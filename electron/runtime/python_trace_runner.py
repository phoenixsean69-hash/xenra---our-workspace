from __future__ import annotations

import datetime as _datetime
import inspect
import io
import json
import os
import reprlib
import runpy
import sys
import time
import traceback
import types
from typing import Any

EVENT_LIMIT = max(100, min(int(os.environ.get("XENRA_TRACE_MAX_EVENTS", "5000")), 100000))
DISPLAY_LIMIT = 180
LOCAL_LIMIT = 80

PROTOCOL_OUT = sys.stdout
RUNNER_FILE = os.path.realpath(__file__)

if len(sys.argv) < 3:
    PROTOCOL_OUT.write(json.dumps({"type": "error", "message": "Usage: python_trace_runner.py <project-root> <target-file>"}) + "\n")
    PROTOCOL_OUT.flush()
    sys.exit(2)

PROJECT_ROOT = os.path.realpath(sys.argv[1])
TARGET_FILE = os.path.realpath(sys.argv[2])

_event_count = 0
_frame_depth: dict[int, int] = {}
_started_perf = time.perf_counter()
_started_at = _datetime.datetime.now(_datetime.timezone.utc).isoformat()
_truncated = False
_limit_emitted = False

_SKIP_DIRS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    ".xenra-backups",
}


def _emit(payload: dict[str, Any]) -> None:
    try:
        PROTOCOL_OUT.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        PROTOCOL_OUT.flush()
    except Exception:
        pass


class _ProtocolStream(io.TextIOBase):
    def __init__(self, message_type: str) -> None:
        self.message_type = message_type

    @property
    def encoding(self) -> str:
        return "utf-8"

    def writable(self) -> bool:
        return True

    def isatty(self) -> bool:
        return False

    def write(self, value: str) -> int:
        text = str(value)
        if text:
            _emit({"type": self.message_type, "chunk": text})
        return len(text)

    def flush(self) -> None:
        return None


def _inside_project(filename: str) -> bool:
    try:
        resolved = os.path.realpath(filename)
        if resolved == RUNNER_FILE:
            return False

        relative = os.path.relpath(resolved, PROJECT_ROOT)
        if relative == os.pardir or relative.startswith(os.pardir + os.sep):
            return False

        parts = set(relative.split(os.sep))
        return not bool(parts.intersection(_SKIP_DIRS))
    except (ValueError, OSError):
        return False


def _clip(text: str, limit: int = DISPLAY_LIMIT) -> str:
    text = text.replace("\r", "\\r").replace("\n", "\\n")
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def _safe_builtin_repr(value: Any) -> str:
    try:
        helper = reprlib.Repr()
        helper.maxstring = 120
        helper.maxother = 120
        helper.maxlist = 8
        helper.maxtuple = 8
        helper.maxset = 8
        helper.maxfrozenset = 8
        helper.maxdict = 8
        return _clip(helper.repr(value))
    except Exception:
        return f"<{type(value).__name__}>"


def _snapshot(value: Any) -> dict[str, Any]:
    type_name = type(value).__name__

    if value is None or isinstance(value, (bool, int, float, complex)):
        return {"type": type_name, "kind": "primitive", "display": _clip(repr(value))}

    if isinstance(value, str):
        return {
            "type": type_name,
            "kind": "string",
            "display": _clip(repr(value)),
            "length": len(value),
        }

    if isinstance(value, bytes):
        return {
            "type": type_name,
            "kind": "sequence",
            "display": _safe_builtin_repr(value),
            "length": len(value),
            "objectId": f"py:{id(value):x}",
        }

    if isinstance(value, (list, tuple, set, frozenset)):
        return {
            "type": type_name,
            "kind": "sequence",
            "display": _safe_builtin_repr(value),
            "length": len(value),
            "objectId": f"py:{id(value):x}",
        }

    if isinstance(value, dict):
        return {
            "type": type_name,
            "kind": "mapping",
            "display": _safe_builtin_repr(value),
            "length": len(value),
            "objectId": f"py:{id(value):x}",
        }

    if isinstance(value, types.ModuleType):
        return {
            "type": type_name,
            "kind": "module",
            "display": f"<module {getattr(value, '__name__', '?')}>",
        }

    if inspect.isclass(value):
        return {
            "type": type_name,
            "kind": "type",
            "display": f"<class {getattr(value, '__module__', '?')}.{getattr(value, '__qualname__', getattr(value, '__name__', '?'))}>",
            "objectId": f"py:{id(value):x}",
        }

    if callable(value):
        name = getattr(value, "__qualname__", getattr(value, "__name__", type_name))
        module = getattr(value, "__module__", None)
        label = f"{module}.{name}" if module else name
        return {
            "type": type_name,
            "kind": "callable",
            "display": f"<callable {label}>",
            "objectId": f"py:{id(value):x}",
        }

    module = getattr(type(value), "__module__", "")
    qualname = getattr(type(value), "__qualname__", type_name)
    qualified = f"{module}.{qualname}" if module and module != "builtins" else qualname
    return {
        "type": type_name,
        "kind": "object",
        "display": f"<{qualified} instance>",
        "objectId": f"py:{id(value):x}",
    }


