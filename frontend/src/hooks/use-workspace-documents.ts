"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteDocument,
  fetchDocuments,
  uploadDocument,
  type WorkspaceDoc,
} from "@/lib/api";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
} from "@/lib/workspace-config";

interface DocumentStore {
  workspaceId: string;
  documents: WorkspaceDoc[];
  status: "loading" | "ready" | "error";
}

export function useWorkspaceDocuments(workspaceId: string) {
  const [store, setStore] = useState<DocumentStore>({
    workspaceId,
    documents: [],
    status: "loading",
  });
  const [uploading, setUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDocuments(workspaceId)
      .then((documents) => {
        if (cancelled) return;
        setStore({ workspaceId, documents, status: "ready" });
      })
      .catch(() => {
        if (cancelled) return;
        setStore({ workspaceId, documents: [], status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const isCurrentWorkspace = store.workspaceId === workspaceId;
  const documents = isCurrentWorkspace ? store.documents : [];
  const loading = !isCurrentWorkspace || store.status === "loading";
  const loadError =
    isCurrentWorkspace && store.status === "error"
      ? "Documents could not be loaded."
      : null;

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`This file is larger than ${MAX_FILE_SIZE_LABEL}.`);
        return;
      }

      setUploading(true);
      setUploadError(null);
      try {
        await uploadDocument(workspaceId, file);
        const documentsAfterUpload = await fetchDocuments(workspaceId);
        setStore({
          workspaceId,
          documents: documentsAfterUpload,
          status: "ready",
        });
      } catch (uploadFailure) {
        setUploadError(
          uploadFailure instanceof Error
            ? uploadFailure.message
            : "The upload failed.",
        );
      } finally {
        setUploading(false);
      }
    },
    [workspaceId],
  );

  const remove = useCallback(
    async (docId: string) => {
      setDeletingDocumentId(docId);
      setUploadError(null);
      try {
        await deleteDocument(workspaceId, docId);
        const documentsAfterDelete = await fetchDocuments(workspaceId);
        setStore({
          workspaceId,
          documents: documentsAfterDelete,
          status: "ready",
        });
      } catch (deleteFailure) {
        setUploadError(
          deleteFailure instanceof Error
            ? deleteFailure.message
            : "The document could not be deleted.",
        );
      } finally {
        setDeletingDocumentId(null);
      }
    },
    [workspaceId],
  );

  const dismissError = useCallback(() => {
    setUploadError(null);
    setStore((current) =>
      current.status === "error" ? { ...current, status: "ready" } : current,
    );
  }, []);

  return {
    documents,
    loading,
    uploading,
    deletingDocumentId,
    error: uploadError ?? loadError,
    upload,
    remove,
    dismissError,
  };
}
