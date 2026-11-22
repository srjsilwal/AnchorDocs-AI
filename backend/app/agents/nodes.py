# what it does: Implement each conginitive step of Anchordocs using our litellm gateway(fast-grader for ultra-fast routing/grading/rewriting, primary-chat for final grounded synthesis) and our output guadrail(parse_and_verify_output)

import json
from langchain_core.messages import AIMessage
from app.agents.state import AgentState
from app.core.llm_gateway import generate_completion
from app.rag.retriever import retrieve_vector_chunks, retrieve_vectorless_summaries
from app.guardrails.output_guard import GroundAnswer, parse_and_verify_output


async def route_query_node(state: AgentState) -> dict:
    """Node 1: Decides between Vector RAG, Vectorless RAG, or Direct Chat."""
    query = state["original_query"]
    history_snippet = "\n".join(
        f"{m.type}: {m.content}" for m in state["messages"][-4:]
    )

    prompt = (
        "Classify the user's latest query into exactly ONE route:\n"
        "- 'vector_rag': specific technical questions, facts, policies, numbers, or follow-ups about uploaded documents.\n"
        "- 'vectorless_rag': high-level requests like 'summarize all documents', 'what files are uploaded?', or 'give me an overview'.\n"
        "- 'direct': simple greetings ('hi', 'thanks') or general chit-chat unrelated to documents.\n\n"
        f"Recent conversation:\n{history_snippet}\n\n"
        f"Latest query: {query}\n"
        "Respond with ONLY a JSON object: {\"route\": \"vector_rag\" | \"vectorless_rag\" | \"direct\"}"
    )

    res = await generate_completion(
        messages=[{"role": "user", "content": prompt}],
        model_group="fast-grader",
        temperature=0.0,
        response_format={"type": "json_object"},
        metadata={"trace_name": "agent-router",
                  "workspace_id": state["workspace_id"]},
    )

    try:
        route = json.loads(res['content']).get('route', 'vector_rag')
        if route not in ('vector_rag', 'vectorless_rag', 'direct'):
            route = 'vector_rag'
    except:
        route = 'vector_rag'
    return {'route': route, 'search_query': query, 'retry_count': 0}


async def vector_retrieve_node(state: AgentState) -> dict:
    """Node 2a: Fetches top-k chunks from Supabase pgvector for this workspace."""
    chunks = retrieve_vector_chunks(
        query=state["search_query"],
        workspace_id=state["workspace_id"],
        k=5,
    )
    return {"retrieved_chunks": chunks}


async def vectorless_retrieve_node(state: AgentState) -> dict:
    """Node 2b: Fetches document-level summaries directly from Postgres metadata."""
    summaries = retrieve_vectorless_summaries(state["workspace_id"])
    formatted = [
        {
            "chunk_id": f"{doc['doc_id']}:summary",
            "doc_id": doc["doc_id"],
            "filename": doc["filename"],
            "page": 1,
            "score": 0.0,
            "content": f"Document: {doc['filename']} ({doc['page_count']} pages)\nSummary:\n{doc['summary']}",
        }
        for doc in summaries
    ]
    return {"retrieved_chunks": formatted, "chunks_relevant": len(formatted) > 0}


async def grade_chunks_node(state: AgentState) -> dict:
    """Node 3: Fast LLM checks if retrieved chunks actually contain evidence to answer."""
    chunks = state.get("retrieved_chunks", [])
    if not chunks:
        return {"chunks_relevant": False}

    context_preview = "\n---\n".join(c["content"][:400] for c in chunks[:3])
    prompt = (
        "You are a strict relevance grader. Does the retrieved context contain ANY useful "
        "information to help answer the user's question?\n\n"
        f"Question: {state['original_query']}\n\n"
        f"Retrieved Context:\n{context_preview}\n\n"
        "Respond ONLY with JSON: {\"relevant\": true} or {\"relevant\": false}"
    )

    res = await generate_completion(
        messages=[{"role": "user", "content": prompt}],
        model_group="fast-grader",
        temperature=0.0,
        response_format={"type": "json_object"},
        metadata={"trace_name": "agent-grader",
                  "workspace_id": state["workspace_id"]},
    )

    try:
        is_relevant = bool(json.loads(res["content"]).get("relevant", True))
    except Exception:
        is_relevant = True

    return {"chunks_relevant": is_relevant}


