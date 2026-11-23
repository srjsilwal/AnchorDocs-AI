"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage } from "@/lib/api";
import {
  createThread,
  createTurnId,
  loadThreads,
  saveThreads,
  titleFromQuery,
  type Thread,
} from "@/lib/threads";

export function useThreadStore(workspaceId: string) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const threadsRef = useRef<Thread[] | null>(null);
  threadsRef.current = threads;

  useEffect(() => {
    const stored = loadThreads();
    setThreads(stored);
    setActiveThreadId(stored[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (threads === null) return;
    saveThreads(threads);
  }, [threads]);

  const visibleThreads = useMemo(
    () =>
      (threads ?? [])
        .filter((thread) => thread.workspaceId === workspaceId)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [threads, workspaceId],
  );

  const activeThread = useMemo(
    () => visibleThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [visibleThreads, activeThreadId],
  );

  useEffect(() => {
    if (threads === null || activeThread) return;
    const existing = threads.find((thread) => thread.workspaceId === workspaceId);
    if (existing) {
      setActiveThreadId(existing.id);
      return;
    }
    const fresh = createThread(workspaceId);
    setThreads((current) => [fresh, ...(current ?? [])]);
    setActiveThreadId(fresh.id);
  }, [threads, activeThread, workspaceId]);

  const updateThread = useCallback(
    (threadId: string, updater: (thread: Thread) => Thread) => {
      setThreads((current) =>
        current
          ? current.map((thread) =>
              thread.id === threadId ? updater(thread) : thread,
            )
          : current,
      );
    },
    [],
  );

  const startNewThread = useCallback(() => {
    const current = threadsRef.current ?? [];
    const reusable = current.find(
      (thread) => thread.workspaceId === workspaceId && thread.turns.length === 0,
    );
    if (reusable) {
      setActiveThreadId(reusable.id);
      return;
    }

    const fresh = createThread(workspaceId);
    setThreads((existing) => [fresh, ...(existing ?? [])]);
    setActiveThreadId(fresh.id);
  }, [workspaceId]);

  const selectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
  }, []);

  const requestAnswer = useCallback(
    async (threadId: string, query: string) => {
      setSending(true);
      try {
        const response = await sendChatMessage(workspaceId, threadId, query);
        updateThread(threadId, (thread) => ({
          ...thread,
          turns: [
            ...thread.turns,
            {
              id: createTurnId(),
              role: "assistant",
              text: response.answer,
              meta: response,
            },
          ],
          updatedAt: Date.now(),
        }));
        return true;
      } catch (error) {
        updateThread(threadId, (thread) => ({
          ...thread,
          turns: [
            ...thread.turns,
            {
              id: createTurnId(),
              role: "error",
              text:
                error instanceof Error
                  ? error.message
                  : "The request could not be completed.",
            },
          ],
          updatedAt: Date.now(),
        }));
        return false;
      } finally {
        setSending(false);
      }
    },
    [updateThread, workspaceId],
  );

  const send = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || sending) return false;

      const thread = (threadsRef.current ?? []).find(
        (candidate) => candidate.id === activeThreadId,
      );
      if (!thread) return false;

      updateThread(thread.id, (current) => ({
        ...current,
        title:
          current.turns.length === 0
            ? titleFromQuery(trimmed)
            : current.title,
        turns: [
          ...current.turns,
          { id: createTurnId(), role: "user", text: trimmed },
        ],
        updatedAt: Date.now(),
      }));

      return requestAnswer(thread.id, trimmed);
    },
    [activeThreadId, requestAnswer, sending, updateThread],
  );

  const retryLast = useCallback(async () => {
    if (sending) return;
    const thread = (threadsRef.current ?? []).find(
      (candidate) => candidate.id === activeThreadId,
    );
    if (!thread) return;

    const lastUserTurn = [...thread.turns]
      .reverse()
      .find((turn) => turn.role === "user");
    if (!lastUserTurn) return;

    updateThread(thread.id, (current) => ({
      ...current,
      turns: current.turns.filter(
        (turn, index) =>
          !(turn.role === "error" && index === current.turns.length - 1),
      ),
      updatedAt: Date.now(),
    }));

    await requestAnswer(thread.id, lastUserTurn.text);
  }, [activeThreadId, requestAnswer, sending, updateThread]);

  return {
    hydrated: threads !== null,
    threads: visibleThreads,
    activeThread,
    activeThreadId: activeThread?.id ?? null,
    sending,
    startNewThread,
    selectThread,
    send,
    retryLast,
  };
}
