from fastapi import FastAPI, Header, Response, HTTPException, status, UploadFile, File
from pydantic import BaseModel, field_validator
from app.core.config import get_settings
from app.core.rate_limiter import enforce_rate_limit
from app.core.llm_gateway import generate_completion
from app.guardrails.input_guard import run_input_guardrails, SecurityViolationError
from app.guardrails.output_guard import GroundAnswer, parse_and_verify_output
from app.rag.ingest import ingest_document
from app.rag.retriever import retrieve_vector_chunks, retrieve_vectorless_summaries
from app.rag.vector_store import get_supabase_client

from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from app.agents.graph import init_agent_graph, close_agent_graph, get_agent_graph

settings = get_settings()

@asynccontextmanager
async def lifespan(app:FastAPI):
    await init_agent_graph()
    yield
    await close_agent_graph()



app = FastAPI(title=settings.APP_NAME, version='0.4.0', lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

class ChatRequest(BaseModel):
    query: str
    thread_id: str = 'default-thread'

@app.post('/api/v1/chat')
async def chat_with_docs(
    payload: ChatRequest,
    response: Response,
    x_workspace_id: str = Header(default='demo-workspace')
):
    rl_headers = enforce_rate_limit(x_workspace_id)
    for k,v in rl_headers.items():
        response.headers[k] = v

    # input guadrails(injection block and pii redaction)
    try:
        sanitized = run_input_guardrails(payload.query)
    except SecurityViolationError as sec_err:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail={
                'error': 'SecurityGuadrailsBlocked',
                'reason': sec_err.reason,
                'rule': sec_err.matched_rules
            }
        )

    # run langgraph agent with persistent supabase thread memory
    graph = get_agent_graph()

    #scoped thread_id by workspace_id so threads are striclty multi-tenant isolated
    scoped_thread_id = f"{x_workspace_id}:{payload.thread_id}"

    result_state= await graph.ainvoke(
        {
            "messages": [HumanMessage(content=sanitized.clean_text)],
            "workspace_id": x_workspace_id,
            "original_query": sanitized.clean_text,
        },
        config={'configurable': {'thread_id':scoped_thread_id}}
    )

    final_payload=result_state['final_response']
    return {
        "workspace_id": x_workspace_id,
        "thread_id": payload.thread_id,
        "input_sanitized": sanitized.was_modified,
        "redacted_categories": sanitized.redacted_categories,
        "query_rewritten_to": result_state.get("search_query"),
        "retries_used": result_state.get("retry_count", 0),
        **final_payload,
    }

       

class GuardedTestRequest(BaseModel):
    prompt: str
    enforce_json_schema: bool = True
    model_group: str = 'primary-chat'



@app.get('/health')
async def health_check():
    return {'status': 'ok', 'app': settings.APP_NAME}

@app.post('/api/v1/gateway/test')
async def test_gateway(
    payload: GuardedTestRequest,
    response: Response,
    x_workspace_id: str = Header(default='demo-workspace')
):
    # enforce upstash redis rate limit
    rl_headers = enforce_rate_limit(x_workspace_id)
    for k, v in rl_headers.items():
        response.headers[k] = v

    # Input Guardrails (prompt Injection Block + PII/Secret Redaction)
    try:
        sanitized = run_input_guardrails(payload.prompt)
    except SecurityViolationError as sec_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "SecurityGuardrailBlocked",
                "reason": sec_err.reason,
                "rule": sec_err.matched_rules,
            },
        )


    # call litellm multi-provider gateway (with langfuse trace tags)
    messages = [{"role": "user", "content": sanitized.clean_text}]
    result = await generate_completion(
        messages= messages,
        model_group = payload.model_group,
        response_format= GroundAnswer if payload.enforce_json_schema else None,
        metadata={
            "trace_name": 'gateway-smoke-test',
            'workspace_id': x_workspace_id,
            'pii_redacted': sanitized.redacted_categories
        }
    )

    # output Guadrails (schema and citation verification)

    structured_output = None
    if payload.enforce_json_schema:
        structured_output = parse_and_verify_output(result['content'])

    return {
        "workspace_id": x_workspace_id,
        "input_sanitized": sanitized.was_modified,
        "redacted_categories": sanitized.redacted_categories,
        "model_served": result["model_served"],
        "usage": result["usage"],
        "raw_content": result["content"],
        "structured_output": structured_output
    }

@app.post('/api/v1/documents/upload')
async def upload_document(
    response: Response,
    file: UploadFile = File(...),
    x_workspace_id: str = Header(default='demo-workspace'),
):
    # rate limit uploads as well, so embeddings quota stay protected
    rl_headers = enforce_rate_limit(f"{x_workspace_id}:upload")
    for k, v in rl_headers.items():
        response.headers[k] = v

    if not file.filename.lower().endswith(('.pdf', '.md', '.txt')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pdf, .md, and .txt files are supported.",
        )
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit.",
        )
    result = await ingest_document(
        file_bytes=file_bytes,
        filename= file.filename,
        workspace_id=x_workspace_id,
        content_type=file.content_type or 'application/octet-stream'
    )

    return result

@app.get('/api/v1/documents')
async def list_workspace_documents(
    x_workspace_id: str = Header(default='demo-workspace'),
):
    docs = retrieve_vectorless_summaries(x_workspace_id)
    return {'workspace_id': x_workspace_id, 'documents': docs}

@app.get('/api/v1/documents/{doc_id}/preview')
async def get_document_preview(
    doc_id: str,
    x_workspace_id: str = Header(default='demo-workspace'),
):
    result = get_supabase_client().table('doc_summaries').select(
        'filename, storage_path, page_count, summary'
    ).eq('workspace_id', x_workspace_id).eq('doc_id', doc_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Document not found.')
    document = result.data[0]
    signed = get_supabase_client().storage.from_('documents').create_signed_url(
        document['storage_path'], 3600
    )
    return {**document, 'url': signed.get('signedURL') or signed.get('signedUrl')}

@app.get('/api/v1/documents/search')
async def test_retrieval(
    query: str,
    k: int=4,
    x_workspace_id: str = Header(default='demo-workspace')
):
    chunks = retrieve_vector_chunks(query, x_workspace_id, k)
    return {"workspace_id": x_workspace_id, "query": query, "results": chunks}

