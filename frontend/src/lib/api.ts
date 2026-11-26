const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const res = await fetch(`${API_BASE}/api/v1/documents`, {
    headers: { "X-Workspace-Id": workspaceId },
  });
  if (!res.ok) throw new Error("Failed to load workspace documents");
  const data = await res.json();
  return data.documents || [];
}

export async function uploadDocument(workspaceId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/v1/documents/upload`, {
    method: "POST",
    headers: { "X-Workspace-Id": workspaceId },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail?.error || data.detail || "Upload failed");
  }
  return data;
}

export async function deleteDocument(workspaceId: string, docId: string) {
  const res = await fetch(`${API_BASE}/api/v1/documents/${docId}`, {
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
  const res = await fetch(`${API_BASE}/api/v1/documents/${docId}/preview`, { headers: { "X-Workspace-Id": workspaceId } });
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
