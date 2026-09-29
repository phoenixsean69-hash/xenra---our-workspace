import type { BottomPanelTab } from "../types";
import type { RuntimeTraceEvent, RuntimeTraceResult } from "../runtime/types";
import type { ToolchainReport } from "../languages/types";
import ExecutionPanel from "./ExecutionPanel";
import { CloseIcon } from "./Icons";
import RunOutputPanel from "./RunOutputPanel";
import ResizeHandle from "./ResizeHandle";
import ToolchainsPanel from "./ToolchainsPanel";
import TerminalPanel from "./TerminalPanel";

type Props = {
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  output: string;
  runRunning: boolean;
  onStopRun: () => void;
  onRunInput: (value: string) => void | Promise<void>;
  toolchains: ToolchainReport | null;
  toolchainsLoading: boolean;
  onRefreshToolchains: () => void;
  panelHeight: number;
  minPanelHeight: number;
  maxPanelHeight: () => number;
  defaultPanelHeight: number;
  onPanelHeightChange: (height: number) => void;
  traceResult: RuntimeTraceResult | null;
  traceRunning: boolean;
  onTraceAgain: () => void;
  onStopTrace: () => void;
  onOpenTraceEvent: (event: RuntimeTraceEvent) => void;
  onClose?: () => void;
};

export default function BottomPanel({
  activeTab,
  onTabChange,
  cwd,
  onCwdChange,
  output,
  runRunning,
  onStopRun,
  onRunInput,
  toolchains,
  toolchainsLoading,
  onRefreshToolchains,
  panelHeight,
  minPanelHeight,
  maxPanelHeight,
  defaultPanelHeight,
  onPanelHeightChange,
  traceResult,
  traceRunning,
  onTraceAgain,
  onStopTrace,
  onOpenTraceEvent,
  onClose
}: Props) {
  return (
    <section className="bottom-panel" style={{ height: panelHeight }}>
      <ResizeHandle
        orientation="horizontal"
        value={panelHeight}
        min={minPanelHeight}
        max={maxPanelHeight}
        defaultValue={defaultPanelHeight}
        onChange={onPanelHeightChange}
        direction={-1}
        label="Resize bottom panel"
      />

      <div className="bottom-tabs">
        {(["terminal", "output", "problems", "execution", "toolchains"] as BottomPanelTab[]).map((tab) => (
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
          <button
            className="panel-close-button"
            type="button"
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="bottom-content">
        <div className={activeTab === "terminal" ? "panel-page visible" : "panel-page"}>
          <TerminalPanel cwd={cwd} onCwdChange={onCwdChange} visible={activeTab === "terminal"} />
        </div>

        <div className={activeTab === "output" ? "panel-page visible" : "panel-page"}>
          <RunOutputPanel
            output={output}
            running={runRunning}
            onStop={onStopRun}
            onSendInput={onRunInput}
          />
        </div>

        <div className={activeTab === "problems" ? "panel-page visible" : "panel-page"}>
          <div className="problems-empty">No problems reported.</div>
        </div>

        <div className={activeTab === "toolchains" ? "panel-page visible" : "panel-page"}>
          <ToolchainsPanel
            report={toolchains}
            loading={toolchainsLoading}
            onRefresh={onRefreshToolchains}
          />
        </div>

        <div className={activeTab === "execution" ? "panel-page visible" : "panel-page"}>
          <ExecutionPanel
            result={traceResult}
            running={traceRunning}
            onTraceAgain={onTraceAgain}
            onStopTrace={onStopTrace}
            onOpenEvent={onOpenTraceEvent}
          />
        </div>
      </div>
    </section>
  );
}
