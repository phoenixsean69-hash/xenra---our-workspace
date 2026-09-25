export type RuntimeValueKind =
  | "primitive"
  | "string"
  | "sequence"
  | "mapping"
  | "callable"
  | "module"
  | "type"
  | "object"
  | "unknown";

export type RuntimeValueSnapshot = {
  type: string;
  kind: RuntimeValueKind;
  display: string;
  objectId?: string;
  length?: number;
};

export type RuntimeEventKind = "call" | "line" | "return" | "exception";

export type RuntimeExceptionSnapshot = {
  type: string;
  message: string;
};

export type RuntimeTraceEvent = {
  sequence: number;
  kind: RuntimeEventKind;
  timeMs: number;
  file: string;
  relativeFile: string;
  line: number;
  function: string;
  depth: number;
  frameId: string;
  locals: Record<string, RuntimeValueSnapshot>;
  returnValue?: RuntimeValueSnapshot;
  exception?: RuntimeExceptionSnapshot;
};

export type RuntimeTraceResult = {
  engine: "python";
  targetPath: string;
  startedAt: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  pythonVersion: string;
  events: RuntimeTraceEvent[];
  truncated: boolean;
  eventLimit: number;
  error?: string;
};
