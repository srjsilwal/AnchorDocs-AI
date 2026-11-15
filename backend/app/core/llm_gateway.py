# LiteLLM + Fallbacks + Langfuse Telemetry

# what it does: Defines our model groups(primary-chat, fast-grader, fallback-chat), configures retries and cross-provider fallbacks and wires langfuse callbacks so every single LLM call records latency, token usage, model used and cost automatically

import litellm
from litellm import Router
from app.core.config import get_settings

settings = get_settings()

# Automatically ship every litellm trace (latency, tokens, cost, errors) to langfuse
litellm.success_callback = ['langfuse_otel']
litellm.failure_callback = ['langfuse_otel']
litellm.drop_params = True

# define our multi-provider model registry
MODEL_LIST = [
    {
        'model_name': 'primary-chat',
        'litellm_params': {
            'model': 'gemini/gemini-3.8-flash',
            'api_key': settings.GOOGLE_API_KEY,
            'timeout': 20
        }
    },
    {
        'model_name': 'fast-grader',
        'litellm_params': {
            'model': 'groq/openai/gpt-oss-120b',
            'api_key': settings.GROQ_API_KEY,
            'timeout': 15
        }
    },
    {
        'model_name': 'fallback-openai',
        'litellm_params': {
            'model': 'openai/gpt-4o-mini',
            'api_key': settings.OPENAI_API_KEY,
            'timeout': 20
        }
    },

]

# configure automatic cross-provider failover;
# if Gemini fails or hits 429 -> try groq llama then openai gpt-4o mini

FALLBACK_CHAIN = [
    {'primary-chat': ['fast-grader', 'fallback-openai']},
    {"fast-grader": ["primary-chat", "fallback-openai"]},
]


llm_router = Router(
    model_list= MODEL_LIST,
    fallbacks=FALLBACK_CHAIN,
    num_retries=1,
    allowed_fails=2,
    cooldown_time=30
)

async def generate_completion(
        messages: list[dict],
        model_group: str = 'primary-chat',
        temperature: float = 0.2,
        metadata: dict | None = None
) -> dict:
    """
    Unified async gateway call with automatic fallback and langfuse trace metadata
    """

    response = await llm_router.acompletion(
        model = model_group,
        messages=messages,
        temperature=temperature,
        metadata=metadata or {}
    )

    choice = response.choices[0].message.content
    actual_model = response.model
    usage = {
        'prompt_tokens': response.usage.prompt_tokens,
        'completion_tokens': response.usage.completion_tokens,
        'total_tokens': response.usage.total_tokens
    }

    return {
        'content': choice,
        'model_served': actual_model,
        'usage': usage
    }
