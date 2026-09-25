# XENRA

**Write. Run. See. Experiment.**

XENRA is a production-grade software development and execution environment. It combines a serious desktop development workflow with runtime observation tools that let developers inspect how software actually behaves while it runs.

Learning and university workflows are supported, but they are not the product ceiling.

## Product ground rules

- XENRA remains useful as a real engineering tool even when educational features are ignored.
- Visible controls perform real actions.
- Runtime truth is preferred over decorative/static diagrams.
- Memory, object, execution, causality and profiling views are built from actual runtime evidence.
- Different programming paradigms get appropriate visualizations.
- XENRA stays self-contained from the user's perspective while using mature runtimes, compilers, debuggers and version-control technology underneath.
- The UI stays compact and professional.
- Gold is an accent, not the interface background.

## Runtime Observation Kernel

The runtime layer uses a language-neutral event model. Language adapters feed real runtime evidence into the same execution UI.

### Python live trace adapter

`Run > Trace Current File` creates a managed live execution session.

While the Python process is still running XENRA receives:

- function calls
- executed source lines
- returns
- exceptions
- call depth
- local-variable snapshots
- interpreter object identities
- stdout and stderr

The Execution panel updates continuously. Long-running programs do not have to exit before events appear.

`Stop Trace` terminates the active trace process. Closing the renderer also cleans up its trace session.

The trace event limit is 5,000 by default. Reaching the limit stops additional tracing but does not silently claim the user program has stopped.

IDs such as `py:...` are interpreter runtime identities, not guaranteed physical memory addresses.

This kernel is the foundation for:

- execution playback
- time-travel state reconstruction
- stack/heap visualization
- OOP/object visualization
- causality tracking
- program autopsy
- data-structure visualization
- profiling

## Current desktop foundation

- Electron desktop shell
- React + TypeScript workbench
- Monaco editor
- Multi-file tabs
- Project explorer and file operations
- Project-wide search
- Integrated xterm command terminal
- Run/output workflow
- Git status, branches, staging and commits
- Live Python runtime tracing
- Context-isolated Electron preload bridge

## Development

```powershell
npm install
npm run dev
```

Verify the production renderer:

```powershell
npm run build
```
