# Upload -> Chunk -> Embed -> Summarize
# what it does:
    # Uploads the raw PDF/Markdown bytes to Supabase Storage(documents/{workspace_id}/{doc_id}_{filename}).

    # Extracts text page-by-page using pypdf ( or UTF-8 decode for .md/.txt), keeping memory usage tiny even for 100-page PDFs.

    # Splits pages using RecursiveCharacterTextSplitter(800 characters per chunk, 150-character overlap so sentences aren't sliced mid-thought) and stamps every chunk with a unique chunk_id, doc_id, workspace_id, filename, and page number.

    # Upserts chunks into Supabase pgvector.

    # Generates a crisp Vectorless Summary using our fast Groq model and stores it in doc_summaries(Vectorless RAG)

import io
import uuid
from pypdf import PdfReader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.rag.vector_store import get_supabase_client, get_vector_store
from app.core.llm_gateway import generate_completion

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    separators=['\n\n', '\n', '. ', ' ', '']
)

def _extract_pages(file_bytes: bytes, filename: str) -> list[tuple[int, str]]:
    """lightweight page-by-page extractor"""

    lower_name = filename.lower()
    if lower_name.endswith('.pdf'):
        reader = PdfReader(io.BytesIO(file_bytes))
        pages=[]
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ''
            if text.strip():
                pages.append((idx, text.strip()))
        return pages
    else:
        # handle .md, .txt, .rst, etc
        decoded = file_bytes.decode('utf-8', errors='ignore').strip()
        return [(1, decoded)] if decoded else []

async def ingest_document(file_bytes: bytes, filename:str, workspace_id: str, content_type: str = 'application/pdf')-> dict:
    """
    End to End ingestion:
    1. Upload raw file to supabase storage
    2. Extract and recursively chunk text with rich metadata
    3. Embed and store vectors in supabase pgvector
    4. Generate and store a Vectorless summary digest
    """

    supabase = get_supabase_client()
    vector_store = get_vector_store()

    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    storage_path = f"{workspace_id}/{doc_id}_{filename}"

    # 1. upload raw file to supabase storage bucket 'documents'
    supabase.storage.from_('documents').upload(
        path=storage_path,
        file = file_bytes,
        file_options={'content-type': content_type}
    )

    # 2. extract text and create recursive chunks with citation metadata
    pages = _extract_pages(file_bytes, filename)
    if not pages:
        raise ValueError("No readable text could be extracted from the uploaded file.")

    all_chunks: list[Document] = []
    chunk_ids: list[str] = []

    for page_num, page_text in pages:
        splits = text_splitter.split_text(page_text)
        for idx, split_text in enumerate(splits):
            c_id = f"{doc_id}:p{page_num}:c{idx}"
            chunk_ids.append(c_id)
            all_chunks.append(
                Document(
                    page_content=split_text,
                    metadata={
                        "chunk_id": c_id,
                        "doc_id": doc_id,
                        "workspace_id": workspace_id,
                        "filename": filename,
                        "page": page_num
                    }
                )
            )

    # 3. Embed via Gemini and store in supabse pgvector
    vector_store.add_documents(documents=all_chunks, ids=chunk_ids)

    # 4. Build Vectorless RAG summary digest(uses first ~4000 chars for fast overview)
    preview_text = "\n\n".join(p[1] for p in pages)[:4000]
    summary_res = await generate_completion(
        messages=[
            {
                "role": "system",
                "content": "Summarize this technical/policy document in 4 concise bullet points covering its purpose, key topics, and target audience.",
            },
            {"role": "user", "content": f"Filename: {filename}\n\n{preview_text}"},
        ],
        model_group="fast-grader",
        metadata={"trace_name": "ingest-summary",
                  "workspace_id": workspace_id},
    )

    supabase.table('doc_summaries').insert({
        "workspace_id": workspace_id,
        "doc_id": doc_id,
        "filename": filename,
        "storage_path": storage_path,
        "summary": summary_res["content"],
        "page_count": len(pages),
    }).execute()

    return {
        "doc_id": doc_id,
        "filename": filename,
        "workspace_id": workspace_id,
        "pages_processed": len(pages),
        "chunks_indexed": len(all_chunks),
        "summary": summary_res["content"],
    }
