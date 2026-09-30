import { useEffect, useRef, useState } from "react";
import { LANGUAGE_REGISTRY } from "../languages/registry";
import type { ToolchainReport } from "../languages/types";
import {
  WORKSPACE_MODE_OPTIONS,
  type WorkspaceMode
} from "../workspace/types";
import {
  BranchIcon,
  CodeIcon,
  PlayIcon,
  SearchIcon
} from "./Icons";

type Props = {
  mode: WorkspaceMode;
  languageId: string;
  currentProject: string | null;
  lastProject: string | null;
  showOnStartup: boolean;
  toolchains: ToolchainReport | null;
  toolchainsLoading: boolean;
  runRunning: boolean;
  traceRunning: boolean;
  traceEventCount: number;
  onModeChange: (mode: WorkspaceMode) => void;
  onLanguageChange: (languageId: string) => void;
  onOpenFolder: () => void;
  onContinueLast: () => void;
  onResume: () => void;
  onCreateFile: (
    fileName: string,
    targetDirectory?: string | null
  ) => Promise<{ ok: boolean; message: string }>;
  onPickDirectory: (defaultPath?: string | null) => Promise<string | null>;
  onShowOnStartupChange: (value: boolean) => void;
};

const languages = LANGUAGE_REGISTRY.filter(
  (language) => language.category === "programming"
);

const LANGUAGE_BADGES: Record<string, string> = {
  auto: "A",
  python: "Py",
  javascript: "JS",
  typescript: "TS",
  c: "C",
  cpp: "C++",
  java: "J",
  csharp: "C#",
  go: "Go",
  rust: "Rs",
  php: "PHP",
  ruby: "Rb",
  powershell: ">_",
  shell: "$",
  assembly: "ASM"
};

const DEFAULT_FILE_NAMES: Record<string, string> = {
  auto: "untitled.txt",
  python: "main.py",
  javascript: "main.js",
  typescript: "main.ts",
  c: "main.c",
  cpp: "main.cpp",
  java: "Main.java",
  csharp: "Program.cs",
  go: "main.go",
  rust: "main.rs",
  php: "index.php",
  ruby: "main.rb",
  powershell: "script.ps1",
  shell: "script.sh",
  assembly: "main.asm"
};

function LanguageBadge({ id }: { id: string }) {
  return (
    <span className={`welcome-language-badge welcome-language-badge--${id}`} aria-hidden="true">
      {LANGUAGE_BADGES[id] ?? "TXT"}
    </span>
  );
}

function workspaceName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? path;
}

function compactPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length <= 4) return normalized;
  return `.../${parts.slice(-4).join("/")}`;
}

function ModeGlyph({ mode }: { mode: WorkspaceMode }) {
  if (mode === "learn") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5c2.8-.9 5.5-.5 8 1.2v12c-2.5-1.7-5.2-2.1-8-1.2z" />
        <path d="M20 5.5c-2.8-.9-5.5-.5-8 1.2v12c2.5-1.7 5.2-2.1 8-1.2z" />
      </svg>
    );
  }

  if (mode === "analyze") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V12" />
        <path d="M12 19V5" />
        <path d="M19 19V9" />
      </svg>
    );
  }

  if (mode === "experiment") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6" />
        <path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
        <path d="M8 15h8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8.5 7-5 5 5 5" />
      <path d="m15.5 7 5 5-5 5" />
      <path d="m13.5 5-3 14" />
    </svg>
  );
}

function ExtensionGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </svg>
  );
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 5.5h5l1.5 2h8.5v8H2.5z" />
    </svg>
  );
}

function ResumeGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 10a5 5 0 1 1 1.4 3.5" />
      <path d="M5 6v4h4" />
    </svg>
  );
}

function OpenGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 3.5h7l2 2h3v11H4z" />
      <path d="M8 10h6M11 7l3 3-3 3" />
    </svg>
  );
}

function NewFileGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 2.5h7l4 4v11H4z" />
      <path d="M11 2.5v4h4M9.5 10v5M7 12.5h5" />
    </svg>
  );
}

