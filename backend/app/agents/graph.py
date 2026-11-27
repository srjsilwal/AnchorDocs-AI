# Wiring the Graph + Supabase Persistent Checkpointer

# What it does: Connects the 5 nodes with conditional edges (including the self-correcting grade -> rewrite -> retrieve loop) and attaches AsyncPostgresSaver connected to your Supabase Postgres URL so every thread_id is saved persistently.


from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from app.agents.state import AgentState
from app.agents.nodes import (
    route_query_node,
    vector_retrieve_node,
    vectorless_retrieve_node,
    grade_chunks_node,
    rewrite_query_node,
    generate_answer_node,
)
from app.core.config import get_settings
import asyncio
import os
import sys

settings = get_settings()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


# Global pool & compiled graph initialized cleanly at FastAPI startup
_db_pool: AsyncConnectionPool | None = None
_compiled_graph = None


def _route_after_classifier(state: AgentState) -> str:
    return state["route"]


def _route_after_grading(state: AgentState) -> str:
    if state.get("chunks_relevant", False):
        return "generate"
    if state.get("retry_count", 0) < 1:
        return "rewrite"
    return "generate"


def _build_workflow() -> StateGraph:
    workflow = StateGraph(AgentState)

    workflow.add_node("router", route_query_node)
    workflow.add_node("vector_retrieve", vector_retrieve_node)
    workflow.add_node("vectorless_retrieve", vectorless_retrieve_node)
    workflow.add_node("grade_chunks", grade_chunks_node)
    workflow.add_node("rewrite_query", rewrite_query_node)
    workflow.add_node("generate", generate_answer_node)

    workflow.set_entry_point("router")


    workflow.add_conditional_edges(
        "router",
        _route_after_classifier,
        {
            "vector_rag": "vector_retrieve",
            "vectorless_rag": "vectorless_retrieve",
            "direct": "generate",
        },
    )

    workflow.add_edge("vector_retrieve", "grade_chunks")
    workflow.add_edge("vectorless_retrieve", "generate")

    workflow.add_conditional_edges(
        "grade_chunks",
        _route_after_grading,
        {
            "generate": "generate",
            "rewrite": "rewrite_query",
        },
    )

    # Self-correcting loop back to vector search after query rewrite
    workflow.add_edge("rewrite_query", "vector_retrieve")
    workflow.add_edge("generate", END)

    return workflow


async def init_agent_graph():
    """Initialize persistent checkpoints when available; otherwise start with memory-only state."""
    global _db_pool, _compiled_graph

    if sys.platform == "win32":
        print("Warning: PostgreSQL checkpoints disabled on Windows local development")
        _compiled_graph = _build_workflow().compile()
        return

    try:
        _db_pool = AsyncConnectionPool(
            conninfo=settings.SUPABASE_DB_URL,
            min_size=1,
            max_size=3,
            kwargs={'autocommit': True, 'prepare_threshold': 0},
        )
        await _db_pool.open()

        checkpointer = AsyncPostgresSaver(_db_pool)
        await checkpointer.setup()
        _compiled_graph = _build_workflow().compile(checkpointer=checkpointer)
    except Exception as exc:
        if _db_pool:
            await _db_pool.close()
            _db_pool = None
        print(f"Warning: PostgreSQL checkpoint unavailable; starting without persistence: {exc}")
        _compiled_graph = _build_workflow().compile()

async def close_agent_graph():
    """cleanly closes postgres pool on shutdown"""
    global _db_pool
    if _db_pool:
        await _db_pool.close()

def get_agent_graph():
    if _compiled_graph is None:
        raise RuntimeError('Agent graph not initialized yet.')
    return _compiled_graph
