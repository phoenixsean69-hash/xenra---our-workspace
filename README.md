# XENRA 0.1 — Electron Foundation

XENRA is a self-contained university coding workspace. Version 0.1 proves the desktop IDE foundation without VS Code, GitHub, Rust, or Cargo.

## What is already inside

- Standalone Electron desktop shell
- React + TypeScript interface
- Monaco code editor with multi-file tabs
- Internal project explorer
- Create / rename / delete files and folders
- Save with `Ctrl + S`
- Internal command terminal powered by xterm.js
- Run support for Python, JavaScript, TypeScript and PowerShell files
- Output and Problems panels
- Native folder picker
- Secure preload bridge between the UI and Node/Electron system APIs
- Sample project for testing

## Requirements

Only these are required for the workspace itself:

- Node.js 22+
- npm

Rust and Cargo are **not** required.

Language projects may still require their own toolchains. For example, running Python requires Python, and compiling C++ will require a C++ compiler. Those are project-language toolchains, not XENRA dependencies.

## Start on Windows

Open PowerShell in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\check-system.ps1
.\run-dev.ps1
```

The first launch installs npm dependencies, then starts the Vite renderer and Electron desktop shell.

## First test

1. Click **Open project folder**.
2. Select the included `sample-project` folder.
3. Open `hello.py`.
4. Edit it and press `Ctrl + S`.
5. Click **Run** if Python is installed, or use the internal Terminal.

## Architecture

```text
XENRA
├── electron/
│   ├── main.mjs        Native desktop process + IPC handlers
│   └── preload.cjs     Restricted renderer bridge
├── src/
│   ├── components/     Workbench UI
│   ├── services/       Desktop bridge client
│   └── lib/            Editor/path helpers
├── sample-project/
└── dist/               Production renderer output after npm run build
```

The renderer has `nodeIntegration: false` and uses `contextIsolation: true`. File operations and command execution are exposed through a small preload API instead of giving the UI direct Node access.

## Deliberately not in 0.1 yet

- Branching/version-control engine
- Collaboration server
- Assignment/submission workflows
- Authorship/paste provenance
- Full PTY terminal sessions
- Debugger
- Build profiles

Those will be added on top of this foundation rather than faked in the first release.
