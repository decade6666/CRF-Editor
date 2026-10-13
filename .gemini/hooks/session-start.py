#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Inject structured context
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import re
import shlex
import subprocess
import sys
from io import StringIO
from pathlib import Path


def _normalize_windows_shell_path(path_str: str) -> str:
    """Normalize Unix-style shell paths to real Windows paths.

    On Windows, shells like Git Bash / MSYS2 / Cygwin may report paths like
    `/d/Users/...` or `/cygdrive/d/Users/...`. `Path.resolve()` will misinterpret
    these as `D:/d/Users...` on drive D: (or similar), breaking repo root
    detection.

    This function is intentionally conservative: it only rewrites patterns that
    unambiguously represent a drive letter mount.
    """
    if not isinstance(path_str, str) or not path_str:
        return path_str

    # Only relevant on Windows; keep other platforms untouched.
    if not sys.platform.startswith("win"):
        return path_str

    p = path_str.strip()

    # Already a Windows drive path (C:\... or C:/...)
    if re.match(r"^[A-Za-z]:[\/]", p):
        return p

    # MSYS/Git-Bash style: /c/Users/... or /d/Work/...
    m = re.match(r"^/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    # Cygwin style: /cygdrive/c/Users/...
    m = re.match(r"^/cygdrive/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    # WSL mounted drive (sometimes leaked into env): /mnt/c/Users/...
    m = re.match(r"^/mnt/([A-Za-z])/(.*)", p)
    if m:
        drive, rest = m.group(1).upper(), m.group(2)
        rest = rest.replace('/', '\\')
        return f"{drive}:\\{rest}"

    return path_str


_FIRST_REPLY_NOTICE_HEAD = """<first-reply-notice>
On the first visible assistant reply in this session, briefly acknowledge that Trellis SessionStart context loaded."""

_FIRST_REPLY_NOTICE_TAIL = """Choose the acknowledgment language in this order:
1. Use the language of the user's current request (the user message that triggered this reply).
2. If that request has no clear natural language, use an explicitly established project communication language.
3. If neither provides a language, output the language-neutral fallback exactly: `Trellis SessionStart ✓`.
Continue directly with the user's request after the acknowledgment.
The acknowledgment must not alter the language used for the remainder of the response.
This notice is one-shot: do not repeat it after the first visible assistant reply in this session.
</first-reply-notice>"""

FIRST_REPLY_NOTICE = f"{_FIRST_REPLY_NOTICE_HEAD}\n{_FIRST_REPLY_NOTICE_TAIL}"


def _build_first_reply_notice(update_hint: str | None) -> str:
    """First-reply notice, carrying the Trellis update reminder when there is one.

    The reminder has to reach the *user*, not just the model's context — a line
    buried in SessionStart context is exactly how the update step kept getting
    skipped. This block is already the payload's one "say it out loud" channel,
    so the hint rides along instead of growing a second mechanism.

    With no hint the notice is byte-identical to the plain constant: no empty
    block, no placeholder line.
    """
    if not update_hint:
        return FIRST_REPLY_NOTICE
    return (
        f"{_FIRST_REPLY_NOTICE_HEAD}\n"
        f"Also relay this Trellis maintenance notice on its own line in that same reply: {update_hint}\n"
        f"{_FIRST_REPLY_NOTICE_TAIL}"
    )


# Force UTF-8 on stdin/stdout/stderr on Windows. Default codepage there is
# cp936 / cp1252 / etc. — non-ASCII content (Chinese task names, prd snippets)
# both in stdin (hook payload from host CLI) and stdout (our emitted blocks)
# raises UnicodeDecodeError / UnicodeEncodeError. Equivalent to `python -X utf8`
# but applied per-stream so we don't depend on host CLI's command wiring.
if sys.platform.startswith("win"):
    import io as _io
    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.
        elif hasattr(_stream, "detach"):
            try:
                setattr(sys, _stream_name, _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass  # Optional Windows stream setup; keep hook startup non-fatal.



def _has_curated_jsonl_entry(jsonl_path: Path) -> bool:
    """Return True iff jsonl has at least one row with a ``file`` field.

    A newly created jsonl is empty, and older tasks may still carry a
    ``{"_example": ...}`` placeholder row (no ``file`` key) — neither is
    "ready". Readiness requires at least one curated entry. Matches the
    contract used by hook-inject and pull-based sub-agent context loaders.
    """
    try:
        for line in jsonl_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("file"):
                return True
    except (OSError, UnicodeDecodeError):
        return False
    return False


def should_skip_injection() -> bool:
    """Check if any platform's non-interactive flag is set, or if Trellis
    hooks are explicitly disabled via TRELLIS_HOOKS=0 / TRELLIS_DISABLE_HOOKS=1.
    """
    if os.environ.get("TRELLIS_HOOKS") == "0":
        return True
    if os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        return True
    non_interactive_vars = [
        "CLAUDE_NON_INTERACTIVE",
        "QODER_NON_INTERACTIVE",
        "CODEBUDDY_NON_INTERACTIVE",
        "FACTORY_NON_INTERACTIVE",
        "CURSOR_NON_INTERACTIVE",
        "GEMINI_NON_INTERACTIVE",
        "KIRO_NON_INTERACTIVE",
        "COPILOT_NON_INTERACTIVE",
        "TRAE_NON_INTERACTIVE",
        "ZCODE_NON_INTERACTIVE",
    ]
    return any(os.environ.get(var) == "1" for var in non_interactive_vars)


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def _repo_relative(repo_root: Path, path: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return str(path)


def _run_git(repo_root: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=3,
            cwd=str(repo_root),
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _format_git_state(repo_root: Path) -> str:
    branch = _run_git(repo_root, ["branch", "--show-current"]) or "(detached)"
    dirty_lines = [
        line for line in _run_git(repo_root, ["status", "--porcelain"]).splitlines()
        if line.strip()
    ]
    dirty_text = "clean" if not dirty_lines else f"dirty {len(dirty_lines)} paths"
    return f"Git: branch {branch}; {dirty_text}."


def _detect_platform(input_data: dict) -> str | None:
    if isinstance(input_data.get("cursor_version"), str):
        return "cursor"
    # CLAUDE_PROJECT_DIR is a compatibility alias that several hosts set
    # alongside their own variable — CodeBuddy, ZCode and Trae all do. It must
    # therefore be checked LAST, or every one of them is detected as claude and
    # the context key becomes `claude_<their-session-id>`. That key does not
    # match the session file `task.py start` wrote under the host's real name,
    # so every turn reports no_task while the pointer exists on disk.
    # Observed on CodeBuddy IDE 4.10.4: session file `codebuddy_ae54840e….json`
    # alongside marker `update-check-claude_ae54840e….marker`, same id.
    env_map = {
        "ZCODE_PROJECT_DIR": "zcode",
        "CURSOR_PROJECT_DIR": "cursor",
        "CODEBUDDY_PROJECT_DIR": "codebuddy",
        "FACTORY_PROJECT_DIR": "droid",
        "GEMINI_PROJECT_DIR": "gemini",
        "QODER_PROJECT_DIR": "qoder",
        "KIRO_PROJECT_DIR": "kiro",
        "COPILOT_PROJECT_DIR": "copilot",
        "TRAE_PROJECT_DIR": "trae",
        # Last: the shared alias, only meaningful once no vendor key matched.
        "CLAUDE_PROJECT_DIR": "claude",
    }
    for env_name, platform in env_map.items():
        if os.environ.get(env_name):
            return platform
    script_parts = set(Path(sys.argv[0]).parts)
    if ".claude" in script_parts:
        return "claude"
    if ".cursor" in script_parts:
        return "cursor"
    if ".codex" in script_parts:
        return "codex"
    if ".gemini" in script_parts:
        return "gemini"
    if ".qoder" in script_parts:
        return "qoder"
    if ".codebuddy" in script_parts:
        return "codebuddy"
    if ".factory" in script_parts:
        return "droid"
    if ".kiro" in script_parts:
        return "kiro"
    if ".trae" in script_parts:
        return "trae"
    if ".zcode" in script_parts:
        return "zcode"
    return None


def _resolve_context_key(trellis_dir: Path, input_data: dict) -> str | None:
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_context_key  # type: ignore[import-not-found]

    return resolve_context_key(input_data, platform=_detect_platform(input_data))


def _persist_context_key_for_bash(context_key: str | None) -> None:
    """Expose Trellis session identity to later Claude Code Bash commands.

    Claude Code SessionStart hooks can append exports to CLAUDE_ENV_FILE; those
    variables are then available to Bash tools in the same conversation. Without
    this bridge, `task.py start` has hook stdin during SessionStart but no
    session identity when the AI later runs it as a normal shell command.

    CLAUDE_ENV_FILE is user-owned (conda init, proxy settings, ...) and the host
    shell sources it for every command, so an unconditional append grows it
    without bound — one line per SessionStart forever. Skip the write when the
    *last* existing TRELLIS_CONTEXT_ID export already assigns this value. Last
    wins in shell, so only the final assignment describes the effective state:
    "the value appears somewhere in the file" would wrongly skip after a switch
    A -> B -> A, leaving the shell on B.
    """
    if not context_key:
        return
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file:
        return
    export_line = f"export TRELLIS_CONTEXT_ID={shlex.quote(context_key)}"
    try:
        if _last_context_key_export(env_file) == export_line:
            return
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(f"{export_line}\n")
    except OSError:
        pass  # Optional shell bridge; keep session-start non-fatal.


def _last_context_key_export(env_file: str) -> str | None:
    """Return the last `export TRELLIS_CONTEXT_ID=` line in env_file, if any.

    A missing file means "no previous export" (the caller then creates it).
    `errors="replace"` matters: a user env file with non-UTF-8 bytes would
    otherwise raise UnicodeDecodeError, which is a ValueError — not an OSError —
    and would escape the caller's non-fatal guard.
    """
    last_export = None
    try:
        with open(env_file, "r", encoding="utf-8", errors="replace") as handle:
            for raw_line in handle:
                stripped = raw_line.strip()
                if stripped.startswith("export TRELLIS_CONTEXT_ID="):
                    last_export = stripped
    except FileNotFoundError:
        return None
    return last_export


def _resolve_update_hint(trellis_dir: Path, context_key: str | None) -> str | None:
    """Ask common.session_context whether a Trellis update is available.

    Throttling lives there: the first SessionStart of a session writes a marker
    under `.trellis/.runtime/`, and later ones (clear, compact) return without
    spawning `trellis --version`. The resolved `context_key` is passed through so
    the marker is scoped to the same session identity the rest of the hook uses,
    rather than session_context's environment-only fallback.

    Best-effort: a missing scripts dir, an import error, or anything raised while
    probing versions leaves the rest of the payload untouched.
    """
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.session_context import get_update_hint  # type: ignore[import-not-found]

        return get_update_hint(trellis_dir.parent, context_key)
    except Exception:
        return None  # Optional reminder; keep session-start non-fatal.


def _resolve_active_task(trellis_dir: Path, input_data: dict):
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from common.active_task import resolve_active_task  # type: ignore[import-not-found]

    return resolve_active_task(
        trellis_dir.parent,
        input_data,
        platform=_detect_platform(input_data),
    )


def run_script(script_path: Path, context_key: str | None = None) -> str:
    try:
        if script_path.suffix == ".py":
            # Add PYTHONIOENCODING to force UTF-8 in subprocess
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [sys.executable, "-W", "ignore", str(script_path)]
        else:
            env = os.environ.copy()
            if context_key:
                env["TRELLIS_CONTEXT_ID"] = context_key
            cmd = [str(script_path)]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=script_path.parent.parent.parent,
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def _normalize_task_ref(task_ref: str) -> str:
    normalized = task_ref.strip()
    if not normalized:
        return ""

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return str(path_obj)

    normalized = normalized.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if normalized.startswith("tasks/"):
        return f".trellis/{normalized}"

    return normalized


def _resolve_task_dir(trellis_dir: Path, task_ref: str) -> Path:
    normalized = _normalize_task_ref(task_ref)
    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return path_obj
    if normalized.startswith(".trellis/"):
        return trellis_dir.parent / path_obj
    return trellis_dir / "tasks" / path_obj


def _get_task_status(trellis_dir: Path, input_data: dict) -> str:
    """Return compact active-task status, artifact presence, and next action."""
    active = _resolve_active_task(trellis_dir, input_data)

    if not active.task_path:
        return (
            "Status: NO ACTIVE TASK\n"
            "Next-Action: Classify the current turn before creating any Trellis task. "
            "Simple conversation / small task asks only whether this turn should create a Trellis task. "
            "Complex task asks whether task creation and planning are allowed."
        )

    task_ref = active.task_path
    task_dir = _resolve_task_dir(trellis_dir, task_ref)
    if active.stale or not task_dir.is_dir():
        return (
            f"Status: STALE POINTER\nTask: {task_ref}\n"
            f"Next-Action: Run `python3 ./.trellis/scripts/task.py finish` to clear the stale pointer, "
            "then ask the user what to work on next."
        )

    task_json_path = task_dir / "task.json"
    task_data = {}
    if task_json_path.is_file():
        try:
            task_data = json.loads(task_json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            pass  # Optional task metadata; fall back to generic status.

    task_title = task_data.get("title", task_ref)
    task_status = task_data.get("status", "unknown")
    artifact_names = ("prd.md", "design.md", "implement.md", "implement.jsonl", "check.jsonl")
    present = [name for name in artifact_names if (task_dir / name).is_file()]
    if (task_dir / "research").is_dir():
        present.append("research/")
    present_line = ", ".join(present) if present else "(none)"

    if task_status == "completed":
        return (
            f"Status: COMPLETED\nTask: {task_title}\n"
            f"Present: {present_line}\n"
            "Next-Action: Run `/trellis:finish-work`. If the working tree is dirty, return to Phase 3.4 first."
        )

    has_prd = (task_dir / "prd.md").is_file()
    has_design = (task_dir / "design.md").is_file()
    has_implement_plan = (task_dir / "implement.md").is_file()
    implement_jsonl = task_dir / "implement.jsonl"
    check_jsonl = task_dir / "check.jsonl"
    jsonl_ready = (
        (not implement_jsonl.is_file() or _has_curated_jsonl_entry(implement_jsonl))
        and (not check_jsonl.is_file() or _has_curated_jsonl_entry(check_jsonl))
    )

    if task_status == "planning" and not has_prd:
        return (
            f"Status: PLANNING\nTask: {task_title}\n"
            f"Present: {present_line}\n"
            "Next-Action: Load `trellis-brainstorm` and write `prd.md`. Stay in planning."
        )

    if task_status == "planning":
        missing_complex = [
            name for name, exists in (
                ("design.md", has_design),
                ("implement.md", has_implement_plan),
            )
            if not exists
        ]
        next_bits: list[str] = []
        if missing_complex:
            next_bits.append(
                "Lightweight task can request start review with PRD-only; "
                f"complex task must add {', '.join(missing_complex)} before start"
            )
        else:
            next_bits.append("Planning artifacts are present; ask for review before `task.py start`")
        if not jsonl_ready:
            next_bits.append("curate `implement.jsonl` and `check.jsonl` before sub-agent mode start")
        return (
            f"Status: PLANNING\nTask: {task_title}\n"
            f"Present: {present_line}\n"
            f"Next-Action: {'; '.join(next_bits)}. Do not enter implementation until the user confirms start."
        )

    return (
        f"Status: {str(task_status).upper()}\nTask: {task_title}\n"
        f"Present: {present_line}\n"
        "Next-Action: Follow the matching per-turn workflow-state. "
        "Implementation/check context order is jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if present`."
    )


def _load_trellis_config(trellis_dir: Path, input_data: dict) -> tuple:
    """Load Trellis config for session-start decisions.

    Returns:
        (is_mono, packages_dict, spec_scope, task_pkg, default_pkg)
    """
    scripts_dir = trellis_dir / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from common.config import get_default_package, get_packages, get_spec_scope, is_monorepo  # type: ignore[import-not-found]
        from common.paths import get_current_task  # type: ignore[import-not-found]

        repo_root = trellis_dir.parent
        is_mono = is_monorepo(repo_root)
        packages = get_packages(repo_root) or {}
        scope = get_spec_scope(repo_root)

        # Get active task's package
        task_pkg = None
        current = get_current_task(
            repo_root,
            input_data,
            platform=_detect_platform(input_data),
        )
        if current:
            task_json = repo_root / current / "task.json"
            if task_json.is_file():
                try:
                    data = json.loads(task_json.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        tp = data.get("package")
                        if isinstance(tp, str) and tp:
                            task_pkg = tp
                except (json.JSONDecodeError, OSError):
                    pass  # Optional package metadata; fall back to default scope.

        default_pkg = get_default_package(repo_root)
        return is_mono, packages, scope, task_pkg, default_pkg
    except Exception:
        return False, {}, None, None, None


def _check_legacy_spec(trellis_dir: Path, is_mono: bool, packages: dict) -> str | None:
    """Check for legacy spec directory structure in monorepo.

    Returns warning message if legacy structure detected, None otherwise.
    """
    if not is_mono or not packages:
        return None

    spec_dir = trellis_dir / "spec"
    if not spec_dir.is_dir():
        return None

    # Check for legacy flat spec dirs (spec/backend/, spec/frontend/ with index.md)
    has_legacy = False
    for legacy_name in ("backend", "frontend"):
        legacy_dir = spec_dir / legacy_name
        if legacy_dir.is_dir() and (legacy_dir / "index.md").is_file():
            has_legacy = True
            break

    if not has_legacy:
        return None

    # Check which packages are missing spec/<pkg>/ directory
    missing = [
        name for name in sorted(packages.keys())
        if not (spec_dir / name).is_dir()
    ]

    if not missing:
        return None  # All packages have spec dirs

    if len(missing) == len(packages):
        return (
            f"[!] Legacy spec structure detected: found `spec/backend/` or `spec/frontend/` "
            f"but no package-scoped `spec/<package>/` directories.\n"
            f"Monorepo packages: {', '.join(sorted(packages.keys()))}\n"
            f"Please reorganize: `spec/backend/` -> `spec/<package>/backend/`"
        )
    return (
        f"[!] Partial spec migration detected: packages {', '.join(missing)} "
        f"still missing `spec/<pkg>/` directory.\n"
        f"Please complete migration for all packages."
    )


def _resolve_spec_scope(
    is_mono: bool,
    packages: dict,
    scope,
    task_pkg: str | None,
    default_pkg: str | None,
) -> set | None:
    """Resolve which packages should have their specs injected.

    Returns:
        Set of package names to include, or None for full scan.
    """
    if not is_mono or not packages:
        return None  # Single-repo: full scan

    if scope is None:
        return None  # No scope configured: full scan

    if isinstance(scope, str) and scope == "active_task":
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Fallback to full scan

    if isinstance(scope, list):
        valid = set()
        for entry in scope:
            if entry in packages:
                valid.add(entry)
            else:
                print(
                    f"Warning: spec_scope contains unknown package: {entry}, ignoring",
                    file=sys.stderr,
                )

        if valid:
            # Warn if active task is out of scope
            if task_pkg and task_pkg not in valid:
                print(
                    f"Warning: active task package '{task_pkg}' is out of configured spec_scope",
                    file=sys.stderr,
                )
            return valid

        # All entries invalid: fallback chain
        print(
            "Warning: all spec_scope entries invalid, falling back to task/default/full",
            file=sys.stderr,
        )
        if task_pkg and task_pkg in packages:
            return {task_pkg}
        if default_pkg and default_pkg in packages:
            return {default_pkg}
        return None  # Full scan

    return None  # Unknown scope type: full scan


def _collect_spec_index_paths(trellis_dir: Path, allowed_pkgs: set | None) -> list[str]:
    paths: list[str] = []
    guides_index = trellis_dir / "spec" / "guides" / "index.md"
    if guides_index.is_file():
        paths.append(".trellis/spec/guides/index.md")

    spec_dir = trellis_dir / "spec"
    if not spec_dir.is_dir():
        return paths

    for sub in sorted(spec_dir.iterdir()):
        if not sub.is_dir() or sub.name.startswith(".") or sub.name == "guides":
            continue

        index_file = sub / "index.md"
        if index_file.is_file():
            paths.append(f".trellis/spec/{sub.name}/index.md")
            continue

        if allowed_pkgs is not None and sub.name not in allowed_pkgs:
            continue
        for nested in sorted(sub.iterdir()):
            if not nested.is_dir():
                continue
            nested_index = nested / "index.md"
            if nested_index.is_file():
                paths.append(f".trellis/spec/{sub.name}/{nested.name}/index.md")

    return paths


def _build_compact_current_state(
    trellis_dir: Path,
    input_data: dict,
    spec_index_paths: list[str],
) -> str:
    repo_root = trellis_dir.parent
    lines: list[str] = []

    try:
        from common.paths import get_active_journal_file, get_developer, get_tasks_dir, count_lines  # type: ignore[import-not-found]
        from common.tasks import iter_active_tasks  # type: ignore[import-not-found]
    except Exception:
        get_active_journal_file = None  # type: ignore[assignment]
        get_developer = None  # type: ignore[assignment]
        get_tasks_dir = None  # type: ignore[assignment]
        count_lines = None  # type: ignore[assignment]
        iter_active_tasks = None  # type: ignore[assignment]

    developer = get_developer(repo_root) if get_developer else None
    lines.append(f"Developer: {developer or '(not initialized)'}")
    lines.append(_format_git_state(repo_root))

    active = _resolve_active_task(trellis_dir, input_data)
    if active.task_path:
        task_dir = _resolve_task_dir(trellis_dir, active.task_path)
        status = "unknown"
        task_json = task_dir / "task.json"
        if task_json.is_file():
            try:
                data = json.loads(task_json.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    status = str(data.get("status") or "unknown")
            except (json.JSONDecodeError, OSError):
                pass  # Optional task metadata; fall back to generic status.
        lines.append(f"Current task: {_repo_relative(repo_root, task_dir)}; status={status}.")
    else:
        lines.append("Current task: none.")

    if get_tasks_dir and iter_active_tasks:
        try:
            task_count = sum(1 for _ in iter_active_tasks(get_tasks_dir(repo_root)))
            lines.append(
                f"Active tasks: {task_count} total. Use `python3 ./.trellis/scripts/task.py list --mine` only if needed."
            )
        except Exception:
            pass  # Optional task summary; keep compact state available.

    if get_active_journal_file and count_lines:
        journal = get_active_journal_file(repo_root)
        if journal:
            lines.append(
                f"Journal: {_repo_relative(repo_root, journal)}, {count_lines(journal)} / 2000 lines."
            )

    if spec_index_paths:
        lines.append(f"Spec indexes: {len(spec_index_paths)} available.")

    return "\n".join(lines)


def _extract_range(content: str, start_header: str, end_header: str) -> str:
    """Extract lines starting at `## start_header` up to (but excluding) `## end_header`.

    Both parameters are full header lines WITHOUT the `## ` prefix (e.g. "Phase Index").
    Returns empty string if start header is not found.
    End header missing → extracts to end of file.
    """
    lines = content.splitlines()
    start: int | None = None
    end: int = len(lines)
    start_match = f"## {start_header}"
    end_match = f"## {end_header}"
    for i, line in enumerate(lines):
        stripped = line.strip()
        if start is None and stripped == start_match:
            start = i
            continue
        if start is not None and stripped == end_match:
            end = i
            break
    if start is None:
        return ""
    return "\n".join(lines[start:end]).rstrip()


_BREADCRUMB_TAG_RE = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n.*?\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)

# SessionStart overview budget. The full Phase Index range is ~11k characters,
# so the overview renders only the phase boundaries, the detected platform's
# routing group, and the guardrails; everything else stays available on demand
# behind `_OVERVIEW_POINTER`.
_OVERVIEW_LIMIT = 2000
_OVERVIEW_POINTER = (
    "Full guide: .trellis/workflow.md. Step detail: "
    "`python3 ./.trellis/scripts/get_context.py --mode phase --step <X.Y>`."
)

# Sections kept in the overview: the phase skeleton, the resolved routing for
# this host, and the consent/artifact/activation guardrails. Step lists and
# planning prose are deliberately excluded - the guide pointer above plus
# `get_context.py --mode phase --step <X.Y>` are the on-demand path for them,
# and carrying them here is what pushed the payload past the budget.
_OVERVIEW_SECTIONS = (
    "## Phase Index",
    "### Active Task Routing",
    "### Guardrails",
)

# Inside a kept section only headings, list items, and quotes survive; prose
# paragraphs are dropped so the overview stays a summary, not a copy. Fenced
# blocks are tracked by the caller's fence state and are never filtered.
_OVERVIEW_LINE_RE = re.compile(r"^(#{1,6}\s|[-*+]\s|\d+\.\s|>)")

# Marker label vs stable id, mirroring common.workflow_phase. Duplicated
# locally because the overview must still render when `.trellis/scripts` is not
# importable (fresh checkout, broken scripts dir).
_PLATFORM_LABEL_FALLBACKS = {
    "claude": "Claude Code",
    "kimi": "Kimi Code",
    "omp": "Oh My Pi",
    "dsh": "DeepSeek Harness",
}

# A platform marker line is `[A, B]` / `[/A, B]` on a line of its own.
_GROUP_OPEN_RE = re.compile(r"^\[([A-Za-z][^\[\]]*)\]$")
_GROUP_CLOSE_RE = re.compile(r"^\[/([A-Za-z][^\[\]]*)\]$")

_FALLBACK_OVERVIEW = """\
Phase 1: Plan    -> classify, request consent, then write planning artifacts
Phase 2: Execute -> implement only after task status is in_progress
Phase 3: Finish  -> verify, update spec, commit, and wrap up

- Consent: creating a task requires user consent; consent to create is not
  consent to implement.
- Artifacts: lightweight tasks may be PRD-only; complex tasks need `prd.md`,
  `design.md`, and `implement.md` reviewed before `task.py start`.
- Activation: implementation waits for `task.py start` (status `in_progress`)
  after artifact review.
- Validation: checks must run before completion is reported; the commit step
  stays reachable before `/trellis:finish-work`.

The workflow Phase Index could not be summarized safely (missing, malformed, or
larger than the overview budget); the full guide and per-step detail remain
available through the pointer above.
"""


def _strip_breadcrumb_tag_blocks(content: str) -> str:
    """Remove `[workflow-state:STATUS]...[/workflow-state:STATUS]` blocks.

    The tag blocks live inside `## Phase Index` (since v0.5.0-rc.0, when
    they were colocated with their phase summaries) and are consumed by the
    UserPromptSubmit hook (`inject-workflow-state.py`). The session-start
    payload already covers the full step bodies, so re-inlining the
    breadcrumbs here would just duplicate context.

    HTML comments go with them. Bracket-only lines are deliberately NOT removed
    here: an earlier version deleted every `[...]` line, which erased the
    `[Claude Code, ...]` marker lines while keeping both groups' contents, so
    two unlabeled, identical routing routes reached the model. Platform groups
    are resolved by `_select_platform_groups` before any marker is hidden.
    """
    stripped = _BREADCRUMB_TAG_RE.sub("", content)
    stripped = re.sub(r"<!--.*?-->", "", stripped, flags=re.DOTALL)
    return re.sub(r"\n{3,}", "\n\n", stripped).strip()


def _normalize_platform_name(name: str) -> str:
    """Case/punctuation-insensitive platform name for marker comparison."""
    return name.strip().lower().replace("-", "").replace("_", "").replace(" ", "")


def _read_codex_dispatch_mode(config_path: Path) -> str | None:
    """Return `codex.dispatch_mode` from `.trellis/config.yaml`, or None.

    Fallback for when the shared reader is unavailable (`.trellis/scripts` not
    importable). The hook needs this single key, so it does not pull in a YAML
    parser on the startup path.
    """
    try:
        lines = config_path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, OSError):
        return None
    in_codex = False
    for raw in lines:
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        if not line.startswith((" ", "\t")):
            in_codex = line.strip() == "codex:"
            continue
        if in_codex and line.strip().startswith("dispatch_mode:"):
            return line.split(":", 1)[1].strip()
    return None


def _codex_dispatch_mode(trellis_dir: Path) -> str:
    """Return `auto` or `inline` for the Codex host.

    The shared reader is preferred so `.trellis/config.yaml` decides; the local
    fallback read keeps the behaviour identical when `.trellis/scripts` is not
    importable. A missing section means the default (`auto`, matching
    `common.config.DEFAULT_CODEX_DISPATCH_MODE`); an invalid explicit value
    falls back to `inline`, as the shared parser does, so a typo cannot
    silently switch a host into sub-agent dispatch.
    """
    scripts_dir = trellis_dir / "scripts"
    config: object = None
    if scripts_dir.is_dir():
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        try:
            from common.trellis_config import read_trellis_config  # type: ignore[import-not-found]

            config = read_trellis_config(trellis_dir.parent)
        except Exception:
            config = None  # Optional helper; the local reader covers it.
    if not isinstance(config, dict):
        mode = _read_codex_dispatch_mode(trellis_dir / "config.yaml")
        if mode is None:
            return "auto"
        return "auto" if mode.strip().lower() in ("auto", "sub-agent") else "inline"
    codex = config.get("codex")
    if codex is None:
        return "auto"
    if not isinstance(codex, dict):
        return "inline"
    raw = str(codex.get("dispatch_mode", "auto")).strip().lower()
    return "auto" if raw in ("auto", "sub-agent") else "inline"


def _effective_platform_label(platform: str | None, trellis_dir: Path) -> str | None:
    """Resolve a platform id to the label its marker block uses.

    `claude` has to match a `[Claude Code, ...]` block, so the shared
    `common.workflow_phase.resolve_effective_platform` is preferred when
    `.trellis/scripts` is importable; the local fallback table covers every id
    whose marker label differs from the id. Unknown ids pass through unchanged,
    which leaves group selection labeled rather than guessing.

    `codex` is namespaced by its dispatch mode first: the shared helper reads
    that mode from the config dict it is handed, and this hook passes none, so
    the mode is resolved here instead of defaulting every Codex host to the
    sub-agent group.
    """
    if not platform:
        return None
    name = platform.strip().lower()
    if name == "codex":
        mode = _codex_dispatch_mode(trellis_dir)
        return "codex-sub-agent" if mode == "auto" else "codex-inline"
    scripts_dir = trellis_dir / "scripts"
    if scripts_dir.is_dir():
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
        try:
            from common.workflow_phase import resolve_effective_platform  # type: ignore[import-not-found]

            return resolve_effective_platform(name, {})
        except Exception:
            pass  # Optional helper; fall back to the local label table.
    return _PLATFORM_LABEL_FALLBACKS.get(name, name)


def _find_group_close(lines: list[str], start: int, names: list[str]) -> int | None:
    """Index of the `[/...]` line closing the group that opens at `start`.

    A group whose closing marker lists different platforms, or that runs into
    another opening marker first, is malformed and treated as ordinary text.
    Fenced blocks are skipped so sample markers inside code never pair.
    """
    target = sorted(_normalize_platform_name(n) for n in names)
    in_fence = False
    for j in range(start, len(lines)):
        stripped = lines[j].strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = _GROUP_CLOSE_RE.match(stripped)
        if m:
            closing = sorted(
                _normalize_platform_name(n) for n in m.group(1).split(",") if n.strip()
            )
            return j if closing == target else None
        if _GROUP_OPEN_RE.match(stripped):
            return None
    return None


def _platform_group_spans(lines: list[str]) -> list[tuple[int, int, list[str]]]:
    """Find well-formed `[A, B] ... [/A, B]` marker pairs, skipping fences.

    A bracket-only line with no matching close is ordinary Markdown and is
    left alone.
    """
    spans: list[tuple[int, int, list[str]]] = []
    in_fence = False
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
        elif not in_fence:
            m = _GROUP_OPEN_RE.match(stripped)
            if m:
                names = [n.strip() for n in m.group(1).split(",") if n.strip()]
                close = _find_group_close(lines, i + 1, names)
                if close is not None:
                    spans.append((i, close, names))
                    i = close + 1
                    continue
        i += 1
    return spans


def _select_platform_groups(content: str, platform: str | None) -> str:
    """Keep only the detected platform's groups; hide their marker lines.

    Selection runs before any marker is hidden - the earlier order deleted the
    labels while keeping the contents, which duplicated the shared routing
    route. Non-matching groups are dropped whole. When no group matches at all
    (unknown or unlisted host), every group is kept WITH its label instead of
    guessing which route applies to the session.
    """
    lines = content.splitlines()
    spans = _platform_group_spans(lines)
    needle = _normalize_platform_name(platform) if platform else None
    matched = [
        idx
        for idx, (_, _, names) in enumerate(spans)
        if needle and any(_normalize_platform_name(n) == needle for n in names)
    ]
    if spans and not matched:
        return content
    drop: set[int] = set()
    hide: set[int] = set()
    for idx, (open_i, close_i, _) in enumerate(spans):
        if idx in matched:
            hide.update((open_i, close_i))
        else:
            drop.update(range(open_i, close_i + 1))
    kept = [line for i, line in enumerate(lines) if i not in drop and i not in hide]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def _overview_blocks(content: str) -> dict[str, list[str]]:
    """Split the Phase Index range into heading-keyed blocks.

    Every ATX heading starts a block (`##` and `###` alike), so the allowlist
    can pick individual sections instead of the whole range.
    """
    blocks: dict[str, list[str]] = {}
    key = ""
    for line in content.splitlines():
        stripped = line.strip()
        if re.match(r"^#{1,6}\s", stripped):
            key = stripped
            blocks[key] = []
        if key:
            blocks[key].append(line)
    return blocks


def _condense_section(lines: list[str]) -> list[str]:
    """Keep headings, list items, quotes, and fenced blocks; drop prose."""
    kept: list[str] = []
    in_fence = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            kept.append(line)
        elif in_fence or _OVERVIEW_LINE_RE.match(stripped) or not stripped:
            kept.append(line)
    return kept


def _render_overview_sections(content: str) -> str:
    """Render the allowlisted sections of the Phase Index range."""
    blocks = _overview_blocks(content)
    out: list[str] = []
    for key in _OVERVIEW_SECTIONS:
        block = blocks.get(key)
        if not block:
            continue
        out.extend(_condense_section(block))
        out.append("")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def _build_workflow_overview(workflow_path: Path, platform: str | None = None) -> str:
    """Inject only the compact Phase Index summary for SessionStart.

    The whole overview - heading, guide/step pointer, and sections - must stay
    within `_OVERVIEW_LIMIT` Unicode characters. When the source is missing,
    malformed, or too large to summarize, a reviewed static summary replaces it
    rather than any blind truncation; no model call and no file write happens
    here.
    """
    content = read_file(workflow_path)
    phases = _extract_range(content, "Phase Index", "Phase 1: Plan") if content else ""
    summary = ""
    if phases:
        cleaned = _strip_breadcrumb_tag_blocks(phases)
        selected = _select_platform_groups(
            cleaned, _effective_platform_label(platform, workflow_path.parent)
        )
        summary = _render_overview_sections(selected)

    head = f"# Development Workflow - Session Summary\n{_OVERVIEW_POINTER}\n\n"
    overview = f"{head}{summary}" if summary else ""
    if not summary or len(overview) > _OVERVIEW_LIMIT:
        overview = f"{head}{_FALLBACK_OVERVIEW}"
    return overview.rstrip()


def main():
    if should_skip_injection():
        sys.exit(0)

    try:
        hook_input = json.loads(sys.stdin.read())
        if not isinstance(hook_input, dict):
            hook_input = {}
    except (json.JSONDecodeError, ValueError):
        hook_input = {}

    # Try platform-specific env vars, hook cwd, fallback to cwd
    project_dir_env_vars = [
        "CLAUDE_PROJECT_DIR",
        "QODER_PROJECT_DIR",
        "CODEBUDDY_PROJECT_DIR",
        "FACTORY_PROJECT_DIR",
        "CURSOR_PROJECT_DIR",
        "GEMINI_PROJECT_DIR",
        "KIRO_PROJECT_DIR",
        "COPILOT_PROJECT_DIR",
        "TRAE_PROJECT_DIR",
        "ZCODE_PROJECT_DIR",
    ]
    project_dir = None
    for var in project_dir_env_vars:
        val = os.environ.get(var)
        if val:
            project_dir = Path(_normalize_windows_shell_path(val)).resolve()
            break
    if project_dir is None:
        project_dir = Path(_normalize_windows_shell_path(hook_input.get("cwd", "."))).resolve()

    trellis_dir = project_dir / ".trellis"
    context_key = _resolve_context_key(trellis_dir, hook_input)
    _persist_context_key_for_bash(context_key)

    # Load config for scope filtering and legacy detection
    is_mono, packages, scope_config, task_pkg, default_pkg = _load_trellis_config(
        trellis_dir,
        hook_input,
    )
    allowed_pkgs = _resolve_spec_scope(is_mono, packages, scope_config, task_pkg, default_pkg)

    output = StringIO()

    spec_index_paths = _collect_spec_index_paths(trellis_dir, allowed_pkgs)

    output.write("""<session-context>
Trellis compact SessionStart context. Use it to orient the session; load details on demand.
</session-context>

""")
    output.write(_build_first_reply_notice(_resolve_update_hint(trellis_dir, context_key)))
    output.write("\n\n")

    # Legacy migration warning
    legacy_warning = _check_legacy_spec(trellis_dir, is_mono, packages)
    if legacy_warning:
        output.write(f"<migration-warning>\n{legacy_warning}\n</migration-warning>\n\n")

    output.write("<current-state>\n")
    output.write(_build_compact_current_state(trellis_dir, hook_input, spec_index_paths))
    output.write("\n</current-state>\n\n")

    output.write("<trellis-workflow>\n")
    output.write(
        _build_workflow_overview(
            trellis_dir / "workflow.md",
            platform=_detect_platform(hook_input),
        )
    )
    output.write("\n</trellis-workflow>\n\n")

    output.write("<guidelines>\n")
    output.write(
        "Task context order for implementation/check: jsonl entries -> `prd.md` -> "
        "`design.md if present` -> `implement.md if present`. Missing optional artifacts "
        "are skipped for lightweight tasks.\n\n"
    )

    if spec_index_paths:
        output.write("## Available indexes (read on demand)\n")
        for p in spec_index_paths:
            output.write(f"- {p}\n")
        output.write("\n")

    output.write(
        "Discover more via: "
        "`python3 ./.trellis/scripts/get_context.py --mode packages`\n"
    )
    output.write("</guidelines>\n\n")

    # Check task status and inject structured tag
    task_status = _get_task_status(trellis_dir, hook_input)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. Follow <task-status>. Load workflow/spec/task details only when needed.
</ready>""")

    context_text = output.getvalue()

    # Kiro (CLI trellis agent agentSpawn) adds a hook's stdout directly to the
    # conversation context — no JSON envelope. Emit the bare overview text.
    # Conditionally isolated: all other platforms keep the JSON path below.
    if _detect_platform(hook_input) == "kiro":
        print(context_text, flush=True)
        return

    platform = _detect_platform(hook_input)
    result: dict[str, object] = {
        # Claude Code / Qoder / CodeBuddy / Droid / Gemini / Copilot / Trae /
        # ZCode format.
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context_text,
        },
    }
    # Cursor sessionStart format (top-level snake_case per Cursor docs).
    # ZCode reads BOTH `hookSpecificOutput.additionalContext` and top-level
    # `additional_context` without deduplication, so emitting both keys would
    # duplicate the context in the conversation. Keep the previous shared output
    # shape for every other platform.
    if platform != "zcode":
        result["additional_context"] = context_text

    # Output JSON - stdout is already configured for UTF-8
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
