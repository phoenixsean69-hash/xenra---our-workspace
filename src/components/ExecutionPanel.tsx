import { useEffect, useMemo, useState } from "react";
import type { RuntimeTraceEvent, RuntimeTraceResult } from "../runtime/types";

type Props = {
  result: RuntimeTraceResult | null;
  running: boolean;
  onTraceAgain: () => void;
  onStopTrace: () => void;
  onOpenEvent: (event: RuntimeTraceEvent) => void;
};

const EVENT_LABEL: Record<RuntimeTraceEvent["kind"], string> = {
  call: "CALL",
  line: "LINE",
  return: "RET",
  exception: "EXC"
};

export default function ExecutionPanel({
  result,
  running,
  onTraceAgain,
  onStopTrace,
  onOpenEvent
}: Props) {
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);

  useEffect(() => {
    if (!result?.events.length) {
      setSelectedSequence(null);
      return;
    }

    setSelectedSequence((current) => {
      if (current && result.events.some((event) => event.sequence === current)) {
        return current;
      }
      return result.events[0].sequence;
    });
  }, [result?.sessionId, result?.events.length]);

  const selected = useMemo(
    () => result?.events.find((event) => event.sequence === selectedSequence) ?? null,
    [result, selectedSequence]
  );

  if (!result) {
    return (
      <div className="execution-empty">
        <span>{running ? "Starting trace…" : "No execution trace."}</span>
        {running ? (
          <button type="button" onClick={onStopTrace}>Stop Trace</button>
        ) : (
          <button type="button" onClick={onTraceAgain}>Trace Current File</button>
        )}
      </div>
    );
  }

  const lastEvent = result.events[result.events.length - 1];
  const elapsedMs = running ? (lastEvent?.timeMs ?? 0) : result.durationMs;

  return (
    <div className="execution-panel">
      <div className="execution-list-column">
        <div className="execution-summary">
          {running && <span className="execution-live-label">LIVE</span>}
          <span>{result.events.length.toLocaleString()} events</span>
          <span>{elapsedMs.toFixed(1)} ms</span>
          {!running && <span>exit {result.exitCode ?? "—"}</span>}
          {result.stopped && <span>stopped</span>}
          {result.truncated && <span>limit {result.eventLimit.toLocaleString()}</span>}

          {running ? (
            <button className="execution-stop-action" type="button" onClick={onStopTrace}>
              Stop Trace
            </button>
          ) : (
            <button type="button" onClick={onTraceAgain}>Trace Again</button>
          )}
        </div>

        <div className="execution-events" role="list">
          {!result.events.length && running && (
            <div className="execution-live-wait">Waiting for the first runtime event…</div>
          )}

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
          <div className="execution-no-values">
            {running ? "Trace is live. Select an event when one appears." : "Select an execution event."}
          </div>
        )}
      </aside>
    </div>
  );
}
