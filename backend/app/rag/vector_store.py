# Supabase Client and pgvector Engine

# what it does: Connects to supabase storage, teh doc_summaries table, and initializes our pgvector store backed by text embedding model

from functools import lru_cache
from supabase import create_client, Client
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_postgres import PGVector
from app.core.config import get_settings

settings = get_settings()

COLLECTION_NAME = 'anchordocs_chunks'

@lru_cache
def get_supabase_client() -> Client:
    """Client for supabase storage (raw PDFs, DOCs) and doc_summarizes metadata"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_PUBLISHABLE_KEY, settings.SUPABASE_SECRET_KEY)


@lru_cache
def get_embeddings_model() -> GoogleGenerativeAIEmbeddings:
    """cloud embeddings via google gemini"""
    return GoogleGenerativeAIEmbeddings(
        model='model/text-embeddings-004',
        google_api_key=settings.GOOGLE_API_KEY
    )

@lru_cache
def get_vector_store() -> PGVector:
    """
    connects to supabase postgres + pgvector.
    Automatically creates the vector collection table on first run
    """

    db_url = settings.SUPABASE_DB_URL
    if db_url.startswith('postgresql://'):
        db_url = db_url.replace('postgresql://', 'postgresql+psycopg://', 1)

    return PGVector(
        embeddings=get_embeddings_model(),
        collection_name=COLLECTION_NAME,
        connection=db_url,
        use_jsonb=True
    )