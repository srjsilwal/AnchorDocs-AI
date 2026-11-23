"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import type { ChatApiResponse, WorkspaceDoc } from "@/lib/api";
import {
  buildCitations,
  confidenceLabel,
  describeLocation,
} from "@/lib/citations";
import { cn } from "@/lib/cn";

interface SourcesPanelProps {
  meta: ChatApiResponse;
  documents: WorkspaceDoc[];
  selectedCitation: number;
  safetyExpanded: boolean;
  onSelectCitation: (index: number) => void;
  onToggleSafety: () => void;
  onClose: () => void;
  onOpenDocument: (docId: string) => Promise<string | null>;
}

const safetyRowClass =
  "grid grid-cols-[96px_1fr] gap-2.5 border-b border-[#f0f0ec] py-[7px] text-[12.5px] leading-[1.55] last:border-b-0";

export function SourcesPanel({
  meta,
  documents,
  selectedCitation,
  safetyExpanded,
  onSelectCitation,
  onToggleSafety,
  onClose,
  onOpenDocument,
}: SourcesPanelProps) {
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const citations = useMemo(() => buildCitations(meta), [meta]);
  const selected =
    citations.find((citation) => citation.index === selectedCitation) ??
    citations[0] ??
    null;
  const others = citations.filter(
    (citation) => citation.index !== selected?.index,
  );
  const matchedDocument = selected?.filename
    ? (documents.find((document) => document.filename === selected.filename) ??
      null)
    : null;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const confidenceTone =
    meta.confidence === "insufficient_evidence"
      ? "bg-danger"
      : meta.confidence === "medium"
        ? "bg-warn"
        : "bg-accent";

  const handleOpenDocument = async () => {
    if (!matchedDocument || opening) return;
    setOpening(true);
    setPreviewError(null);
    const message = await onOpenDocument(matchedDocument.doc_id);
    setPreviewError(message);
    setOpening(false);
  };

  return (
    <aside
      id="sources-panel"
      ref={panelRef}
      tabIndex={-1}
      aria-label="Sources"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-paper shadow-panel outline-hidden focus-visible:outline-hidden sm:top-[72px] sm:w-[420px]"
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line pl-5 pr-3.5">
        <div className="flex items-baseline">
          <h2 className="m-0 font-ui text-[14.5px] font-semibold text-ink">
            Sources
          </h2>
          <span className="ml-2 font-ui text-[12.5px] font-medium text-muted">
            {selected
              ? `${selected.index} of ${citations.length}`
              : "No citations"}
          </span>
        </div>
        <IconButton aria-label="Close sources" onClick={onClose}>
          <X className="size-[17px]" strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-[22px]">
        {selected ? (
          <>
            <div className="flex items-start gap-2.5 pb-4">
              <FileText
                className="mt-px size-[18px] shrink-0 text-ink-2"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="m-0 break-words font-ui text-[14.5px] font-semibold leading-[1.35] text-ink">
                  {selected.filename ?? "Source unavailable"}
                </p>
                <p className="m-0 mt-[3px] text-[12.5px] text-muted">
                  {describeLocation(selected)}
                </p>
              </div>
            </div>

            <blockquote className="m-0 border-l-2 border-[#cfe0dc] pl-3.5 text-[14.5px] leading-[1.62] text-[#2b3138]">
              {selected.quote}
            </blockquote>

            {selected.snippet && (
              <div className="mt-[18px] whitespace-pre-line rounded-[10px] border border-line bg-[#f8f8f5] p-3.5 text-[13.5px] leading-[1.68] text-[#3c424a]">
                {selected.snippet}
              </div>
            )}

            {others.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="m-0 font-ui text-[12.5px] font-semibold text-ink">
                    Other citations
                  </h3>
                  <span className="font-ui text-[12px] text-muted">
                    {others.length}
                  </span>
                </div>
                {others.map((citation) => (
                  <button
                    key={`${citation.chunkId}-${citation.index}`}
                    type="button"
                    onClick={() => onSelectCitation(citation.index)}
                    className="flex w-full items-start gap-2.5 rounded-[7px] px-2 py-2.5 text-left transition-colors hover:bg-[#f5f5f1]"
                  >
                    <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-[4px] bg-accent-soft font-ui text-[11px] font-semibold text-accent">
                      {citation.index}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words font-ui text-[13px] font-medium leading-[1.4] text-ink">
                        {citation.filename ?? "Source unavailable"}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">
                        {describeLocation(citation)}
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </>
        ) : (
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            No sources were returned for this answer.
          </p>
        )}

        <section className="mt-[22px] border-t border-line pt-4">
          <button
            type="button"
            aria-expanded={safetyExpanded}
            onClick={onToggleSafety}
            className="flex h-7 w-full items-center justify-between"
          >
            <span className="flex items-center gap-1.5 font-ui text-[12.5px] font-semibold text-ink">
              <ShieldCheck
                className="size-3.5 text-ink-2"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              Safety checks
            </span>
            {safetyExpanded ? (
              <ChevronUp
                className="size-3.5 text-muted"
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="size-3.5 text-muted"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </button>

          {safetyExpanded && (
            <div className="mt-1.5">
              <dl className="m-0">
                <div className={safetyRowClass}>
                  <dt className="text-muted">Confidence</dt>
                  <dd className="m-0 flex items-center gap-1.5 text-ink-2">
                    <span
                      className={cn("size-[5px] rounded-full", confidenceTone)}
                      aria-hidden="true"
                    />
                    {confidenceLabel(meta.confidence)}
                  </dd>
                </div>
                <div className={safetyRowClass}>
                  <dt className="text-muted">Input</dt>
                  <dd className="m-0 text-ink-2">
                    {meta.input_sanitized
                      ? `Redacted${
                          meta.redacted_categories?.length
                            ? `: ${meta.redacted_categories.join(", ")}`
                            : ""
                        }`
                      : "No redactions applied"}
                  </dd>
                </div>
              </dl>
              {meta.guardrail_notes?.map((note) => (
                <p
                  key={note}
                  className="m-0 mt-2 rounded-[8px] bg-warn-soft px-3 py-2.5 text-[12.5px] leading-[1.55] text-[#5f4410]"
                >
                  {note}
                </p>
              ))}
            </div>
          )}
        </section>

        {previewError && (
          <p role="alert" className="m-0 mt-3 text-[12px] text-danger">
            {previewError}
          </p>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-line px-5">
        {matchedDocument ? (
          <button
            type="button"
            onClick={() => void handleOpenDocument()}
            disabled={opening}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-line-strong px-2.5 font-ui text-[12.5px] font-medium text-ink transition-colors hover:bg-[#f6f6f2]"
          >
            {opening ? (
              <LoaderCircle className="size-3.5 animate-spin text-muted" aria-hidden="true" />
            ) : (
              <ExternalLink className="size-3.5 text-muted" strokeWidth={1.8} aria-hidden="true" />
            )}
            Open document
          </button>
        ) : (
          <span className="text-[12.5px] text-muted">Preview unavailable</span>
        )}
        {selected?.page && (
          <span className="font-ui text-[12px] text-muted">p. {selected.page}</span>
        )}
      </div>
    </aside>
  );
}
