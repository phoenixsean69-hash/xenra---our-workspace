import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = "http://127.0.0.1:1420";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function runCapture(executable, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr: `${stderr}${errorMessage(error)}\n`, exitCode: 1, cwd });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, exitCode: code ?? 1, cwd });
    });
  });
}

const pythonTraceSessions = new Map();
const traceCleanupSenders = new Set();
const TRACE_EVENT_LIMIT = 5000;

function sendTraceMessage(session, message) {
  if (!session?.sender || session.sender.isDestroyed()) return;
  session.sender.send("runtime:python-trace-message", {
    sessionId: session.id,
    ...message
  });
}

function consumeTraceProtocolLine(session, line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const message = JSON.parse(trimmed);

    if (message.type === "limit") {
      session.truncated = true;
    }

    if (message.type === "complete") {
      session.runnerCompleted = true;
      session.finished = true;
      sendTraceMessage(session, message);
      pythonTraceSessions.delete(session.id);
      return;
    }

    sendTraceMessage(session, message);
  } catch {
    sendTraceMessage(session, {
      type: "stderr",
      chunk: `[XENRA trace protocol] ${line}\n`
    });
  }
}

function finalizeTraceSession(session, {
  exitCode = 1,
  stopped = false,
  error = undefined
} = {}) {
  if (!session || session.finished) return;

  session.finished = true;
  pythonTraceSessions.delete(session.id);

  if (error) {
    sendTraceMessage(session, { type: "error", message: error });
  }

  sendTraceMessage(session, {
    type: "complete",
    durationMs: Date.now() - session.startedEpochMs,
    exitCode,
    stopped,
    truncated: Boolean(session.truncated),
    eventLimit: TRACE_EVENT_LIMIT,
    error
  });
}

function startTraceCandidate(session, candidateIndex) {
  if (!session || session.finished) return;

  if (session.stopRequested) {
    finalizeTraceSession(session, { exitCode: 130, stopped: true });
    return;
  }

  const candidate = session.candidates[candidateIndex];
  if (!candidate) {
    finalizeTraceSession(session, {
      exitCode: 1,
      error: "No usable Python 3 interpreter was found on PATH."
    });
    return;
  }

  const runner = path.join(__dirname, "runtime", "python_trace_runner.py");
  const child = spawn(
    candidate.executable,
    [...candidate.prefix, runner, session.rootPath, session.targetPath],
    {
      cwd: session.rootPath,
      windowsHide: true,
      env: {
        ...process.env,
        XENRA_TRACE_MAX_EVENTS: String(TRACE_EVENT_LIMIT)
      }
    }
  );

  session.child = child;
  session.spawned = false;

  let stdoutBuffer = "";

  child.once("spawn", () => {
    if (session.child !== child || session.finished) return;
    session.spawned = true;
  });

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk) => {
    if (session.child !== child || session.finished) return;

    stdoutBuffer += chunk;
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;

      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      consumeTraceProtocolLine(session, line);
    }
  });

  child.stderr?.on("data", (chunk) => {
    if (session.child !== child || session.finished) return;
    sendTraceMessage(session, { type: "stderr", chunk });
  });

  child.on("error", (error) => {
    if (session.child !== child || session.finished) return;

    if (!session.spawned && error?.code === "ENOENT") {
      session.child = null;
      startTraceCandidate(session, candidateIndex + 1);
      return;
    }

    finalizeTraceSession(session, {
      exitCode: 1,
      error: errorMessage(error)
    });
  });

  child.on("close", (code, signal) => {
    if (session.child !== child || session.finished) return;

    if (stdoutBuffer.trim()) {
      consumeTraceProtocolLine(session, stdoutBuffer);
      stdoutBuffer = "";
    }

    if (session.runnerCompleted) return;

    const stopped = session.stopRequested || signal === "SIGTERM" || signal === "SIGKILL";
    finalizeTraceSession(session, {
      exitCode: code ?? (stopped ? 130 : 1),
      stopped,
      error: stopped ? undefined : (code === 0 ? undefined : `Python trace process exited with code ${code ?? 1}.`)
    });
  });
}

function beginTraceSession(session) {
  if (!session || session.finished || session.launchRequested) return false;
  session.launchRequested = true;
  startTraceCandidate(session, 0);
  return true;
}

