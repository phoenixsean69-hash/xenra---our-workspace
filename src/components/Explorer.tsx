import { useEffect, useMemo, useState } from "react";
import type { FileNode } from "../types";
import { ChevronIcon, FileIcon, FolderIcon, PlusFileIcon, PlusFolderIcon, RefreshIcon, RenameIcon, TrashIcon } from "./Icons";
import { createDirectory, createFile, deletePath, listDirectory, renamePath } from "../services/backend";
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
};

function TreeNode({ node, depth, selectedPath, refreshToken, onSelectFile, onSelectPath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
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
        if (!cancelled) setChildren([]);
      });
    return () => { cancelled = true; };
  }, [node.path, node.isDir, expanded, refreshToken]);

  const click = () => {
    onSelectPath(node);
    if (node.isDir) {
      setExpanded((v) => !v);
    } else {
      onSelectFile(node);
    }
  };

  return (
    <>
      <button
        className={`tree-row ${selectedPath === node.path ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={click}
        title={node.path}
      >
        <span className={`tree-chevron ${expanded ? "open" : ""}`}>{node.isDir ? <ChevronIcon /> : null}</span>
        <span className="tree-icon">{node.isDir ? <FolderIcon /> : <FileIcon />}</span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.isDir && expanded && loaded && children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          refreshToken={refreshToken}
          onSelectFile={onSelectFile}
          onSelectPath={onSelectPath}
        />
      ))}
    </>
  );
}

export default function Explorer({ rootPath, selectedPath, onSelectFile, onSelectPath, onChanged, onPathRenamed, onPathDeleted }: Props) {
  const [refreshToken, setRefreshToken] = useState(0);
  const rootNode = useMemo<FileNode>(() => ({ name: fileName(rootPath), path: rootPath, isDir: true }), [rootPath]);

  const targetDirectory = selectedPath ?? rootPath;

  const refresh = () => {
    setRefreshToken((v) => v + 1);
    onChanged();
  };

  const addFile = async () => {
    const base = selectedPath ?? rootPath;
    const target = await isDirectory(base) ? base : parentOf(base);
    const name = window.prompt("New file name");
    if (!name?.trim()) return;
    await createFile(joinPath(target, name.trim()));
    refresh();
  };

  const addFolder = async () => {
    const base = selectedPath ?? rootPath;
    const target = await isDirectory(base) ? base : parentOf(base);
    const name = window.prompt("New folder name");
    if (!name?.trim()) return;
    await createDirectory(joinPath(target, name.trim()));
    refresh();
  };

  const rename = async () => {
    if (!selectedPath || selectedPath === rootPath) return;
    const current = fileName(selectedPath);
    const nextName = window.prompt("Rename", current);
    if (!nextName?.trim() || nextName.trim() === current) return;
    const nextPath = joinPath(parentOf(selectedPath), nextName.trim());
    await renamePath(selectedPath, nextPath);
    onPathRenamed(selectedPath, nextPath);
    refresh();
  };

  const remove = async () => {
    if (!selectedPath || selectedPath === rootPath) return;
    const doomed = selectedPath;
    const ok = window.confirm(`Delete ${fileName(doomed)}? This cannot be undone.`);
    if (!ok) return;
    await deletePath(doomed);
    onPathDeleted(doomed);
    refresh();
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
    const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return slash > 0 ? path.slice(0, slash) : rootPath;
  };

  return (
    <aside className="explorer-panel">
      <div className="panel-heading">
        <span>EXPLORER</span>
        <div className="panel-actions">
          <button title="New file" onClick={addFile}><PlusFileIcon /></button>
          <button title="New folder" onClick={addFolder}><PlusFolderIcon /></button>
          <button title="Refresh" onClick={refresh}><RefreshIcon /></button>
          <button title="Rename selected" onClick={rename} disabled={!selectedPath || selectedPath === rootPath}><RenameIcon /></button>
          <button title="Delete selected" onClick={remove} disabled={!selectedPath || selectedPath === rootPath}><TrashIcon /></button>
        </div>
      </div>
      <div className="project-caption" title={rootPath}>{fileName(rootPath)}</div>
      <div className="tree-scroll">
        <TreeNode
          node={rootNode}
          depth={0}
          selectedPath={selectedPath}
          refreshToken={refreshToken}
          onSelectFile={onSelectFile}
          onSelectPath={onSelectPath}
        />
      </div>
      <div className="explorer-footer" title={targetDirectory}>Project files</div>
    </aside>
  );
}
