# Multi-Tenant Vector + Vectorless Retrieval

# what it does:
    # retrieve_vector_chunks(query, workspace_id, k=5): Runs similarity search with scores in pgvector, strictly filtered by workspace_id so workspace are isolated, and returns formatted chunks with their chunk_id and similarity score

    # retrieve_vectorless_summaries(workspace_id): fetch all document-level summaries for that workspace directly from postgres-ideal when a user asks, "what documents are in my workspace" or "give me an overview of the architecture spec" without relying on fragile vector similarity


from app.rag.vector_store import get_supabase_client, get_vector_store

def retrieve_vector_chunks(
        query: str,
        workspace_id: str,
        k: int = 5
) -> list[dict]:
    """
    Retrieve top-k semantically similar chunks strictly scoped to 'workspace_id'
    """

    vector_store = get_vector_store()

    results = vector_store.similarity_search_with_score(
        query=query,
        k=k,
        filter={'workspace_id': workspace_id}
    )
    formatted_chunks= []
    for doc, distance_score in results:
        formatted_chunks.append(
            {
                "chunk_id": doc.metadata.get("chunk_id"),
                "doc_id": doc.metadata.get("doc_id"),
                "filename": doc.metadata.get("filename"),
                "page": doc.metadata.get("page"),
                "score": round(float(distance_score), 4),
                "content": doc.page_content,
            }
        )

        return formatted_chunks


def retrieve_vectorless_summaries(workspace_id:str) ->list[dict]:
    """
    vectorless RAG retrieval: fetches document-level digests directly from metadata for broad overview or cross-document synthesis queries
    """
    supabase = get_supabase_client()
    response = (
    supabase.table('doc_summaries')
    .select('doc_id, filename, page_count, summary')
    .eq('workspace_id', workspace_id)
    .execute()
    )
    return response.data or []