def _locals_snapshot(frame: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    try:
        items = list(frame.f_locals.items())[:LOCAL_LIMIT]
    except Exception:
        return result

    for key, value in items:
        try:
            result[str(key)] = _snapshot(value)
        except Exception:
            result[str(key)] = {
                "type": type(value).__name__,
                "kind": "unknown",
                "display": "<unavailable>",
            }
    return result


def _relative_file(filename: str) -> str:
    try:
        return os.path.relpath(os.path.realpath(filename), PROJECT_ROOT)
    except Exception:
        return filename


def _record(frame: Any, kind: str, arg: Any = None) -> None:
    global _event_count, _truncated, _limit_emitted

    if _event_count >= EVENT_LIMIT:
        _truncated = True
        if not _limit_emitted:
            _limit_emitted = True
            _emit({"type": "limit", "truncated": True, "eventLimit": EVENT_LIMIT})
        sys.settrace(None)
        return

    filename = os.path.realpath(frame.f_code.co_filename)
    frame_key = id(frame)

    if frame_key not in _frame_depth:
        parent_depth = _frame_depth.get(id(frame.f_back), -1) if frame.f_back else -1
        _frame_depth[frame_key] = parent_depth + 1

    _event_count += 1
    event: dict[str, Any] = {
        "sequence": _event_count,
        "kind": kind,
        "timeMs": round((time.perf_counter() - _started_perf) * 1000.0, 3),
        "file": filename,
        "relativeFile": _relative_file(filename),
        "line": int(frame.f_lineno),
        "function": frame.f_code.co_name,
        "depth": int(_frame_depth.get(frame_key, 0)),
        "frameId": f"frame:{frame_key:x}",
        "locals": _locals_snapshot(frame),
    }

    if kind == "return":
        event["returnValue"] = _snapshot(arg)

    if kind == "exception":
        try:
            exc_type, exc_value, _tb = arg
            event["exception"] = {
                "type": getattr(exc_type, "__name__", str(exc_type)),
                "message": _clip(str(exc_value), 240),
            }
        except Exception:
            event["exception"] = {"type": "Exception", "message": "<unavailable>"}

    _emit({"type": "event", "event": event})


def _trace(frame: Any, event: str, arg: Any):
    if not _inside_project(frame.f_code.co_filename):
        return None

    if event == "call":
        parent_depth = _frame_depth.get(id(frame.f_back), -1) if frame.f_back else -1
        _frame_depth[id(frame)] = parent_depth + 1
        _record(frame, "call")
        return _trace

    if event == "line":
        _record(frame, "line")
        return _trace

    if event == "return":
        _record(frame, "return", arg)
        _frame_depth.pop(id(frame), None)
        return _trace

    if event == "exception":
        _record(frame, "exception", arg)
        return _trace

    return _trace


exit_code = 0
error_text: str | None = None

_emit({
    "type": "meta",
    "pythonVersion": sys.version.split()[0],
    "eventLimit": EVENT_LIMIT,
    "startedAt": _started_at,
})

try:
    if not os.path.isfile(TARGET_FILE):
        raise FileNotFoundError(TARGET_FILE)

    try:
        inside = os.path.commonpath([PROJECT_ROOT, TARGET_FILE]) == PROJECT_ROOT
    except ValueError:
        inside = False

    if not inside:
        raise ValueError("Target file must be inside the active project.")

    sys.path.insert(0, os.path.dirname(TARGET_FILE))

    program_stdout = _ProtocolStream("stdout")
    program_stderr = _ProtocolStream("stderr")

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = program_stdout
    sys.stderr = program_stderr

    try:
        sys.settrace(_trace)
        try:
            runpy.run_path(TARGET_FILE, run_name="__main__")
        except SystemExit as exc:
            if isinstance(exc.code, int):
                exit_code = exc.code
            elif exc.code is None:
                exit_code = 0
            else:
                exit_code = 1
                program_stderr.write(str(exc.code) + "\n")
        except BaseException as exc:
            exit_code = 1
            error_text = f"{type(exc).__name__}: {exc}"
            traceback.print_exc(file=program_stderr)
        finally:
            sys.settrace(None)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

except BaseException as exc:
    exit_code = 1
    error_text = f"{type(exc).__name__}: {exc}"
    _emit({"type": "error", "message": error_text})

finally:
    duration_ms = round((time.perf_counter() - _started_perf) * 1000.0, 3)
    payload: dict[str, Any] = {
        "type": "complete",
        "durationMs": duration_ms,
        "exitCode": exit_code,
        "stopped": False,
        "truncated": _truncated,
        "eventLimit": EVENT_LIMIT,
        "pythonVersion": sys.version.split()[0],
    }
    if error_text:
        payload["error"] = error_text
    _emit(payload)
