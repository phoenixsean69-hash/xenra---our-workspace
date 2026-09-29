import { useEffect, useRef, useState } from "react";

type Props = {
  output: string;
  running: boolean;
  onStop: () => void;
  onSendInput: (value: string) => void | Promise<void>;
};

export default function RunOutputPanel({
  output,
  running,
  onStop,
  onSendInput
}: Props) {
  const [input, setInput] = useState("");
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const element = outputRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [output]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!running) return;

    const value = input;
    setInput("");

    try {
      await onSendInput(value);
    } catch {
      // App-level status/output reports process input failures.
    }
  };

  return (
    <div className="run-output-panel">
      <div className="run-output-toolbar">
        <span className={running ? "run-state running" : "run-state"}>
          {running ? "RUNNING" : "OUTPUT"}
        </span>

        {running && (
          <button type="button" className="run-stop-button" onClick={onStop}>
            Stop
          </button>
        )}
      </div>

      <pre ref={outputRef} className="output-view run-output-view">
        {output || "Build and run output will appear here."}
      </pre>

      {running && (
        <form className="run-input-row" onSubmit={(event) => void submit(event)}>
          <span>stdin</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Program input — Enter to send"
            autoComplete="off"
            spellCheck={false}
            aria-label="Program input"
          />
          <button type="submit">Send</button>
        </form>
      )}
    </div>
  );
}
