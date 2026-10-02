import type * as Monaco from "monaco-editor";
import {
  createFile,
  deletePath,
  onLanguageServerMessage,
  readTextFile,
  renamePath,
  sendLanguageServerMessage,
  startLanguageServer,
  stopLanguageServer,
  writeTextFile
} from "../services/backend";
import type { LspServerEvent, LspServerStart } from "./types";

type MonacoApi = typeof import("monaco-editor");
type StandaloneEditor = Monaco.editor.IStandaloneCodeEditor;
type TextModel = Monaco.editor.ITextModel;
type Disposable = { dispose(): void };
type StatusSink = (message: string) => void;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: number;
};

const SERVICE_BY_MONACO_LANGUAGE: Record<string, string> = {
  python: "python",
  c: "clangd",
  cpp: "clangd",
  java: "java",
  csharp: "csharp",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  powershell: "powershell",
  shell: "shell",
  asm: "assembly"
};

const LSP_LANGUAGE_BY_MONACO_LANGUAGE: Record<string, string> = {
  python: "python",
  c: "c",
  cpp: "cpp",
  java: "java",
  csharp: "csharp",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  powershell: "powershell",
  shell: "shellscript",
  asm: "asm"
};

const connections = new Map<string, LspConnection>();
const connectionPromises = new Map<string, Promise<LspConnection | null>>();
const sessionConnections = new Map<string, LspConnection>();
const documentConnections = new Map<string, LspConnection>();
const providerDisposables: Disposable[] = [];

let monacoRef: MonacoApi | null = null;
let transportDispose: (() => void) | null = null;
let providersInstalled = false;
let lspCommandRegistered = false;

const EXECUTE_COMMAND_ID = "xenra.lsp.executeCommand";
const APPLY_ACTION_ID = "xenra.lsp.applyAction";

export function fileUriFromPath(value: string) {
  let normalized = value.replace(/\\/g, "/");

  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = `/${normalized}`;
  }

  return `file://${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

function filePathFromUri(uri: string) {
  const parsed = new URL(uri);

  if (parsed.protocol !== "file:") {
    return uri;
  }

  let pathname = decodeURIComponent(parsed.pathname);

  if (/^\/[A-Za-z]:\//.test(pathname)) {
    pathname = pathname.slice(1);
  }

  if (parsed.host) {
    return `\\\\${parsed.host}${pathname.replace(/\//g, "\\")}`;
  }

  return /^[A-Za-z]:\//.test(pathname)
    ? pathname.replace(/\//g, "\\")
    : pathname;
}

function baseName(pathValue: string) {
  const normalized = pathValue.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? pathValue;
}

function ensureTransport() {
  if (transportDispose) return;

  transportDispose = onLanguageServerMessage((event) => {
    const connection = sessionConnections.get(event.sessionId);
    connection?.handleTransportEvent(event);
  });
}

function toLspPosition(position: { lineNumber: number; column: number }) {
  return {
    line: Math.max(0, position.lineNumber - 1),
    character: Math.max(0, position.column - 1)
  };
}

function toLspRange(range: {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}) {
  return {
    start: {
      line: Math.max(0, range.startLineNumber - 1),
      character: Math.max(0, range.startColumn - 1)
    },
    end: {
      line: Math.max(0, range.endLineNumber - 1),
      character: Math.max(0, range.endColumn - 1)
    }
  };
}

function toMonacoRange(range: any) {
  if (!monacoRef || !range) return undefined;

  return new monacoRef.Range(
    Number(range.start?.line ?? 0) + 1,
    Number(range.start?.character ?? 0) + 1,
    Number(range.end?.line ?? 0) + 1,
    Number(range.end?.character ?? 0) + 1
  );
}

function toMarkdown(value: any): any {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "string") {
    return { value };
  }

  if (Array.isArray(value)) {
    const rendered = value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry.value === "string") {
          return entry.language
            ? `\`\`\`${entry.language}\n${entry.value}\n\`\`\``
            : entry.value;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");

    return { value: rendered };
  }

  if (typeof value.value === "string") {
    return { value: value.value };
  }

  return { value: String(value) };
}

function completionKind(kind: number | undefined) {
  if (!monacoRef) return 0;
  const values = monacoRef.languages.CompletionItemKind;

  const map: Record<number, number> = {
    1: values.Text,
    2: values.Method,
    3: values.Function,
    4: values.Constructor,
    5: values.Field,
    6: values.Variable,
    7: values.Class,
    8: values.Interface,
    9: values.Module,
    10: values.Property,
    11: values.Unit,
    12: values.Value,
    13: values.Enum,
    14: values.Keyword,
    15: values.Snippet,
    16: values.Color,
    17: values.File,
    18: values.Reference,
    19: values.Folder,
    20: values.EnumMember,
    21: values.Constant,
    22: values.Struct,
    23: values.Event,
    24: values.Operator,
    25: values.TypeParameter
  };

  return map[kind ?? 1] ?? values.Text;
}

