import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import type { EditorProblem, EditorProblemSeverity } from "../editor/types";
import { attachLanguageServices, fileUriFromPath } from "../lsp/client";
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
  onProblemsChange: (problems: EditorProblem[]) => void;
  workspaceRoot: string | null;
  onLanguageServiceStatus: (message: string) => void;
};

function severityFromMarker(value: monaco.MarkerSeverity): EditorProblemSeverity {
  if (value === monaco.MarkerSeverity.Error) return "error";
  if (value === monaco.MarkerSeverity.Warning) return "warning";
  if (value === monaco.MarkerSeverity.Info) return "info";
  return "hint";
}

function collectProblems(): EditorProblem[] {
  return monaco.editor.getModelMarkers({}).map((marker) => ({
    owner: marker.owner,
    path: marker.resource.fsPath || marker.resource.path || marker.resource.toString(),
    message: marker.message,
    severity: severityFromMarker(marker.severity),
    startLine: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLine: marker.endLineNumber,
    endColumn: marker.endColumn,
    code: marker.code === undefined
      ? undefined
      : typeof marker.code === "string"
        ? marker.code
        : String(marker.code.value)
  }));
}

function configureLanguageServices() {
  const diagnostics = {
    noSemanticValidation: false,
    noSyntaxValidation: false
  };

  monaco.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(diagnostics);
}

export default function CodeEditor({
  file,
  onChange,
  onSave,
  onProblemsChange,
  workspaceRoot,
  onLanguageServiceStatus
}: Props) {
  if (!file) {
    return <div className="empty-editor" aria-label="No file open" />;
  }

  return (
    <Editor
      path={fileUriFromPath(file.path)}
      language={file.language}
      value={file.content}
      theme="xenra-diamond"
      beforeMount={(monacoApi) => {
        configureLanguageServices();

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
        let languageServices = attachLanguageServices(
          monaco,
          editor,
          workspaceRoot,
          onLanguageServiceStatus
        );

        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => {
            onSave();
            languageServices.didSave();
          }
        );

        let minimapEnabled = true;

        const publishProblems = () => {
          onProblemsChange(collectProblems());
        };

        publishProblems();
        const markerSubscription = monaco.editor.onDidChangeMarkers(publishProblems);

        const onEditorAction = (event: Event) => {
          const action = (event as CustomEvent<{ action: string; line?: number; column?: number }>).detail;
          if (!action) return;

          editor.focus();

          switch (action.action) {
            case "undo":
              editor.trigger("xenra", "undo", null);
              break;
            case "redo":
              editor.trigger("xenra", "redo", null);
              break;
            case "cut":
              void editor.getAction("editor.action.clipboardCutAction")?.run();
              break;
            case "copy":
              void editor.getAction("editor.action.clipboardCopyAction")?.run();
              break;
            case "paste":
              void editor.getAction("editor.action.clipboardPasteAction")?.run();
              break;
            case "find":
              void editor.getAction("actions.find")?.run();
              break;
            case "selectAll":
              if (editor.getModel()) editor.setSelection(editor.getModel()!.getFullModelRange());
              break;
            case "selectLine":
              void editor.getAction("expandLineSelection")?.run();
              break;
            case "cursorAbove":
              void editor.getAction("editor.action.insertCursorAbove")?.run();
              break;
            case "cursorBelow":
              void editor.getAction("editor.action.insertCursorBelow")?.run();
              break;
            case "goToLine":
              void editor.getAction("editor.action.gotoLine")?.run();
              break;
            case "toggleMinimap":
              minimapEnabled = !minimapEnabled;
              editor.updateOptions({ minimap: { enabled: minimapEnabled } });
              break;
            case "suggest":
              void editor.getAction("editor.action.triggerSuggest")?.run();
              break;
            case "quickFix":
              void editor.getAction("editor.action.quickFix")?.run();
              break;
            case "renameSymbol":
              void editor.getAction("editor.action.rename")?.run();
              break;
            case "formatDocument":
              void editor.getAction("editor.action.formatDocument")?.run();
              break;
            case "goToDefinition":
              void editor.getAction("editor.action.revealDefinition")?.run();
              break;
            case "goToReferences":
              void editor.getAction("editor.action.referenceSearch.trigger")?.run();
              break;
            case "didSave":
              languageServices.didSave();
              break;
            case "reveal":
              if (action.line) {
                const line = Math.max(1, action.line);
                const column = Math.max(1, action.column ?? 1);
                editor.setPosition({ lineNumber: line, column });
                editor.revealPositionInCenter({ lineNumber: line, column });
              }
              break;
          }
        };

        window.addEventListener("xenra:editor-action", onEditorAction);
        editor.onDidDispose(() => {
          languageServices.dispose();
          markerSubscription.dispose();
          window.removeEventListener("xenra:editor-action", onEditorAction);
        });

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
        tabSize: 2,
        glyphMargin: true,
        folding: true,
        showFoldingControls: "mouseover",
        stickyScroll: { enabled: true },
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: "on",
        tabCompletion: "on",
        snippetSuggestions: "inline",
        parameterHints: { enabled: true, cycle: true },
        hover: { enabled: "on", delay: 250, sticky: true },
        codeLens: true,
        links: true,
        inlayHints: { enabled: "on" },
        "semanticHighlighting.enabled": true,
        formatOnPaste: true,
        formatOnType: true
      }}
    />
  );
}
