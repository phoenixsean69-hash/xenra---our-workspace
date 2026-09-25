const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("university", {
  chooseProjectFolder: () => ipcRenderer.invoke("workspace:choose-project-folder"),
  listDirectory: (path) => ipcRenderer.invoke("fs:list-directory", path),
  readTextFile: (path) => ipcRenderer.invoke("fs:read-text-file", path),
  writeTextFile: (path, content) => ipcRenderer.invoke("fs:write-text-file", { path, content }),
  createFile: (path) => ipcRenderer.invoke("fs:create-file", path),
  createDirectory: (path) => ipcRenderer.invoke("fs:create-directory", path),
  renamePath: (path, newPath) => ipcRenderer.invoke("fs:rename-path", { path, newPath }),
  deletePath: (path) => ipcRenderer.invoke("fs:delete-path", path),
  executeCommand: (cwd, command) => ipcRenderer.invoke("process:execute-command", { cwd, command })
});
