import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { executeCommand } from "../services/backend";

type Props = {
  cwd: string;
  onCwdChange: (cwd: string) => void;
  visible: boolean;
};

export default function TerminalPanel({ cwd, onCwdChange, visible }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cwdRef = useRef(cwd);
  const inputRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const busyRef = useRef(false);

  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      theme: {
        background: "#111214",
        foreground: "#C4CBDA",
        cursor: "#F2B705",
        cursorAccent: "#111214",
        selectionBackground: "#66511F88",
        black: "#111214",
        brightBlack: "#717888",
        yellow: "#F2B705",
        brightYellow: "#FFD447",
        cyan: "#7FDBCA",
        brightCyan: "#9CE3D8",
        red: "#E66A6A",
        brightRed: "#FF8B8B"
      },
      convertEol: true,
      scrollback: 4000
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    fitRef.current = fit;
    fit.fit();

    terminal.writeln("\x1b[33mXENRA Terminal\x1b[0m");
    terminal.writeln("Commands run inside the current project. Type 'clear' to reset.\r\n");

    const prompt = () => {
      terminal.write(`\x1b[90m${cwdRef.current}\x1b[0m\r\n\x1b[33m>\x1b[0m `);
    };

    prompt();

    const renderInput = (next: string) => {
      while (inputRef.current.length > 0) {
        terminal.write("\b \b");
        inputRef.current = inputRef.current.slice(0, -1);
      }
      inputRef.current = next;
      terminal.write(next);
    };

    const keyDisposable = terminal.onKey(async ({ key, domEvent }) => {
      if (busyRef.current) return;

      if (domEvent.key === "Enter") {
        const command = inputRef.current.trim();
        terminal.write("\r\n");
        inputRef.current = "";
        historyIndexRef.current = -1;

        if (!command) {
          prompt();
          return;
        }

        historyRef.current.push(command);

        if (command === "clear" || command === "cls") {
          terminal.clear();
          prompt();
          return;
        }

        busyRef.current = true;
        try {
          const result = await executeCommand(cwdRef.current, command);
          if (result.stdout) terminal.write(result.stdout.replace(/\n/g, "\r\n"));
          if (result.stderr) terminal.write(`\x1b[31m${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
          if (result.cwd && result.cwd !== cwdRef.current) {
            cwdRef.current = result.cwd;
            onCwdChange(result.cwd);
          }
          if (result.exitCode !== 0) {
            terminal.writeln(`\x1b[31mProcess exited with code ${result.exitCode}\x1b[0m`);
          }
        } catch (error) {
          terminal.writeln(`\x1b[31m${String(error)}\x1b[0m`);
        } finally {
          busyRef.current = false;
          prompt();
        }
        return;
      }

      if (domEvent.key === "Backspace") {
        if (inputRef.current.length) {
          inputRef.current = inputRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
        return;
      }

      if (domEvent.key === "ArrowUp") {
        if (!historyRef.current.length) return;
        historyIndexRef.current = historyIndexRef.current < 0
          ? historyRef.current.length - 1
          : Math.max(0, historyIndexRef.current - 1);
        renderInput(historyRef.current[historyIndexRef.current]);
        return;
      }

      if (domEvent.key === "ArrowDown") {
        if (historyIndexRef.current < 0) return;
        historyIndexRef.current += 1;
        const next = historyIndexRef.current >= historyRef.current.length
          ? ""
          : historyRef.current[historyIndexRef.current];
        if (!next) historyIndexRef.current = -1;
        renderInput(next);
        return;
      }

      if (!domEvent.ctrlKey && !domEvent.metaKey && !domEvent.altKey && key.length === 1) {
        inputRef.current += key;
        terminal.write(key);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* host may be hidden during layout */ }
    });
    resizeObserver.observe(hostRef.current);

    return () => {
      resizeObserver.disconnect();
      keyDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [onCwdChange]);

  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      try { fitRef.current?.fit(); } catch { /* panel may still be sizing */ }
      terminalRef.current?.focus();
    });
  }, [visible]);

  return <div ref={hostRef} className="terminal-host" />;
}
