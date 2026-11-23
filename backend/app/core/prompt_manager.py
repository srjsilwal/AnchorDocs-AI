# Dynamic Prompt Versioning + Cache

# what it does: Fetches the active "production" prompt (along with its exact version number) from langfuse so every answer in langfuse traces records which prompt version generated it - enabling you to spot accuracy drift between prompt v1 and v2.

import time
from dataclasses import dataclass
from langfuse import Langfuse
from app.core.config import get_settings

settings = get_settings()

DEFAULT_GROUNDED_PROMPT = (
    "You are AnchorDocs, an enterprise document assistant. Answer the user's question "
    "using ONLY the provided context chunks. Every factual claim MUST cite the exact `chunk_id` "
    "from the context. If the context does not contain the answer, set confidence to "
    "'insufficient_evidence' and state clearly what is missing."
)

@dataclass
class VersionedPrompt:
    name: str
    version: int
    template: str

_prompt_cache: dict[str, tuple[float, VersionedPrompt]] = {}
CACHE_TTL_SECONDS = 60

def get_versioned_prompt(
    prompt_name: str = 'anchordocs-grounded-qa',
    label: str = 'production'
) -> VersionedPrompt:
    """
    Fetches the active versioned prompt from Langfuse Prompt Registry with a 60s TTL cache
    and a guaranteed local fallback so production never breaks.
    """
    cache_key = f"{prompt_name}:{label}"
    now = time.time()

    if cache_key in _prompt_cache:
        cached_at, cached_prompt = _prompt_cache[cache_key]
        if now - cached_at < CACHE_TTL_SECONDS:
            return cached_prompt

    try:
        lf = Langfuse()
        remote_prompt = lf.get_prompt(prompt_name, label=label)
        vp = VersionedPrompt(
            name=prompt_name,
            version=remote_prompt.version,
            template=remote_prompt.prompt
        )   
    except Exception:
        # Resilient fallback if prompt hasn't been created in Langfuse yet or network blips
        vp = VersionedPrompt(
            name=prompt_name,
            version=0,
            template=DEFAULT_GROUNDED_PROMPT,
        )
    _prompt_cache[cache_key] = (now, vp)
    return vp