"use client";

import { ChevronDown, FileText, LoaderCircle, Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import type { WorkspaceDoc } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ACCEPTED_FILE_TYPES, WORKSPACES } from "@/lib/workspace-config";
import type { Thread } from "@/lib/threads";

interface WorkspaceSidebarProps {
  className?: string;
  workspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  documents: WorkspaceDoc[];
  documentsLoading: boolean;
  uploading: boolean;
  error: string | null;
  onDismissError: () => void;
  onUploadFile: (file: File) => void;
  onOpenDocument: (docId: string) => Promise<string | null>;
}

const rowClass =
  "flex h-[38px] w-full items-center gap-[9px] rounded-[7px] px-2.5 text-left font-ui text-[13.5px] transition-colors";
const rowIdleClass = "text-ink-2 hover:bg-rail-hover hover:text-ink";
const rowActiveClass = "bg-rail-active font-medium text-ink";

export function WorkspaceSidebar({
  className,
  workspaceId,
  onWorkspaceChange,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  documents,
  documentsLoading,
  uploading,
  error,
  onDismissError,
  onUploadFile,
  onOpenDocument,
}: WorkspaceSidebarProps) {
  const [documentError, setDocumentError] = useState<string | null>(null);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadFile(file);
  };

  const handleOpenDocument = async (docId: string) => {
    setDocumentError(null);
    const message = await onOpenDocument(docId);
    setDocumentError(message);
  };

  const conversations = threads.filter((thread) => thread.turns.length > 0);

  return (
    <aside
      className={cn(
        "shrink-0 flex-col overflow-hidden border-r border-line bg-rail px-3 pb-3.5",
        className,
      )}
    >
      <div className="flex h-[72px] shrink-0 flex-col justify-center gap-[5px] px-1">
        <Link
          href="/"
          className="flex items-center gap-[9px] font-ui text-[15px] font-semibold tracking-[-0.01em] text-ink"
        >
          <span className="grid size-[26px] place-items-center rounded-[7px] bg-ink text-white">
            <FileText className="size-[15px]" strokeWidth={1.9} aria-hidden="true" />
          </span>
          AnchorDocs
        </Link>
        <div className="relative ml-[35px] inline-block">
          <select
            aria-label="Workspace"
            value={workspaceId}
            onChange={(event) => onWorkspaceChange(event.target.value)}
            className="h-5 max-w-full appearance-none rounded-[4px] bg-transparent pr-4 font-ui text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
          >
            {WORKSPACES.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-0 top-1/2 size-3.5 -translate-y-1/2 text-muted"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onNewThread}
        className="mt-0.5 flex h-10 w-full shrink-0 items-center gap-[9px] rounded-[8px] border border-line-strong bg-paper px-2.5 font-ui text-[13.5px] font-medium text-ink transition-colors hover:border-[#c3c6bd] hover:bg-[#fcfcfa]"
      >
        <Plus className="size-[15px]" strokeWidth={2} aria-hidden="true" />
        New chat
      </button>

      <nav
        aria-label="Workspace"
        className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pt-5"
      >
        <div className="mb-1.5 flex items-center justify-between px-2.5 font-ui text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#8a929b]">
          Recent conversations
        </div>
        {conversations.length ? (
          <ul className="m-0 flex list-none flex-col gap-px p-0">
            {conversations.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    aria-current={isActive ? "page" : undefined}
                    title={thread.title}
                    className={cn(rowClass, isActive ? rowActiveClass : rowIdleClass)}
                  >
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 px-2.5 pb-1 text-[12.5px] leading-[1.5] text-muted">
            No conversations yet.
          </p>
        )}

        <div className="mb-1.5 mt-5 flex items-center justify-between px-2.5">
          <span className="font-ui text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#8a929b]">
            Documents
          </span>
          <span className="font-ui text-[11.5px] font-semibold text-muted">
            {documents.length}
          </span>
        </div>

        {documentsLoading ? (
          <div className="flex flex-col gap-3 px-2.5 py-2" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <span
                key={row}
                className="block h-3 animate-pulse rounded bg-line"
                style={{ width: `${[82, 68, 74][row]}%` }}
              />
            ))}
          </div>
        ) : documents.length ? (
          <ul className="m-0 flex list-none flex-col gap-px p-0">
            {documents.map((document) => (
              <li key={document.doc_id}>
                <button
                  type="button"
                  onClick={() => void handleOpenDocument(document.doc_id)}
                  title={document.filename}
                  className={cn(rowClass, rowIdleClass)}
                >
                  <FileText
                    className="size-[15px] shrink-0 text-muted"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{document.filename}</span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {document.page_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 px-2.5 pb-1 text-[12.5px] leading-[1.5] text-muted">
            No documents in this workspace.
          </p>
        )}

        <label className="mt-1 flex h-[38px] w-full cursor-pointer items-center gap-[9px] rounded-[7px] px-2.5 font-ui text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-rail-hover hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          {uploading ? (
            <LoaderCircle className="size-[15px] animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-[15px]" strokeWidth={1.8} aria-hidden="true" />
          )}
          {uploading ? "Uploading document" : "Add documents"}
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="sr-only"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </label>

        {(error || documentError) && (
          <div
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-[7px] bg-danger-soft px-2.5 py-2 text-[12px] leading-[1.5] text-danger"
          >
            <span className="min-w-0 flex-1">{error ?? documentError}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => {
                setDocumentError(null);
                onDismissError();
              }}
              className="mt-px text-danger/70 transition-colors hover:text-danger"
            >
              <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
      </nav>
    </aside>
  );
}
