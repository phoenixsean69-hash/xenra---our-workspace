import type { CommandResult, FileNode } from "./types";

declare global {
  interface Window {
    university: {
      chooseProjectFolder(): Promise<string | null>;
      listDirectory(path: string): Promise<FileNode[]>;
      readTextFile(path: string): Promise<string>;
      writeTextFile(path: string, content: string): Promise<void>;
      createFile(path: string): Promise<void>;
      createDirectory(path: string): Promise<void>;
      renamePath(path: string, newPath: string): Promise<void>;
      deletePath(path: string): Promise<void>;
      executeCommand(cwd: string, command: string): Promise<CommandResult>;
    };
  }
}

export {};
