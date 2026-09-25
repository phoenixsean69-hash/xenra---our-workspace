import type { CommandResult, FileNode } from "../types";

function bridge() {
  if (!window.university) {
    throw new Error("Desktop bridge is unavailable. Start the app with npm run dev, not only vite.");
  }
  return window.university;
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
