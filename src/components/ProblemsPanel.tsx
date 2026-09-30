import type { EditorProblem } from "../editor/types";

type Props = {
  problems: EditorProblem[];
  onOpenProblem: (problem: EditorProblem) => void;
};

const severityRank: Record<EditorProblem["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3
};

function baseName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? path;
}

export default function ProblemsPanel({ problems, onOpenProblem }: Props) {
  const sorted = [...problems].sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.path.localeCompare(b.path) ||
    a.startLine - b.startLine ||
    a.startColumn - b.startColumn
  );

  const errors = problems.filter((problem) => problem.severity === "error").length;
  const warnings = problems.filter((problem) => problem.severity === "warning").length;

  if (!sorted.length) {
    return (
      <div className="problems-empty">
        No editor diagnostics reported.
      </div>
    );
  }

  return (
    <div className="problems-panel">
      <header className="problems-summary">
        <span>{errors} error{errors === 1 ? "" : "s"}</span>
        <span>{warnings} warning{warnings === 1 ? "" : "s"}</span>
        <span>{problems.length} total</span>
      </header>

      <div className="problems-list">
        {sorted.map((problem, index) => (
          <button
            type="button"
            className={`problem-row problem-${problem.severity}`}
            key={`${problem.owner}:${problem.path}:${problem.startLine}:${problem.startColumn}:${index}`}
            onClick={() => onOpenProblem(problem)}
            title={`${problem.path}:${problem.startLine}:${problem.startColumn}`}
          >
            <span className="problem-severity" aria-hidden="true" />
            <span className="problem-main">
              <strong>{problem.message}</strong>
              <small>
                {baseName(problem.path)}:{problem.startLine}:{problem.startColumn}
                {problem.owner ? `  ${problem.owner}` : ""}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
