"use client";

import { ArrowUp, LoaderCircle, Paperclip } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { ACCEPTED_FILE_TYPES } from "@/lib/workspace-config";

interface ChatComposerProps {
  value: string;
  loading: boolean;
  uploading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUploadFile: (file: File) => void;
}

export function ChatComposer({
  value,
  loading,
  uploading,
  onChange,
  onSubmit,
  onUploadFile,
}: ChatComposerProps) {
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadFile(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="shrink-0 bg-paper px-5 pb-[18px] pt-3">
      <form
        className="mx-auto w-full max-w-[720px]"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex h-[76px] items-end gap-2 rounded-field border border-line-strong bg-paper py-2.5 pl-3 pr-2.5 shadow-field transition-[border-color,box-shadow] focus-within:border-[#9daeaa] focus-within:shadow-[0_0_0_3px_rgba(20,84,77,0.09)]">
          <label className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[7px] text-muted transition-colors hover:bg-[#f3f3ef] hover:text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            {uploading ? (
              <LoaderCircle className="size-[17px] animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="size-[17px]" strokeWidth={1.7} aria-hidden="true" />
            )}
            <span className="sr-only">Add documents</span>
            <input
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="sr-only"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>

          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            aria-label="Ask a question about your documents"
            placeholder="Ask about your documents…"
            className="h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-0.5 py-1.5 text-[15px] leading-[1.5] text-ink outline-hidden placeholder:text-[#8b939b]"
          />

          <button
            type="submit"
            aria-label="Send question"
            disabled={loading || !value.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-ink text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {loading ? (
              <LoaderCircle className="size-[19px] animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-[19px]" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
