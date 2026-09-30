export type EditorProblemSeverity = "error" | "warning" | "info" | "hint";

export type EditorProblem = {
  owner: string;
  path: string;
  message: string;
  severity: EditorProblemSeverity;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code?: string;
};
