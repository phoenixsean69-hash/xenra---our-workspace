import type { CommandResult, FileNode, SearchResult } from "../types";
import type { ToolchainReport } from "../languages/types";
import type { RunSessionMessage, RunSessionStart } from "../run/types";
import type {
  RuntimeTraceMessage,
  RuntimeTraceSessionStart
} from "../runtime/types";

function bridge() {
  const api = window.xenra ?? window.university;
  if (!api) {
    throw new Error("Desktop bridge is unavailable. Start XENRA with npm run dev, not only Vite.");
  }
  return api;
}

export function chooseProjectFolder(): Promise<string | null> {
  return bridge().chooseProjectFolder();
}

export function chooseDirectory(defaultPath?: string | null): Promise<string | null> {
  return bridge().chooseDirectory(defaultPath);
}

export function listDirectory(path: string): Promise<FileNode[]> {
  return bridge().listDirectory(path);
}

export function readTextFile(path: string): Promise<string> {
  return bridge().readTextFile(path);
}

export function writeTextFile(path: string, content: string): Promise<void> {
  return bridge().writeTextFile(path, content);
}

export function createFile(path: string): Promise<void> {
  return bridge().createFile(path);
}

export function createDirectory(path: string): Promise<void> {
  return bridge().createDirectory(path);
}

export function renamePath(path: string, newPath: string): Promise<void> {
  return bridge().renamePath(path, newPath);
}

export function deletePath(path: string): Promise<void> {
  return bridge().deletePath(path);
}

export function executeCommand(cwd: string, command: string): Promise<CommandResult> {
  return bridge().executeCommand(cwd, command);
}

export function prepareRunSession(cwd: string, command: string): Promise<RunSessionStart> {
  return bridge().prepareRunSession(cwd, command);
}

export function beginRunSession(sessionId: string): Promise<boolean> {
  return bridge().beginRunSession(sessionId);
}

export function writeRunSession(sessionId: string, input: string): Promise<boolean> {
  return bridge().writeRunSession(sessionId, input);
}

export function stopRunSession(sessionId: string): Promise<boolean> {
  return bridge().stopRunSession(sessionId);
}

export function onRunSessionMessage(callback: (message: RunSessionMessage) => void): () => void {
  return bridge().onRunSessionMessage(callback);
}

export function searchProject(rootPath: string, query: string): Promise<SearchResult[]> {
  return bridge().searchProject(rootPath, query);
}

export function gitCommand(cwd: string, args: string[]): Promise<CommandResult> {
  return bridge().gitCommand(cwd, args);
}

export function detectToolchains(cwd: string): Promise<ToolchainReport> {
  return bridge().detectToolchains(cwd);
}

export function preparePythonTrace(rootPath: string, targetPath: string): Promise<RuntimeTraceSessionStart> {
  return bridge().preparePythonTrace(rootPath, targetPath);
}

export function beginPythonTrace(sessionId: string): Promise<boolean> {
  return bridge().beginPythonTrace(sessionId);
}

export function stopPythonTrace(sessionId: string): Promise<boolean> {
  return bridge().stopPythonTrace(sessionId);
}

export function onPythonTraceMessage(callback: (message: RuntimeTraceMessage) => void): () => void {
  return bridge().onPythonTraceMessage(callback);
}

export function closeWindow(): Promise<void> {
  return bridge().closeWindow();
}
