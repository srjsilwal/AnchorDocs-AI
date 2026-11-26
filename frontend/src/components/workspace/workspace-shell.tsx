"use client";

import { useCallback, useMemo, useState } from "react";
import { useThreadStore } from "@/hooks/use-thread-store";
import { useWorkspaceDocuments } from "@/hooks/use-workspace-documents";
import { fetchDocumentPreview } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEFAULT_WORKSPACE_ID, WORKSPACES } from "@/lib/workspace-config";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { NewThreadView } from "./new-thread-view";
import { SourcesPanel } from "./sources-panel";
import { ThreadHeader } from "./thread-header";
import { WorkspaceSidebar } from "./workspace-sidebar";

interface PanelSelection {
  turnId: string;
  citation: number;
  safetyExpanded: boolean;
}

export default function WorkspaceShell() {
  const [workspaceId, setWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panel, setPanel] = useState<PanelSelection | null>(null);
  const [input, setInput] = useState("");

  const {
    documents,
    loading: documentsLoading,
    uploading,
    deletingDocumentId,
    error: documentsError,
    upload,
    remove: removeDocument,
    dismissError,
  } = useWorkspaceDocuments(workspaceId);

  const {
    threads,
    activeThread,
    activeThreadId,
    sending,
    startNewThread,
    selectThread,
    send,
    retryLast,
  } = useThreadStore(workspaceId);

  const turns = useMemo(() => activeThread?.turns ?? [], [activeThread]);

  const workspaceLabel =
    WORKSPACES.find((workspace) => workspace.id === workspaceId)?.label ??
    "Workspace";

  const panelTurn = useMemo(() => {
    if (!panel || !activeThread) return null;
    return (
      activeThread.turns.find(
        (turn) => turn.id === panel.turnId && turn.meta,
      ) ?? null
    );
  }, [activeThread, panel]);

  const lastAnswer = useMemo(
    () =>
      [...turns]
        .reverse()
        .find((turn) => turn.role === "assistant" && turn.meta) ?? null,
    [turns],
  );

  const panelOpen = Boolean(panel && panelTurn?.meta);

  const handleNewThread = useCallback(() => {
    startNewThread();
    setPanel(null);
    setSidebarOpen(false);
    setInput("");
  }, [startNewThread]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      setPanel(null);
      setSidebarOpen(false);
      setInput("");
    },
    [selectThread],
  );

  const handleWorkspaceChange = useCallback((nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setPanel(null);
    setSidebarOpen(false);
    setInput("");
  }, []);

  const submitQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || sending) return;
      setInput("");
      setPanel(null);
      await send(trimmed);
    },
    [send, sending],
  );

  const toggleSources = useCallback(() => {
    if (panel) {
      setPanel(null);
      return;
    }
    if (!lastAnswer) return;
    setPanel({ turnId: lastAnswer.id, citation: 1, safetyExpanded: false });
  }, [lastAnswer, panel]);

  const openSources = useCallback(
    (turnId: string, citation: number, safetyExpanded: boolean) => {
      setPanel({ turnId, citation, safetyExpanded });
    },
    [],
  );

  const openDocument = useCallback(
    async (docId: string) => {
      try {
        const preview = await fetchDocumentPreview(workspaceId, docId);
        if (!preview.url) return "No preview is available for this document.";
        window.open(preview.url, "_blank", "noopener,noreferrer");
        return null;
      } catch {
        return "This document could not be opened.";
      }
    },
    [workspaceId],
  );

  const handleUpload = useCallback(
    (file: File) => {
      void upload(file);
    },
    [upload],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-ink/25 lg:hidden"
        />
      )}

      <WorkspaceSidebar
        className={
          sidebarOpen
            ? "fixed inset-y-0 left-0 z-40 flex w-[280px] shadow-[0_0_40px_rgba(16,24,40,0.18)]"
            : "hidden w-[260px] lg:flex"
        }
        workspaceId={workspaceId}
        onWorkspaceChange={handleWorkspaceChange}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        documents={documents}
        documentsLoading={documentsLoading}
        uploading={uploading}
        deletingDocumentId={deletingDocumentId}
        error={documentsError}
        onDismissError={dismissError}
        onUploadFile={handleUpload}
        onDeleteDocument={removeDocument}
        onOpenDocument={openDocument}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <ThreadHeader
          title={
            turns.length > 0 ? (activeThread?.title ?? "New chat") : workspaceLabel
          }
          panelOpen={panelOpen}
          canToggleSources={Boolean(lastAnswer)}
          onToggleSources={toggleSources}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col transition-[margin] duration-200 ease-out",
            panelOpen && "lg:mr-[420px]",
          )}
        >
          <ChatThread
            turns={turns}
            loading={sending}
            panelTurnId={panel?.turnId ?? null}
            activeCitation={panel?.citation ?? null}
            emptyState={
              <NewThreadView
                documents={documents}
                uploading={uploading}
                onSuggestion={(suggestion) => void submitQuery(suggestion)}
                onUploadFile={handleUpload}
              />
            }
            onOpenSources={openSources}
            onRetry={() => void retryLast()}
          />

          <ChatComposer
            value={input}
            loading={sending}
            uploading={uploading}
            onChange={setInput}
            onSubmit={() => void submitQuery(input)}
            onUploadFile={handleUpload}
          />
        </div>

        {panelOpen && panel && panelTurn?.meta && (
          <SourcesPanel
            meta={panelTurn.meta}
            documents={documents}
            selectedCitation={panel.citation}
            safetyExpanded={panel.safetyExpanded}
            onSelectCitation={(citation) =>
              setPanel((current) =>
                current ? { ...current, citation } : current,
              )
            }
            onToggleSafety={() =>
              setPanel((current) =>
                current
                  ? { ...current, safetyExpanded: !current.safetyExpanded }
                  : current,
              )
            }
            onClose={() => setPanel(null)}
            onOpenDocument={openDocument}
          />
        )}
      </div>
    </div>
  );
}
