import { useEffect, useMemo, useState } from "react";
import type { RuntimeTraceEvent, RuntimeTraceResult, RuntimeValueSnapshot } from "../runtime/types";

type Props = {
  result: RuntimeTraceResult | null;
  running: boolean;
  onTraceAgain: () => void;
  onStopTrace: () => void;
  onOpenEvent: (event: RuntimeTraceEvent) => void;
};

type ExecutionMode = "simple" | "advanced";

const EVENT_LABEL: Record<RuntimeTraceEvent["kind"], string> = {
  call: "CALL",
  line: "LINE",
  return: "RET",
  exception: "EXC"
};

function shortFileName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || path;
}

function isInternalRuntimeEvent(event: RuntimeTraceEvent) {
  const file = event.file.trim().toLowerCase();
  const relative = event.relativeFile.trim().toLowerCase();

  return (
    file.startsWith("<frozen ") ||
    relative.startsWith("<frozen ") ||
    file.startsWith("<built-in") ||
    relative.startsWith("<built-in")
  );
}

function explainEvent(event: RuntimeTraceEvent) {
  const file = shortFileName(event.relativeFile);

  if (event.kind === "exception") {
    const detail = event.exception
      ? `${event.exception.type}: ${event.exception.message}`
      : "an exception";
    return `The program hit ${detail} in ${event.function}().`;
  }

  if (event.function === "<module>") {
    if (event.kind === "call") return `Started running ${file}.`;
    if (event.kind === "return") return `Finished running ${file}.`;
    return `Running line ${event.line} in ${file}.`;
  }

  if (event.kind === "call") {
    return `Entered ${event.function}() in ${file}.`;
  }

  if (event.kind === "return") {
    const returned = event.returnValue?.display;
    return returned
      ? `${event.function}() returned ${returned}.`
      : `${event.function}() returned.`;
  }

  return `Executing line ${event.line} inside ${event.function}().`;
}

function isImportantValue(name: string, value: RuntimeValueSnapshot) {
  if (name.startsWith("__")) return false;
  if (value.kind === "module" || value.kind === "callable" || value.kind === "type") return false;
  return true;
}

function SimpleExecutionView({
  result,
  running,
  onTraceAgain,
  onStopTrace,
  onOpenEvent
}: Props) {
  const userEvents = useMemo(
    () => result?.events.filter((event) => !isInternalRuntimeEvent(event)) ?? [],
    [result?.events]
  );

  const hiddenEvents = (result?.events.length ?? 0) - userEvents.length;
  const latest = userEvents[userEvents.length - 1] ?? null;

  const counts = useMemo(() => {
    const next = { calls: 0, lines: 0, returns: 0, errors: 0 };
    for (const event of userEvents) {
      if (event.kind === "call") next.calls += 1;
      if (event.kind === "line") next.lines += 1;
      if (event.kind === "return") next.returns += 1;
      if (event.kind === "exception") next.errors += 1;
    }
    return next;
  }, [userEvents]);

  const importantValues = useMemo(() => {
    if (!latest) return [];
    return Object.entries(latest.locals)
      .filter(([name, value]) => isImportantValue(name, value))
      .slice(0, 8);
  }, [latest]);

  const recentSteps = useMemo(
    () => userEvents.slice(-6).reverse(),
    [userEvents]
  );

  const statusText = running
    ? "Running"
    : result?.stopped
      ? "Stopped"
      : result?.exitCode === 0
        ? "Completed"
        : result
          ? `Exited with code ${result.exitCode ?? "—"}`
          : "Idle";

  const message = latest
    ? explainEvent(latest)
    : running
      ? hiddenEvents > 0
        ? "Python is preparing your program. Internal runtime setup is hidden in Simple view."
        : "Waiting for your program to begin executing."
      : result
        ? "Trace finished without user-code events."
        : "Run a Python trace to see a simplified explanation of execution.";

  return (
    <div className="execution-simple-view">
      <div className="execution-simple-toolbar">
        {running && <span className="execution-live-label">LIVE</span>}
        <span>{statusText}</span>
        <span>{userEvents.length.toLocaleString()} user-code events</span>
        {hiddenEvents > 0 && <span>{hiddenEvents.toLocaleString()} runtime events hidden</span>}
        {result?.truncated && <span>trace limit reached</span>}

        {running ? (
          <button className="execution-stop-action" type="button" onClick={onStopTrace}>
            Stop Trace
          </button>
        ) : (
          <button type="button" onClick={onTraceAgain}>Trace Again</button>
        )}
      </div>

      <div className="execution-simple-scroll">
        <section className="execution-simple-section">
          <div className="execution-simple-label">WHAT'S HAPPENING</div>
          <div className="execution-simple-message">{message}</div>

          {latest && (
            <button
              className="execution-source-link"
              type="button"
              onClick={() => onOpenEvent(latest)}
            >
              {latest.relativeFile}:{latest.line}
            </button>
          )}
        </section>

        <section className="execution-simple-section">
          <div className="execution-simple-label">SUMMARY</div>
          <div className="execution-simple-metrics">
            <span><strong>{counts.calls}</strong> function calls</span>
            <span><strong>{counts.lines}</strong> lines</span>
            <span><strong>{counts.returns}</strong> returns</span>
            <span><strong>{counts.errors}</strong> errors</span>
          </div>
        </section>

        <section className="execution-simple-section">
          <div className="execution-simple-label">IMPORTANT VARIABLES</div>

          {importantValues.length ? (
            <div className="execution-simple-values">
              {importantValues.map(([name, value]) => (
                <div className="execution-simple-value" key={name}>
                  <span>{name}</span>
                  <span>{value.type}</span>
                  <code title={value.display}>{value.display}</code>
                </div>
              ))}
            </div>
          ) : (
            <div className="execution-simple-muted">
              {latest ? "No user variables at this step." : "No user-code state yet."}
            </div>
          )}
        </section>

        <section className="execution-simple-section">
          <div className="execution-simple-label">RECENT STEPS</div>

          {recentSteps.length ? (
            <div className="execution-simple-steps">
              {recentSteps.map((event) => (
                <button
                  type="button"
                  key={event.sequence}
                  onClick={() => onOpenEvent(event)}
                >
                  <span className={`execution-kind kind-${event.kind}`}>{EVENT_LABEL[event.kind]}</span>
                  <span>{explainEvent(event)}</span>
                  <span>{event.relativeFile}:{event.line}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="execution-simple-muted">No user-code steps yet.</div>
          )}
        </section>

        {(result?.stdout || result?.stderr) && (
          <section className="execution-simple-section">
            <div className="execution-simple-label">PROGRAM OUTPUT</div>
            {result.stdout && <pre className="execution-simple-output">{result.stdout}</pre>}
            {result.stderr && (
              <pre className="execution-simple-output execution-stderr">{result.stderr}</pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function AdvancedExecutionView({
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

export default function ExecutionPanel(props: Props) {
  const [mode, setMode] = useState<ExecutionMode>("simple");

  return (
    <div className="execution-shell">
      <div className="execution-mode-tabs" role="tablist" aria-label="Execution detail level">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "simple"}
          className={mode === "simple" ? "active" : ""}
          onClick={() => setMode("simple")}
        >
          SIMPLE
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "advanced"}
          className={mode === "advanced" ? "active" : ""}
          onClick={() => setMode("advanced")}
        >
          ADVANCED
        </button>
      </div>

      <div className="execution-mode-body">
        {mode === "simple" ? (
          <SimpleExecutionView {...props} />
        ) : (
          <AdvancedExecutionView {...props} />
        )}
      </div>
    </div>
  );
}