function symbolKind(kind: number | undefined) {
  if (!monacoRef) return 1;
  const values = monacoRef.languages.SymbolKind;
  const map: Record<number, number> = {
    1: values.File,
    2: values.Module,
    3: values.Namespace,
    4: values.Package,
    5: values.Class,
    6: values.Method,
    7: values.Property,
    8: values.Field,
    9: values.Constructor,
    10: values.Enum,
    11: values.Interface,
    12: values.Function,
    13: values.Variable,
    14: values.Constant,
    15: values.String,
    16: values.Number,
    17: values.Boolean,
    18: values.Array,
    19: values.Object,
    20: values.Key,
    21: values.Null,
    22: values.EnumMember,
    23: values.Struct,
    24: values.Event,
    25: values.Operator,
    26: values.TypeParameter
  };

  return map[kind ?? 1] ?? values.Variable;
}

function diagnosticSeverity(severity: number | undefined) {
  if (!monacoRef) return 8;

  switch (severity) {
    case 1:
      return monacoRef.MarkerSeverity.Error;
    case 2:
      return monacoRef.MarkerSeverity.Warning;
    case 3:
      return monacoRef.MarkerSeverity.Info;
    default:
      return monacoRef.MarkerSeverity.Hint;
  }
}

function locationToMonaco(location: any) {
  if (!monacoRef || !location) return null;

  if (location.targetUri) {
    return {
      uri: monacoRef.Uri.parse(location.targetUri),
      range: toMonacoRange(location.targetSelectionRange ?? location.targetRange)
    };
  }

  if (!location.uri || !location.range) return null;

  return {
    uri: monacoRef.Uri.parse(location.uri),
    range: toMonacoRange(location.range)
  };
}

function locationsToMonaco(value: any) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(locationToMonaco).filter(Boolean);
}

function textEditToMonaco(edit: any) {
  if (!edit?.range) return null;

  return {
    range: toMonacoRange(edit.range),
    text: String(edit.newText ?? "")
  };
}

function workspaceEditToMonaco(edit: any) {
  if (!monacoRef || !edit) return { edits: [] };

  const edits: any[] = [];

  if (edit.changes && typeof edit.changes === "object") {
    for (const [uri, values] of Object.entries(edit.changes)) {
      for (const item of Array.isArray(values) ? values : []) {
        const textEdit = textEditToMonaco(item);
        if (!textEdit) continue;

        edits.push({
          resource: monacoRef.Uri.parse(uri),
          textEdit,
          versionId: undefined
        });
      }
    }
  }

  for (const change of Array.isArray(edit.documentChanges) ? edit.documentChanges : []) {
    if (change?.textDocument?.uri && Array.isArray(change.edits)) {
      for (const item of change.edits) {
        const textEdit = textEditToMonaco(item);
        if (!textEdit) continue;

        edits.push({
          resource: monacoRef.Uri.parse(change.textDocument.uri),
          textEdit,
          versionId: undefined
        });
      }
      continue;
    }

    if (change?.kind === "create" && change.uri) {
      edits.push({
        newResource: monacoRef.Uri.parse(change.uri),
        options: change.options
      });
      continue;
    }

    if (change?.kind === "rename" && change.oldUri && change.newUri) {
      edits.push({
        oldResource: monacoRef.Uri.parse(change.oldUri),
        newResource: monacoRef.Uri.parse(change.newUri),
        options: change.options
      });
      continue;
    }

    if (change?.kind === "delete" && change.uri) {
      edits.push({
        oldResource: monacoRef.Uri.parse(change.uri),
        newResource: undefined,
        options: change.options
      });
    }
  }

  return { edits };
}

function offsetAt(text: string, position: any) {
  const line = Math.max(0, Number(position?.line ?? 0));
  const character = Math.max(0, Number(position?.character ?? 0));

  let offset = 0;
  let currentLine = 0;

  while (currentLine < line && offset < text.length) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
    currentLine += 1;
  }

  return Math.min(text.length, offset + character);
}

function applyTextEdits(source: string, edits: any[]) {
  const prepared = edits
    .filter((edit) => edit?.range)
    .map((edit) => ({
      start: offsetAt(source, edit.range.start),
      end: offsetAt(source, edit.range.end),
      text: String(edit.newText ?? "")
    }))
    .sort((a, b) => b.start - a.start || b.end - a.end);

  let result = source;

  for (const edit of prepared) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }

  return result;
}

async function writeTextEdits(uri: string, edits: any[]) {
  const path = filePathFromUri(uri);
  const model = monacoRef?.editor.getModel(monacoRef.Uri.parse(uri)) ?? null;
  const source = model ? model.getValue() : await readTextFile(path);
  const content = applyTextEdits(source, edits);

  await writeTextFile(path, content);

  if (model && model.getValue() !== content) {
    model.setValue(content);
  }

  window.dispatchEvent(new CustomEvent("xenra:lsp-file-written", {
    detail: { path, content }
  }));
}