export default function WelcomeScreen({
  mode,
  languageId,
  currentProject,
  lastProject,
  showOnStartup,
  toolchains,
  toolchainsLoading,
  runRunning,
  traceRunning,
  traceEventCount,
  onModeChange,
  onLanguageChange,
  onOpenFolder,
  onContinueLast,
  onResume,
  onCreateFile,
  onPickDirectory,
  onShowOnStartupChange
}: Props) {
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [newFileDirectory, setNewFileDirectory] = useState<string | null>(null);
  const [creatingFile, setCreatingFile] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!languageMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        event.target instanceof Node &&
        !languageMenuRef.current.contains(event.target)
      ) {
        setLanguageMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    if (!newFileOpen) return;

    const frame = requestAnimationFrame(() => {
      newFileInputRef.current?.focus();
      newFileInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [newFileOpen]);

  const selectedLanguage = languageId === "auto"
    ? null
    : languages.find((language) => language.id === languageId) ?? null;

  const detectedToolchains = toolchains?.tools.filter((tool) => tool.available).length ?? 0;
  const selectedToolchainIds = selectedLanguage?.toolchains ?? [];
  const selectedDetectedToolchains = selectedToolchainIds.filter((id) =>
    toolchains?.tools.some((tool) => tool.id === id && tool.available)
  ).length;

  const liveRunState = runRunning
    ? "RUNNING"
    : selectedLanguage
      ? selectedLanguage.runnable
        ? "READY"
        : "EDITOR ONLY"
      : "PER FILE";

  const observationState = traceRunning
    ? "TRACING"
    : languageId === "python"
      ? "LIVE TRACE READY"
      : languageId === "auto"
        ? "PYTHON TRACE READY"
        : "PYTHON TRACE ONLY";

  const toolchainState = toolchainsLoading
    ? "SCANNING"
    : toolchains
      ? selectedLanguage && selectedToolchainIds.length
        ? `${selectedDetectedToolchains}/${selectedToolchainIds.length} TOOLS`
        : `${detectedToolchains}/${toolchains.tools.length} DETECTED`
      : currentProject
        ? "NOT SCANNED"
        : "OPEN WORKSPACE";

  const lastTraceState = traceEventCount > 0
    ? `${traceEventCount.toLocaleString()} EVENTS`
    : "NO TRACE YET";

  const recentPath = currentProject ?? lastProject;
  const closeWelcome = currentProject
    ? onResume
    : lastProject
      ? onContinueLast
      : null;

  const beginNewFile = () => {
    setNewFileName(DEFAULT_FILE_NAMES[languageId] ?? "untitled.txt");
    setNewFileDirectory(null);
    setNewFileError("");
    setNewFileOpen(true);
  };

  const cancelNewFile = () => {
    if (creatingFile) return;
    setNewFileOpen(false);
    setNewFileError("");
  };

  const submitNewFile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingFile) return;

    setCreatingFile(true);
    setNewFileError("");

    try {
      const result = await onCreateFile(newFileName, newFileDirectory);
      if (!result.ok) {
        setNewFileError(result.message);
        return;
      }

      setNewFileOpen(false);
    } finally {
      setCreatingFile(false);
    }
  };

  const chooseLanguage = (id: string) => {
    onLanguageChange(id);
    setLanguageMenuOpen(false);

    if (newFileOpen) {
      setNewFileName(DEFAULT_FILE_NAMES[id] ?? "untitled.txt");
      setNewFileError("");
    }
  };

  const pickNewFileDirectory = async () => {
    const picked = await onPickDirectory(
      newFileDirectory ?? currentProject ?? lastProject
    );

    if (picked) {
      setNewFileDirectory(picked);
      setNewFileError("");
    }
  };

  const effectiveNewFileDirectory =
    newFileDirectory ?? currentProject ?? lastProject;

  return (
    <main className="welcome-ref-shell">
      <aside className="welcome-ref-rail" aria-hidden="true">
        <div className="welcome-ref-rail-top">
          <span className="welcome-ref-rail-item active"><CodeIcon /></span>
          <span className="welcome-ref-rail-item"><SearchIcon /></span>
          <span className="welcome-ref-rail-item"><BranchIcon /></span>
          <span className="welcome-ref-rail-item"><PlayIcon /></span>
          <span className="welcome-ref-rail-item"><ExtensionGlyph /></span>
        </div>

        <div className="welcome-ref-rail-bottom">
          <span className="welcome-ref-user"><UserGlyph /></span>
          <span className="welcome-ref-gear"><SettingsGlyph /></span>
        </div>
      </aside>

      <section className="welcome-ref-editor">
        <div className="welcome-ref-tabs">
          <div className="welcome-ref-tab active">
            <CodeIcon />
            <span>Welcome</span>
            {closeWelcome && (
              <button
                type="button"
                className="welcome-ref-tab-close"
                onClick={closeWelcome}
                aria-label="Close Welcome"
                title="Close Welcome"
              >
                <CloseGlyph />
              </button>
            )}
          </div>
        </div>

        <div className="welcome-ref-body">
          <div className="welcome-ref-content">
            <header className="welcome-ref-heading">
              <h1>XENRA</h1>
              <p>Write. Run. See. Experiment.</p>
            </header>

            <div className="welcome-ref-columns">
              <div className="welcome-ref-left">
                <section className="welcome-ref-section">
                  <h2>Start</h2>

                  <div className="welcome-ref-links">
                    <button type="button" onClick={beginNewFile}>
                      <span className="welcome-ref-link-icon"><NewFileGlyph /></span>
                      <span>New File...</span>
                    </button>

                    {newFileOpen && (
                      <form className="welcome-new-file-form" onSubmit={(event) => void submitNewFile(event)}>
                        <div className="welcome-new-file-row">
                          <LanguageBadge id={languageId} />
                          <input
                            ref={newFileInputRef}
                            value={newFileName}
                            onChange={(event) => {
                              setNewFileName(event.target.value);
                              setNewFileError("");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelNewFile();
                              }
                            }}
                            placeholder="file name"
                            spellCheck={false}
                            disabled={creatingFile}
                            aria-label="New file name"
                          />
                          <button type="submit" className="welcome-new-file-create" disabled={creatingFile}>
                            {creatingFile ? "Creating..." : "Create"}
                          </button>
                          <button
                            type="button"
                            className="welcome-new-file-cancel"
                            onClick={cancelNewFile}
                            disabled={creatingFile}
                            aria-label="Cancel new file"
                          >
                            x
                          </button>
                        </div>

                        <div className="welcome-new-file-directory">
                          <button
                            type="button"
                            className="welcome-new-file-pick-dir"
                            onClick={() => void pickNewFileDirectory()}
                            disabled={creatingFile}
                          >
                            Pick dir
                          </button>

                          <small
                            className={newFileError ? "welcome-new-file-note error" : "welcome-new-file-note"}
                            title={effectiveNewFileDirectory ?? undefined}
                          >
                            {newFileError ||
                              (effectiveNewFileDirectory
                                ? `Create in ${compactPath(effectiveNewFileDirectory)}`
                                : "No target directory selected")}
                          </small>
                        </div>
                      </form>
                    )}

                    {currentProject && (
                      <button type="button" onClick={onResume}>
                        <span className="welcome-ref-link-icon"><ResumeGlyph /></span>
                        <span>Resume Workspace</span>
                      </button>
                    )}

                    <button type="button" onClick={onOpenFolder}>
                      <span className="welcome-ref-link-icon"><OpenGlyph /></span>
                      <span>Open Folder...</span>
                    </button>

                    {!currentProject && lastProject && (
                      <button type="button" onClick={onContinueLast}>
                        <span className="welcome-ref-link-icon"><ResumeGlyph /></span>
                        <span>Continue Last Workspace</span>
                      </button>
                    )}
                  </div>
                </section>

                <section className="welcome-ref-section welcome-ref-recent">
                  <h2>Recent</h2>

                  {recentPath ? (
                    <button
                      type="button"
                      className="welcome-ref-recent-item"
                      onClick={currentProject ? onResume : onContinueLast}
                      title={recentPath}
                    >
                      <strong>{workspaceName(recentPath)}</strong>
                      <small>{compactPath(recentPath)}</small>
                    </button>
                  ) : (
                    <p>
                      You have no recent folders,{" "}
                      <button type="button" onClick={onOpenFolder}>
                        open a folder
                      </button>{" "}
                      to start.
                    </p>
                  )}
                </section>

                <section className="welcome-ref-section welcome-ref-lens">
                  <div className="welcome-ref-lens-heading">
                    <h2>Execution Lens</h2>
                    <span>XENRA</span>
                  </div>

                  <div className="welcome-ref-lens-rows">
                    <div className="welcome-ref-lens-row">
                      <span>Live Run</span>
                      <strong className={runRunning ? "active" : "ready"}>
                        {liveRunState}
                      </strong>
                    </div>

                    <div className="welcome-ref-lens-row">
                      <span>Runtime Observation</span>
                      <strong className={traceRunning ? "active" : languageId === "python" || languageId === "auto" ? "ready" : "muted"}>
                        {observationState}
                      </strong>
                    </div>

                    <div className="welcome-ref-lens-row">
                      <span>Toolchains</span>
                      <strong className={toolchainsLoading ? "active" : toolchains ? "ready" : "muted"}>
                        {toolchainState}
                      </strong>
                    </div>

                    <div className="welcome-ref-lens-row">
                      <span>Last Trace</span>
                      <strong className={traceEventCount > 0 ? "ready" : "muted"}>
                        {lastTraceState}
                      </strong>
                    </div>
                  </div>
                </section>
              </div>

              <div className="welcome-ref-right">
                <section className="welcome-ref-section">
                  <h2>Workspace Modes</h2>

                  <div className="welcome-ref-mode-list">
                    {WORKSPACE_MODE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        className={
                          mode === option.id
                            ? `welcome-ref-mode welcome-ref-mode--${option.id} selected`
                            : `welcome-ref-mode welcome-ref-mode--${option.id}`
                        }
                        aria-pressed={mode === option.id}
                        onClick={() => onModeChange(option.id)}
                      >
                        <span className="welcome-ref-mode-icon">
                          <ModeGlyph mode={option.id} />
                        </span>

                        <span className="welcome-ref-mode-copy">
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>

                        <span className="welcome-ref-mode-accent" />
                      </button>
                    ))}
                  </div>
                </section>

                <section className="welcome-ref-section welcome-ref-language">
                  <div className="welcome-ref-language-heading">
                    <h2>Preferred Language</h2>
                    <span>{selectedLanguage?.name ?? "Auto-detect"}</span>
                  </div>

                  <div className="welcome-language-picker" ref={languageMenuRef}>
                    <button
                      type="button"
                      className="welcome-language-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={languageMenuOpen}
                      onClick={() => setLanguageMenuOpen((value) => !value)}
                    >
                      <LanguageBadge id={languageId} />
                      <span className="welcome-language-trigger-name">
                        {selectedLanguage?.name ?? "Auto-detect"}
                      </span>
                      <span className="welcome-ref-select-arrow" aria-hidden="true" />
                    </button>

                    {languageMenuOpen && (
                      <div className="welcome-language-menu" role="listbox" aria-label="Preferred Language">
                        <button
                          type="button"
                          role="option"
                          aria-selected={languageId === "auto"}
                          className={languageId === "auto" ? "selected" : ""}
                          onClick={() => chooseLanguage("auto")}
                        >
                          <LanguageBadge id="auto" />
                          <span>
                            <strong>Auto-detect</strong>
                            <small>Choose language per file</small>
                          </span>
                        </button>

                        {languages.map((language) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={languageId === language.id}
                            className={languageId === language.id ? "selected" : ""}
                            key={language.id}
                            onClick={() => chooseLanguage(language.id)}
                          >
                            <LanguageBadge id={language.id} />
                            <span>
                              <strong>{language.name}</strong>
                              <small>
                                {language.extensions.slice(0, 3).map((extension) => `.${extension}`).join("  ")}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <label className="welcome-ref-startup">
            <input
              type="checkbox"
              checked={showOnStartup}
              onChange={(event) => onShowOnStartupChange(event.target.checked)}
            />
            <span>Show welcome page on startup</span>
          </label>
        </div>
      </section>
    </main>
  );
}
