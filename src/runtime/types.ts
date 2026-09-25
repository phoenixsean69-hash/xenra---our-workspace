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

export type RuntimeTraceSessionStart = {
  sessionId: string;
  engine: "python";
  targetPath: string;
  startedAt: string;
  eventLimit: number;
};

export type RuntimeTraceResult = {
  sessionId: string;
  engine: "python";
  targetPath: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  pythonVersion: string;
  events: RuntimeTraceEvent[];
  truncated: boolean;
  eventLimit: number;
  running: boolean;
  stopped: boolean;
  error?: string;
};

export type RuntimeTraceMessage =
  | {
      type: "meta";
      sessionId: string;
      pythonVersion: string;
      eventLimit: number;
    }
  | {
      type: "event";
      sessionId: string;
      event: RuntimeTraceEvent;
    }
  | {
      type: "stdout";
      sessionId: string;
      chunk: string;
    }
  | {
      type: "stderr";
      sessionId: string;
      chunk: string;
    }
  | {
      type: "limit";
      sessionId: string;
      truncated: true;
      eventLimit: number;
    }
  | {
      type: "error";
      sessionId: string;
      message: string;
    }
  | {
      type: "complete";
      sessionId: string;
      durationMs: number;
      exitCode: number;
      stopped: boolean;
      truncated: boolean;
      eventLimit: number;
      pythonVersion?: string;
      error?: string;
    };
