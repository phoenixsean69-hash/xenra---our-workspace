const { contextBridge, ipcRenderer } = require("electron");

const xenraApi = {
  chooseProjectFolder: () => ipcRenderer.invoke("workspace:choose-project-folder"),
  chooseDirectory: (defaultPath) =>
    ipcRenderer.invoke("workspace:choose-directory", { defaultPath }),
  listDirectory: (path) => ipcRenderer.invoke("fs:list-directory", path),
  readTextFile: (path) => ipcRenderer.invoke("fs:read-text-file", path),
  writeTextFile: (path, content) => ipcRenderer.invoke("fs:write-text-file", { path, content }),
  createFile: (path) => ipcRenderer.invoke("fs:create-file", path),
  createDirectory: (path) => ipcRenderer.invoke("fs:create-directory", path),
  renamePath: (path, newPath) => ipcRenderer.invoke("fs:rename-path", { path, newPath }),
  deletePath: (path) => ipcRenderer.invoke("fs:delete-path", path),
  executeCommand: (cwd, command) => ipcRenderer.invoke("process:execute-command", { cwd, command }),
  prepareRunSession: (cwd, command) =>
    ipcRenderer.invoke("process:prepare-run-session", { cwd, command }),
  beginRunSession: (sessionId) =>
    ipcRenderer.invoke("process:begin-run-session", { sessionId }),
  writeRunSession: (sessionId, input) =>
    ipcRenderer.invoke("process:write-run-session", { sessionId, input }),
  stopRunSession: (sessionId) =>
    ipcRenderer.invoke("process:stop-run-session", { sessionId }),
  onRunSessionMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("process:run-session-message", listener);
    return () => ipcRenderer.removeListener("process:run-session-message", listener);
  },
  searchProject: (rootPath, query) => ipcRenderer.invoke("workspace:search-project", { rootPath, query }),
  gitCommand: (cwd, args) => ipcRenderer.invoke("git:run", { cwd, args }),
  detectToolchains: (cwd) => ipcRenderer.invoke("language:detect-toolchains", { cwd }),
  preparePythonTrace: (rootPath, targetPath) =>
    ipcRenderer.invoke("runtime:prepare-python-trace", { rootPath, targetPath }),
  beginPythonTrace: (sessionId) =>
    ipcRenderer.invoke("runtime:begin-python-trace", { sessionId }),
  stopPythonTrace: (sessionId) =>
    ipcRenderer.invoke("runtime:stop-python-trace", { sessionId }),
  onPythonTraceMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("runtime:python-trace-message", listener);
    return () => ipcRenderer.removeListener("runtime:python-trace-message", listener);
  },
  startLanguageServer: (serviceId, workspaceRoot) =>
    ipcRenderer.invoke("lsp:start", { serviceId, workspaceRoot }),
  sendLanguageServerMessage: (sessionId, message) =>
    ipcRenderer.invoke("lsp:send", { sessionId, message }),
  stopLanguageServer: (sessionId) =>
    ipcRenderer.invoke("lsp:stop", { sessionId }),
  onLanguageServerMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("lsp:server-event", listener);
    return () => ipcRenderer.removeListener("lsp:server-event", listener);
  },
  closeWindow: () => ipcRenderer.invoke("app:close-window")
};

contextBridge.exposeInMainWorld("xenra", xenraApi);

// Temporary compatibility alias for the earlier bridge name.
contextBridge.exposeInMainWorld("university", xenraApi);
