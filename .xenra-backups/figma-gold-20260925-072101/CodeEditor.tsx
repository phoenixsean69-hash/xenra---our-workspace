import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import type { OpenFile } from "../types";

(self as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  }
};

loader.config({ monaco });

type Props = {
  file: OpenFile | null;
  onChange: (value: string) => void;
  onSave: () => void;
};

export default function CodeEditor({ file, onChange, onSave }: Props) {
  if (!file) {
    return (
      <div className="empty-editor">
        <div className="empty-mark">U</div>
        <h2>XENRA</h2>
        <p>Open a file from the Explorer to start coding.</p>
        <div className="shortcut-hint"><kbd>Ctrl</kbd><span>+</span><kbd>S</kbd><span>Save current file</span></div>
      </div>
    );
  }

  return (
    <Editor
      path={file.path}
      language={file.language}
      value={file.content}
      theme="vs-dark"
      onChange={(value) => onChange(value ?? "")}
      onMount={(editor) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
        editor.focus();
      }}
      options={{
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: true, scale: 1 },
        smoothScrolling: true,
        padding: { top: 12 },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true },
        cursorBlinking: "smooth",
        fontLigatures: true,
        tabSize: 2
      }}
    />
  );
}