function stopTraceSession(session) {
  if (!session || session.finished) return false;

  session.stopRequested = true;
  const child = session.child;

  if (!child || child.killed) {
    finalizeTraceSession(session, { exitCode: 130, stopped: true });
    return true;
  }

  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true
    });

    killer.on("error", () => {
      try { child.kill(); } catch { /* already stopped */ }
    });

    killer.on("close", (code) => {
      if (code !== 0 && !session.finished) {
        try { child.kill(); } catch { /* already stopped */ }
      }
    });
  } else {
    try { child.kill("SIGTERM"); } catch { /* already stopped */ }
  }

  setTimeout(() => {
    if (!session.finished && session.child === child) {
      try { child.kill("SIGKILL"); } catch { /* already stopped */ }
    }
  }, 1500);

  return true;
}

function stopTraceSessionsForSender(senderId) {
  for (const session of pythonTraceSessions.values()) {
    if (session.senderId === senderId) {
      stopTraceSession(session);
    }
  }
}

async function preparePythonTraceSession(sender, rootPathValue, targetPathValue) {
  const rootPath = path.resolve(String(rootPathValue ?? ""));
  const targetPath = path.resolve(String(targetPathValue ?? ""));

  const rootStat = await fs.stat(rootPath);
  if (!rootStat.isDirectory()) throw new Error("Project root is not a directory.");

  const targetStat = await fs.stat(targetPath);
  if (!targetStat.isFile()) throw new Error("Trace target is not a file.");
  if (path.extname(targetPath).toLowerCase() !== ".py") {
    throw new Error("The Python runtime adapter only accepts .py files.");
  }
  if (!pathIsInside(rootPath, targetPath)) {
    throw new Error("Trace target must be inside the active project.");
  }

  stopTraceSessionsForSender(sender.id);

  const session = {
    id: randomUUID(),
    sender,
    senderId: sender.id,
    rootPath,
    targetPath,
    startedAt: new Date().toISOString(),
    startedEpochMs: Date.now(),
    child: null,
    spawned: false,
    runnerCompleted: false,
    launchRequested: false,
    stopRequested: false,
    finished: false,
    truncated: false,
    candidates: process.platform === "win32"
      ? [
          { executable: "python", prefix: ["-u"] },
          { executable: "py", prefix: ["-3", "-u"] }
        ]
      : [
          { executable: "python3", prefix: ["-u"] },
          { executable: "python", prefix: ["-u"] }
        ]
  };

  pythonTraceSessions.set(session.id, session);

  return {
    sessionId: session.id,
    engine: "python",
    targetPath,
    startedAt: session.startedAt,
    eventLimit: TRACE_EVENT_LIMIT
  };
}

function pathIsInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const SEARCH_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".vite",
  ".xenra-backups"
]);

const SEARCH_BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
  ".pdf", ".zip", ".7z", ".rar", ".gz", ".tar",
  ".exe", ".dll", ".so", ".dylib", ".class", ".jar",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".mp4", ".mov"
]);

async function searchProjectFiles(rootPath, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return [];

  const results = [];
  let visitedFiles = 0;

  async function walk(directory, depth) {
    if (results.length >= 250 || visitedFiles >= 4000 || depth > 24) return;

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= 250 || visitedFiles >= 4000) break;
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!SEARCH_SKIP_DIRS.has(entry.name)) {
          await walk(fullPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      visitedFiles += 1;

      const extension = path.extname(entry.name).toLowerCase();
      if (SEARCH_BINARY_EXTENSIONS.has(extension)) continue;

      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stat.size > 2 * 1024 * 1024) continue;

      let content;
      try {
        content = await fs.readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      if (content.includes("\u0000")) continue;

      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const lower = lines[index].toLowerCase();
        let from = 0;

        while (results.length < 250) {
          const match = lower.indexOf(needle, from);
          if (match < 0) break;

          results.push({
            path: fullPath,
            relativePath: path.relative(rootPath, fullPath),
            line: index + 1,
            column: match + 1,
            preview: lines[index].trim().slice(0, 220)
          });

          from = match + Math.max(needle.length, 1);
        }
      }
    }
  }

  await walk(rootPath, 0);
  return results;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#111214",
    show: false,
    autoHideMenuBar: true,
    title: "XENRA",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#18191d",
      symbolColor: "#c4cbda",
      height: 48
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed = app.isPackaged ? url.startsWith("file:") : url.startsWith(DEV_URL);
    if (!allowed) event.preventDefault();
  });

  const useBuiltRenderer = app.isPackaged || process.argv.includes("--production");
  if (useBuiltRenderer) {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    void win.loadURL(DEV_URL);
  }
}

