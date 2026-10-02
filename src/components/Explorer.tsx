import { useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "../types";
import {
  ChevronIcon,
  FileIcon,
  FolderIcon,
  PlusFileIcon,
  PlusFolderIcon,
  RefreshIcon,
  RenameIcon,
  TrashIcon
} from "./Icons";
import {
  createDirectory,
  createFile,
  deletePath,
  listDirectory,
  renamePath
} from "../services/backend";
import { fileName, joinPath } from "../lib/path";

type Props = {
  rootPath: string;
  selectedPath: string | null;
  onSelectFile: (node: FileNode) => void;
  onSelectPath: (node: FileNode) => void;
  onChanged: () => void;
  onPathRenamed: (oldPath: string, newPath: string) => void;
  onPathDeleted: (path: string) => void;
};

type TreeNodeProps = {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  refreshToken: number;
  onSelectFile: (node: FileNode) => void;
  onSelectPath: (node: FileNode) => void;
  hideSelf?: boolean;
};

type ExplorerEditMode = "file" | "folder" | "rename" | null;

const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

function TreeNode({
  node,
  depth,
  selectedPath,
  refreshToken,
  onSelectFile,
  onSelectPath,
  hideSelf = false
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(hideSelf);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!node.isDir || !expanded) return;

    let cancelled = false;

    listDirectory(node.path)
      .then((items) => {
        if (!cancelled) {
          setChildren(items);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChildren([]);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [node.path, node.isDir, expanded, refreshToken]);

  const click = () => {
    onSelectPath(node);

    if (node.isDir) {
      setExpanded((value) => !value);
    } else {
      onSelectFile(node);
    }
  };

  return (
    <>
      {!hideSelf && (
        <button
          className={`tree-row ${selectedPath === node.path ? "selected" : ""}`}
          style={{ paddingLeft: 10 + depth * 17 }}
          onClick={click}
          title={node.path}
          type="button"
        >
          <span className={`tree-chevron ${expanded ? "open" : ""}`}>
            {node.isDir ? <ChevronIcon /> : null}
          </span>
          <span className="tree-icon">
            {node.isDir ? <FolderIcon /> : <FileIcon />}
          </span>
          <span className="tree-name">{node.name}</span>
        </button>
      )}

      {node.isDir && expanded && loaded && children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={hideSelf ? depth : depth + 1}
          selectedPath={selectedPath}
          refreshToken={refreshToken}
          onSelectFile={onSelectFile}
          onSelectPath={onSelectPath}
        />
      ))}
    </>
  );
}

function validateEntryName(value: string) {
  const name = value.trim();

  if (!name) {
    return "Enter a name.";
  }

  if (name === "." || name === "..") {
    return "That name is not allowed.";
  }

  if (/[<>:"/\\|?*\u0000-\u001F]/.test(name)) {
    return 'Names cannot contain < > : " / \\ | ? *';
  }

  if (/[. ]$/.test(name)) {
    return "Names cannot end with a dot or space.";
  }

  const stem = name.split(".")[0]?.toUpperCase();

  if (stem && WINDOWS_RESERVED_NAMES.has(stem)) {
    return `${stem} is reserved by Windows.`;
  }

  return null;
}

export default function Explorer({
  rootPath,
  selectedPath,
  onSelectFile,
  onSelectPath,
  onChanged,
  onPathRenamed,
  onPathDeleted
}: Props) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [editMode, setEditMode] = useState<ExplorerEditMode>(null);
  const [draftName, setDraftName] = useState("");
  const [editDirectory, setEditDirectory] = useState(rootPath);
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const rootNode = useMemo<FileNode>(
    () => ({
      name: fileName(rootPath),
      path: rootPath,
      isDir: true
    }),
    [rootPath]
  );

  useEffect(() => {
    if (!editMode) return;

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [editMode]);

  const refresh = () => {
    setRefreshToken((value) => value + 1);
    onChanged();
  };

  const isDirectory = async (path: string) => {
    try {
      await listDirectory(path);
      return true;
    } catch {
      return false;
    }
  };

  const parentOf = (path: string) => {
    const slash = Math.max(
      path.lastIndexOf("/"),
      path.lastIndexOf("\\")
    );

    return slash > 0
      ? path.slice(0, slash)
      : rootPath;
  };

  const selectedDirectory = async () => {
    const base = selectedPath ?? rootPath;

    return await isDirectory(base)
      ? base
      : parentOf(base);
  };

  const cancelEdit = () => {
    if (editBusy) return;

    setEditMode(null);
    setDraftName("");
    setEditError(null);
  };

  const beginCreate = async (mode: "file" | "folder") => {
    if (editBusy) return;

    const target = await selectedDirectory();

    setEditDirectory(target);
    setDraftName("");
    setEditError(null);
    setEditMode(mode);
  };

  const beginRename = () => {
    if (
      editBusy ||
      !selectedPath ||
      selectedPath === rootPath
    ) {
      return;
    }

    setEditDirectory(parentOf(selectedPath));
    setDraftName(fileName(selectedPath));
    setEditError(null);
    setEditMode("rename");
  };

  const commitEdit = async () => {
    if (!editMode || editBusy) return;

    const name = draftName.trim();
    const validationError = validateEntryName(name);

    if (validationError) {
      setEditError(validationError);
      return;
    }

    setEditBusy(true);
    setEditError(null);

    try {
      if (editMode === "file") {
        const path = joinPath(editDirectory, name);

        await createFile(path);

        const node: FileNode = {
          name,
          path,
          isDir: false
        };

        setEditMode(null);
        setDraftName("");
        refresh();
        onSelectPath(node);
        onSelectFile(node);
        return;
      }

      if (editMode === "folder") {
        const path = joinPath(editDirectory, name);

        await createDirectory(path);

        const node: FileNode = {
          name,
          path,
          isDir: true
        };

        setEditMode(null);
        setDraftName("");
        refresh();
        onSelectPath(node);
        return;
      }

      if (!selectedPath || selectedPath === rootPath) {
        setEditMode(null);
        return;
      }

      const currentName = fileName(selectedPath);

      if (name === currentName) {
        setEditMode(null);
        setDraftName("");
        return;
      }

      const oldPath = selectedPath;
      const nextPath = joinPath(editDirectory, name);

      await renamePath(oldPath, nextPath);

      setEditMode(null);
      setDraftName("");
      onPathRenamed(oldPath, nextPath);
      refresh();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      setEditError(message);
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async () => {
    if (
      editBusy ||
      !selectedPath ||
      selectedPath === rootPath
    ) {
      return;
    }

    const doomed = selectedPath;

    if (!window.confirm(
      `Delete ${fileName(doomed)}? This cannot be undone.`
    )) {
      return;
    }

    await deletePath(doomed);
    onPathDeleted(doomed);
    refresh();
  };

  const editLabel =
    editMode === "file"
      ? "New file"
      : editMode === "folder"
        ? "New folder"
        : "Rename";

  return (
    <aside className="explorer-panel">
      <div className="explorer-heading">
        <span
          className="explorer-title"
          title={rootPath}
        >
          {fileName(rootPath)}
        </span>

        <div className="panel-actions">
          <button
            type="button"
            title="New file"
            aria-label="New file"
            aria-pressed={editMode === "file"}
            className={editMode === "file" ? "active" : ""}
            onClick={() => void beginCreate("file")}
            disabled={editBusy}
          >
            <PlusFileIcon />
          </button>

          <button
            type="button"
            title="New folder"
            aria-label="New folder"
            aria-pressed={editMode === "folder"}
            className={editMode === "folder" ? "active" : ""}
            onClick={() => void beginCreate("folder")}
            disabled={editBusy}
          >
            <PlusFolderIcon />
          </button>

          <button
            type="button"
            title="Refresh"
            aria-label="Refresh Explorer"
            onClick={refresh}
            disabled={editBusy}
          >
            <RefreshIcon />
          </button>

          <button
            type="button"
            title="Rename selected"
            aria-label="Rename selected"
            aria-pressed={editMode === "rename"}
            className={editMode === "rename" ? "active" : ""}
            onClick={beginRename}
            disabled={
              editBusy ||
              !selectedPath ||
              selectedPath === rootPath
            }
          >
            <RenameIcon />
          </button>

          <button
            type="button"
            title="Delete selected"
            aria-label="Delete selected"
            onClick={() => void remove()}
            disabled={
              editBusy ||
              !selectedPath ||
              selectedPath === rootPath
            }
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="tree-scroll">
        {editMode && (
          <form
            className="explorer-inline-edit"
            onSubmit={(event) => {
              event.preventDefault();
              void commitEdit();
            }}
          >
            <div className="explorer-inline-edit-row">
              <span className="explorer-inline-edit-icon">
                {editMode === "folder"
                  ? <FolderIcon />
                  : <FileIcon />}
              </span>

              <input
                ref={inputRef}
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  if (editError) setEditError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEdit();
                  }
                }}
                placeholder={
                  editMode === "file"
                    ? "filename.ext"
                    : editMode === "folder"
                      ? "folder name"
                      : "new name"
                }
                aria-label={editLabel}
                spellCheck={false}
                disabled={editBusy}
              />
            </div>

            <div className="explorer-inline-edit-meta">
              <span title={editDirectory}>
                {editMode === "rename"
                  ? "Rename selected item"
                  : `Create in ${fileName(editDirectory)}`}
              </span>

              <span>Enter to confirm - Esc to cancel</span>
            </div>

            {editError && (
              <div
                className="explorer-inline-edit-error"
                role="alert"
              >
                {editError}
              </div>
            )}
          </form>
        )}

        <TreeNode
          node={rootNode}
          depth={0}
          hideSelf
          selectedPath={selectedPath}
          refreshToken={refreshToken}
          onSelectFile={onSelectFile}
          onSelectPath={onSelectPath}
        />
      </div>
    </aside>
  );
}
