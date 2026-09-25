# XENRA

**Write. Run. See. Experiment.**

XENRA is a production-grade software development and execution environment. It combines a serious desktop development workflow with runtime observation tools that let developers inspect how software actually behaves while it runs.

Learning and university workflows are supported, but they are not the product ceiling.

## Product ground rules

- XENRA remains useful as a real engineering tool even when educational features are ignored.
- Visible controls perform real actions; XENRA does not ship fake IDE interactions.
- Runtime truth is preferred over decorative/static diagrams.
- Memory, object, execution, causality and profiling views are built from actual runtime evidence.
- Different programming paradigms get appropriate visualizations instead of being forced into one model.
- XENRA stays self-contained from the user's perspective while using mature compilers, runtimes, debuggers and version-control technology underneath.
- The UI stays compact and professional.
- Gold is an accent, not the interface background.

## Current desktop foundation

- Electron desktop shell
- React + TypeScript workbench
- Monaco editor
- Multi-file tabs
- Project explorer and file operations
- Project-wide text search
- Integrated xterm command terminal
- Run/output workflow
- Git status, branches, staging and commits
- Native folder selection
- Context-isolated Electron preload bridge

## Runtime Observation Kernel

XENRA's runtime layer is language-neutral at the UI/data-model level. Language-specific adapters feed real execution events into that model.

### Python adapter — first implementation

`Run > Trace Current File` captures real Python execution information:

- function calls
- executed source lines
- returns
- exceptions
- call depth
- local-variable snapshots
- interpreter object identities
- stdout/stderr
- duration and exit code

The **Execution** panel presents these events as an ordered runtime timeline. Selecting an event opens the exact source location.

Object IDs such as `py:...` are explicitly treated as interpreter runtime identities. XENRA does not present them as guaranteed physical memory addresses.

This is the foundation for later:

- time-travel state replay
- stack/heap visualization
- object/OOP visualization
- causality tracking
- data-structure visualization
- profiling
- program autopsy
- execution comparison

## Architecture

```text
XENRA
├── electron/
│   ├── main.mjs
│   ├── preload.cjs
│   └── runtime/
│       └── python_trace_runner.py
├── src/
│   ├── components/
│   ├── runtime/
│   │   └── types.ts
│   ├── services/
│   └── lib/
└── sample-project/
```

The renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and a restricted preload API.

## Development

```powershell
npm install
npm run dev
```

Production renderer verification:

```powershell
npm run build
```

Language toolchains remain external system dependencies where appropriate. Python tracing requires an installed Python interpreter; C/C++ development will use a real compiler/debugger toolchain rather than a XENRA reimplementation.
