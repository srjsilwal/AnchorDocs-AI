from fastapi import FastAPI, Header, Response, HTTPException, status
from pydantic import BaseModel, field_validator
from app.core.config import get_settings
from app.core.rate_limiter import enforce_rate_limit
from app.core.llm_gateway import generate_completion
from app.guardrails.input_guard import run_input_guardrails, SecurityViolationError
from app.guardrails.output_guard import GroundAnswer, parse_and_verify_output

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
