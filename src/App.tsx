import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomPanelTab, FileNode, OpenFile, SearchResult, SidebarView } from "./types";
import type { RuntimeTraceEvent, RuntimeTraceMessage, RuntimeTraceResult } from "./runtime/types";
import {
  beginPythonTrace,
  chooseProjectFolder,
  closeWindow,
  executeCommand,
  onPythonTraceMessage,
  preparePythonTrace,
  readTextFile,
  stopPythonTrace,
  writeTextFile
} from "./services/backend";
import { fileName, joinPath, languageFromPath } from "./lib/path";
import { BranchIcon, CodeIcon, PlayIcon, SaveIcon, SearchIcon, TerminalIcon } from "./components/Icons";
import Explorer from "./components/Explorer";
import EditorTabs from "./components/EditorTabs";
import CodeEditor from "./components/CodeEditor";
import BottomPanel from "./components/BottomPanel";
import MenuBar, { type MenuAction } from "./components/MenuBar";
import SearchPanel from "./components/SearchPanel";
import SourceControlPanel from "./components/SourceControlPanel";

const LAST_PROJECT_KEY = "xenra:last-project";

function defaultRunCommand(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const quoted = `"${path}"`;
  if (ext === "py") return `python ${quoted}`;
  if (ext === "js" || ext === "mjs" || ext === "cjs") return `node ${quoted}`;
  if (ext === "ps1") return `powershell -ExecutionPolicy Bypass -File ${quoted}`;
  return null;
}

function emitEditorAction(action: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent("xenra:editor-action", {
    detail: { action, ...detail }
  }));
}

function emitTerminalAction(action: string) {
  window.dispatchEvent(new CustomEvent("xenra:terminal-action", {
    detail: { action }
  }));
}

