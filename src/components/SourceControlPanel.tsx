import { useCallback, useEffect, useMemo, useState } from "react";
import { gitCommand } from "../services/backend";

type GitChange = {
  status: string;
  path: string;
};

type Props = {
  rootPath: string | null;
  onOpenPath: (relativePath: string) => void;
  onStatus: (message: string) => void;
};

function parseStatus(text: string) {
  let branch = "";
  const changes: GitChange[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;

    if (line.startsWith("## ")) {
      const branchText = line.slice(3);
      if (branchText.startsWith("No commits yet on ")) {
        branch = branchText.slice("No commits yet on ".length).trim();
      } else if (branchText.startsWith("Initial commit on ")) {
        branch = branchText.slice("Initial commit on ".length).trim();
      } else {
        branch = branchText.split("...")[0].split(" ")[0];
      }
      continue;
    }

    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    const rawPath = line.slice(3);
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
    changes.push({ status, path });
  }

  return { branch, changes };
}

function statusLabel(code: string) {
  if (code.includes("?")) return "U";
  if (code.includes("A")) return "A";
  if (code.includes("D")) return "D";
  if (code.includes("R")) return "R";
  if (code.includes("M")) return "M";
  return code.trim() || "•";
}

export default function SourceControlPanel({ rootPath, onOpenPath, onStatus }: Props) {
  const [branch, setBranch] = useState("");
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [repoReady, setRepoReady] = useState<boolean | null>(null);
  const [gitAvailable, setGitAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!rootPath) {
      setRepoReady(null);
      setBranch("");
      setChanges([]);
      setMessage("Open a folder first.");
      return;
    }

    setBusy(true);
    try {
      const result = await gitCommand(rootPath, ["status", "--porcelain=v1", "-b"]);
      if (result.exitCode !== 0) {
        const error = result.stderr.trim() || "Git command failed.";
        const missingGit = /ENOENT|not recognized|not found/i.test(error);
        setGitAvailable(!missingGit);
        setRepoReady(missingGit ? null : false);
        setBranch("");
        setChanges([]);
        setMessage(missingGit ? "Git is not installed or is not available on PATH." : error);
        return;
      }

      const parsed = parseStatus(result.stdout);
      setGitAvailable(true);
      setRepoReady(true);
      setBranch(parsed.branch || "HEAD");
      setChanges(parsed.changes);
      setMessage(parsed.changes.length ? "" : "No changes");
    } catch (error) {
      setRepoReady(false);
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }, [rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runGit = async (args: string[], success: string) => {
    if (!rootPath) return;
    setBusy(true);
    try {
      const result = await gitCommand(rootPath, args);
      if (result.exitCode !== 0) {
        const error = result.stderr.trim() || result.stdout.trim() || "Git command failed.";
        setMessage(error);
        onStatus(error);
        return;
      }
      setMessage(success);
      onStatus(success);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const initialize = () => void runGit(["init"], "Repository initialized");

  const commit = async () => {
    const value = commitMessage.trim();
    if (!value) {
      setMessage("Enter a commit message.");
      return;
    }
    await runGit(["commit", "-m", value], "Commit created");
    setCommitMessage("");
  };

  const unstageAll = async () => {
    if (!rootPath) return;

    setBusy(true);
    try {
      const head = await gitCommand(rootPath, ["rev-parse", "--verify", "HEAD"]);
      const result = head.exitCode === 0
        ? await gitCommand(rootPath, ["reset"])
        : await gitCommand(rootPath, ["rm", "--cached", "-r", "--ignore-unmatch", "."]);

      if (result.exitCode !== 0) {
        const error = result.stderr.trim() || result.stdout.trim() || "Could not unstage changes.";
        setMessage(error);
        onStatus(error);
        return;
      }

      setMessage("Staged changes reset");
      onStatus("Staged changes reset");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async () => {
    if (!rootPath) return;
    const name = window.prompt("New branch name");
    if (!name?.trim()) return;
    await runGit(["checkout", "-b", name.trim()], `Created branch ${name.trim()}`);
  };

  const switchBranch = async () => {
    if (!rootPath) return;
    const result = await gitCommand(rootPath, ["branch", "--format=%(refname:short)"]);
    if (result.exitCode !== 0) {
      setMessage(result.stderr.trim() || "Cannot list branches.");
      return;
    }

    const branches = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!branches.length) {
      setMessage("No branches yet.");
      return;
    }

    const target = window.prompt(`Switch branch:\n${branches.join("\n")}`, branch);
    if (!target?.trim() || target.trim() === branch) return;
    await runGit(["checkout", target.trim()], `Switched to ${target.trim()}`);
  };

  const stagedCount = useMemo(
    () => changes.filter((change) => change.status[0] && change.status[0] !== " " && change.status[0] !== "?").length,
    [changes]
  );

  return (
    <aside className="side-panel source-panel">
      <div className="side-panel-heading">
        <span>SOURCE CONTROL</span>
        <button type="button" className="small-icon-button" onClick={() => void refresh()} disabled={!rootPath || busy} title="Refresh">↻</button>
      </div>

      {!rootPath && <div className="side-panel-empty">Open a folder first.</div>}

      {rootPath && !gitAvailable && (
        <div className="side-panel-empty">Git is not installed or is not available on PATH.</div>
      )}

      {rootPath && gitAvailable && repoReady === false && (
        <div className="source-init">
          <span>Git repository not initialized.</span>
          <button type="button" onClick={initialize} disabled={busy}>Initialize Repository</button>
          {message && <small>{message}</small>}
        </div>
      )}

      {rootPath && repoReady && (
        <>
          <div className="branch-row">
            <button type="button" onClick={switchBranch} title="Switch branch">{branch || "HEAD"}</button>
            <button type="button" onClick={createBranch} title="Create branch">+</button>
          </div>

          <div className="commit-row">
            <input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Message"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  void commit();
                }
              }}
            />
            <button type="button" onClick={() => void commit()} disabled={busy || !commitMessage.trim()}>Commit</button>
          </div>

          <div className="source-actions">
            <button type="button" onClick={() => void runGit(["add", "-A"], "All changes staged")} disabled={busy || !changes.length}>Stage All</button>
            <button type="button" onClick={() => void unstageAll()} disabled={busy || !stagedCount}>Unstage All</button>
          </div>

          <div className="source-meta">
            <span>{changes.length} change{changes.length === 1 ? "" : "s"}</span>
            {message && <span>{message}</span>}
          </div>

          <div className="source-changes">
            {changes.map((change, index) => (
              <button
                type="button"
                className="source-change"
                key={`${change.path}:${change.status}:${index}`}
                onClick={() => {
                  if (!change.status.includes("D")) onOpenPath(change.path);
                }}
                disabled={change.status.includes("D")}
                title={`${change.status} ${change.path}`}
              >
                <span className="change-path">{change.path}</span>
                <span className="change-status">{statusLabel(change.status)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
