import type { OpenFile } from "../types";
import { CloseIcon, FileIcon } from "./Icons";

type Props = {
  files: OpenFile[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
};

export default function EditorTabs({ files, activePath, onActivate, onClose }: Props) {
  return (
    <div className="editor-tabs">
      {files.map((file) => {
        const dirty = file.content !== file.savedContent;
        return (
          <button
            key={file.path}
            className={`editor-tab ${activePath === file.path ? "active" : ""}`}
            onClick={() => onActivate(file.path)}
            title={file.path}
          >
            <FileIcon />
            <span>{file.name}</span>
            <span className="tab-dirty">{dirty ? "●" : ""}</span>
            <span
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(file.path);
              }}
            ><CloseIcon /></span>
          </button>
        );
      })}
    </div>
  );
}
