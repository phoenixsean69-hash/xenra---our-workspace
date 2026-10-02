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

const TOOLCHAIN_PROBES = [
  {
    id: "python",
    label: "Python",
    candidates: process.platform === "win32"
      ? [
          { executable: "python", versionArgs: ["--version"], prefixArgs: [] },
          { executable: "py", versionArgs: ["-3", "--version"], prefixArgs: ["-3"] }
        ]
      : [
          { executable: "python3", versionArgs: ["--version"], prefixArgs: [] },
          { executable: "python", versionArgs: ["--version"], prefixArgs: [] }
        ]
  },
  { id: "node", label: "Node.js", candidates: [{ executable: "node", versionArgs: ["--version"] }] },
  { id: "tsx", label: "tsx", candidates: [{ executable: "tsx", versionArgs: ["--version"] }] },
  { id: "ts-node", label: "ts-node", candidates: [{ executable: "ts-node", versionArgs: ["--version"] }] },
  { id: "tsc", label: "TypeScript Compiler", candidates: [{ executable: "tsc", versionArgs: ["--version"] }] },
  { id: "gcc", label: "GCC (C)", candidates: [{ executable: "gcc", versionArgs: ["--version"] }] },
  { id: "g++", label: "G++ (C++)", candidates: [{ executable: "g++", versionArgs: ["--version"] }] },
  { id: "clang", label: "Clang (C)", candidates: [{ executable: "clang", versionArgs: ["--version"] }] },
  { id: "clang++", label: "Clang++ (C++)", candidates: [{ executable: "clang++", versionArgs: ["--version"] }] },
  { id: "javac", label: "Java Compiler", candidates: [{ executable: "javac", versionArgs: ["-version"] }] },
  { id: "java", label: "Java Runtime", candidates: [{ executable: "java", versionArgs: ["-version"] }] },
  { id: "dotnet", label: ".NET SDK", candidates: [{ executable: "dotnet", versionArgs: ["--version"] }] },
  { id: "csc", label: "C# Compiler", candidates: [{ executable: "csc", versionArgs: ["-version"] }] },
  { id: "go", label: "Go", candidates: [{ executable: "go", versionArgs: ["version"] }] },
  { id: "rustc", label: "Rust Compiler", candidates: [{ executable: "rustc", versionArgs: ["--version"] }] },
  { id: "cargo", label: "Cargo", candidates: [{ executable: "cargo", versionArgs: ["--version"] }] },
  { id: "php", label: "PHP", candidates: [{ executable: "php", versionArgs: ["--version"] }] },
  { id: "ruby", label: "Ruby", candidates: [{ executable: "ruby", versionArgs: ["--version"] }] },
  {
    id: "powershell",
    label: "PowerShell",
    candidates: process.platform === "win32"
      ? [
          { executable: "pwsh", versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"] },
          { executable: "powershell", versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"] }
        ]
      : [
          { executable: "pwsh", versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"] }
        ]
  },
  { id: "bash", label: "Bash", candidates: [{ executable: "bash", versionArgs: ["--version"] }] },
  { id: "nasm", label: "NASM", candidates: [{ executable: "nasm", versionArgs: ["-v"] }] },
  { id: "as", label: "GNU Assembler", candidates: [{ executable: "as", versionArgs: ["--version"] }] }
];

function firstVersionLine(stdout, stderr) {
  return (`${stdout}\n${stderr}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 180) || "detected";
}

function probeExecutable(executable, args, cwd, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;

    try {
      child = spawn(executable, args, {
        cwd,
        windowsHide: true,
        env: process.env
      });
    } catch (error) {
      resolve({ available: false, stdout, stderr: errorMessage(error) });
      return;
    }

    let timer;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (error) => {
      finish({ available: false, stdout, stderr: errorMessage(error) });
    });

    child.on("close", (code) => {
      finish({ available: code === 0, stdout, stderr, exitCode: code ?? 1 });
    });

    timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish({ available: false, stdout, stderr: "probe timed out" });
    }, timeoutMs);
  });
}

async function probeToolchain(definition, cwd) {
  let lastError = "not found";

  for (const candidate of definition.candidates) {
    const probe = await probeExecutable(candidate.executable, candidate.versionArgs ?? [], cwd);

    if (probe.available) {
      return {
        id: definition.id,
        label: definition.label,
        available: true,
        command: candidate.executable,
        prefixArgs: candidate.prefixArgs ?? [],
        version: firstVersionLine(probe.stdout, probe.stderr)
      };
    }

    lastError = firstVersionLine(probe.stdout, probe.stderr);
  }

  return {
    id: definition.id,
    label: definition.label,
    available: false,
    error: lastError
  };
}

async function detectToolchains(cwdValue) {
  const cwd = path.resolve(String(cwdValue || process.cwd()));
  const tools = await Promise.all(
    TOOLCHAIN_PROBES.map((definition) => probeToolchain(definition, cwd))
  );

  return {
    platform: process.platform,
    detectedAt: new Date().toISOString(),
    tools
  };
}


const XENRA_ROOT = path.resolve(__dirname, "..");
const XENRA_TOOLS_ROOT = path.join(XENRA_ROOT, ".xenra-tools");

const LANGUAGE_SERVER_LABELS = {
  python: "Python",
  clangd: "C / C++",
  java: "Java",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  powershell: "PowerShell",
  shell: "Shell / Bash",
  assembly: "Assembly"
};

const LANGUAGE_SERVER_INSTALL_HINTS = {
  python: "Install Pyright language service.",
  clangd: "Install clangd language service.",
  java: "Install Eclipse JDT Language Server.",
  csharp: "Install csharp-ls.",
  go: "Install gopls.",
  rust: "Install rust-analyzer.",
  php: "Install Intelephense or phpactor.",
  ruby: "Install ruby-lsp.",
  powershell: "Install PowerShell Editor Services.",
  shell: "Install bash-language-server.",
  assembly: "Install asm-lsp; clangd is used as a fallback."
};

const languageServerSessions = new Map();
const languageServerCleanupSenders = new Set();

function xenraToolPath(...segments) {
  return path.join(XENRA_TOOLS_ROOT, ...segments);
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(executable, cwd) {
  if (!executable) return null;

  const looksLikePath =
    path.isAbsolute(executable) ||
    executable.includes("/") ||
    executable.includes("\\");

  if (looksLikePath) {
    return await exists(executable) ? executable : null;
  }

  const locator = process.platform === "win32" ? "where.exe" : "which";
  const located = await runCapture(locator, [executable], cwd);

  if (located.exitCode !== 0) return null;

  return located.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

async function findFileRecursive(root, predicate, depth = 5) {
  if (depth < 0 || !(await exists(root))) return null;

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && predicate(entry.name, fullPath)) {
      return fullPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFileRecursive(
      path.join(root, entry.name),
      predicate,
      depth - 1
    );
    if (found) return found;
  }

  return null;
}

function workspaceCacheKey(workspaceRoot) {
  return Buffer
    .from(path.resolve(workspaceRoot), "utf8")
    .toString("base64url")
    .slice(0, 36);
}

async function buildLanguageServerCandidates(serviceId, workspaceRoot) {
  const isWindows = process.platform === "win32";
  const localNodeBin = (name) =>
    xenraToolPath(
      "node",
      "node_modules",
      ".bin",
      isWindows ? `${name}.cmd` : name
    );

  const projectNodeBin = (name) =>
    path.join(
      XENRA_ROOT,
      "node_modules",
      ".bin",
      isWindows ? `${name}.cmd` : name
    );

  const clangdExecutableName = isWindows ? "clangd.exe" : "clangd";
  const bundledClangd = await findFileRecursive(
    xenraToolPath("clangd"),
    (name) => name === clangdExecutableName,
    6
  );

  const candidates = {
    python: [
      { name: "XENRA Pyright", executable: localNodeBin("pyright-langserver"), args: ["--stdio"] },
      { name: "Project Pyright", executable: projectNodeBin("pyright-langserver"), args: ["--stdio"] },
      { name: "BasedPyright", executable: "basedpyright-langserver", args: ["--stdio"] },
      { name: "Pyright", executable: "pyright-langserver", args: ["--stdio"] },
      { name: "Python LSP Server", executable: "pylsp", args: [] }
    ],
    clangd: [
      ...(bundledClangd
        ? [{ name: "XENRA clangd", executable: bundledClangd, args: ["--background-index", "--clang-tidy"] }]
        : []),
      { name: "clangd", executable: "clangd", args: ["--background-index", "--clang-tidy"] }
    ],
    csharp: [
      { name: "XENRA csharp-ls", executable: xenraToolPath("dotnet", isWindows ? "csharp-ls.exe" : "csharp-ls"), args: [] },
      { name: "csharp-ls", executable: "csharp-ls", args: [] }
    ],
    go: [
      { name: "XENRA gopls", executable: xenraToolPath("go", isWindows ? "gopls.exe" : "gopls"), args: [] },
      { name: "gopls", executable: "gopls", args: [] }
    ],
    rust: [
      { name: "XENRA rust-analyzer", executable: xenraToolPath("rust", isWindows ? "rust-analyzer.exe" : "rust-analyzer"), args: [] },
      { name: "rust-analyzer", executable: "rust-analyzer", args: [] }
    ],
    php: [
      { name: "XENRA Intelephense", executable: localNodeBin("intelephense"), args: ["--stdio"] },
      { name: "Project Intelephense", executable: projectNodeBin("intelephense"), args: ["--stdio"] },
      { name: "Intelephense", executable: "intelephense", args: ["--stdio"] },
      { name: "Phpactor", executable: "phpactor", args: ["language-server"] }
    ],
    ruby: [
      { name: "XENRA Ruby LSP", executable: xenraToolPath("ruby", "bin", isWindows ? "ruby-lsp.bat" : "ruby-lsp"), args: [] },
      { name: "Ruby LSP", executable: "ruby-lsp", args: [] }
    ],
    shell: [
      { name: "XENRA Bash Language Server", executable: localNodeBin("bash-language-server"), args: ["start"] },
      { name: "Project Bash Language Server", executable: projectNodeBin("bash-language-server"), args: ["start"] },
      { name: "Bash Language Server", executable: "bash-language-server", args: ["start"] }
    ],
    assembly: [
      { name: "XENRA asm-lsp", executable: xenraToolPath("asm", "bin", isWindows ? "asm-lsp.exe" : "asm-lsp"), args: [] },
      { name: "asm-lsp", executable: "asm-lsp", args: [] },
      ...(bundledClangd
        ? [{ name: "XENRA clangd fallback", executable: bundledClangd, args: ["--background-index"] }]
        : []),
      { name: "clangd fallback", executable: "clangd", args: ["--background-index"] }
    ]
  };

  if (serviceId === "java") {
    const jdtRoot = xenraToolPath("jdtls");
    const java = await resolveExecutable("java", workspaceRoot);
    const launcher = await findFileRecursive(
      path.join(jdtRoot, "plugins"),
      (name) =>
        name.startsWith("org.eclipse.equinox.launcher_") &&
        name.endsWith(".jar"),
      2
    );

    const configName =
      process.platform === "win32"
        ? "config_win"
        : process.platform === "darwin"
          ? "config_mac"
          : "config_linux";

    const configPath = path.join(jdtRoot, configName);

    if (java && launcher && await exists(configPath)) {
      const dataPath = path.join(
        app.getPath("userData"),
        "lsp",
        "jdtls",
        workspaceCacheKey(workspaceRoot)
      );
      await fs.mkdir(dataPath, { recursive: true });

      return [
        {
          name: "XENRA Eclipse JDT LS",
          executable: java,
          args: [
            "-Declipse.application=org.eclipse.jdt.ls.core.id1",
            "-Dosgi.bundles.defaultStartLevel=4",
            "-Declipse.product=org.eclipse.jdt.ls.core.product",
            "-Dlog.level=ERROR",
            "-Xmx1G",
            "--add-modules=ALL-SYSTEM",
            "--add-opens",
            "java.base/java.util=ALL-UNNAMED",
            "--add-opens",
            "java.base/java.lang=ALL-UNNAMED",
            "-jar",
            launcher,
            "-configuration",
            configPath,
            "-data",
            dataPath
          ]
        },
        { name: "jdtls", executable: "jdtls", args: ["-data", dataPath] }
      ];
    }

    return [
      { name: "jdtls", executable: "jdtls", args: [] }
    ];
  }

  if (serviceId === "powershell") {
    const psesRoot = xenraToolPath("powershell-editor-services");
    const startScript = await findFileRecursive(
      psesRoot,
      (name) => name === "Start-EditorServices.ps1",
      6
    );

    if (!startScript) return [];

    const shells = process.platform === "win32"
      ? ["pwsh", "powershell"]
      : ["pwsh"];

    return shells.map((shellName) => ({
      name: `PowerShell Editor Services (${shellName})`,
      executable: shellName,
      args: [
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        startScript,
        "-Stdio",
        "-LogLevel",
        "Error"
      ],
      env: {
        NO_COLOR: "1",
        TERM: "dumb"
      }
    }));
  }

  return candidates[serviceId] ?? [];
}

async function resolveLanguageServer(serviceId, workspaceRoot) {
  const candidates = await buildLanguageServerCandidates(serviceId, workspaceRoot);

  for (const candidate of candidates) {
    const executable = await resolveExecutable(candidate.executable, workspaceRoot);
    if (!executable) continue;

    return {
      ...candidate,
      executable
    };
  }

  return null;
}

function sendLanguageServerEvent(session, event) {
  if (!session?.sender || session.sender.isDestroyed()) return;

  session.sender.send("lsp:server-event", {
    sessionId: session.id,
    ...event
  });
}

function parseLanguageServerOutput(session, chunk) {
  if (session.finished) return;

  const incoming = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk);

  session.stdoutBuffer = Buffer.concat([
    session.stdoutBuffer,
    incoming
  ]);

  while (session.stdoutBuffer.length) {
    const headerStart = session.stdoutBuffer.indexOf("Content-Length:");

    if (headerStart < 0) {
      if (session.stdoutBuffer.length > 65536) {
        session.stdoutBuffer = Buffer.alloc(0);
      }
      return;
    }

    if (headerStart > 0) {
      session.stdoutBuffer = session.stdoutBuffer.subarray(headerStart);
    }

    const headerEnd = session.stdoutBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const header = session.stdoutBuffer
      .subarray(0, headerEnd)
      .toString("ascii");

    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      session.stdoutBuffer = session.stdoutBuffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 32 * 1024 * 1024) {
      session.stdoutBuffer = session.stdoutBuffer.subarray(headerEnd + 4);
      continue;
    }

    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (session.stdoutBuffer.length < bodyEnd) return;

    const body = session.stdoutBuffer
      .subarray(bodyStart, bodyEnd)
      .toString("utf8");

    session.stdoutBuffer = session.stdoutBuffer.subarray(bodyEnd);

    try {
      const message = JSON.parse(body);
      sendLanguageServerEvent(session, {
        type: "message",
        message
      });
    } catch (error) {
      sendLanguageServerEvent(session, {
        type: "error",
        message: `Invalid LSP JSON from ${session.serverName}: ${errorMessage(error)}`
      });
    }
  }
}

function writeLanguageServerMessage(session, message) {
  if (!session || session.finished) return false;

  const stdin = session.child?.stdin;
  if (!stdin || stdin.destroyed || !stdin.writable) return false;

  let json;
  try {
    json = JSON.stringify(message);
  } catch {
    return false;
  }

  const body = Buffer.from(json, "utf8");
  const header = Buffer.from(
    `Content-Length: ${body.length}\r\n\r\n`,
    "ascii"
  );

  stdin.write(header);
  stdin.write(body);
  return true;
}

function stopLanguageServerSession(session) {
  if (!session || session.finished) return false;

  session.stopRequested = true;
  const child = session.child;

  if (!child || child.killed) {
    session.finished = true;
    languageServerSessions.delete(session.id);
    return true;
  }

  if (process.platform === "win32" && child.pid) {
    const killer = spawn(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true }
    );

    killer.on("error", () => {
      try { child.kill(); } catch { /* already stopped */ }
    });
  } else {
    try { child.kill("SIGTERM"); } catch { /* already stopped */ }
  }

  setTimeout(() => {
    if (!session.finished && session.child === child) {
      try { child.kill("SIGKILL"); } catch { /* already stopped */ }
    }
  }, 1200);

  return true;
}

function stopLanguageServersForSender(senderId) {
  for (const session of languageServerSessions.values()) {
    if (session.senderId === senderId) {
      stopLanguageServerSession(session);
    }
  }
}

async function startLanguageServerSession(sender, serviceIdValue, workspaceRootValue) {
  const serviceId = String(serviceIdValue ?? "");
  const workspaceRoot = path.resolve(String(workspaceRootValue ?? ""));

  if (!LANGUAGE_SERVER_LABELS[serviceId]) {
    throw new Error(`Unsupported language service: ${serviceId}`);
  }

  const workspaceStat = await fs.stat(workspaceRoot);
  if (!workspaceStat.isDirectory()) {
    throw new Error("Language server workspace root is not a directory.");
  }

  for (const session of languageServerSessions.values()) {
    if (
      session.senderId === sender.id &&
      session.serviceId === serviceId &&
      session.workspaceRoot === workspaceRoot &&
      !session.finished
    ) {
      return {
        available: true,
        serviceId,
        languageLabel: LANGUAGE_SERVER_LABELS[serviceId],
        sessionId: session.id,
        serverName: session.serverName,
        executable: session.executable
      };
    }
  }

  const resolved = await resolveLanguageServer(serviceId, workspaceRoot);

  if (!resolved) {
    return {
      available: false,
      serviceId,
      languageLabel: LANGUAGE_SERVER_LABELS[serviceId],
      installHint: LANGUAGE_SERVER_INSTALL_HINTS[serviceId],
      error: "Language server not detected."
    };
  }

  const child = spawn(
    resolved.executable,
    resolved.args ?? [],
    {
      cwd: workspaceRoot,
      windowsHide: true,
      shell:
        process.platform === "win32" &&
        /\.(cmd|bat)$/i.test(resolved.executable),
      env: {
        ...process.env,
        ...(resolved.env ?? {})
      },
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  const session = {
    id: randomUUID(),
    serviceId,
    languageLabel: LANGUAGE_SERVER_LABELS[serviceId],
    workspaceRoot,
    sender,
    senderId: sender.id,
    serverName: resolved.name,
    executable: resolved.executable,
    child,
    stdoutBuffer: Buffer.alloc(0),
    stopRequested: false,
    finished: false
  };

  languageServerSessions.set(session.id, session);

  child.stdout?.on("data", (chunk) => {
    parseLanguageServerOutput(session, chunk);
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    if (session.finished) return;
    sendLanguageServerEvent(session, {
      type: "stderr",
      chunk: String(chunk)
    });
  });

  child.on("error", (error) => {
    if (session.finished) return;
    sendLanguageServerEvent(session, {
      type: "error",
      message: errorMessage(error)
    });
  });

  child.on("close", (code, signal) => {
    if (session.finished) return;

    session.finished = true;
    languageServerSessions.delete(session.id);

    sendLanguageServerEvent(session, {
      type: "exit",
      exitCode: code ?? (session.stopRequested ? 0 : 1),
      stopped:
        session.stopRequested ||
        signal === "SIGTERM" ||
        signal === "SIGKILL"
    });
  });

  if (!languageServerCleanupSenders.has(sender.id)) {
    languageServerCleanupSenders.add(sender.id);
    sender.once("destroyed", () => {
      languageServerCleanupSenders.delete(sender.id);
      stopLanguageServersForSender(sender.id);
    });
  }

  return {
    available: true,
    serviceId,
    languageLabel: LANGUAGE_SERVER_LABELS[serviceId],
    sessionId: session.id,
    serverName: session.serverName,
    executable: session.executable
  };
}


const runSessions = new Map();
const runCleanupSenders = new Set();

function sendRunSessionMessage(session, message) {
  if (!session?.sender || session.sender.isDestroyed()) return;

  session.sender.send("process:run-session-message", {
    sessionId: session.id,
    ...message
  });
}

function finalizeRunSession(session, {
  exitCode = 1,
  stopped = false,
  error = undefined
} = {}) {
  if (!session || session.finished) return;

  session.finished = true;
  runSessions.delete(session.id);

  if (error) {
    sendRunSessionMessage(session, {
      type: "error",
      message: error
    });
  }

  sendRunSessionMessage(session, {
    type: "complete",
    durationMs: Date.now() - session.startedEpochMs,
    exitCode,
    stopped
  });
}

function beginRunProcess(session) {
  if (!session || session.finished || session.launchRequested) return false;

  session.launchRequested = true;
  const isWindows = process.platform === "win32";

  const executable = isWindows ? "powershell.exe" : "/bin/sh";
  const args = isWindows
    ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", session.command]
    : ["-lc", session.command];

  const child = spawn(executable, args, {
    cwd: session.cwd,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8"
    }
  });

  session.child = child;

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk) => {
    if (session.finished || session.child !== child) return;
    sendRunSessionMessage(session, {
      type: "stdout",
      chunk
    });
  });

  child.stderr?.on("data", (chunk) => {
    if (session.finished || session.child !== child) return;
    sendRunSessionMessage(session, {
      type: "stderr",
      chunk
    });
  });

  child.on("error", (error) => {
    if (session.finished || session.child !== child) return;

    finalizeRunSession(session, {
      exitCode: 1,
      error: errorMessage(error)
    });
  });

  child.on("close", (code, signal) => {
    if (session.finished || session.child !== child) return;

    const stopped =
      session.stopRequested ||
      signal === "SIGTERM" ||
      signal === "SIGKILL";

    finalizeRunSession(session, {
      exitCode: code ?? (stopped ? 130 : 1),
      stopped
    });
  });

  return true;
}

async function prepareRunSession(sender, cwdValue, commandValue) {
  const cwd = path.resolve(String(cwdValue ?? ""));
  const command = String(commandValue ?? "").trim();

  if (!command) {
    throw new Error("Run command is empty.");
  }

  if (command.length > 32768) {
    throw new Error("Run command is too long.");
  }

  const cwdStat = await fs.stat(cwd);
  if (!cwdStat.isDirectory()) {
    throw new Error("Run working directory is not a directory.");
  }

  stopRunSessionsForSender(sender.id);

  const session = {
    id: randomUUID(),
    sender,
    senderId: sender.id,
    cwd,
    command,
    startedAt: new Date().toISOString(),
    startedEpochMs: Date.now(),
    child: null,
    launchRequested: false,
    stopRequested: false,
    finished: false
  };

  runSessions.set(session.id, session);

  return {
    sessionId: session.id,
    cwd,
    command,
    startedAt: session.startedAt
  };
}

function writeRunSession(session, inputValue) {
  if (!session || session.finished) return false;

  const input = String(inputValue ?? "");
  if (Buffer.byteLength(input, "utf8") > 65536) {
    throw new Error("Run input exceeds the 64 KB limit.");
  }

  const stdin = session.child?.stdin;
  if (!stdin || stdin.destroyed || !stdin.writable) {
    return false;
  }

  stdin.write(input);
  return true;
}

function stopRunSession(session) {
  if (!session || session.finished) return false;

  session.stopRequested = true;
  const child = session.child;

  if (!child || child.killed) {
    finalizeRunSession(session, {
      exitCode: 130,
      stopped: true
    });
    return true;
  }

  if (process.platform === "win32" && child.pid) {
    const killer = spawn(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        windowsHide: true
      }
    );

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

function stopRunSessionsForSender(senderId) {
  for (const session of runSessions.values()) {
    if (session.senderId === senderId) {
      stopRunSession(session);
    }
  }
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

  ipcMain.handle("workspace:choose-directory", async (_event, { defaultPath } = {}) => {
    const result = await dialog.showOpenDialog({
      title: "Pick target directory",
      defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined,
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

  ipcMain.handle("process:prepare-run-session", async (event, { cwd, command }) => {
    try {
      const sender = event.sender;
      const senderId = sender.id;

      if (!runCleanupSenders.has(senderId)) {
        runCleanupSenders.add(senderId);

        sender.once("destroyed", () => {
          runCleanupSenders.delete(senderId);
          stopRunSessionsForSender(senderId);
        });
      }

      return await prepareRunSession(sender, cwd, command);
    } catch (error) {
      throw new Error(`Run session failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("process:begin-run-session", async (_event, { sessionId }) => {
    const session = runSessions.get(String(sessionId ?? ""));
    return beginRunProcess(session);
  });

  ipcMain.handle("process:write-run-session", async (_event, { sessionId, input }) => {
    const session = runSessions.get(String(sessionId ?? ""));

    try {
      return writeRunSession(session, input);
    } catch (error) {
      throw new Error(`Run input failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("process:stop-run-session", async (_event, { sessionId }) => {
    const session = runSessions.get(String(sessionId ?? ""));
    return stopRunSession(session);
  });

  ipcMain.handle("language:detect-toolchains", async (_event, { cwd }) => {
    try {
      return await detectToolchains(cwd);
    } catch (error) {
      throw new Error(`Toolchain detection failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("lsp:start", async (event, { serviceId, workspaceRoot }) => {
    try {
      return await startLanguageServerSession(
        event.sender,
        serviceId,
        workspaceRoot
      );
    } catch (error) {
      throw new Error(`Language server start failed: ${errorMessage(error)}`);
    }
  });

  ipcMain.handle("lsp:send", async (_event, { sessionId, message }) => {
    const session = languageServerSessions.get(String(sessionId ?? ""));
    return writeLanguageServerMessage(session, message);
  });

  ipcMain.handle("lsp:stop", async (_event, { sessionId }) => {
    const session = languageServerSessions.get(String(sessionId ?? ""));
    return stopLanguageServerSession(session);
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
