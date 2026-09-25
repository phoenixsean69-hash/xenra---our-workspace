import type { BottomPanelTab } from "../types";
import TerminalPanel from "./TerminalPanel";

type Props = {
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  output: string;
};

export default function BottomPanel({ activeTab, onTabChange, cwd, onCwdChange, output }: Props) {
  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        {(["terminal", "output", "problems"] as BottomPanelTab[]).map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="bottom-content">
        <div className={activeTab === "terminal" ? "panel-page visible" : "panel-page"}>
          <TerminalPanel cwd={cwd} onCwdChange={onCwdChange} visible={activeTab === "terminal"} />
        </div>
        <div className={activeTab === "output" ? "panel-page visible" : "panel-page"}>
          <pre className="output-view">{output || "Build and run output will appear here."}</pre>
        </div>
        <div className={activeTab === "problems" ? "panel-page visible" : "panel-page"}>
          <div className="problems-empty">No problems reported yet.</div>
        </div>
      </div>
    </section>
  );
}
