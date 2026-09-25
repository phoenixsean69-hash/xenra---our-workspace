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
        <div className="empty-mark">Xe</div>
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
      theme="xenra-gold"
      beforeMount={(monacoApi) => {
        monacoApi.editor.defineTheme("xenra-gold", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "comment", foreground: "6F6F6F", fontStyle: "italic" },
            { token: "keyword", foreground: "F2B705" },
            { token: "number", foreground: "EBCB8B" },
            { token: "string", foreground: "D6B86B" },
            { token: "type", foreground: "FFD447" },
            { token: "class", foreground: "FFD447" },
            { token: "function", foreground: "E5E5E5" },
            { token: "variable", foreground: "D8D8D8" },
            { token: "delimiter", foreground: "989898" },
            { token: "tag", foreground: "F2B705" },
            { token: "attribute.name", foreground: "FFD447" }
          ],
          colors: {
            "editor.background": "#0D0D0D",
            "editor.foreground": "#D8D8D8",
            "editorLineNumber.foreground": "#555555",
            "editorLineNumber.activeForeground": "#F2B705",
            "editorCursor.foreground": "#FFD447",
            "editor.selectionBackground": "#5A430055",
            "editor.inactiveSelectionBackground": "#4A370033",
            "editor.lineHighlightBackground": "#171717",
            "editorIndentGuide.background1": "#242424",
            "editorIndentGuide.activeBackground1": "#6F5414",
            "editorBracketMatch.background": "#F2B70522",
            "editorBracketMatch.border": "#F2B70588",
            "editorGutter.background": "#0D0D0D",
            "editorWidget.background": "#151515",
            "editorWidget.border": "#343434",
            "editorHoverWidget.background": "#151515",
            "editorHoverWidget.border": "#343434",
            "editorSuggestWidget.background": "#151515",
            "editorSuggestWidget.border": "#343434",
            "editorSuggestWidget.selectedBackground": "#3D310D",
            "minimap.background": "#0B0B0B",
            "scrollbarSlider.background": "#5A5A5A44",
            "scrollbarSlider.hoverBackground": "#7A7A7A66",
            "scrollbarSlider.activeBackground": "#F2B70555"
          }
        });
      }}
      onChange={(value) => onChange(value ?? "")}
      onMount={(editor) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
        editor.focus();
      }}
      options={{
        fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
        smoothScrolling: true,
        padding: { top: 12 },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        fontLigatures: true,
        tabSize: 2
      }}
    />
  );
}

