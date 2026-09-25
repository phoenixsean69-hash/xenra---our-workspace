const { contextBridge, ipcRenderer } = require("electron");

const xenraApi = {
  chooseProjectFolder: () => ipcRenderer.invoke("workspace:choose-project-folder"),
  listDirectory: (path) => ipcRenderer.invoke("fs:list-directory", path),
  readTextFile: (path) => ipcRenderer.invoke("fs:read-text-file", path),
  writeTextFile: (path, content) => ipcRenderer.invoke("fs:write-text-file", { path, content }),
  createFile: (path) => ipcRenderer.invoke("fs:create-file", path),
  createDirectory: (path) => ipcRenderer.invoke("fs:create-directory", path),
  renamePath: (path, newPath) => ipcRenderer.invoke("fs:rename-path", { path, newPath }),
  deletePath: (path) => ipcRenderer.invoke("fs:delete-path", path),
  executeCommand: (cwd, command) => ipcRenderer.invoke("process:execute-command", { cwd, command }),
  searchProject: (rootPath, query) => ipcRenderer.invoke("workspace:search-project", { rootPath, query }),
  gitCommand: (cwd, args) => ipcRenderer.invoke("git:run", { cwd, args }),
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
  closeWindow: () => ipcRenderer.invoke("app:close-window")
};

contextBridge.exposeInMainWorld("xenra", xenraApi);

// Temporary compatibility alias for the earlier bridge name.
contextBridge.exposeInMainWorld("university", xenraApi);
