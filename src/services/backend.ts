import type { CommandResult, FileNode, SearchResult } from "../types";
import type { RuntimeTraceResult } from "../runtime/types";

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

export function searchProject(rootPath: string, query: string): Promise<SearchResult[]> {
  return bridge().searchProject(rootPath, query);
}

export function gitCommand(cwd: string, args: string[]): Promise<CommandResult> {
  return bridge().gitCommand(cwd, args);
}

export function tracePython(rootPath: string, targetPath: string): Promise<RuntimeTraceResult> {
  return bridge().tracePython(rootPath, targetPath);
}

export function closeWindow(): Promise<void> {
  return bridge().closeWindow();
}
