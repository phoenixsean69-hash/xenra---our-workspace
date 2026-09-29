import { LANGUAGE_REGISTRY } from "../languages/registry";
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
  onModeChange: (mode: WorkspaceMode) => void;
  onLanguageChange: (languageId: string) => void;
  onOpenFolder: () => void;
  onContinueLast: () => void;
  onResume: () => void;
  onShowOnStartupChange: (value: boolean) => void;
};

const languages = LANGUAGE_REGISTRY.filter(
  (language) => language.category === "programming"
);

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

export default function WelcomeScreen({
  mode,
  languageId,
  currentProject,
  lastProject,
  showOnStartup,
  onModeChange,
  onLanguageChange,
  onOpenFolder,
  onContinueLast,
  onResume,
  onShowOnStartupChange
}: Props) {
  const selectedLanguage = languageId === "auto"
    ? null
    : languages.find((language) => language.id === languageId) ?? null;

  const recentPath = currentProject ?? lastProject;
  const closeWelcome = currentProject
    ? onResume
    : lastProject
      ? onContinueLast
      : null;

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

                  <label className="welcome-ref-select">
                    <span className="welcome-ref-sr-only">Preferred Language</span>
                    <select
                      value={languageId}
                      onChange={(event) => onLanguageChange(event.target.value)}
                    >
                      <option value="auto">Auto-detect</option>
                      {languages.map((language) => (
                        <option value={language.id} key={language.id}>
                          {language.name}
                        </option>
                      ))}
                    </select>
                    <span className="welcome-ref-select-arrow" aria-hidden="true" />
                  </label>
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
