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
      .catch((loadFailure) => {
        if (cancelled) return;
        setStore({ workspaceId, documents: [], status: "error" });
        setUploadError(
          loadFailure instanceof Error
            ? loadFailure.message
            : "Documents could not be loaded.",
        );
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
        try {
          await uploadDocument(workspaceId, file);
        } catch (uploadFailure) {
          const message =
            uploadFailure instanceof Error
              ? uploadFailure.message
              : "The upload failed.";
          setUploadError(
            message.includes("timed out")
              ? `${message} The upload may still finish; refresh the document list before retrying.`
              : message,
          );
          return;
        }

        const documentsAfterUpload = await fetchDocuments(workspaceId);
        setStore({
          workspaceId,
          documents: documentsAfterUpload,
          status: "ready",
        });
      } catch (refreshFailure) {
        setUploadError(
          `Upload completed, but the document list could not be refreshed. ${
            refreshFailure instanceof Error
              ? refreshFailure.message
              : "Please refresh the document list."
          }`,
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
