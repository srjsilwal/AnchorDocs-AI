"use client";

import { Files, ShieldCheck } from "lucide-react";
import { Fragment, useMemo } from "react";
import {
  answerParagraphs,
  buildCitations,
  tokenizeAnswer,
} from "@/lib/citations";
import { cn } from "@/lib/cn";
import type { ChatTurn } from "@/lib/threads";

interface AnswerTurnProps {
  turn: ChatTurn;
  activeCitation: number | null;
  onOpenSources: (citation: number, safetyExpanded: boolean) => void;
}

const footButtonClass =
  "inline-flex h-[30px] items-center gap-1.5 rounded-[6px] px-2 font-ui text-[12.5px] font-medium text-muted transition-colors hover:bg-[#f3f3ef] hover:text-ink";

export function AnswerTurn({
  turn,
  activeCitation,
  onOpenSources,
}: AnswerTurnProps) {
  const citations = useMemo(
    () => (turn.meta ? buildCitations(turn.meta) : []),
    [turn.meta],
  );
  const paragraphs = useMemo(() => answerParagraphs(turn.text), [turn.text]);

  return (
    <article className="mb-8">
      <div className="text-[16px] leading-[1.66] text-answer">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p
            key={`${turn.id}-${paragraphIndex}`}
            className="m-0 mb-3.5 last:mb-0"
          >
            {tokenizeAnswer(paragraph, citations.length).map((token, tokenIndex) =>
              token.kind === "text" ? (
                <Fragment key={tokenIndex}>{token.value}</Fragment>
              ) : (
                <button
                  key={tokenIndex}
                  type="button"
                  aria-label={`Show source ${token.index}`}
                  aria-pressed={activeCitation === token.index}
                  onClick={() => onOpenSources(token.index, false)}
                  className={cn(
                    "ml-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[4px] border px-1 align-[1.5px] font-ui text-[11px] font-semibold leading-none transition-colors",
                    activeCitation === token.index
                      ? "border-accent bg-accent text-white"
                      : "border-transparent bg-accent-soft text-accent hover:border-accent-line",
                  )}
                >
                  {token.index}
                </button>
              ),
            )}
          </p>
        ))}
      </div>

      <div className="mt-2 flex h-10 items-center gap-1">
        {citations.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenSources(1, false)}
            className={footButtonClass}
          >
            <Files className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
            {citations.length} {citations.length === 1 ? "source" : "sources"}
          </button>
        )}
        {citations.length > 0 && (
          <span
            className="mx-0.5 h-[13px] w-px bg-line-strong"
            aria-hidden="true"
          />
        )}
        {turn.meta && (
          <button
            type="button"
            onClick={() => onOpenSources(1, true)}
            className={footButtonClass}
          >
            <ShieldCheck
              className="size-3.5"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Safety checks
          </button>
        )}
      </div>
    </article>
  );
}
