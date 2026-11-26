# Centalized Settings and Validation
# what it does: Reads your .env file, validates that required credentials exist, and exports a single cached settings object across the entire app.

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict 

class Settings(BaseSettings):
    # App Metadata
    APP_NAME: str = 'AnchorDocs'
    ENVIRONMENT: str = 'development'

    # LLM Provider Keys
    GOOGLE_API_KEY: str
    GROQ_API_KEY: str
    OPENAI_API_KEY: str | None = None
    HUGGINGFACE_API_KEY: str | None = None

    # Supabase
    SUPABASE_URL: str
    SUPABASE_PUBLISHABLE_KEY: str
    SUPABASE_SECRET_KEY: str
    SUPABASE_DB_URL: str

    # Upstash Redis
    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str

    # Langfuse Observability
    LANGFUSE_BASE_URL: str = "https://us.cloud.langfuse.com"
    LANGFUSE_PUBLIC_KEY: str
    LANGFUSE_SECRET_KEY: str

    # Rate Limit 
    RATE_LIMIT_REQUESTS: int = 10
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # LiteLLM and Langfuse read standard environment variables automatically
    os.environ['GEMINI_API_KEY'] = settings.GOOGLE_API_KEY
    os.environ['GROQ_API_KEY'] = settings.GROQ_API_KEY
    if settings.OPENAI_API_KEY:
        os.environ['OPEN_API_KEY'] = settings.OPENAI_API_KEY
    os.environ['LANGFUSE_HOST'] = settings.LANGFUSE_BASE_URL
    os.environ['LANGFUSE_PUBLIC_KEY'] = settings.LANGFUSE_PUBLIC_KEY
    os.environ['LANGFUSE_SECRET_KEY'] = settings.LANGFUSE_SECRET_KEY
    return settings

