import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
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

function runCaptureWithTimeout(executable, args, cwd, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (error) => {
      finish({ stdout, stderr: `${stderr}${errorMessage(error)}\n`, exitCode: 1, cwd, timedOut: false });
    });

    child.on("close", (code) => {
      finish({ stdout, stderr, exitCode: code ?? 1, cwd, timedOut: false });
    });

    timer = setTimeout(() => {
      try { child.kill(); } catch { /* process may already be gone */ }
      finish({
        stdout,
        stderr: `${stderr}XENRA trace process exceeded ${timeoutMs} ms and was stopped.\n`,
        exitCode: 124,
        cwd,
        timedOut: true
      });
    }, timeoutMs);
  });
}

function pathIsInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function tracePythonFile(rootPathValue, targetPathValue) {
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

  const runner = path.join(__dirname, "runtime", "python_trace_runner.py");
  const candidates = process.platform === "win32"
    ? [
        { executable: "python", prefix: [] },
        { executable: "py", prefix: ["-3"] }
      ]
    : [
        { executable: "python3", prefix: [] },
        { executable: "python", prefix: [] }
      ];

  const failures = [];

  for (const candidate of candidates) {
    const result = await runCaptureWithTimeout(
      candidate.executable,
      [...candidate.prefix, runner, rootPath, targetPath],
      rootPath,
      30000
    );

    if (result.timedOut) {
      throw new Error(result.stderr.trim() || "Python trace timed out.");
    }

    const payload = result.stdout.trim();
    if (!payload) {
      failures.push(`${candidate.executable}: ${result.stderr.trim() || "no trace output"}`);
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      if (parsed?.error && !parsed?.events) {
        throw new Error(parsed.error);
      }
      return parsed;
    } catch (error) {
      failures.push(`${candidate.executable}: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    `Unable to start the Python runtime adapter. ${failures.filter(Boolean).join(" | ")}`
  );
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

  ipcMain.handle("runtime:trace-python", async (_event, { rootPath, targetPath }) => {
    try {
      return await tracePythonFile(rootPath, targetPath);
    } catch (error) {
      throw new Error(`Python trace failed: ${errorMessage(error)}`);
    }
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
