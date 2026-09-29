import { LANGUAGE_REGISTRY } from "../languages/registry";
import {
  WORKSPACE_MODE_OPTIONS,
  type WorkspaceMode
} from "../workspace/types";

type Props = {
  mode: WorkspaceMode;
  languageId: string;
  currentProject: string | null;
  lastProject: string | null;
  onModeChange: (mode: WorkspaceMode) => void;
  onLanguageChange: (languageId: string) => void;
  onOpenFolder: () => void;
  onContinueLast: () => void;
  onResume: () => void;
};

const languages = LANGUAGE_REGISTRY.filter(
  (language) => language.category === "programming"
);

function compactPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join("/")}`;
}

export default function WelcomeScreen({
  mode,
  languageId,
  currentProject,
  lastProject,
  onModeChange,
  onLanguageChange,
  onOpenFolder,
  onContinueLast,
  onResume
}: Props) {
  const selectedLanguage = languageId === "auto"
    ? null
    : languages.find((language) => language.id === languageId) ?? null;

  return (
    <main className="welcome-screen">
      <div className="welcome-shell">
        <header className="welcome-heading">
          <div className="welcome-kicker">WORKSPACE SETUP</div>
          <h1>Choose how you want to work.</h1>
          <p>
            Mode controls the starting workbench. Language records the workspace
            context while each source file keeps XENRA's normal auto-detection.
          </p>
        </header>

        <div className="welcome-columns">
          <section className="welcome-section" aria-labelledby="welcome-mode-heading">
            <div className="welcome-section-heading">
              <span id="welcome-mode-heading">MODE</span>
              <span>{WORKSPACE_MODE_OPTIONS.find((option) => option.id === mode)?.label}</span>
            </div>

            <div className="welcome-mode-list">
              {WORKSPACE_MODE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={mode === option.id ? "welcome-mode-row selected" : "welcome-mode-row"}
                  aria-pressed={mode === option.id}
                  onClick={() => onModeChange(option.id)}
                >
                  <span className="welcome-mode-code">{option.shortLabel}</span>
                  <span className="welcome-mode-copy">
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                    <small>{option.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="welcome-section welcome-language-section" aria-labelledby="welcome-language-heading">
            <div className="welcome-section-heading">
              <span id="welcome-language-heading">LANGUAGE FOCUS</span>
              <span>{selectedLanguage?.name ?? "Auto-detect"}</span>
            </div>

            <button
              type="button"
              className={languageId === "auto" ? "welcome-language-auto selected" : "welcome-language-auto"}
              aria-pressed={languageId === "auto"}
              onClick={() => onLanguageChange("auto")}
            >
              <span>AUTO</span>
              <span>
                <strong>Auto-detect</strong>
                <small>Use each file and project’s detected language.</small>
              </span>
            </button>

            <div className="welcome-language-grid">
              {languages.map((language) => (
                <button
                  type="button"
                  key={language.id}
                  className={languageId === language.id ? "welcome-language-button selected" : "welcome-language-button"}
                  aria-pressed={languageId === language.id}
                  onClick={() => onLanguageChange(language.id)}
                  title={language.notes ?? language.name}
                >
                  <span>{language.name}</span>
                  <small>{language.extensions.map((extension) => `.${extension}`).slice(0, 3).join("  ")}</small>
                </button>
              ))}
            </div>

            <div className="welcome-language-note">
              Language focus is saved with your XENRA workspace preference. Source
              files remain extension-detected, so mixed-language projects stay safe.
            </div>
          </section>
        </div>

        <footer className="welcome-footer">
          <div className="welcome-context">
            <span className="welcome-context-label">
              {currentProject ? "CURRENT WORKSPACE" : lastProject ? "LAST WORKSPACE" : "WORKSPACE"}
            </span>
            <code title={currentProject ?? lastProject ?? ""}>
              {currentProject
                ? compactPath(currentProject)
                : lastProject
                  ? compactPath(lastProject)
                  : "No folder selected"}
            </code>
          </div>

          <div className="welcome-actions">
            {currentProject ? (
              <button
                type="button"
                className="welcome-secondary-action"
                onClick={onResume}
              >
                Resume Workspace
              </button>
            ) : lastProject ? (
              <button
                type="button"
                className="welcome-secondary-action"
                onClick={onContinueLast}
              >
                Continue Last
              </button>
            ) : null}

            <button
              type="button"
              className="welcome-primary-action"
              onClick={onOpenFolder}
            >
              {currentProject ? "Open Another Folder…" : "Open Folder…"}
            </button>
          </div>
        </footer>

        <div className="welcome-philosophy">WRITE · RUN · SEE · EXPERIMENT</div>
      </div>
    </main>
  );
}
