export type FileNode = {
  name: string;
  path: string;
  isDir: boolean;
};

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language: string;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
};

export type BottomPanelTab = "terminal" | "output" | "problems";
