import { useCallback, useEffect, useMemo, useState } from "react";
import type { BottomPanelTab, FileNode, OpenFile } from "./types";
import { chooseProjectFolder, executeCommand, readTextFile, writeTextFile } from "./services/backend";
import { fileName, languageFromPath } from "./lib/path";
import { BranchIcon, CodeIcon, FolderOpenIcon, PlayIcon, SaveIcon, SearchIcon, TerminalIcon } from "./components/Icons";
import Explorer from "./components/Explorer";
import EditorTabs from "./components/EditorTabs";
import CodeEditor from "./components/CodeEditor";
import BottomPanel from "./components/BottomPanel";

const LAST_PROJECT_KEY = "xenra:last-project";

function defaultRunCommand(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const quoted = `"${path}"`;
  if (ext === "py") return `python ${quoted}`;
  if (ext === "js") return `node ${quoted}`;
  if (ext === "ps1") return `powershell -ExecutionPolicy Bypass -File ${quoted}`;
  return null;
}

export default function App() {
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("terminal");
  const [bottomOpen, setBottomOpen] = useState(false);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [treeRevision, setTreeRevision] = useState(0);

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
      setOpenFiles((files) => files.map((item) =>
        item.path === file.path ? { ...item, savedContent: item.content } : item
      ));
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
        setBottomOpen((value) => !value);
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

  const closeFile = (path: string) => {
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
        "Use the Terminal panel for compiler commands for now."
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

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="title-left">
          <span className="app-wordmark">XENRA</span>
          <nav className="menu-strip" aria-label="Application menu">
            <button type="button">File</button>
            <button type="button">Edit</button>
            <button type="button">Selection</button>
            <button type="button">View</button>
            <button type="button">Go</button>
            <button type="button">Run</button>
            <button type="button">Terminal</button>
            <button type="button">Help</button>
          </nav>
        </div>

        <div className="window-title" title={windowTitle}>{windowTitle}</div>

        <div className="title-actions">
          <button className="chrome-action" type="button" onClick={saveActive} disabled={!activeFile} title="Save current file">
            <SaveIcon />
          </button>
          <button className="chrome-action" type="button" onClick={runActive} disabled={!activeFile} title="Run current file">
            <PlayIcon />
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="activity-bar">
          <div className="activity-top">
            <button className="active" type="button" title="Explorer"><CodeIcon /></button>
            <button type="button" title="Search"><SearchIcon /></button>
            <button type="button" title="Source Control"><BranchIcon /></button>
          </div>
          <div className="activity-bottom">
            <button
              className={bottomOpen ? "" : "muted"}
              type="button"
              title="Toggle terminal"
              onClick={() => setBottomOpen((value) => !value)}
            >
              <TerminalIcon />
            </button>
          </div>
        </aside>

        {projectRoot ? (
          <Explorer
            key={`${projectRoot}-${treeRevision}`}
            rootPath={projectRoot}
            selectedPath={selectedPath}
            onSelectFile={openFile}
            onSelectPath={(node) => setSelectedPath(node.path)}
            onChanged={() => setTreeRevision((value) => value + 1)}
            onPathRenamed={handlePathRenamed}
            onPathDeleted={handlePathDeleted}
          />
        ) : (
          <aside className="explorer-panel empty-project-panel">
            <div className="explorer-heading">
              <span>EXPLORER</span>
              <button className="ellipsis-button" type="button" onClick={openProject} title="Open folder">•••</button>
            </div>
            <div className="empty-project-content">
              <span>No folder open</span>
              <button type="button" onClick={openProject}>Open Folder...</button>
            </div>
          </aside>
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
                onClose={() => setBottomOpen(false)}
              />
          )}
        </section>
      </div>
    </div>
  );
}
