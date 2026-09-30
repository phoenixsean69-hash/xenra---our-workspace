import type { CommandResult, FileNode, SearchResult } from "./types";
import type { ToolchainReport } from "./languages/types";
import type { RunSessionMessage, RunSessionStart } from "./run/types";
import type {
  RuntimeTraceMessage,
  RuntimeTraceSessionStart
} from "./runtime/types";

type XenraDesktopBridge = {
  chooseProjectFolder(): Promise<string | null>;
  chooseDirectory(defaultPath?: string | null): Promise<string | null>;
  listDirectory(path: string): Promise<FileNode[]>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  renamePath(path: string, newPath: string): Promise<void>;
  deletePath(path: string): Promise<void>;
  executeCommand(cwd: string, command: string): Promise<CommandResult>;
  prepareRunSession(cwd: string, command: string): Promise<RunSessionStart>;
  beginRunSession(sessionId: string): Promise<boolean>;
  writeRunSession(sessionId: string, input: string): Promise<boolean>;
  stopRunSession(sessionId: string): Promise<boolean>;
  onRunSessionMessage(callback: (message: RunSessionMessage) => void): () => void;
  searchProject(rootPath: string, query: string): Promise<SearchResult[]>;
  gitCommand(cwd: string, args: string[]): Promise<CommandResult>;
  detectToolchains(cwd: string): Promise<ToolchainReport>;
  preparePythonTrace(rootPath: string, targetPath: string): Promise<RuntimeTraceSessionStart>;
  beginPythonTrace(sessionId: string): Promise<boolean>;
  stopPythonTrace(sessionId: string): Promise<boolean>;
  onPythonTraceMessage(callback: (message: RuntimeTraceMessage) => void): () => void;
  closeWindow(): Promise<void>;
};

declare global {
  interface Window {
    xenra?: XenraDesktopBridge;
    /** @deprecated Compatibility alias. New XENRA code should use window.xenra. */
    university?: XenraDesktopBridge;
  }
}

export {};