async def rewrite_query_node(state: AgentState) -> dict:
    """Node 4: Rewrites ambiguous follow-up questions using conversation history."""
    history_snippet = "\n".join(
        f"{m.type}: {m.content}" for m in state["messages"][-4:]
    )
    prompt = (
        "Rewrite the user's query into a standalone, keyword-rich search query using the conversation history.\n"
        f"History:\n{history_snippet}\n\n"
        f"Original query: {state['original_query']}\n"
        "Respond ONLY with JSON: {\"rewritten_query\": \"...\"}"
    )

    res = await generate_completion(
        messages=[{"role": "user", "content": prompt}],
        model_group="fast-grader",
        temperature=0.1,
        response_format={"type": "json_object"},
        metadata={"trace_name": "agent-rewriter",
                  "workspace_id": state["workspace_id"]},
    )

    try:
        rewritten = json.loads(res["content"]).get(
            "rewritten_query", state["original_query"])
    except Exception:
        rewritten = state["original_query"]

    return {
        "search_query": rewritten,
        "retry_count": state.get("retry_count", 0) + 1,
    }


async def generate_answer_node(state: AgentState) -> dict:
    """Node 5: Synthesizes a strictly grounded answer + runs Output Guardrail verification."""
    route = state["route"]
    chunks = state.get("retrieved_chunks", [])
    valid_chunk_ids = {c["chunk_id"] for c in chunks if c.get("chunk_id")}

    if route == "direct":
        system_prompt = (
            "You are AnchorDocs, a helpful technical knowledge assistant. "
            "Respond concisely. Set citations to [] and confidence to 'high'."
        )
        context_block = "No document retrieval required for this conversational message."
    elif not chunks:
        # Zero documents found in workspace -> safe refusal without hallucinating
        refusal = {
            "answer": "I couldn't find any relevant information in your uploaded workspace documents to answer that question.",
            "citations": [],
            "confidence": "insufficient_evidence",
            "guardrail_notes": ["Safe refusal: no matching chunks in workspace"],
        }
        return {
            "final_response": refusal,
            "messages": [AIMessage(content=refusal["answer"])],
        }
    else:
        system_prompt = (
            "You are AnchorDocs, an enterprise document assistant. Answer the user's question "
            "using ONLY the provided context chunks. Every factual claim MUST cite the exact `chunk_id` "
            "from the context. If the context does not contain the answer, set confidence to "
            "'insufficient_evidence' and state clearly what is missing."
        )
        context_block = "\n\n".join(
            f"[chunk_id: {c['chunk_id']} | file: {c['filename']} | page: {c['page']}]\n{c['content']}"
            for c in chunks
        )

    history_messages = [
        {"role": "user" if m.type == "human" else "assistant", "content": m.content}
        for m in state["messages"][-6:]
    ]

    llm_messages = [
        {"role": "system", "content": system_prompt},
        *history_messages[:-1],  # Prior turns for conversational continuity
        {
            "role": "user",
            "content": f"Context:\n{context_block}\n\nQuestion: {state['original_query']}",
        },
    ]

    res = await generate_completion(
        messages=llm_messages,
        model_group="primary-chat",
        temperature=0.1,
        response_format=GroundAnswer,
        metadata={
            "trace_name": "agent-generator",
            "workspace_id": state["workspace_id"],
            "route": route,
        },
    )

    verified = parse_and_verify_output(
        raw_llm_text=res["content"],
        valid_chunk_ids=valid_chunk_ids if route != "direct" else None,
    )
    verified["model_served"] = res["model_served"]
    verified["usage"] = res["usage"]
    verified["route_used"] = route
    verified["sources"] = [
        {
            "chunk_id": c["chunk_id"],
            "filename": c["filename"],
            "page": c["page"],
            "snippet": c["content"][:220] + "...",
        }
        for c in chunks
    ]

    return {
        "final_response": verified,
        "messages": [AIMessage(content=verified["answer"])],
    }