export default function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>("explorer");
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("terminal");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [treeRevision, setTreeRevision] = useState(0);
  const [overlay, setOverlay] = useState<"about" | "shortcuts" | null>(null);
  const [traceResult, setTraceResult] = useState<RuntimeTraceResult | null>(null);
  const [traceRunning, setTraceRunning] = useState(false);
  const traceSessionRef = useRef<string | null>(null);
  const traceQueueRef = useRef<RuntimeTraceMessage[]>([]);
  const traceFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const flush = () => {
      traceFlushTimerRef.current = null;
      const messages = traceQueueRef.current.splice(0);
      if (!messages.length) return;

      let completed: Extract<RuntimeTraceMessage, { type: "complete" }> | null = null;
      let traceError: string | null = null;

      for (const message of messages) {
        if (message.type === "complete") {
          completed = message;
        } else if (message.type === "error") {
          traceError = message.message;
        }
      }

      setTraceResult((current) => {
        if (!current) return current;

        let next: RuntimeTraceResult = current;
        let eventsCopied = false;

        const ensureCopy = () => {
          if (next === current) next = { ...current };
        };

        for (const message of messages) {
          if (message.sessionId !== current.sessionId) continue;

          switch (message.type) {
            case "meta":
              ensureCopy();
              next.pythonVersion = message.pythonVersion;
              next.eventLimit = message.eventLimit;
              break;
            case "event":
              ensureCopy();
              if (!eventsCopied) {
                next.events = [...current.events];
                eventsCopied = true;
              }
              next.events.push(message.event);
              break;
            case "stdout":
              ensureCopy();
              next.stdout += message.chunk;
              break;
            case "stderr":
              ensureCopy();
              next.stderr += message.chunk;
              break;
            case "limit":
              ensureCopy();
              next.truncated = true;
              next.eventLimit = message.eventLimit;
              break;
            case "error":
              ensureCopy();
              next.error = message.message;
              next.stderr += `${message.message}\n`;
              break;
            case "complete":
              ensureCopy();
              next.running = false;
              next.stopped = message.stopped;
              next.durationMs = message.durationMs;
              next.exitCode = message.exitCode;
              next.truncated = message.truncated;
              next.eventLimit = message.eventLimit;
              if (message.pythonVersion) next.pythonVersion = message.pythonVersion;
              if (message.error) next.error = message.error;
              break;
          }
        }

        return next;
      });

      if (traceError) {
        setStatus(`Trace error: ${traceError}`);
      }

      if (completed) {
        setTraceRunning(false);
        traceSessionRef.current = null;
        setStatus(
          completed.stopped
            ? "Trace stopped"
            : completed.exitCode === 0
              ? "Trace completed"
              : `Trace completed with exit code ${completed.exitCode}`
        );
      }
    };

    const unsubscribe = onPythonTraceMessage((message) => {
      const sessionId = traceSessionRef.current;
      if (!sessionId || message.sessionId !== sessionId) return;

      traceQueueRef.current.push(message);
      if (traceFlushTimerRef.current === null) {
        traceFlushTimerRef.current = window.setTimeout(flush, 40);
      }
    });

    return () => {
      unsubscribe();
      if (traceFlushTimerRef.current !== null) {
        window.clearTimeout(traceFlushTimerRef.current);
      }
    };
  }, []);
  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activePath) ?? null,
    [openFiles, activePath]
  );

  const projectName = projectRoot ? fileName(projectRoot) : "No Folder";
  const windowTitle = activeFile
    ? `${activeFile.name} - ${projectName} - XENRA`
    : projectRoot
      ? `${projectName} - XENRA`
      : "XENRA";

  const openProject = useCallback(async () => {
    try {
      const selected = await chooseProjectFolder();
      if (!selected) return;
      const activeTrace = traceSessionRef.current;
      if (activeTrace) {
        await stopPythonTrace(activeTrace);
        traceSessionRef.current = null;
      }

      setProjectRoot(selected);
      setTerminalCwd(selected);
      setSelectedPath(selected);
      setOpenFiles([]);
      setActivePath(null);
      setActiveView("explorer");
      setTraceResult(null);
      localStorage.setItem(LAST_PROJECT_KEY, selected);
      setStatus(`Opened ${fileName(selected)}`);
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    const lastProject = localStorage.getItem(LAST_PROJECT_KEY);
    if (lastProject) {
      setProjectRoot(lastProject);
      setTerminalCwd(lastProject);
      setSelectedPath(lastProject);
    }
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (openFiles.some((file) => file.content !== file.savedContent)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [openFiles]);

  const openFile = useCallback(async (node: FileNode, reveal?: { line?: number; column?: number }) => {
    if (node.isDir) return;
    setSelectedPath(node.path);

    const existing = openFiles.find((file) => file.path === node.path);
    if (existing) {
      setActivePath(node.path);
      if (reveal?.line) {
        requestAnimationFrame(() => emitEditorAction("reveal", reveal));
      }
      return;
    }

    try {
      const content = await readTextFile(node.path);
      const file: OpenFile = {
        path: node.path,
        name: node.name,
        content,
        savedContent: content,
        language: languageFromPath(node.path)
      };
      setOpenFiles((files) => [...files, file]);
      setActivePath(node.path);
      setStatus(`Opened ${node.name}`);

      if (reveal?.line) {
        setTimeout(() => emitEditorAction("reveal", reveal), 80);
      }
    } catch (error) {
      setStatus(`Cannot open ${node.name}: ${String(error)}`);
    }
  }, [openFiles]);

  const openAbsolutePath = useCallback(async (path: string, line?: number, column?: number) => {
    await openFile(
      { name: fileName(path), path, isDir: false },
      { line, column }
    );
  }, [openFile]);

  const changeActiveContent = (content: string) => {
    if (!activePath) return;
    setOpenFiles((files) => files.map((file) => file.path === activePath ? { ...file, content } : file));
  };

  const saveActive = useCallback(async () => {
    if (!activePath) return;
    const file = openFiles.find((item) => item.path === activePath);
    if (!file) return;

    try {
      await writeTextFile(file.path, file.content);
      setOpenFiles((files) => files.map((item) =>
        item.path === file.path ? { ...item, savedContent: item.content } : item
      ));
      setStatus(`Saved ${file.name}`);
    } catch (error) {
      setStatus(`Save failed: ${String(error)}`);
    }
  }, [activePath, openFiles]);

  const saveAll = useCallback(async () => {
    const dirty = openFiles.filter((file) => file.content !== file.savedContent);
    if (!dirty.length) {
      setStatus("No unsaved files");
      return;
    }

    try {
      for (const file of dirty) {
        await writeTextFile(file.path, file.content);
      }
      setOpenFiles((files) => files.map((file) => ({ ...file, savedContent: file.content })));
      setStatus(`Saved ${dirty.length} file${dirty.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(`Save all failed: ${String(error)}`);
    }
  }, [openFiles]);

  const pathIsInside = (candidate: string, parent: string) => {
    if (candidate === parent) return true;
    return candidate.startsWith(`${parent}/`) || candidate.startsWith(`${parent}\\`);
  };

  const replacePathPrefix = (candidate: string, oldPath: string, newPath: string) => {
    if (candidate === oldPath) return newPath;
    if (candidate.startsWith(`${oldPath}/`)) return `${newPath}${candidate.slice(oldPath.length)}`;
    if (candidate.startsWith(`${oldPath}\\`)) return `${newPath}${candidate.slice(oldPath.length)}`;
    return candidate;
  };

  const handlePathRenamed = (oldPath: string, newPath: string) => {
    setOpenFiles((files) => files.map((file) => {
      const nextPath = replacePathPrefix(file.path, oldPath, newPath);
      return nextPath === file.path
        ? file
        : { ...file, path: nextPath, name: fileName(nextPath), language: languageFromPath(nextPath) };
    }));
    setActivePath((path) => path ? replacePathPrefix(path, oldPath, newPath) : path);
    setSelectedPath(newPath);
  };

  const handlePathDeleted = (deletedPath: string) => {
    setOpenFiles((files) => files.filter((file) => !pathIsInside(file.path, deletedPath)));
    setActivePath((path) => path && pathIsInside(path, deletedPath) ? null : path);
    setSelectedPath(projectRoot);
  };

  const closeFile = useCallback((path: string) => {
    const file = openFiles.find((item) => item.path === path);
    if (file && file.content !== file.savedContent && !window.confirm(`${file.name} has unsaved changes. Close anyway?`)) {
      return;
    }

    const next = openFiles.filter((item) => item.path !== path);
    setOpenFiles(next);
    if (activePath === path) {
      const oldIndex = openFiles.findIndex((item) => item.path === path);
      setActivePath(next[Math.max(0, oldIndex - 1)]?.path ?? next[0]?.path ?? null);
    }
  }, [activePath, openFiles]);

  const closeActive = useCallback(() => {
    if (activePath) closeFile(activePath);
  }, [activePath, closeFile]);

  const moveEditor = useCallback((direction: 1 | -1) => {
    if (!openFiles.length) return;
    const currentIndex = Math.max(0, openFiles.findIndex((file) => file.path === activePath));
    const nextIndex = (currentIndex + direction + openFiles.length) % openFiles.length;
    setActivePath(openFiles[nextIndex].path);
  }, [activePath, openFiles]);

  const runActive = useCallback(async () => {
    if (!activeFile || !projectRoot) return;
    await saveActive();

    const command = defaultRunCommand(activeFile.path);
    setBottomOpen(true);
    setBottomTab("output");

    if (!command) {
      setOutput(
        `No automatic run command is configured for ${activeFile.language}.\n\n` +
        "Use the Terminal panel for compiler commands."
      );
      setStatus(`No runner for ${activeFile.language}`);
      return;
    }

    setOutput(`> ${command}\n\nRunning...`);
    try {
      const result = await executeCommand(projectRoot, command);
      setOutput(`> ${command}\n\n${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}\n\nExit code: ${result.exitCode}`);
      setStatus(result.exitCode === 0 ? "Run completed" : `Run failed (${result.exitCode})`);
    } catch (error) {
      setOutput(`> ${command}\n\n${String(error)}`);
      setStatus("Run failed");
    }
  }, [activeFile, projectRoot, saveActive]);

  const stopTrace = useCallback(async () => {
    const sessionId = traceSessionRef.current;
    if (!sessionId) return;

    setStatus("Stopping trace...");
    try {
      await stopPythonTrace(sessionId);
    } catch (error) {
      setStatus(`Stop trace failed: ${String(error)}`);
    }
  }, []);

  const traceActive = useCallback(async () => {
    if (!activeFile || !projectRoot) return;

    if (!activeFile.path.toLowerCase().endsWith(".py")) {
      setStatus("Execution tracing currently supports Python files");
      return;
    }

    const previousSession = traceSessionRef.current;
    if (previousSession) {
      await stopPythonTrace(previousSession);
      traceSessionRef.current = null;
    }

    await saveActive();
    setTraceRunning(true);
    setTraceResult(null);
    setBottomOpen(true);
    setBottomTab("execution");
    setStatus("Preparing Python trace...");

    try {
      const session = await preparePythonTrace(projectRoot, activeFile.path);

      traceSessionRef.current = session.sessionId;
      setTraceResult({
        sessionId: session.sessionId,
        engine: "python",
        targetPath: session.targetPath,
        startedAt: session.startedAt,
        durationMs: 0,
        exitCode: null,
        stdout: "",
        stderr: "",
        pythonVersion: "",
        events: [],
        truncated: false,
        eventLimit: session.eventLimit,
        running: true,
        stopped: false
      });

      const started = await beginPythonTrace(session.sessionId);
      if (!started) {
        throw new Error("Trace session could not be started.");
      }

      setStatus("Python trace running");
    } catch (error) {
      setTraceRunning(false);
      traceSessionRef.current = null;
      setStatus(`Trace failed: ${String(error)}`);
    }
  }, [activeFile, projectRoot, saveActive]);
  const showTerminal = useCallback((action?: "focus" | "clear") => {
    if (!projectRoot) {
      setStatus("Open a folder first");
      return;
    }

    setBottomOpen(true);
    setBottomTab("terminal");
    if (action) {
      setTimeout(() => emitTerminalAction(action), 60);
    }
  }, [projectRoot]);

  const handleMenuAction = useCallback((action: MenuAction) => {
    switch (action) {
      case "file.open":
        void openProject();
        break;
      case "file.save":
        void saveActive();
        break;
      case "file.saveAll":
        void saveAll();
        break;
      case "file.close":
        closeActive();
        break;
      case "file.exit":
        void closeWindow();
        break;

      case "edit.undo":
        emitEditorAction("undo");
        break;
      case "edit.redo":
        emitEditorAction("redo");
        break;
      case "edit.cut":
        emitEditorAction("cut");
        break;
      case "edit.copy":
        emitEditorAction("copy");
        break;
      case "edit.paste":
        emitEditorAction("paste");
        break;
      case "edit.find":
        emitEditorAction("find");
        break;

      case "selection.all":
        emitEditorAction("selectAll");
        break;
      case "selection.line":
        emitEditorAction("selectLine");
        break;
      case "selection.cursorAbove":
        emitEditorAction("cursorAbove");
        break;
      case "selection.cursorBelow":
        emitEditorAction("cursorBelow");
        break;

      case "view.explorer":
        setActiveView("explorer");
        break;
      case "view.search":
        setActiveView("search");
        setTimeout(() => window.dispatchEvent(new Event("xenra:focus-search")), 50);
        break;
      case "view.source":
        setActiveView("source");
        break;
      case "view.panel":
        if (projectRoot) setBottomOpen((value) => !value);
        break;
      case "view.minimap":
        emitEditorAction("toggleMinimap");
        break;

      case "go.line":
        emitEditorAction("goToLine");
        break;
      case "go.nextEditor":
        moveEditor(1);
        break;
      case "go.previousEditor":
        moveEditor(-1);
        break;

      case "run.current":
        void runActive();
        break;
      case "run.trace":
        void traceActive();
        break;
      case "run.stopTrace":
        void stopTrace();
        break;
      case "run.output":
        if (projectRoot) {
          setBottomOpen(true);
          setBottomTab("output");
        }
        break;

      case "terminal.toggle":
        if (projectRoot) {
          setBottomTab("terminal");
          setBottomOpen((value) => !value);
        }
        break;
      case "terminal.clear":
        showTerminal("clear");
        break;
      case "terminal.focus":
        showTerminal("focus");
        break;

      case "help.shortcuts":
        setOverlay("shortcuts");
        break;
      case "help.about":
        setOverlay("about");
        break;
    }
  }, [
    closeActive,
    moveEditor,
    openProject,
    projectRoot,
    runActive,
    saveActive,
    saveAll,
    showTerminal,
    stopTrace,
    traceActive
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const control = event.ctrlKey || event.metaKey;

      if (control && event.key.toLowerCase() === "s" && event.shiftKey) {
        event.preventDefault();
        void saveAll();
        return;
      }

      if (control && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActive();
        return;
      }

      if (control && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProject();
        return;
      }

      if (control && event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeActive();
        return;
      }

      if (control && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setActiveView("explorer");
        return;
      }

      if (control && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setActiveView("search");
        setTimeout(() => window.dispatchEvent(new Event("xenra:focus-search")), 50);
        return;
      }

      if (control && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setActiveView("source");
        return;
      }

      if (control && event.key === "`") {
        event.preventDefault();
        if (projectRoot) {
          setBottomTab("terminal");
          setBottomOpen((value) => !value);
        }
        return;
      }

      if (control && event.key === "PageDown") {
        event.preventDefault();
        moveEditor(1);
        return;
      }

      if (control && event.key === "PageUp") {
        event.preventDefault();
        moveEditor(-1);
        return;
      }

      if (event.key === "F5") {
        event.preventDefault();
        void runActive();
      }

      if (event.key === "Escape" && overlay) {
        setOverlay(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    closeActive,
    moveEditor,
    openProject,
    overlay,
    projectRoot,
    runActive,
    saveActive,
    saveAll
  ]);

  const openSearchResult = (result: SearchResult) => {
    void openAbsolutePath(result.path, result.line, result.column);
  };

  const openSourcePath = (relativePath: string) => {
    if (!projectRoot) return;
    const normalized = relativePath.replace(/\//g, projectRoot.includes("\\") ? "\\" : "/");
    void openAbsolutePath(joinPath(projectRoot, normalized));
  };

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="title-left">
          <span className="app-wordmark">XENRA</span>
          <MenuBar
            onAction={handleMenuAction}
            hasProject={Boolean(projectRoot)}
            hasActiveFile={Boolean(activeFile)}
            hasOpenFiles={openFiles.length > 0}
            traceRunning={traceRunning}
          />
        </div>

        <div className="window-title" title={windowTitle}>{windowTitle}</div>

        <div className="title-actions">
          <span className="title-status" title={status}>{status}</span>
          <button className="chrome-action" type="button" onClick={() => void saveActive()} disabled={!activeFile} title="Save">
            <SaveIcon />
          </button>
          <button className="chrome-action" type="button" onClick={() => void runActive()} disabled={!activeFile || !projectRoot} title="Run">
            <PlayIcon />
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="activity-bar">
          <div className="activity-top">
            <button
              className={activeView === "explorer" ? "active" : ""}
              type="button"
              title="Explorer"
              onClick={() => setActiveView("explorer")}
            >
              <CodeIcon />
            </button>
            <button
              className={activeView === "search" ? "active" : ""}
              type="button"
              title="Search"
              onClick={() => {
                setActiveView("search");
                setTimeout(() => window.dispatchEvent(new Event("xenra:focus-search")), 50);
              }}
            >
              <SearchIcon />
            </button>
            <button
              className={activeView === "source" ? "active" : ""}
              type="button"
              title="Source Control"
              onClick={() => setActiveView("source")}
            >
              <BranchIcon />
            </button>
          </div>

          <div className="activity-bottom">
            <button
              className={bottomOpen && bottomTab === "terminal" ? "active-bottom" : ""}
              type="button"
              title="Terminal"
              onClick={() => {
                if (!projectRoot) {
                  setStatus("Open a folder first");
                  return;
                }
                setBottomTab("terminal");
                setBottomOpen((value) => !value);
              }}
            >
              <TerminalIcon />
            </button>
          </div>
        </aside>

        {activeView === "explorer" && (
          projectRoot ? (
            <Explorer
              key={`${projectRoot}-${treeRevision}`}
              rootPath={projectRoot}
              selectedPath={selectedPath}
              onSelectFile={(node) => void openFile(node)}
              onSelectPath={(node) => setSelectedPath(node.path)}
              onChanged={() => setTreeRevision((value) => value + 1)}
              onPathRenamed={handlePathRenamed}
              onPathDeleted={handlePathDeleted}
            />
          ) : (
            <aside className="explorer-panel empty-project-panel">
              <div className="explorer-heading">
                <span>EXPLORER</span>
                <button className="ellipsis-button" type="button" onClick={() => void openProject()} title="Open folder">Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢</button>
              </div>
              <div className="empty-project-content">
                <span>No folder open</span>
                <button type="button" onClick={() => void openProject()}>Open Folder...</button>
              </div>
            </aside>
          )
        )}

        {activeView === "search" && (
          <SearchPanel rootPath={projectRoot} onOpenResult={openSearchResult} />
        )}

        {activeView === "source" && (
          <SourceControlPanel
            rootPath={projectRoot}
            onOpenPath={openSourcePath}
            onStatus={setStatus}
          />
        )}

        <section className="main-column">
          <EditorTabs
            files={openFiles}
            activePath={activePath}
            onActivate={setActivePath}
            onClose={closeFile}
          />

          <div className="editor-area">
            <CodeEditor file={activeFile} onChange={changeActiveContent} onSave={saveActive} />
          </div>

          {bottomOpen && projectRoot && (
            <BottomPanel
              activeTab={bottomTab}
              onTabChange={setBottomTab}
              cwd={terminalCwd}
              onCwdChange={setTerminalCwd}
              output={output}
              traceResult={traceResult}
              traceRunning={traceRunning}
              onTraceAgain={() => void traceActive()}
              onStopTrace={() => void stopTrace()}
              onOpenTraceEvent={(event: RuntimeTraceEvent) => {
                void openAbsolutePath(event.file, event.line, 1);
              }}
              onClose={() => setBottomOpen(false)}
            />
          )}
        </section>
      </div>

      {overlay && (
        <div className="overlay-backdrop" onMouseDown={() => setOverlay(null)}>
          <section className="overlay-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span>{overlay === "about" ? "About XENRA" : "Keyboard Shortcuts"}</span>
              <button type="button" onClick={() => setOverlay(null)}>Ãƒâ€”</button>
            </header>

            {overlay === "about" ? (
              <div className="about-body">
                <strong>XENRA 0.1</strong>
                <p>Production-grade development and execution environment.</p>
                <p>Electron Ã‚Â· React Ã‚Â· Monaco Ã‚Â· xterm</p>
              </div>
            ) : (
              <div className="shortcut-table">
                <span>Open Folder</span><kbd>Ctrl+O</kbd>
                <span>Save</span><kbd>Ctrl+S</kbd>
                <span>Save All</span><kbd>Ctrl+Shift+S</kbd>
                <span>Close Editor</span><kbd>Ctrl+W</kbd>
                <span>Explorer</span><kbd>Ctrl+Shift+E</kbd>
                <span>Search</span><kbd>Ctrl+Shift+F</kbd>
                <span>Source Control</span><kbd>Ctrl+Shift+G</kbd>
                <span>Terminal</span><kbd>Ctrl+`</kbd>
                <span>Run</span><kbd>F5</kbd>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
