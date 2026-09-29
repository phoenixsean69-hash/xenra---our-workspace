import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BottomPanelTab, FileNode, OpenFile, SearchResult, SidebarView } from "./types";
import type { RuntimeTraceEvent, RuntimeTraceMessage, RuntimeTraceResult } from "./runtime/types";
import type { RunSessionMessage } from "./run/types";
import {
  beginPythonTrace,
  beginRunSession,
  chooseProjectFolder,
  closeWindow,
  detectToolchains,
  executeCommand,
  onPythonTraceMessage,
  onRunSessionMessage,
  preparePythonTrace,
  prepareRunSession,
  readTextFile,
  stopPythonTrace,
  stopRunSession,
  writeRunSession,
  writeTextFile
} from "./services/backend";
import { fileName, joinPath, languageFromPath } from "./lib/path";
import { createBuildPlan, createRunPlan, LANGUAGE_REGISTRY, languageForPath } from "./languages/registry";
import type { ToolchainReport } from "./languages/types";
import {
  workspaceModeLabel,
  type WorkspaceMode
} from "./workspace/types";
import { BranchIcon, CodeIcon, PlayIcon, SaveIcon, SearchIcon, TerminalIcon } from "./components/Icons";
import Explorer from "./components/Explorer";
import EditorTabs from "./components/EditorTabs";
import CodeEditor from "./components/CodeEditor";
import BottomPanel from "./components/BottomPanel";
import MenuBar, { type MenuAction } from "./components/MenuBar";
import SearchPanel from "./components/SearchPanel";
import SourceControlPanel from "./components/SourceControlPanel";
import ResizeHandle from "./components/ResizeHandle";
import WelcomeScreen from "./components/WelcomeScreen";

const LAST_PROJECT_KEY = "xenra:last-project";
const WELCOME_ON_STARTUP_KEY = "xenra:welcome:on-startup";
const WORKSPACE_MODE_KEY = "xenra:workspace:mode";
const WORKSPACE_LANGUAGE_KEY = "xenra:workspace:language";
const SIDEBAR_WIDTH_KEY = "xenra:layout:sidebar-width";
const BOTTOM_PANEL_HEIGHT_KEY = "xenra:layout:bottom-panel-height";

const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;

const BOTTOM_PANEL_DEFAULT_HEIGHT = 230;
const BOTTOM_PANEL_MIN_HEIGHT = 130;
const BOTTOM_PANEL_MAX_HEIGHT = 520;
const EDITOR_MIN_HEIGHT = 180;

function clampDimension(value: number, min: number, max: number) {
  return Math.min(Math.max(min, max), Math.max(min, value));
}

function readStoredDimension(key: string, fallback: number, min: number, max: number) {
  try {
    const stored = Number.parseFloat(localStorage.getItem(key) ?? "");
    return Number.isFinite(stored) ? clampDimension(stored, min, max) : fallback;
  } catch {
    return fallback;
  }
}

