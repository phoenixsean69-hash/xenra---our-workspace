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

export type SearchResult = {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
};

export type BottomPanelTab = "terminal" | "output" | "problems" | "execution";
export type SidebarView = "explorer" | "search" | "source";
