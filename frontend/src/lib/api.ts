const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
const API_BASE = configuredApiBase ||
  (process.env.NODE_ENV === "production" ? null : "http://localhost:8000");
const API_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

async function apiFetch(
  url: string,
  init: RequestInit,
  timeoutMs = API_TIMEOUT_MS,
) {
  if (!API_BASE) {
    throw new Error(
      "The deployed app is missing NEXT_PUBLIC_API_URL. Configure it with the public HTTPS URL of the API, then redeploy the frontend.",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. The document service may be unavailable.");
    }
    throw new Error("Could not connect to the document service. Please try again later.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function responseError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    const detail = data.detail;
    if (typeof detail === "string") return detail;
    if (typeof detail?.error === "string") return detail.error;
    if (typeof detail?.reason === "string") return detail.reason;
  } catch {
    // Error responses from a proxy may be plain text or HTML.
  }
  return `${fallback} (HTTP ${res.status})`;
}

export interface WorkspaceDoc {
  doc_id: string;
  filename: string;
  page_count: number;
  summary: string;
}
export interface DocumentPreview extends WorkspaceDoc { url?: string; }

export interface CitationItem {
  chunk_id: string;
  quote: string;
}

export interface SourceSnippet {
  chunk_id: string;
  filename: string;
  page: number;
  snippet: string;
}

export interface ChatApiResponse {
  workspace_id: string;
  thread_id: string;
  answer: string;
  citations: CitationItem[];
  confidence: "high" | "medium" | "insufficient_evidence";
  guardrail_notes: string[];
  input_sanitized: boolean;
  redacted_categories: string[];
  query_rewritten_to?: string;
  retries_used: number;
  model_served?: string;
  route_used?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources?: SourceSnippet[];
}

export async function fetchDocuments(
  workspaceId: string,
): Promise<WorkspaceDoc[]> {
  const res = await apiFetch(`${API_BASE}/api/v1/documents`, {
    cache: "no-store",
    headers: { "X-Workspace-Id": workspaceId },
  });
  if (!res.ok) throw new Error(await responseError(res, "Could not load documents"));
  const data = await res.json();
  return data.documents || [];
}

export async function uploadDocument(workspaceId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`${API_BASE}/api/v1/documents/upload`, {
    method: "POST",
    headers: { "X-Workspace-Id": workspaceId },
    body: formData,
  }, UPLOAD_TIMEOUT_MS);

  if (!res.ok) {
    throw new Error(await responseError(res, "Upload failed"));
  }
  return res.json();
}

export async function deleteDocument(workspaceId: string, docId: string) {
  const res = await apiFetch(`${API_BASE}/api/v1/documents/${docId}`, {
    method: "DELETE",
    headers: { "X-Workspace-Id": workspaceId },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to delete document");
  }
  return data;
}

export async function fetchDocumentPreview(workspaceId: string, docId: string): Promise<DocumentPreview> {
  const res = await apiFetch(`${API_BASE}/api/v1/documents/${docId}/preview`, {
    headers: { "X-Workspace-Id": workspaceId },
  });
  if (!res.ok) throw new Error("Failed to load document preview");
  return res.json();
}

export async function sendChatMessage(
  workspaceId: string,
  threadId: string,
  query: string,
): Promise<ChatApiResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
    },
    body: JSON.stringify({ query, thread_id: threadId }),
  });

  const data = await res.json();
  if (!res.ok) {
    const reason =
      data.detail?.reason || data.detail?.error || "Request blocked";
    throw new Error(reason);
  }
  return data;
}
