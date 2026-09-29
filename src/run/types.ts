export type RunSessionStart = {
  sessionId: string;
  cwd: string;
  command: string;
  startedAt: string;
};

export type RunSessionMessage =
  | {
      sessionId: string;
      type: "stdout";
      chunk: string;
    }
  | {
      sessionId: string;
      type: "stderr";
      chunk: string;
    }
  | {
      sessionId: string;
      type: "error";
      message: string;
    }
  | {
      sessionId: string;
      type: "complete";
      durationMs: number;
      exitCode: number;
      stopped: boolean;
    };
