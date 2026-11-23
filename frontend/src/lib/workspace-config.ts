export const WORKSPACES = [
  { id: "demo-workspace", label: "Procurement" },
  { id: "engineering-ops", label: "Engineering ops" },
  { id: "security-policies", label: "Security policies" },
] as const;

export const DEFAULT_WORKSPACE_ID: string = WORKSPACES[0].id;

export const ACCEPTED_FILE_TYPES = ".pdf,.md,.txt";
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = "10 MB";

export const THREAD_SUGGESTIONS = [
  "What is the liability cap in this contract?",
  "Summarize the termination notice periods.",
  "Which clauses limit confidentiality obligations?",
];
