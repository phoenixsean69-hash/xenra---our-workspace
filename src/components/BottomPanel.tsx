import type { BottomPanelTab } from "../types";
import type { RuntimeTraceEvent, RuntimeTraceResult } from "../runtime/types";
import ExecutionPanel from "./ExecutionPanel";
import TerminalPanel from "./TerminalPanel";

type Props = {
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  output: string;
  traceResult: RuntimeTraceResult | null;
  traceRunning: boolean;
  onTraceAgain: () => void;
  onOpenTraceEvent: (event: RuntimeTraceEvent) => void;
  onClose?: () => void;
};

export default function BottomPanel({
  activeTab,
  onTabChange,
  cwd,
  onCwdChange,
  output,
  traceResult,
  traceRunning,
  onTraceAgain,
  onOpenTraceEvent,
  onClose
}: Props) {
  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        {(["terminal", "output", "problems", "execution"] as BottomPanelTab[]).map((tab) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => onTabChange(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
        {onClose && (
          <button className="panel-close-button" type="button" onClick={onClose} title="Close panel">×</button>
        )}
      </div>

      <div className="bottom-content">
        <div className={activeTab === "terminal" ? "panel-page visible" : "panel-page"}>
          <TerminalPanel cwd={cwd} onCwdChange={onCwdChange} visible={activeTab === "terminal"} />
        </div>
        <div className={activeTab === "output" ? "panel-page visible" : "panel-page"}>
          <pre className="output-view">{output || "Build and run output will appear here."}</pre>
        </div>
        <div className={activeTab === "problems" ? "panel-page visible" : "panel-page"}>
          <div className="problems-empty">No problems reported.</div>
        </div>
        <div className={activeTab === "execution" ? "panel-page visible" : "panel-page"}>
          <ExecutionPanel
            result={traceResult}
            running={traceRunning}
            onTraceAgain={onTraceAgain}
            onOpenEvent={onOpenTraceEvent}
          />
        </div>
      </div>
    </section>
  );
}