async function applyWorkspaceEdit(edit: any) {
  if (!edit) return false;

  try {
    if (edit.changes && typeof edit.changes === "object") {
      for (const [uri, values] of Object.entries(edit.changes)) {
        await writeTextEdits(uri, Array.isArray(values) ? values : []);
      }
    }

    for (const change of Array.isArray(edit.documentChanges) ? edit.documentChanges : []) {
      if (change?.textDocument?.uri && Array.isArray(change.edits)) {
        await writeTextEdits(change.textDocument.uri, change.edits);
        continue;
      }

      if (change?.kind === "create" && change.uri) {
        const path = filePathFromUri(change.uri);
        try {
          await createFile(path);
        } catch {
          if (!change.options?.ignoreIfExists) throw new Error(`Cannot create ${path}`);
        }
        window.dispatchEvent(new CustomEvent("xenra:lsp-tree-changed"));
        continue;
      }

      if (change?.kind === "rename" && change.oldUri && change.newUri) {
        await renamePath(
          filePathFromUri(change.oldUri),
          filePathFromUri(change.newUri)
        );
        window.dispatchEvent(new CustomEvent("xenra:lsp-tree-changed"));
        continue;
      }

      if (change?.kind === "delete" && change.uri) {
        await deletePath(filePathFromUri(change.uri));
        window.dispatchEvent(new CustomEvent("xenra:lsp-tree-changed"));
      }
    }

    return true;
  } catch {
    return false;
  }
}

class LspConnection {
  readonly key: string;
  readonly serviceId: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly serverName: string;
  readonly statusSink: StatusSink;

  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private documentVersions = new Map<string, number>();
  private stopped = false;

  constructor(
    key: string,
    serviceId: string,
    workspaceRoot: string,
    start: LspServerStart,
    statusSink: StatusSink
  ) {
    this.key = key;
    this.serviceId = serviceId;
    this.workspaceRoot = workspaceRoot;
    this.sessionId = String(start.sessionId);
    this.serverName = start.serverName ?? start.languageLabel;
    this.statusSink = statusSink;
  }

