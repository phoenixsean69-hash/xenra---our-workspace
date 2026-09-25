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
