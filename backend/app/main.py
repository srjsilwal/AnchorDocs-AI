from fastapi import FastAPI, Header, Response
from pydantic import BaseModel, field_validator
from app.core.config import get_settings
from app.core.rate_limiter import enforce_rate_limit
from app.core.llm_gateway import generate_completion

settings = get_settings()

app = FastAPI(title=settings.APP_NAME, version='0.1.8')

class PingRequest(BaseModel):
    prompt: str = "Explain what an AI Gateway does in one sentence"
    model_group: str = 'primary-chat'

    # @field_validator('prompt', mode='before')
    # @classmethod
    # def unwrap_single_prompt(cls, value):
    #     if isinstance(value, list) and len(value) == 1:
    #         return value[0]
    #     return value

@app.get('/health')
async def health_check():
    return {'status': 'ok', 'app': settings.APP_NAME}

@app.post('/api/v1/gateway/test')
async def test_gateway(
    payload: PingRequest,
    response: Response,
    x_workspace_id: str = Header(default='demo-workspace')
):
    # enforce upstash redis rate limit
    rl_headers = enforce_rate_limit(x_workspace_id)
    for k, v in rl_headers.items():
        response.headers[k] = v

    # call litellm multi-provider gateway (with langfuse trace tags)
    result = await generate_completion(
        messages= [{"role": "user", "content": payload.prompt}],
        model_group = payload.model_group,
        metadata={
            "trace_name": 'gateway-smoke-test',
            'workspace_id': x_workspace_id
        }
    )

    return {
        'workspace_id': x_workspace_id,
        'rate_limit_remaining': rl_headers['X-RateLimit-Remaining'], **result
    }