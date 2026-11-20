from fastapi import HTTPException, status
from upstash_redis import Redis
from upstash_ratelimit import Ratelimit, SlidingWindow
from app.core.config import get_settings

settings = get_settings()

# initialize Upstash HTTP Redis client (stateless)
redis_client = Redis(
    url=settings.UPSTASH_REDIS_REST_URL,
    token=settings.UPSTASH_REDIS_REST_TOKEN
)

rate_limiter = Ratelimit(
    redis=redis_client,
    limiter=SlidingWindow(
        max_requests=settings.RATE_LIMIT_REQUESTS,
        window=settings.RATE_LIMIT_WINDOW_SECONDS
    ),
    prefix='anchordocs:ratelimit'
)

def enforce_rate_limit(identifier:str) -> dict:
    """
    checks if 'identifier' (eg., workspace_id or user_ip) has remaining quota. Raises HTTP 429 if exceeded, otherwise returns remaining quota headers.
    """
    result = rate_limiter.limit(identifier)

    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'error': 'Rate Limit exceeded',
                'limit': result.limit,
                'remaining': 0,
                'reset_timestamp': result.reset
            }
        )
    return {
        'X-RateLimit-Limit': str(result.limit),
        'X-RateLimit-Remaining': str(result.remaining)
    }

