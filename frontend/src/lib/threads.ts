import type { ChatApiResponse } from "@/lib/api";

export const NEW_THREAD_TITLE = "New chat";
const THREADS_STORAGE_KEY = "anchordocs.threads.v1";
const MAX_STORED_THREADS = 20;
const MAX_TITLE_LENGTH = 52;

export type ChatTurnRole = "user" | "assistant" | "error";

export interface ChatTurn {
  id: string;
  role: ChatTurnRole;
  text: string;
  meta?: ChatApiResponse;
}

export interface Thread {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
}

function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function createTurnId(): string {
  return createId("turn");
}

export function createThread(workspaceId: string): Thread {
  const now = Date.now();
  return {
    id: createId("thread"),
    workspaceId,
    title: NEW_THREAD_TITLE,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

export function titleFromQuery(query: string): string {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (!cleaned) return NEW_THREAD_TITLE;
  return cleaned.length <= MAX_TITLE_LENGTH
    ? cleaned
    : `${cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    typeof turn.id === "string" &&
    (turn.role === "user" || turn.role === "assistant" || turn.role === "error") &&
    typeof turn.text === "string"
  );
}

function isThread(value: unknown): value is Thread {
  if (typeof value !== "object" || value === null) return false;
  const thread = value as Record<string, unknown>;
  return (
    typeof thread.id === "string" &&
    typeof thread.workspaceId === "string" &&
    typeof thread.title === "string" &&
    typeof thread.createdAt === "number" &&
    typeof thread.updatedAt === "number" &&
    Array.isArray(thread.turns) &&
    thread.turns.every(isChatTurn)
  );
}

export function loadThreads(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(THREADS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isThread)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  if (typeof window === "undefined") return;
  try {
    const persistable = threads
      .filter((thread) => thread.turns.length > 0)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_STORED_THREADS);
    window.localStorage.setItem(
      THREADS_STORAGE_KEY,
      JSON.stringify(persistable),
    );
  } catch {
    // Storage can be unavailable (private mode or quota); the session still works.
  }
}
