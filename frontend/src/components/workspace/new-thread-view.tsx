"use client";

import { LoaderCircle, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import type { WorkspaceDoc } from "@/lib/api";
import {
  ACCEPTED_FILE_TYPES,
  THREAD_SUGGESTIONS,
} from "@/lib/workspace-config";

interface NewThreadViewProps {
  documents: WorkspaceDoc[];
  uploading: boolean;
  onSuggestion: (suggestion: string) => void;
  onUploadFile: (file: File) => void;
}

export function NewThreadView({
  documents,
  uploading,
  onSuggestion,
  onUploadFile,
}: NewThreadViewProps) {
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadFile(file);
  };

  return (
    <section className="max-w-[560px] pt-12">
      <h2 className="m-0 font-ui text-[20px] font-semibold tracking-[-0.015em] text-ink">
        New chat
      </h2>

      {documents.length > 0 ? (
        <div className="mt-6 flex flex-col items-start gap-2">
          {THREAD_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border border-line bg-paper px-3.5 py-2 text-left font-ui text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:bg-rail hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-[10px] border border-line bg-rail px-4 py-4">
          <p className="m-0 text-[13.5px] leading-[1.6] text-ink-2">
            No documents in this workspace yet.
          </p>
          <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[7px] border border-line-strong bg-paper px-3 font-ui text-[13px] font-medium text-ink transition-colors hover:bg-[#fcfcfa] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" strokeWidth={1.8} aria-hidden="true" />
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
        </div>
      )}
    </section>
  );
}
