from fastapi import FastAPI, Header, Response, HTTPException, status, UploadFile, File
from pydantic import BaseModel, field_validator
from app.core.config import get_settings
from app.core.rate_limiter import enforce_rate_limit
from app.core.llm_gateway import generate_completion
from app.guardrails.input_guard import run_input_guardrails, SecurityViolationError
from app.guardrails.output_guard import GroundAnswer, parse_and_verify_output
from app.rag.ingest import ingest_document
from app.rag.retriever import retrieve_vector_chunks, retrieve_vectorless_summaries

settings = get_settings()

app = FastAPI(title=settings.APP_NAME, version='0.2.0')


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

@app.get('/api/v1/documents/search')
async def test_retrieval(
    query: str,
    k: int=4,
    x_workspace_id: str = Header(default='demo-workspace')
):
    chunks = retrieve_vector_chunks(query, x_workspace_id, k)
    return {"workspace_id": x_workspace_id, "query": query, "results": chunks}

