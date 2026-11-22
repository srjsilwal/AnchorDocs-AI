# what it does: Defines the exact data structures passed from node to node inside langgraph. using add_messages automatically appends new turns to the conversation history stored in Postgres.

from typing import Annotated, Literal, TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # persistent conversation history (automatically managed by Langgraph checkpointer)
    messages: Annotated[list[BaseMessage], add_messages]

    # tenant and request context
    workspace_id: str
    original_query: str
    search_query: str

    # routing and self-correction tracking
    route: Literal['vector_rag', 'vectorless_rag', 'direct']
    retry_count: int
    chunks_relavant: bool

    # Retrieved evidence and final verified payload
    retrieved_chunks:list[dict]
    final_response: dict

    


  