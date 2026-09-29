import { monacoLanguageForPath } from "../languages/registry";

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
  return monacoLanguageForPath(path);
}
