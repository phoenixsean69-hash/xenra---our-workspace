import { useEffect, useMemo, useState } from "react";
import type { RuntimeTraceEvent, RuntimeTraceResult } from "../runtime/types";

type Props = {
  result: RuntimeTraceResult | null;
  running: boolean;
  onTraceAgain: () => void;
  onOpenEvent: (event: RuntimeTraceEvent) => void;
};

const EVENT_LABEL: Record<RuntimeTraceEvent["kind"], string> = {
  call: "CALL",
  line: "LINE",
  return: "RET",
  exception: "EXC"
};

export default function ExecutionPanel({ result, running, onTraceAgain, onOpenEvent }: Props) {
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);

  useEffect(() => {
    setSelectedSequence(result?.events[0]?.sequence ?? null);
  }, [result]);

  const selected = useMemo(
    () => result?.events.find((event) => event.sequence === selectedSequence) ?? null,
    [result, selectedSequence]
  );

  if (running) {
    return <div className="execution-empty">Tracing current Python file…</div>;
  }

  if (!result) {
    return (
      <div className="execution-empty">
        <span>No execution trace.</span>
        <button type="button" onClick={onTraceAgain}>Trace Current File</button>
      </div>
    );
  }

  return (
    <div className="execution-panel">
      <div className="execution-list-column">
        <div className="execution-summary">
          <span>{result.events.length.toLocaleString()} events</span>
          <span>{result.durationMs.toFixed(1)} ms</span>
          <span>exit {result.exitCode}</span>
          {result.truncated && <span>truncated at {result.eventLimit.toLocaleString()}</span>}
          <button type="button" onClick={onTraceAgain}>Trace Again</button>
        </div>

        <div className="execution-events" role="list">
          {result.events.map((event) => (
            <button
              type="button"
              role="listitem"
              key={event.sequence}
              className={selectedSequence === event.sequence ? "execution-event selected" : "execution-event"}
              onClick={() => {
                setSelectedSequence(event.sequence);
                onOpenEvent(event);
              }}
              title={`${event.relativeFile}:${event.line}`}
            >
              <span className={`execution-kind kind-${event.kind}`}>{EVENT_LABEL[event.kind]}</span>
              <span className="execution-function" style={{ paddingLeft: Math.min(event.depth, 10) * 7 }}>
                {event.function}
              </span>
              <span className="execution-location">{event.relativeFile}:{event.line}</span>
              <span className="execution-time">{event.timeMs.toFixed(1)} ms</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="execution-detail">
        {selected ? (
          <>
            <div className="execution-detail-heading">
              <strong>{selected.function}</strong>
              <span>{selected.relativeFile}:{selected.line}</span>
            </div>

            {selected.exception && (
              <div className="execution-exception">
                {selected.exception.type}: {selected.exception.message}
              </div>
            )}

            <div className="runtime-values">
              {Object.entries(selected.locals).map(([name, value]) => (
                <div className="runtime-value-row" key={name}>
                  <span className="runtime-value-name">{name}</span>
                  <span className="runtime-value-type">{value.type}</span>
                  <span className="runtime-value-display" title={value.display}>{value.display}</span>
                  {value.objectId && (
                    <span
                      className="runtime-value-id"
                      title="Interpreter runtime identity; not a guaranteed physical memory address"
                    >
                      {value.objectId}
                    </span>
                  )}
                </div>
              ))}

              {!Object.keys(selected.locals).length && (
                <div className="execution-no-values">No local values in this frame.</div>
              )}
            </div>

            {selected.returnValue && (
              <div className="execution-return-value">
                <span>return</span>
                <code>{selected.returnValue.display}</code>
              </div>
            )}

            {(result.stdout || result.stderr) && (
              <details className="execution-stdio">
                <summary>Program output</summary>
                {result.stdout && <pre>{result.stdout}</pre>}
                {result.stderr && <pre className="execution-stderr">{result.stderr}</pre>}
              </details>
            )}
          </>
        ) : (
          <div className="execution-no-values">Select an execution event.</div>
        )}
      </aside>
    </div>
  );
}
