export type LspServerStart = {
  available: boolean;
  serviceId: string;
  languageLabel: string;
  sessionId?: string;
  serverName?: string;
  executable?: string;
  installHint?: string;
  error?: string;
};

export type LspServerEvent =
  | {
      sessionId: string;
      type: "message";
      message: unknown;
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
      type: "exit";
      exitCode: number;
      stopped: boolean;
    };
