export type ToolchainId =
  | "python"
  | "node"
  | "tsx"
  | "ts-node"
  | "tsc"
  | "gcc"
  | "g++"
  | "clang"
  | "clang++"
  | "javac"
  | "java"
  | "dotnet"
  | "csc"
  | "go"
  | "rustc"
  | "cargo"
  | "php"
  | "ruby"
  | "powershell"
  | "bash"
  | "nasm"
  | "as";

export type ToolchainStatus = {
  id: ToolchainId;
  label: string;
  available: boolean;
  command?: string;
  prefixArgs?: string[];
  version?: string;
  error?: string;
};

export type ToolchainReport = {
  platform: string;
  detectedAt: string;
  tools: ToolchainStatus[];
};

export type LanguageCategory = "programming" | "web" | "data" | "text";

export type LanguageDefinition = {
  id: string;
  name: string;
  monaco: string;
  extensions: string[];
  category: LanguageCategory;
  runnable: boolean;
  buildable: boolean;
  toolchains: ToolchainId[];
  notes?: string;
};

export type CommandPlan = {
  kind: "run" | "build";
  languageId: string;
  languageName: string;
  command: string;
  toolchains: ToolchainId[];
  description: string;
};

export type PlanResolution =
  | { ok: true; plan: CommandPlan }
  | { ok: false; language?: LanguageDefinition; message: string; missing: ToolchainId[] };
