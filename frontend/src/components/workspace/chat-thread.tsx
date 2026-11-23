"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { ChatTurn } from "@/lib/threads";
import { AnswerTurn } from "./answer-turn";

interface ChatThreadProps {
  turns: ChatTurn[];
  loading: boolean;
  panelTurnId: string | null;
  activeCitation: number | null;
  emptyState: ReactNode;
  onOpenSources: (
    turnId: string,
    citation: number,
    safetyExpanded: boolean,
  ) => void;
  onRetry: () => void;
}

export function ChatThread({
  turns,
  loading,
  panelTurnId,
  activeCitation,
  emptyState,
  onOpenSources,
  onRetry,
}: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    endRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [turns.length, loading]);

  return (
    <div
      role="log"
      aria-label="Conversation"
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-[720px] px-5 pb-4 pt-7">
        {turns.length === 0 ? emptyState : null}

        {turns.map((turn) => (
          <Fragment key={turn.id}>
            {turn.role === "user" && (
              <div className="mb-[22px] flex justify-end">
                <div className="max-w-[540px] rounded-tl-[16px] rounded-tr-[16px] rounded-br-[5px] rounded-bl-[16px] bg-bubble px-4 py-2.5 text-[15px] leading-[1.5] text-[#1b1f24]">
                  {turn.text}
                </div>
              </div>
            )}

            {turn.role === "assistant" && (
              <AnswerTurn
                turn={turn}
                activeCitation={panelTurnId === turn.id ? activeCitation : null}
                onOpenSources={(citation, safetyExpanded) =>
                  onOpenSources(turn.id, citation, safetyExpanded)
                }
              />
            )}

            {turn.role === "error" && (
              <div
                role="alert"
                className="mb-8 flex items-start gap-2.5 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px] leading-[1.5] text-danger"
              >
                <TriangleAlert
                  className="mt-px size-4 shrink-0"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <div>
                  <p className="m-0">{turn.text}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={loading}
                    className="mt-1.5 font-ui text-[12.5px] font-medium underline underline-offset-2 hover:no-underline disabled:no-underline disabled:opacity-60"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </Fragment>
        ))}

        {loading && (
          <div
            role="status"
            className="flex items-center gap-2 pb-2 font-ui text-[12.5px] text-muted"
          >
            <LoaderCircle
              className="size-4 animate-spin text-accent"
              aria-hidden="true"
            />
            Searching your documents…
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
