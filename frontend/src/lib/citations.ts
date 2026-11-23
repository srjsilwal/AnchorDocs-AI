import type { ChatApiResponse, SourceSnippet } from "@/lib/api";

export interface CitationView {
  index: number;
  chunkId: string;
  quote: string;
  filename: string | null;
  page: number | null;
  snippet: string | null;
}

export type AnswerToken =
  | { kind: "text"; value: string }
  | { kind: "citation"; index: number };

const MARKER_PATTERN = /\[(\d{1,2})\]/g;

export function buildCitations(meta: ChatApiResponse): CitationView[] {
  const sourcesById = new Map<string, SourceSnippet>();
  for (const source of meta.sources ?? []) {
    sourcesById.set(source.chunk_id, source);
  }

  return (meta.citations ?? []).map((citation, position) => {
    const source = sourcesById.get(citation.chunk_id);
    return {
      index: position + 1,
      chunkId: citation.chunk_id,
      quote: citation.quote,
      filename: source?.filename ?? null,
      page: typeof source?.page === "number" ? source.page : null,
      snippet: source?.snippet ?? null,
    };
  });
}

export function tokenizeAnswer(
  text: string,
  citationCount: number,
): AnswerToken[] {
  if (citationCount === 0 || !text) {
    return text ? [{ kind: "text", value: text }] : [];
  }

  const tokens: AnswerToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKER_PATTERN)) {
    const index = Number(match[1]);
    const start = match.index ?? 0;
    if (index < 1 || index > citationCount) continue;

    const precedingText = text.slice(cursor, start).replace(/\s+$/, "");
    if (precedingText) {
      tokens.push({ kind: "text", value: precedingText });
    }
    tokens.push({ kind: "citation", index });
    cursor = start + match[0].length;
  }

  if (!tokens.length) return [{ kind: "text", value: text }];
  if (cursor < text.length) {
    tokens.push({ kind: "text", value: text.slice(cursor) });
  }
  return tokens;
}

export function answerParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function describeLocation(citation: CitationView): string {
  return citation.page ? `Page ${citation.page}` : "Location unavailable";
}

export function confidenceLabel(confidence: ChatApiResponse["confidence"]): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Insufficient evidence";
  }
}
