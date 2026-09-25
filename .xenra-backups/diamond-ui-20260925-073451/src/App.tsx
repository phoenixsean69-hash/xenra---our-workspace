import { useCallback, useEffect, useMemo, useState } from "react";
import type { BottomPanelTab, FileNode, OpenFile } from "./types";
import { chooseProjectFolder, executeCommand, readTextFile, writeTextFile } from "./services/backend";
import { fileName, languageFromPath } from "./lib/path";
import { BranchIcon, CodeIcon, FolderOpenIcon, PlayIcon, SaveIcon, SearchIcon, TerminalIcon } from "./components/Icons";
import Explorer from "./components/Explorer";
import EditorTabs from "./components/EditorTabs";
import CodeEditor from "./components/CodeEditor";
import BottomPanel from "./components/BottomPanel";
import Welcome from "./components/Welcome";

const LAST_PROJECT_KEY = "xenra:last-project";

function defaultRunCommand(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const quoted = `"${path}"`;
  if (ext === "py") return `python ${quoted}`;
  if (ext === "js") return `node ${quoted}`;
  if (ext === "java") return null;
  if (["c", "cc", "cpp", "cxx"].includes(ext ?? "")) return null;
  if (ext === "ps1") return `powershell -ExecutionPolicy Bypass -File ${quoted}`;
  return null;
}

export default function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("terminal");
  const [bottomOpen, setBottomOpen] = useState(true);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [treeRevision, setTreeRevision] = useState(0);

  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activePath) ?? null,
    [openFiles, activePath]
  );

  const openProject = useCallback(async () => {
    try {
      const selected = await chooseProjectFolder();
      if (!selected) return;
      setProjectRoot(selected);
      setTerminalCwd(selected);
      setSelectedPath(selected);
      setOpenFiles([]);
      setActivePath(null);
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

  const openFile = async (node: FileNode) => {
    if (node.isDir) return;
    setSelectedPath(node.path);
    const existing = openFiles.find((file) => file.path === node.path);
    if (existing) {
      setActivePath(node.path);
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
    } catch (error) {
      setStatus(`Cannot open ${node.name}: ${String(error)}`);
    }
  };

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
      setOpenFiles((files) => files.map((item) => item.path === file.path ? { ...item, savedContent: item.content } : item));
      setStatus(`Saved ${file.name}`);
    } catch (error) {
      setStatus(`Save failed: ${String(error)}`);
    }
  }, [activePath, openFiles]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActive();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "`") {
        event.preventDefault();
        setBottomOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActive]);

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
      return nextPath === file.path ? file : { ...file, path: nextPath, name: fileName(nextPath), language: languageFromPath(nextPath) };
    }));
    setActivePath((path) => path ? replacePathPrefix(path, oldPath, newPath) : path);
    setSelectedPath(newPath);
  };

  const handlePathDeleted = (deletedPath: string) => {
    setOpenFiles((files) => files.filter((file) => !pathIsInside(file.path, deletedPath)));
    setActivePath((path) => path && pathIsInside(path, deletedPath) ? null : path);
    setSelectedPath(projectRoot);
  };

  const closeFile = (path: string) => {
    const file = openFiles.find((item) => item.path === path);
    if (file && file.content !== file.savedContent && !window.confirm(`${file.name} has unsaved changes. Close anyway?`)) return;

    const next = openFiles.filter((item) => item.path !== path);
    setOpenFiles(next);
    if (activePath === path) {
      const oldIndex = openFiles.findIndex((item) => item.path === path);
      setActivePath(next[Math.max(0, oldIndex - 1)]?.path ?? next[0]?.path ?? null);
    }
  };

  const runActive = async () => {
    if (!activeFile || !projectRoot) return;
    await saveActive();
    const command = defaultRunCommand(activeFile.path);
    setBottomOpen(true);
    setBottomTab("output");

    if (!command) {
      setOutput(
        `No automatic run command is configured for ${activeFile.language}.\n\n` +
        `Use the Terminal panel for compiler commands for now. Build profiles will be added next.`
      );
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
  };

  const projectName = projectRoot ? fileName(projectRoot) : "XENRA";
  const activeRelativePath = activeFile && projectRoot
    ? activeFile.path.replace(projectRoot, "").replace(/^[/\\]+/, "")
    : null;

  if (!projectRoot) {
    return (
      <div className="app-shell welcome-mode">
        <header className="titlebar welcome-titlebar">
          <div className="title-left">
            <div className="brand-mark">Xe</div>
            <span className="title-name">XENRA</span>
          </div>
          <div className="window-title">XENRA</div>
          <span className="version-tag">0.1</span>
        </header>
        <Welcome onOpenProject={openProject} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="title-left">
          <div className="brand-mark">Xe</div>
          <nav className="menu-strip" aria-label="Application menu">
            <span>File</span>
            <span>Edit</span>
            <span>Selection</span>
            <span>View</span>
            <span>Go</span>
            <span>Run</span>
            <span>Terminal</span>
            <span>Help</span>
          </nav>
        </div>

        <div className="window-title">{projectName} — XENRA</div>

        <div className="title-actions">
          <button className="top-action" onClick={openProject} title="Open project">
            <FolderOpenIcon /><span>Open</span>
          </button>
          <button className="top-action" onClick={saveActive} disabled={!activeFile} title="Save current file">
            <SaveIcon /><span>Save</span>
          </button>
          <button className="run-action" onClick={runActive} disabled={!activeFile} title="Run current file">
            <PlayIcon /><span>Run</span>
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="activity-bar">
          <button className="active" title="Explorer"><CodeIcon /></button>
          <button title="Search (coming next)"><SearchIcon /></button>
          <button title="Source control / branches (planned)"><BranchIcon /></button>
          <div className="activity-spacer" />
          <button className={bottomOpen ? "" : "muted"} title="Toggle terminal" onClick={() => setBottomOpen((v) => !v)}>
            <TerminalIcon />
          </button>
        </aside>

        <Explorer
          key={`${projectRoot}-${treeRevision}`}
          rootPath={projectRoot}
          selectedPath={selectedPath}
          onSelectFile={openFile}
          onSelectPath={(node) => setSelectedPath(node.path)}
          onChanged={() => setTreeRevision((v) => v + 1)}
          onPathRenamed={handlePathRenamed}
          onPathDeleted={handlePathDeleted}
        />

        <section className="main-column">
          <EditorTabs files={openFiles} activePath={activePath} onActivate={setActivePath} onClose={closeFile} />

          <div className="breadcrumbs">
            <span className="crumb-project">{projectName}</span>
            {activeRelativePath ? activeRelativePath.split(/[\\/]/).map((part, index, parts) => (
              <span className={index === parts.length - 1 ? "crumb-current" : ""} key={`${part}-${index}`}>
                <span className="crumb-separator">›</span>{part}
              </span>
            )) : <span className="crumb-muted">Select a file</span>}
          </div>

          <div className="editor-area">
            <CodeEditor file={activeFile} onChange={changeActiveContent} onSave={saveActive} />
          </div>

          {bottomOpen && (
            <BottomPanel
              activeTab={bottomTab}
              onTabChange={setBottomTab}
              cwd={terminalCwd}
              onCwdChange={setTerminalCwd}
              output={output}
            />
          )}
        </section>
      </div>

      <footer className="statusbar">
        <span className="status-branch"><BranchIcon /> main <span className="future-label">branching next</span></span>
        <span>{status}</span>
        <span className="status-spacer" />
        <span>{activeFile?.language ?? "No file"}</span>
        <span>{activeFile ? "UTF-8" : ""}</span>
        <span>{projectName}</span>
      </footer>
    </div>
  );
}