  async initialize() {
    const rootUri = fileUriFromPath(this.workspaceRoot);

    const result = await this.request("initialize", {
      processId: null,
      clientInfo: {
        name: "XENRA",
        version: "0.1.0"
      },
      locale: "en",
      rootUri,
      rootPath: this.workspaceRoot,
      workspaceFolders: [
        {
          uri: rootUri,
          name: baseName(this.workspaceRoot)
        }
      ],
      capabilities: {
        workspace: {
          applyEdit: true,
          workspaceFolders: true,
          configuration: true,
          didChangeConfiguration: { dynamicRegistration: false },
          workspaceEdit: {
            documentChanges: true,
            resourceOperations: ["create", "rename", "delete"],
            failureHandling: "textOnlyTransactional"
          },
          symbol: {
            dynamicRegistration: false
          }
        },
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            didSave: true
          },
          completion: {
            dynamicRegistration: false,
            contextSupport: true,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ["markdown", "plaintext"],
              deprecatedSupport: true,
              preselectSupport: true,
              insertReplaceSupport: true,
              resolveSupport: {
                properties: [
                  "documentation",
                  "detail",
                  "additionalTextEdits",
                  "command"
                ]
              }
            }
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ["markdown", "plaintext"]
          },
          signatureHelp: {
            dynamicRegistration: false,
            contextSupport: true,
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: {
                labelOffsetSupport: true
              },
              activeParameterSupport: true
            }
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true
          },
          references: {
            dynamicRegistration: false
          },
          documentHighlight: {
            dynamicRegistration: false
          },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true
          },
          formatting: {
            dynamicRegistration: false
          },
          rangeFormatting: {
            dynamicRegistration: false
          },
          rename: {
            dynamicRegistration: false,
            prepareSupport: true
          },
          codeAction: {
            dynamicRegistration: false,
            isPreferredSupport: true,
            disabledSupport: true,
            dataSupport: true,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  "",
                  "quickfix",
                  "refactor",
                  "refactor.extract",
                  "refactor.inline",
                  "refactor.rewrite",
                  "source",
                  "source.organizeImports"
                ]
              }
            },
            resolveSupport: {
              properties: ["edit", "command"]
            }
          },
          codeLens: {
            dynamicRegistration: false
          },
          foldingRange: {
            dynamicRegistration: false,
            lineFoldingOnly: false
          },
          inlayHint: {
            dynamicRegistration: false,
            resolveSupport: {
              properties: ["tooltip", "textEdits", "location", "command"]
            }
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            codeDescriptionSupport: true,
            dataSupport: true
          }
        },
        window: {
          workDoneProgress: true,
          showMessage: {
            messageActionItem: {
              additionalPropertiesSupport: true
            }
          }
        },
        general: {
          positionEncodings: ["utf-16"]
        }
      },
      initializationOptions: {}
    }, 30000);

    this.notify("initialized", {});
    this.notify("workspace/didChangeConfiguration", { settings: {} });

    return result;
  }

  request(method: string, params: any, timeoutMs = 12000): Promise<any> {
    if (this.stopped) {
      return Promise.reject(new Error(`${this.serverName} is not running.`));
    }

    const id = this.nextRequestId++;

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.serverName} timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      void sendLanguageServerMessage(this.sessionId, {
        jsonrpc: "2.0",
        id,
        method,
        params
      }).then((sent) => {
        if (sent) return;

        const pending = this.pending.get(id);
        if (!pending) return;

        window.clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new Error(`${this.serverName} did not accept ${method}.`));
      });
    });
  }

  async safeRequest(method: string, params: any, fallback: any = null) {
    try {
      return await this.request(method, params);
    } catch {
      return fallback;
    }
  }

  notify(method: string, params: any) {
    if (this.stopped) return;

    void sendLanguageServerMessage(this.sessionId, {
      jsonrpc: "2.0",
      method,
      params
    });
  }

  openDocument(model: TextModel) {
    const uri = model.uri.toString();
    if (this.documentVersions.has(uri)) return;

    const version = 1;
    this.documentVersions.set(uri, version);

    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: LSP_LANGUAGE_BY_MONACO_LANGUAGE[model.getLanguageId()] ?? model.getLanguageId(),
        version,
        text: model.getValue()
      }
    });
  }

  changeDocument(model: TextModel) {
    const uri = model.uri.toString();
    if (!this.documentVersions.has(uri)) {
      this.openDocument(model);
      return;
    }

    const version = (this.documentVersions.get(uri) ?? 0) + 1;
    this.documentVersions.set(uri, version);

    this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [
        {
          text: model.getValue()
        }
      ]
    });
  }

  saveDocument(model: TextModel) {
    const uri = model.uri.toString();
    if (!this.documentVersions.has(uri)) return;

    this.notify("textDocument/didSave", {
      textDocument: { uri },
      text: model.getValue()
    });
  }

  closeDocument(model: TextModel) {
    const uri = model.uri.toString();
    if (!this.documentVersions.has(uri)) return;

    this.documentVersions.delete(uri);
    this.notify("textDocument/didClose", {
      textDocument: { uri }
    });
  }

  handleTransportEvent(event: LspServerEvent) {
    if (event.type === "stderr") {
      const line = event.chunk.trim();
      if (line && /error|fail|exception/i.test(line)) {
        this.statusSink(`${this.serverName}: ${line.slice(0, 180)}`);
      }
      return;
    }

    if (event.type === "error") {
      this.statusSink(`${this.serverName}: ${event.message}`);
      return;
    }

    if (event.type === "exit") {
      this.stopped = true;
      this.rejectPending(new Error(`${this.serverName} exited with code ${event.exitCode}.`));
      sessionConnections.delete(this.sessionId);
      connections.delete(this.key);
      connectionPromises.delete(this.key);

      if (!event.stopped) {
        this.statusSink(`${this.serverName} stopped unexpectedly.`);
      }
      return;
    }

    if (event.type === "message") {
      this.handleRpcMessage(event.message as any);
    }
  }

  private handleRpcMessage(message: any) {
    if (!message || message.jsonrpc !== "2.0") return;

    if (message.id !== undefined && message.method === undefined) {
      const id = Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) return;

      window.clearTimeout(pending.timer);
      this.pending.delete(id);

      if (message.error) {
        pending.reject(new Error(String(message.error.message ?? "Language server request failed.")));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method !== "string") return;

    if (message.id !== undefined) {
      void this.handleServerRequest(message);
      return;
    }

    this.handleServerNotification(message.method, message.params);
  }

  private handleServerNotification(method: string, params: any) {
    if (method === "textDocument/publishDiagnostics") {
      publishDiagnostics(this, params);
      return;
    }

    if (
      method === "window/showMessage" ||
      method === "window/logMessage"
    ) {
      const message = String(params?.message ?? "").trim();
      if (message && params?.type <= 2) {
        this.statusSink(`${this.serverName}: ${message.slice(0, 180)}`);
      }
    }
  }

  private async handleServerRequest(message: any) {
    let result: any = null;

    try {
      switch (message.method) {
        case "workspace/configuration":
          result = (Array.isArray(message.params?.items) ? message.params.items : []).map(() => ({}));
          break;

        case "workspace/workspaceFolders":
          result = [
            {
              uri: fileUriFromPath(this.workspaceRoot),
              name: baseName(this.workspaceRoot)
            }
          ];
          break;

        case "workspace/applyEdit":
          result = {
            applied: await applyWorkspaceEdit(message.params?.edit)
          };
          break;

        case "client/registerCapability":
        case "client/unregisterCapability":
        case "window/workDoneProgress/create":
        case "workspace/codeLens/refresh":
        case "workspace/inlayHint/refresh":
        case "workspace/semanticTokens/refresh":
          result = null;
          break;

        case "window/showMessageRequest":
          result = null;
          break;

        default:
          result = null;
          break;
      }

      this.respond(message.id, result);
    } catch (error) {
      this.respond(message.id, null, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private respond(id: any, result: any, error?: any) {
    void sendLanguageServerMessage(this.sessionId, {
      jsonrpc: "2.0",
      id,
      ...(error ? { error } : { result })
    });
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async shutdown() {
    if (this.stopped) return;

    try {
      await this.request("shutdown", null, 2500);
    } catch {
      // Fall through to forced process shutdown.
    }

    this.notify("exit", null);
    this.stopped = true;
    this.rejectPending(new Error(`${this.serverName} stopped.`));

    await stopLanguageServer(this.sessionId).catch(() => false);
  }
}

function publishDiagnostics(connection: LspConnection, params: any) {
  if (!monacoRef || !params?.uri) return;

  const uri = monacoRef.Uri.parse(String(params.uri));
  const model = monacoRef.editor.getModel(uri);
  if (!model) return;

  const markers = (Array.isArray(params.diagnostics) ? params.diagnostics : []).map((item: any) => ({
    severity: diagnosticSeverity(item.severity),
    message: String(item.message ?? ""),
    source: item.source ? String(item.source) : connection.serverName,
    code: item.code === undefined ? undefined : String(item.code),
    startLineNumber: Number(item.range?.start?.line ?? 0) + 1,
    startColumn: Number(item.range?.start?.character ?? 0) + 1,
    endLineNumber: Number(item.range?.end?.line ?? 0) + 1,
    endColumn: Number(item.range?.end?.character ?? 0) + 1,
    tags: Array.isArray(item.tags) ? item.tags : undefined
  }));

  monacoRef.editor.setModelMarkers(
    model,
    `lsp:${connection.serverName}`,
    markers
  );
}

async function ensureConnection(
  serviceId: string,
  workspaceRoot: string,
  statusSink: StatusSink
) {
  ensureTransport();

  const key = `${serviceId}::${workspaceRoot}`;
  const existing = connections.get(key);
  if (existing) return existing;

  const pending = connectionPromises.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const start = await startLanguageServer(serviceId, workspaceRoot);

    if (!start.available || !start.sessionId) {
      const reason = start.error || start.installHint || "language server is not installed";
      statusSink(`${start.languageLabel}: ${reason}`);
      return null;
    }

    const connection = new LspConnection(
      key,
      serviceId,
      workspaceRoot,
      start,
      statusSink
    );

    connections.set(key, connection);
    sessionConnections.set(connection.sessionId, connection);

    try {
      await connection.initialize();
      statusSink(`${start.languageLabel}: ${connection.serverName} ready`);
      return connection;
    } catch (error) {
      connections.delete(key);
      sessionConnections.delete(connection.sessionId);
      await stopLanguageServer(connection.sessionId).catch(() => false);

      statusSink(
        `${start.languageLabel} language service failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      return null;
    }
  })();

  connectionPromises.set(key, promise);

  const resolved = await promise;
  if (!resolved) connectionPromises.delete(key);
  return resolved;
}

function connectionForModel(model: any) {
  return documentConnections.get(model.uri.toString()) ?? null;
}

function documentParams(model: any, position?: any) {
  return {
    textDocument: {
      uri: model.uri.toString()
    },
    ...(position ? { position: toLspPosition(position) } : {})
  };
}

function codeActionDiagnostics(context: any) {
  return (Array.isArray(context?.markers) ? context.markers : []).map((marker: any) => ({
    range: {
      start: {
        line: Math.max(0, Number(marker.startLineNumber ?? 1) - 1),
        character: Math.max(0, Number(marker.startColumn ?? 1) - 1)
      },
      end: {
        line: Math.max(0, Number(marker.endLineNumber ?? 1) - 1),
        character: Math.max(0, Number(marker.endColumn ?? 1) - 1)
      }
    },
    severity:
      marker.severity === monacoRef?.MarkerSeverity.Error ? 1 :
      marker.severity === monacoRef?.MarkerSeverity.Warning ? 2 :
      marker.severity === monacoRef?.MarkerSeverity.Info ? 3 : 4,
    message: String(marker.message ?? ""),
    source: marker.source,
    code: marker.code
  }));
}

function lspCommandToMonaco(connection: LspConnection, command: any) {
  if (!command?.command) return undefined;

  return {
    id: EXECUTE_COMMAND_ID,
    title: String(command.title ?? command.command),
    arguments: [
      connection.key,
      String(command.command),
      Array.isArray(command.arguments) ? command.arguments : []
    ]
  };
}

function installGlobalCommands(monacoApi: MonacoApi) {
  if (lspCommandRegistered) return;

  const registerCommand = (monacoApi.editor as any).registerCommand;
  if (typeof registerCommand !== "function") return;

  registerCommand(
    EXECUTE_COMMAND_ID,
    (_accessor: any, key: string, command: string, args: any[]) => {
      const connection = connections.get(key);
      if (!connection) return;

      void connection.safeRequest("workspace/executeCommand", {
        command,
        arguments: Array.isArray(args) ? args : []
      });
    }
  );

  registerCommand(
    APPLY_ACTION_ID,
    (_accessor: any, key: string, action: any) => {
      const connection = connections.get(key);
      if (!connection) return;

      void (async () => {
        if (action?.edit) {
          await applyWorkspaceEdit(action.edit);
        }

        if (action?.command?.command) {
          await connection.safeRequest("workspace/executeCommand", {
            command: action.command.command,
            arguments: Array.isArray(action.command.arguments)
              ? action.command.arguments
              : []
          });
        }
      })();
    }
  );

  lspCommandRegistered = true;
}

function installProviders(monacoApi: MonacoApi) {
  if (providersInstalled) return;
  providersInstalled = true;
  monacoRef = monacoApi;

  installGlobalCommands(monacoApi);

  const languages = Object.keys(SERVICE_BY_MONACO_LANGUAGE);

  for (const languageId of languages) {
    const completionProvider = (monacoApi.languages as any).registerCompletionItemProvider(
      languageId,
      {
        triggerCharacters: [".", ":", ">", "<", "/", "\\", "$", "@", "#", "(", ","],
        provideCompletionItems: async (model: any, position: any, context: any) => {
          const connection = connectionForModel(model);
          if (!connection) return { suggestions: [] };

          const response = await connection.safeRequest(
            "textDocument/completion",
            {
              ...documentParams(model, position),
              context: {
                triggerKind: Number(context?.triggerKind ?? 1),
                triggerCharacter: context?.triggerCharacter
              }
            },
            []
          );

          const items = Array.isArray(response)
            ? response
            : Array.isArray(response?.items)
              ? response.items
              : [];

          const word = model.getWordUntilPosition(position);
          const defaultRange = new monacoApi.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          );

          return {
            suggestions: items.map((item: any) => {
              const label = typeof item.label === "string"
                ? item.label
                : String(item.label?.label ?? "");

              const editRange =
                item.textEdit?.range ??
                item.textEdit?.replace ??
                item.textEdit?.insert;

              const insertText =
                item.textEdit?.newText ??
                item.insertText ??
                label;

              return {
                label,
                kind: completionKind(item.kind),
                detail: item.detail,
                documentation: toMarkdown(item.documentation),
                sortText: item.sortText,
                filterText: item.filterText,
                preselect: item.preselect,
                insertText,
                insertTextRules:
                  item.insertTextFormat === 2
                    ? monacoApi.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : monacoApi.languages.CompletionItemInsertTextRule.None,
                range: editRange ? toMonacoRange(editRange) : defaultRange,
                commitCharacters: item.commitCharacters,
                additionalTextEdits: Array.isArray(item.additionalTextEdits)
                  ? item.additionalTextEdits
                      .map(textEditToMonaco)
                      .filter(Boolean)
                  : undefined
              };
            })
          };
        }
      } as any
    );

    const hoverProvider = (monacoApi.languages as any).registerHoverProvider(
      languageId,
      {
        provideHover: async (model: any, position: any) => {
          const connection = connectionForModel(model);
          if (!connection) return null;

          const response = await connection.safeRequest(
            "textDocument/hover",
            documentParams(model, position),
            null
          );

          if (!response?.contents) return null;

          const markdown = toMarkdown(response.contents);
          return {
            contents: markdown ? [markdown] : [],
            range: response.range ? toMonacoRange(response.range) : undefined
          };
        }
      } as any
    );

    const signatureProvider = (monacoApi.languages as any).registerSignatureHelpProvider(
      languageId,
      {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],
        provideSignatureHelp: async (model: any, position: any, _token: any, context: any) => {
          const connection = connectionForModel(model);
          if (!connection) return null;

          const response = await connection.safeRequest(
            "textDocument/signatureHelp",
            {
              ...documentParams(model, position),
              context: context
                ? {
                    triggerKind: context.triggerKind,
                    triggerCharacter: context.triggerCharacter,
                    isRetrigger: context.isRetrigger
                  }
                : undefined
            },
            null
          );

          if (!response) return null;

          return {
            value: {
              activeSignature: Number(response.activeSignature ?? 0),
              activeParameter: Number(response.activeParameter ?? 0),
              signatures: (Array.isArray(response.signatures) ? response.signatures : []).map((signature: any) => ({
                label: String(signature.label ?? ""),
                documentation: toMarkdown(signature.documentation),
                parameters: (Array.isArray(signature.parameters) ? signature.parameters : []).map((parameter: any) => ({
                  label: parameter.label,
                  documentation: toMarkdown(parameter.documentation)
                }))
              }))
            },
            dispose() {}
          };
        }
      } as any
    );

    const definitionProvider = (monacoApi.languages as any).registerDefinitionProvider(
      languageId,
      {
        provideDefinition: async (model: any, position: any) => {
          const connection = connectionForModel(model);
          if (!connection) return null;

          const response = await connection.safeRequest(
            "textDocument/definition",
            documentParams(model, position),
            null
          );

          return locationsToMonaco(response);
        }
      } as any
    );

    const referenceProvider = (monacoApi.languages as any).registerReferenceProvider(
      languageId,
      {
        provideReferences: async (model: any, position: any, context: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/references",
            {
              ...documentParams(model, position),
              context: {
                includeDeclaration: context?.includeDeclaration !== false
              }
            },
            []
          );

          return locationsToMonaco(response);
        }
      } as any
    );

    const renameProvider = (monacoApi.languages as any).registerRenameProvider(
      languageId,
      {
        resolveRenameLocation: async (model: any, position: any) => {
          const connection = connectionForModel(model);
          if (!connection) return null;

          const response = await connection.safeRequest(
            "textDocument/prepareRename",
            documentParams(model, position),
            null
          );

          if (!response) {
            const word = model.getWordAtPosition(position);
            return word
              ? {
                  range: new monacoApi.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn
                  ),
                  text: word.word
                }
              : null;
          }

          const range = response.range ?? response;
          return {
            range: toMonacoRange(range),
            text: String(response.placeholder ?? model.getValueInRange(toMonacoRange(range)))
          };
        },

        provideRenameEdits: async (model: any, position: any, newName: string) => {
          const connection = connectionForModel(model);
          if (!connection) return { edits: [], rejectReason: "No language server is active." };

          const response = await connection.safeRequest(
            "textDocument/rename",
            {
              ...documentParams(model, position),
              newName
            },
            null
          );

          if (!response) {
            return {
              edits: [],
              rejectReason: `${connection.serverName} did not provide rename edits.`
            };
          }

          return workspaceEditToMonaco(response);
        }
      } as any
    );

    const symbolProvider = (monacoApi.languages as any).registerDocumentSymbolProvider(
      languageId,
      {
        provideDocumentSymbols: async (model: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/documentSymbol",
            documentParams(model),
            []
          );

          const convert = (item: any): any => {
            if (item.location) {
              return {
                name: String(item.name ?? ""),
                detail: item.containerName,
                kind: symbolKind(item.kind),
                range: toMonacoRange(item.location.range),
                selectionRange: toMonacoRange(item.location.range),
                children: []
              };
            }

            return {
              name: String(item.name ?? ""),
              detail: item.detail,
              kind: symbolKind(item.kind),
              tags: item.tags,
              range: toMonacoRange(item.range),
              selectionRange: toMonacoRange(item.selectionRange ?? item.range),
              children: (Array.isArray(item.children) ? item.children : []).map(convert)
            };
          };

          return (Array.isArray(response) ? response : []).map(convert);
        }
      } as any
    );

    const formattingProvider = (monacoApi.languages as any).registerDocumentFormattingEditProvider(
      languageId,
      {
        provideDocumentFormattingEdits: async (model: any, options: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/formatting",
            {
              ...documentParams(model),
              options: {
                tabSize: Number(options?.tabSize ?? 2),
                insertSpaces: Boolean(options?.insertSpaces ?? true),
                trimTrailingWhitespace: true,
                insertFinalNewline: false,
                trimFinalNewlines: false
              }
            },
            []
          );

          return (Array.isArray(response) ? response : [])
            .map(textEditToMonaco)
            .filter(Boolean);
        }
      } as any
    );

    const rangeFormattingProvider = (monacoApi.languages as any).registerDocumentRangeFormattingEditProvider(
      languageId,
      {
        provideDocumentRangeFormattingEdits: async (model: any, range: any, options: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/rangeFormatting",
            {
              ...documentParams(model),
              range: toLspRange(range),
              options: {
                tabSize: Number(options?.tabSize ?? 2),
                insertSpaces: Boolean(options?.insertSpaces ?? true)
              }
            },
            []
          );

          return (Array.isArray(response) ? response : [])
            .map(textEditToMonaco)
            .filter(Boolean);
        }
      } as any
    );

    const codeActionProvider = (monacoApi.languages as any).registerCodeActionProvider(
      languageId,
      {
        provideCodeActions: async (model: any, range: any, context: any) => {
          const connection = connectionForModel(model);
          if (!connection) {
            return { actions: [], dispose() {} };
          }

          const response = await connection.safeRequest(
            "textDocument/codeAction",
            {
              ...documentParams(model),
              range: toLspRange(range),
              context: {
                diagnostics: codeActionDiagnostics(context),
                only: context?.only
                  ? [String(context.only)]
                  : undefined,
                triggerKind: Number(context?.trigger ?? 1)
              }
            },
            []
          );

          const actions = (Array.isArray(response) ? response : [])
            .map((item: any) => {
              const commandOnly =
                typeof item?.command === "string" &&
                typeof item?.title === "string";

              const action = commandOnly
                ? {
                    title: item.title,
                    command: item
                  }
                : item;

              if (!action?.title) return null;

              const command = action.command?.command
                ? lspCommandToMonaco(connection, action.command)
                : action.edit
                  ? {
                      id: APPLY_ACTION_ID,
                      title: action.title,
                      arguments: [connection.key, action]
                    }
                  : undefined;

              return {
                title: String(action.title),
                kind: action.kind,
                isPreferred: Boolean(action.isPreferred),
                disabled: action.disabled?.reason,
                diagnostics: context?.markers,
                edit: action.edit && !command
                  ? workspaceEditToMonaco(action.edit)
                  : undefined,
                command
              };
            })
            .filter(Boolean);

          return {
            actions,
            dispose() {}
          };
        }
      } as any
    );

    const highlightProvider = (monacoApi.languages as any).registerDocumentHighlightProvider(
      languageId,
      {
        provideDocumentHighlights: async (model: any, position: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/documentHighlight",
            documentParams(model, position),
            []
          );

          return (Array.isArray(response) ? response : []).map((item: any) => ({
            range: toMonacoRange(item.range),
            kind:
              item.kind === 2
                ? monacoApi.languages.DocumentHighlightKind.Read
                : item.kind === 3
                  ? monacoApi.languages.DocumentHighlightKind.Write
                  : monacoApi.languages.DocumentHighlightKind.Text
          }));
        }
      } as any
    );

    const foldingProvider = (monacoApi.languages as any).registerFoldingRangeProvider(
      languageId,
      {
        provideFoldingRanges: async (model: any) => {
          const connection = connectionForModel(model);
          if (!connection) return [];

          const response = await connection.safeRequest(
            "textDocument/foldingRange",
            documentParams(model),
            []
          );

          return (Array.isArray(response) ? response : []).map((item: any) => ({
            start: Number(item.startLine ?? 0) + 1,
            end: Number(item.endLine ?? item.startLine ?? 0) + 1,
            kind:
              item.kind === "comment"
                ? monacoApi.languages.FoldingRangeKind.Comment
                : item.kind === "imports"
                  ? monacoApi.languages.FoldingRangeKind.Imports
                  : item.kind === "region"
                    ? monacoApi.languages.FoldingRangeKind.Region
                    : undefined
          }));
        }
      } as any
    );

    const registerInlay = (monacoApi.languages as any).registerInlayHintsProvider;
    const inlayProvider = typeof registerInlay === "function"
      ? registerInlay(
          languageId,
          {
            provideInlayHints: async (model: any, range: any) => {
              const connection = connectionForModel(model);
              if (!connection) return { hints: [], dispose() {} };

              const response = await connection.safeRequest(
                "textDocument/inlayHint",
                {
                  ...documentParams(model),
                  range: toLspRange(range)
                },
                []
              );

              return {
                hints: (Array.isArray(response) ? response : []).map((item: any) => ({
                  position: {
                    lineNumber: Number(item.position?.line ?? 0) + 1,
                    column: Number(item.position?.character ?? 0) + 1
                  },
                  label: Array.isArray(item.label)
                    ? item.label.map((part: any) => String(part.value ?? "")).join("")
                    : String(item.label ?? ""),
                  kind:
                    item.kind === 1
                      ? monacoApi.languages.InlayHintKind.Type
                      : item.kind === 2
                        ? monacoApi.languages.InlayHintKind.Parameter
                        : undefined,
                  tooltip: toMarkdown(item.tooltip),
                  paddingLeft: Boolean(item.paddingLeft),
                  paddingRight: Boolean(item.paddingRight)
                })),
                dispose() {}
              };
            }
          } as any
        )
      : null;

    const registerCodeLens = (monacoApi.languages as any).registerCodeLensProvider;
    const codeLensProvider = typeof registerCodeLens === "function"
      ? registerCodeLens(
          languageId,
          {
            provideCodeLenses: async (model: any) => {
              const connection = connectionForModel(model);
              if (!connection) return { lenses: [], dispose() {} };

              const response = await connection.safeRequest(
                "textDocument/codeLens",
                documentParams(model),
                []
              );

              return {
                lenses: (Array.isArray(response) ? response : []).map((item: any) => ({
                  range: toMonacoRange(item.range),
                  command: item.command
                    ? lspCommandToMonaco(connection, item.command)
                    : undefined
                })),
                dispose() {}
              };
            }
          } as any
        )
      : null;

    providerDisposables.push(
      completionProvider,
      hoverProvider,
      signatureProvider,
      definitionProvider,
      referenceProvider,
      renameProvider,
      symbolProvider,
      formattingProvider,
      rangeFormattingProvider,
      codeActionProvider,
      highlightProvider,
      foldingProvider
    );

    if (inlayProvider) providerDisposables.push(inlayProvider);
    if (codeLensProvider) providerDisposables.push(codeLensProvider);
  }
}

export function attachLanguageServices(
  monacoApi: MonacoApi,
  editor: StandaloneEditor,
  workspaceRoot: string | null,
  statusSink: StatusSink
) {
  monacoRef = monacoApi;
  installProviders(monacoApi);

  let activeModel: TextModel | null = null;
  let contentDisposable: Disposable | null = null;
  let attachGeneration = 0;

  const detachCurrentModel = () => {
    contentDisposable?.dispose();
    contentDisposable = null;

    if (activeModel) {
      const uri = activeModel.uri.toString();
      const connection = documentConnections.get(uri);
      connection?.closeDocument(activeModel);
      documentConnections.delete(uri);
      activeModel = null;
    }
  };

  const attachCurrentModel = async () => {
    const generation = ++attachGeneration;
    detachCurrentModel();

    if (!workspaceRoot) return;

    const model = editor.getModel();
    if (!model) return;

    const serviceId = SERVICE_BY_MONACO_LANGUAGE[model.getLanguageId()];
    if (!serviceId) return;

    const connection = await ensureConnection(
      serviceId,
      workspaceRoot,
      statusSink
    );

    if (!connection || generation !== attachGeneration) return;

    activeModel = model;
    documentConnections.set(model.uri.toString(), connection);
    connection.openDocument(model);

    contentDisposable = model.onDidChangeContent(() => {
      connection.changeDocument(model);
    });
  };

  const modelDisposable = editor.onDidChangeModel(() => {
    void attachCurrentModel();
  });

  void attachCurrentModel();

  return {
    didSave() {
      const model = editor.getModel();
      const connection = model ? documentConnections.get(model.uri.toString()) : null;
      if (model && connection) {
        connection.saveDocument(model);
      }
    },

    dispose() {
      attachGeneration += 1;
      modelDisposable.dispose();
      detachCurrentModel();

      const all = [...connections.values()];
      connections.clear();
      connectionPromises.clear();
      documentConnections.clear();
      sessionConnections.clear();

      for (const connection of all) {
        void connection.shutdown();
      }
    }
  };
}
