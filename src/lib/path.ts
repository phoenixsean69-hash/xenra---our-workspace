export function fileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? path;
}

export function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  parts.pop();
  const joined = parts.join("/");

  if (/^[A-Za-z]:$/.test(joined)) return `${joined}/`;
  return joined || "/";
}

export function joinPath(parent: string, child: string): string {
  const separator = parent.includes("\\") ? "\\" : "/";
  const cleanParent = parent.replace(/[\\/]$/, "");
  return `${cleanParent}${separator}${child}`;
}

export function languageFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";

  const map: Record<string, string> = {
    c: "c",
    h: "cpp",
    cc: "cpp",
    cpp: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    py: "python",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    java: "java",
    cs: "csharp",
    rs: "rust",
    go: "go",
    php: "php",
    rb: "ruby",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    json: "json",
    md: "markdown",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    sh: "shell",
    ps1: "powershell",
    txt: "plaintext"
  };

  return map[extension] ?? "plaintext";
}
