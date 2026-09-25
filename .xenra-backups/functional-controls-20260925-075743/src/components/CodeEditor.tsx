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
    return <div className="empty-editor" aria-label="No file open" />;
  }

  return (
    <Editor
      path={file.path}
      language={file.language}
      value={file.content}
      theme="xenra-diamond"
      beforeMount={(monacoApi) => {
        monacoApi.editor.defineTheme("xenra-diamond", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "comment", foreground: "737987", fontStyle: "italic" },
            { token: "keyword", foreground: "C792EA" },
            { token: "number", foreground: "FFD866" },
            { token: "string", foreground: "F2B705" },
            { token: "type", foreground: "82AAFF" },
            { token: "class", foreground: "82AAFF" },
            { token: "function", foreground: "7FDBCA" },
            { token: "variable", foreground: "C4CBDA" },
            { token: "delimiter", foreground: "9099AC" },
            { token: "tag", foreground: "F2B705" },
            { token: "attribute.name", foreground: "7FDBCA" }
          ],
          colors: {
            "editor.background": "#111214",
            "editor.foreground": "#C4CBDA",
            "editorLineNumber.foreground": "#626978",
            "editorLineNumber.activeForeground": "#E6C55A",
            "editorCursor.foreground": "#F2B705",
            "editor.selectionBackground": "#5C461E66",
            "editor.inactiveSelectionBackground": "#4B3A1844",
            "editor.lineHighlightBackground": "#191A1E",
            "editorIndentGuide.background1": "#292B31",
            "editorIndentGuide.activeBackground1": "#68541B",
            "editorBracketMatch.background": "#F2B7051A",
            "editorBracketMatch.border": "#A98418",
            "editorGutter.background": "#111214",
            "editorWidget.background": "#1D1F24",
            "editorWidget.border": "#3A3C45",
            "editorHoverWidget.background": "#1D1F24",
            "editorHoverWidget.border": "#3A3C45",
            "editorSuggestWidget.background": "#202229",
            "editorSuggestWidget.border": "#3C3F49",
            "editorSuggestWidget.selectedBackground": "#4A421F",
            "editorSuggestWidget.highlightForeground": "#FFD447",
            "minimap.background": "#111214",
            "scrollbarSlider.background": "#61677640",
            "scrollbarSlider.hoverBackground": "#737A8A5A",
            "scrollbarSlider.activeBackground": "#F2B70552"
          }
        });
      }}
      onChange={(value) => onChange(value ?? "")}
      onMount={(editor) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
        editor.focus();
      }}
      options={{
        fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
        fontSize: 15,
        lineHeight: 24,
        minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
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