function readWorkspaceMode(): WorkspaceMode {
  try {
    const stored = localStorage.getItem(WORKSPACE_MODE_KEY);

    if (
      stored === "develop" ||
      stored === "learn" ||
      stored === "analyze" ||
      stored === "experiment"
    ) {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in unusual renderer environments.
  }

  return "develop";
}

function readWorkspaceLanguage() {
  try {
    const stored = localStorage.getItem(WORKSPACE_LANGUAGE_KEY);
    if (!stored || stored === "auto") return "auto";

    return LANGUAGE_REGISTRY.some(
      (language) => language.category === "programming" && language.id === stored
    )
      ? stored
      : "auto";
  } catch {
    return "auto";
  }
}
function readWelcomeOnStartup() {
  try {
    return localStorage.getItem(WELCOME_ON_STARTUP_KEY) !== "false";
  } catch {
    return true;
  }
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
  const [lastProject, setLastProject] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
  });
  const [showWelcomeOnStartup, setShowWelcomeOnStartup] = useState(() => readWelcomeOnStartup());
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => showWelcomeOnStartup || !lastProject
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => readWorkspaceMode());
  const [preferredLanguageId, setPreferredLanguageId] = useState(() => readWorkspaceLanguage());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SidebarView>("explorer");
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("terminal");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredDimension(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() =>
    readStoredDimension(BOTTOM_PANEL_HEIGHT_KEY, BOTTOM_PANEL_DEFAULT_HEIGHT, BOTTOM_PANEL_MIN_HEIGHT, BOTTOM_PANEL_MAX_HEIGHT)
  );
  const [terminalCwd, setTerminalCwd] = useState("");
  const [output, setOutput] = useState("");
  const [runRunning, setRunRunning] = useState(false);
  const [toolchains, setToolchains] = useState<ToolchainReport | null>(null);
  const [toolchainsLoading, setToolchainsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [treeRevision, setTreeRevision] = useState(0);
  const [overlay, setOverlay] = useState<"about" | "shortcuts" | null>(null);
  const [traceResult, setTraceResult] = useState<RuntimeTraceResult | null>(null);
  const [traceRunning, setTraceRunning] = useState(false);
  const runSessionRef = useRef<string | null>(null);
  const runQueueRef = useRef<RunSessionMessage[]>([]);
  const runFlushTimerRef = useRef<number | null>(null);
  const traceSessionRef = useRef<string | null>(null);
  const traceQueueRef = useRef<RuntimeTraceMessage[]>([]);
  const traceFlushTimerRef = useRef<number | null>(null);
  const mainColumnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (welcomeOpen || projectRoot || !lastProject) return;

    setProjectRoot(lastProject);
    setTerminalCwd(lastProject);
    setSelectedPath(lastProject);
  }, [lastProject, projectRoot, welcomeOpen]);

  useEffect(() => {
    const flushRunOutput = () => {
      runFlushTimerRef.current = null;

      const messages = runQueueRef.current.splice(0);
      if (!messages.length) return;

      let chunk = "";
      let completed: Extract<RunSessionMessage, { type: "complete" }> | null = null;
      let runError: string | null = null;

      for (const message of messages) {
        if (message.type === "stdout" || message.type === "stderr") {
          chunk += message.chunk;
        } else if (message.type === "error") {
          runError = message.message;
          chunk += `\n[Run error] ${message.message}\n`;
        } else if (message.type === "complete") {
          completed = message;
        }
      }

      if (chunk) {
        setOutput((current) => {
          const next = current + chunk;
          const limit = 750_000;

          return next.length > limit
            ? `[Older live output trimmed]\n${next.slice(-limit)}`
            : next;
        });
      }

      if (runError) {
        setStatus(`Run error: ${runError}`);
      }

      if (completed) {
        const final = completed;
        setRunRunning(false);
        runSessionRef.current = null;

        setOutput((current) =>
          `${current}${current.endsWith("\n") ? "" : "\n"}\n` +
          (final.stopped
            ? `[Process stopped after ${final.durationMs.toFixed(0)} ms]`
            : `[Process exited with code ${final.exitCode} after ${final.durationMs.toFixed(0)} ms]`)
        );

        setStatus(
          final.stopped
            ? "Run stopped"
            : final.exitCode === 0
              ? "Run completed"
              : `Run failed (${final.exitCode})`
        );
      }
    };

    const unsubscribe = onRunSessionMessage((message) => {
      const sessionId = runSessionRef.current;
      if (!sessionId || message.sessionId !== sessionId) return;

      runQueueRef.current.push(message);

      if (runFlushTimerRef.current === null) {
        runFlushTimerRef.current = window.setTimeout(flushRunOutput, 30);
      }
    });

    return () => {
      unsubscribe();

      if (runFlushTimerRef.current !== null) {
        window.clearTimeout(runFlushTimerRef.current);
      }
    };
  }, []);
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
  const getSidebarMax = useCallback(() => {
    const activityWidth = window.innerWidth <= 900 ? 54 : window.innerWidth <= 1180 ? 58 : 64;
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - activityWidth - 5 - 420));
  }, []);

  const getBottomPanelMax = useCallback(() => {
    const availableHeight = mainColumnRef.current?.clientHeight ?? Math.max(400, window.innerHeight - 48);
    return Math.max(
      BOTTOM_PANEL_MIN_HEIGHT,
      Math.min(BOTTOM_PANEL_MAX_HEIGHT, availableHeight - 60 - EDITOR_MIN_HEIGHT)
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [sidebarWidth]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, String(Math.round(bottomPanelHeight)));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [bottomPanelHeight]);

  useEffect(() => {
    const clampLayout = () => {
      setSidebarWidth((current) => clampDimension(current, SIDEBAR_MIN_WIDTH, getSidebarMax()));
      setBottomPanelHeight((current) => clampDimension(current, BOTTOM_PANEL_MIN_HEIGHT, getBottomPanelMax()));
    };
    clampLayout();
    window.addEventListener("resize", clampLayout);
    return () => window.removeEventListener("resize", clampLayout);
  }, [getBottomPanelMax, getSidebarMax]);

  const preferredLanguage = useMemo(
    () => preferredLanguageId === "auto"
      ? null
      : LANGUAGE_REGISTRY.find((language) => language.id === preferredLanguageId) ?? null,
    [preferredLanguageId]
  );

  const executionDefaultMode = workspaceMode === "analyze" ? "advanced" : "simple";

  const applyWorkspacePreset = useCallback((mode: WorkspaceMode) => {
    switch (mode) {
      case "learn":
      case "analyze":
        setBottomTab("execution");
        setBottomOpen(true);
        break;
      case "experiment":
        setBottomTab("terminal");
        setBottomOpen(true);
        break;
      case "develop":
      default:
        setBottomOpen(false);
        break;
    }
  }, []);

  const persistWorkspacePreferences = useCallback(() => {
    localStorage.setItem(WORKSPACE_MODE_KEY, workspaceMode);
    localStorage.setItem(WORKSPACE_LANGUAGE_KEY, preferredLanguageId);
  }, [preferredLanguageId, workspaceMode]);
  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activePath) ?? null,
    [openFiles, activePath]
  );

  const projectName = projectRoot ? fileName(projectRoot) : "No Folder";
  const windowTitle = welcomeOpen
    ? "Welcome - XENRA"
    : activeFile
      ? `${activeFile.name} - ${projectName} - XENRA`
      : projectRoot
        ? `${projectName} - XENRA`
        : "XENRA";

  const activateProject = useCallback(async (selected: string) => {
    const activeRun = runSessionRef.current;
    if (activeRun) {
      await stopRunSession(activeRun);
      runSessionRef.current = null;
      setRunRunning(false);
    }

    const activeTrace = traceSessionRef.current;
    if (activeTrace) {
      await stopPythonTrace(activeTrace);
      traceSessionRef.current = null;
    }

    setProjectRoot(selected);
    setLastProject(selected);
    setTerminalCwd(selected);
    setSelectedPath(selected);
    setOpenFiles([]);
    setActivePath(null);
    setActiveView("explorer");
    setTraceResult(null);

    localStorage.setItem(LAST_PROJECT_KEY, selected);
    persistWorkspacePreferences();
    applyWorkspacePreset(workspaceMode);
    setWelcomeOpen(false);

    setStatus(
      `${workspaceModeLabel(workspaceMode)} Â· ${preferredLanguage?.name ?? "Auto"} Â· ${fileName(selected)}`
    );
  }, [
    applyWorkspacePreset,
    persistWorkspacePreferences,
    preferredLanguage,
    workspaceMode
  ]);

  const openProject = useCallback(async () => {
    try {
      const selected = await chooseProjectFolder();
      if (!selected) return;

      await activateProject(selected);
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, [activateProject]);

  const continueLastProject = useCallback(async () => {
    if (!lastProject) return;

    try {
      await activateProject(lastProject);
    } catch (error) {
      setStatus(`Continue failed: ${String(error)}`);
    }
  }, [activateProject, lastProject]);

  const resumeWorkspace = useCallback(() => {
    if (!projectRoot) return;

    persistWorkspacePreferences();
    applyWorkspacePreset(workspaceMode);
    setWelcomeOpen(false);
    setStatus(`${workspaceModeLabel(workspaceMode)} Â· ${preferredLanguage?.name ?? "Auto"}`);
  }, [
    applyWorkspacePreset,
    persistWorkspacePreferences,
    preferredLanguage,
    projectRoot,
    workspaceMode
  ]);

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

  const refreshToolchainsAt = useCallback(async (cwd: string) => {
    setToolchainsLoading(true);
    try {
      const report = await detectToolchains(cwd);
      setToolchains(report);
      return report;
    } catch (error) {
      setStatus(`Toolchain scan failed: ${String(error)}`);
      return null;
    } finally {
      setToolchainsLoading(false);
    }
  }, []);

  const refreshToolchains = useCallback(async () => {
    if (!projectRoot) {
      setStatus("Open a folder first");
      return null;
    }

    return await refreshToolchainsAt(projectRoot);
  }, [projectRoot, refreshToolchainsAt]);

  useEffect(() => {
    if (!projectRoot) {
      setToolchains(null);
      return;
    }

    void refreshToolchainsAt(projectRoot);
  }, [projectRoot, refreshToolchainsAt]);

  const resolveToolchains = useCallback(async () => {
    if (toolchains) return toolchains;
    if (!projectRoot) return null;
    return await refreshToolchainsAt(projectRoot);
  }, [projectRoot, refreshToolchainsAt, toolchains]);

  const runActive = useCallback(async () => {
    if (!activeFile || !projectRoot) return;

    const previousRun = runSessionRef.current;
    if (previousRun) {
      await stopRunSession(previousRun);
      runSessionRef.current = null;
      setRunRunning(false);
    }

    await saveActive();

    setBottomOpen(true);
    setBottomTab("output");

    const report = await resolveToolchains();
    if (!report) {
      setOutput("Toolchain detection failed. Open TOOLCHAINS and refresh the scan.");
      return;
    }

    const resolution = createRunPlan(activeFile.path, activeFile.content, report);

    if (!resolution.ok) {
      const language = resolution.language ?? languageForPath(activeFile.path);
      setOutput(
        `${language?.name ?? "This file type"} cannot be run automatically yet.\n\n${resolution.message}\n\n` +
        (resolution.missing.length
          ? `Required/alternative toolchains: ${resolution.missing.join(", ")}\n\nOpen TOOLCHAINS to inspect your system.`
          : "Use the Terminal for a project-specific command.")
      );
      setBottomTab("toolchains");
      setStatus(`Runner unavailable for ${language?.name ?? activeFile.language}`);
      return;
    }

    const { plan } = resolution;
    const header = `[${plan.languageName}] ${plan.description}\n> ${plan.command}\n\n`;

    try {
      const session = await prepareRunSession(projectRoot, plan.command);

      runSessionRef.current = session.sessionId;
      setRunRunning(true);
      setOutput(header);
      setStatus(`${plan.languageName} running`);

      const started = await beginRunSession(session.sessionId);
      if (!started) {
        throw new Error("Run session could not be started.");
      }
    } catch (error) {
      const sessionId = runSessionRef.current;

      if (sessionId) {
        try { await stopRunSession(sessionId); } catch { /* already stopped */ }
      }

      runSessionRef.current = null;
      setRunRunning(false);
      setOutput(`${header}[Run error] ${String(error)}`);
      setStatus(`${plan.languageName} run failed`);
    }
  }, [activeFile, projectRoot, resolveToolchains, saveActive]);

  const stopRun = useCallback(async () => {
    const sessionId = runSessionRef.current;
    if (!sessionId) return;

    setStatus("Stopping run...");

    try {
      await stopRunSession(sessionId);
    } catch (error) {
      setStatus(`Stop run failed: ${String(error)}`);
    }
  }, []);

  const sendRunInput = useCallback(async (value: string) => {
    const sessionId = runSessionRef.current;
    if (!sessionId) return;

    const input = `${value}\n`;

    setOutput((current) =>
      `${current}${current.endsWith("\n") || !current ? "" : "\n"}> ${value}\n`
    );

    try {
      const written = await writeRunSession(sessionId, input);

      if (!written) {
        setOutput((current) => `${current}[stdin is no longer available]\n`);
      }
    } catch (error) {
      setStatus(`Run input failed: ${String(error)}`);
    }
  }, []);

  const buildActive = useCallback(async () => {
    if (!activeFile || !projectRoot) return;
    await saveActive();

    setBottomOpen(true);
    setBottomTab("output");

    const report = await resolveToolchains();
    if (!report) {
      setOutput("Toolchain detection failed. Open TOOLCHAINS and refresh the scan.");
      return;
    }

    const resolution = createBuildPlan(activeFile.path, activeFile.content, report);

    if (!resolution.ok) {
      const language = resolution.language ?? languageForPath(activeFile.path);
      setOutput(
        `${language?.name ?? "This file type"} cannot be built automatically yet.\n\n${resolution.message}\n\n` +
        (resolution.missing.length
          ? `Required/alternative toolchains: ${resolution.missing.join(", ")}`
          : "No direct build action is defined for this language.")
      );
      if (resolution.missing.length) setBottomTab("toolchains");
      setStatus(`Build unavailable for ${language?.name ?? activeFile.language}`);
      return;
    }

    const { plan } = resolution;
    setOutput(`[${plan.languageName}] ${plan.description}\n> ${plan.command}\n\nBuilding...`);

    try {
      const result = await executeCommand(projectRoot, plan.command);
      setOutput(
        `[${plan.languageName}] ${plan.description}\n> ${plan.command}\n\n` +
        `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}\n\nExit code: ${result.exitCode}`
      );
      setStatus(result.exitCode === 0 ? `${plan.languageName} build completed` : `${plan.languageName} build failed (${result.exitCode})`);
    } catch (error) {
      setOutput(`[${plan.languageName}] ${plan.description}\n> ${plan.command}\n\n${String(error)}`);
      setStatus(`${plan.languageName} build failed`);
    }
  }, [activeFile, projectRoot, resolveToolchains, saveActive]);

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
      case "run.build":
        void buildActive();
        break;
      case "run.trace":
        void traceActive();
        break;
      case "run.stopTrace":
        void stopTrace();
        break;
      case "run.toolchains":
        if (projectRoot) {
          setBottomOpen(true);
          setBottomTab("toolchains");
          void refreshToolchains();
        }
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
    buildActive,
    closeActive,
    moveEditor,
    openProject,
    projectRoot,
    refreshToolchains,
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

      if (welcomeOpen) {
        if (event.key === "Escape" && projectRoot) {
          event.preventDefault();
          resumeWorkspace();
        }
        return;
      }

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

      if (control && event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        void buildActive();
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
    buildActive,
    closeActive,
    moveEditor,
    openProject,
    overlay,
    projectRoot,
    resumeWorkspace,
    runActive,
    saveActive,
    saveAll,
    welcomeOpen
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
    <div className={welcomeOpen ? "app-shell welcome-open" : "app-shell"}>
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
          {!welcomeOpen && (
            <>
              <button
                className="workspace-context-button"
                type="button"
                onClick={() => setWelcomeOpen(true)}
                title="Change workspace mode or language"
              >
                <span>{workspaceModeLabel(workspaceMode)}</span>
                <span>Â·</span>
                <span>{preferredLanguage?.name ?? "Auto"}</span>
              </button>

              <span className="title-status" title={status}>{status}</span>

              <button className="chrome-action" type="button" onClick={() => void saveActive()} disabled={!activeFile} title="Save">
                <SaveIcon />
              </button>

              <button className="chrome-action" type="button" onClick={() => void runActive()} disabled={!activeFile || !projectRoot} title="Run">
                <PlayIcon />
              </button>
            </>
          )}
        </div>
      </header>

      {welcomeOpen && (
        <WelcomeScreen
          mode={workspaceMode}
          languageId={preferredLanguageId}
          currentProject={projectRoot}
          lastProject={lastProject}
          showOnStartup={showWelcomeOnStartup}
          onModeChange={setWorkspaceMode}
          onLanguageChange={setPreferredLanguageId}
          onOpenFolder={() => void openProject()}
          onContinueLast={() => void continueLastProject()}
          onResume={resumeWorkspace}
          onShowOnStartupChange={(value) => {
            setShowWelcomeOnStartup(value);
            localStorage.setItem(WELCOME_ON_STARTUP_KEY, value ? "true" : "false");
          }}
        />
      )}

      <div
        className="workbench"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
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
                <button className="ellipsis-button" type="button" onClick={() => void openProject()} title="Open folder">ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢</button>
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

        <ResizeHandle
          orientation="vertical"
          value={sidebarWidth}
          min={SIDEBAR_MIN_WIDTH}
          max={getSidebarMax}
          defaultValue={SIDEBAR_DEFAULT_WIDTH}
          onChange={setSidebarWidth}
          label="Resize side panel"
        />

        <section ref={mainColumnRef} className="main-column">
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
              runRunning={runRunning}
              onStopRun={() => void stopRun()}
              onRunInput={sendRunInput}
              toolchains={toolchains}
              toolchainsLoading={toolchainsLoading}
              onRefreshToolchains={() => void refreshToolchains()}
              executionDefaultMode={executionDefaultMode}
              panelHeight={bottomPanelHeight}
              minPanelHeight={BOTTOM_PANEL_MIN_HEIGHT}
              maxPanelHeight={getBottomPanelMax}
              defaultPanelHeight={BOTTOM_PANEL_DEFAULT_HEIGHT}
              onPanelHeightChange={setBottomPanelHeight}
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
              <button type="button" onClick={() => setOverlay(null)}>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â</button>
            </header>

            {overlay === "about" ? (
              <div className="about-body">
                <strong>XENRA 0.1</strong>
                <p>Production-grade development and execution environment.</p>
                <p>Electron ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· React ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· Monaco ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· xterm</p>
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