function registerIpc() {
  ipcMain.handle("workspace:choose-project-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open project folder",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("fs:list-directory", async (_event, targetPath) => {
    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
        .map((entry) => ({
          name: entry.name,
          path: path.join(targetPath, entry.name),
          isDir: entry.isDirectory()
        }))
        .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    } catch (error) {
      throw new Error(`Cannot list ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:read-text-file", async (_event, targetPath) => {
    try {
      return await fs.readFile(targetPath, "utf8");
    } catch (error) {
      throw new Error(`Cannot read ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:write-text-file", async (_event, { path: targetPath, content }) => {
    try {
      await fs.writeFile(targetPath, content, "utf8");
    } catch (error) {
      throw new Error(`Cannot save ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:create-file", async (_event, targetPath) => {
    try {
      await fs.writeFile(targetPath, "", { encoding: "utf8", flag: "wx" });
    } catch (error) {
      throw new Error(`Cannot create ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:create-directory", async (_event, targetPath) => {
    try {
      await fs.mkdir(targetPath, { recursive: false });
    } catch (error) {
      throw new Error(`Cannot create ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:rename-path", async (_event, { path: oldPath, newPath }) => {
    try {
      await fs.rename(oldPath, newPath);
    } catch (error) {
      throw new Error(`Cannot rename ${oldPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("fs:delete-path", async (_event, targetPath) => {
    try {
      await fs.rm(targetPath, { recursive: true, force: false });
    } catch (error) {
      throw new Error(`Cannot delete ${targetPath}: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("workspace:search-project", async (_event, { rootPath, query }) => {
    const resolvedRoot = path.resolve(String(rootPath ?? ""));
    if (!resolvedRoot) return [];

    try {
      const stat = await fs.stat(resolvedRoot);
      if (!stat.isDirectory()) throw new Error("Project root is not a directory");
      return await searchProjectFiles(resolvedRoot, query);
    } catch (error) {
      throw new Error(`Search failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("runtime:prepare-python-trace", async (event, { rootPath, targetPath }) => {
    try {
      const sender = event.sender;
      const senderId = sender.id;

      if (!traceCleanupSenders.has(senderId)) {
        traceCleanupSenders.add(senderId);
        sender.once("destroyed", () => {
          traceCleanupSenders.delete(senderId);
          stopTraceSessionsForSender(senderId);
        });
      }

      return await preparePythonTraceSession(sender, rootPath, targetPath);
    } catch (error) {
      throw new Error(`Python trace failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("runtime:begin-python-trace", async (_event, { sessionId }) => {
    const session = pythonTraceSessions.get(String(sessionId ?? ""));
    return beginTraceSession(session);
  });

  ipcMain.handle("runtime:stop-python-trace", async (_event, { sessionId }) => {
    const session = pythonTraceSessions.get(String(sessionId ?? ""));
    return stopTraceSession(session);
  });

  ipcMain.handle("git:run", async (_event, { cwd, args }) => {
    const safeArgs = Array.isArray(args) ? args.map((value) => String(value)) : [];
    if (safeArgs.length > 32) {
      return { stdout: "", stderr: "Too many Git arguments.\n", exitCode: 1, cwd };
    }
    return await runCapture("git", safeArgs, cwd);
  });

  ipcMain.handle("app:close-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle("process:execute-command", async (_event, { cwd, command }) => {
    const trimmed = String(command ?? "").trim();
    if (!trimmed) return { stdout: "", stderr: "", exitCode: 0, cwd };

    const cdMatch = trimmed.match(/^(?:cd|Set-Location)(?:\s+\/d)?\s+(.+)$/i);
    if (cdMatch) {
      const rawTarget = cdMatch[1].trim().replace(/^(["'])(.*)\1$/, "$2");
      const nextCwd = path.isAbsolute(rawTarget) ? path.normalize(rawTarget) : path.resolve(cwd, rawTarget);
      try {
        const stat = await fs.stat(nextCwd);
        if (!stat.isDirectory()) throw new Error("Target is not a directory");
        return { stdout: "", stderr: "", exitCode: 0, cwd: nextCwd };
      } catch (error) {
        return { stdout: "", stderr: `${errorMessage(error)}\n`, exitCode: 1, cwd };
      }
    }

    return await new Promise((resolve) => {
      const isWindows = process.platform === "win32";
      const child = isWindows
        ? spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", trimmed], {
            cwd,
            windowsHide: true,
            env: process.env
          })
        : spawn("/bin/sh", ["-lc", trimmed], { cwd, env: process.env });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => {
        resolve({ stdout, stderr: `${stderr}${errorMessage(error)}\n`, exitCode: 1, cwd });
      });
      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1, cwd });
      });
    });
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
