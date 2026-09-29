import { LANGUAGE_REGISTRY } from "../languages/registry";
import type { ToolchainReport } from "../languages/types";

type Props = {
  report: ToolchainReport | null;
  loading: boolean;
  onRefresh: () => void;
};

const firstClassToolchains = new Set(
  LANGUAGE_REGISTRY
    .filter((language) => language.category === "programming")
    .flatMap((language) => language.toolchains)
);

export default function ToolchainsPanel({ report, loading, onRefresh }: Props) {
  const tools = report?.tools.filter((tool) => firstClassToolchains.has(tool.id)) ?? [];
  const ready = tools.filter((tool) => tool.available).length;

  return (
    <div className="toolchains-panel">
      <div className="toolchains-toolbar">
        <span>{report ? `${ready}/${tools.length} detected · ${report.platform}` : "Toolchains not scanned"}</span>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Scanning…" : "Refresh"}
        </button>
      </div>

      <div className="toolchains-table">
        <div className="toolchains-head">
          <span>Status</span>
          <span>Toolchain</span>
          <span>Command</span>
          <span>Version</span>
        </div>

        {tools.map((tool) => (
          <div className="toolchains-row" key={tool.id}>
            <span className={tool.available ? "toolchain-ok" : "toolchain-missing"}>
              {tool.available ? "READY" : "MISSING"}
            </span>
            <span>{tool.label}</span>
            <code>{tool.available ? tool.command : "—"}</code>
            <code title={tool.version ?? tool.error ?? ""}>
              {tool.available ? (tool.version || "detected") : (tool.error || "not found")}
            </code>
          </div>
        ))}

        {!report && !loading && (
          <div className="toolchains-empty">Open a project and scan the development toolchains available to XENRA.</div>
        )}

        {loading && (
          <div className="toolchains-empty">Scanning installed runtimes, compilers and assemblers…</div>
        )}
      </div>
    </div>
  );
}
