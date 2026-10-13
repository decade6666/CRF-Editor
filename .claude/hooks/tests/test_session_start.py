#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression tests for the SessionStart workflow-overview renderer.

Scope: `_build_workflow_overview` / `_strip_breadcrumb_tag_blocks` /
`_select_platform_groups` plus the contracts the surrounding hook depends on
(silent disable, host output envelopes, tolerant stdin). These are controlled
fixtures only: nothing here reads the user's active task, environment file, or
live repository state.

The overview keeps the phase skeleton, the resolved routing for the detected
host, and the guardrails; other fixture sections exist to prove they are NOT
copied into the overview. Bracket-text and fence behaviour is asserted against
`_select_platform_groups` directly, because the section filter would otherwise
hide the sample before an assertion could see it.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOK_PATH = REPO_ROOT / ".claude" / "hooks" / "session-start.py"

OVERVIEW_LIMIT = 2000

# Marker groups copied from .trellis/workflow.md, so the "before the fix" and
# "after the fix" expectations can both be stated as explicit content.
ROUTE_GROUP = (
    "[Claude Code, Cursor]\n"
    "- Planning or unclear requirements -> `trellis-brainstorm`.\n"
    "- `in_progress` implementation/check -> dispatch `trellis-implement` / `trellis-check`.\n"
    "[/Claude Code, Cursor]\n"
    "\n"
    "[codex-inline, Kilo]\n"
    "- Planning or unclear requirements -> `trellis-brainstorm`.\n"
    "- Before editing -> `trellis-before-dev`; after editing -> `trellis-check`.\n"
    "[/codex-inline, Kilo]\n"
)

FIXTURE_WORKFLOW = f"""# Workflow

## Phase Index

```
Phase 1: Plan    -> classify, consent, then write planning artifacts
Phase 2: Execute -> implement only after task status is in_progress
Phase 3: Finish  -> verify, update spec, commit, and wrap up
```

### Request Triage

- Simple conversation or small task: ask only whether this turn should create a task.
- Complex task: ask whether you may create a task and enter planning.

### Planning Artifacts

- `prd.md` — requirements, constraints, and acceptance criteria.
- `design.md` — technical design for complex tasks.
- `implement.md` — execution plan for complex tasks.
- Lightweight tasks may be PRD-only.

[workflow-state:no_task]
No active task. First classify the current turn and ask for task-creation consent.
[/workflow-state:no_task]

### Phase 1: Plan
- 1.0 Create task `[required · once]`
- 1.1 Requirement exploration `[required · repeatable]`
- 1.4 Activate task `[required · once]`

### Phase 2: Execute
- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`

### Phase 3: Finish
- 3.3 Spec update `[required · once]`
- 3.4 Commit changes `[required · once]`

### Active Task Routing

When a user request matches one of these intents inside an active task, route first.

- `[sample]:` directive-looking bracket text is ordinary Markdown, not a marker.
- [note] and [release-notes] appear mid-line and must survive as written.

{ROUTE_GROUP}
### Guardrails

- Task creation approval is not implementation approval; implementation waits for
  `task.py start` after artifact review.

### Loading Step Detail

At each step, run this to fetch detailed guidance:

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step <step>
```

### Notes

Ordinary bracket text [note] must survive, and so must a fenced block:

```text
[Code]
fenced routing sample
[/Code]
```

---

## Phase 1: Plan

Step bodies are intentionally outside the Phase Index range.
"""


class Hook:
    """A loaded hook module plus the temp HOME used while loading it."""

    def __init__(self, module, home: Path):
        self.module = module
        self.home = home


def load_hook() -> Hook:
    """Load the hook by path with HOME redirected into a temp directory."""
    home = Path(tempfile.mkdtemp(prefix="session-start-home-"))
    saved_home = os.environ.get("HOME")
    os.environ["HOME"] = str(home)
    try:
        spec = importlib.util.spec_from_file_location("session_start_hook", HOOK_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        if saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = saved_home
    return Hook(module, home)


def write_workflow(tmp_path: Path, content: str | None = FIXTURE_WORKFLOW) -> Path:
    """Create a fixture workflow.md; `None` means the file must be missing."""
    path = tmp_path / "workflow.md"
    if content is not None:
        path.write_text(content, encoding="utf-8")
    return path


def render(
    hook: Hook,
    tmp_path: Path,
    content: str | None = FIXTURE_WORKFLOW,
    platform: str | None = "claude",
) -> str:
    return hook.module._build_workflow_overview(
        write_workflow(tmp_path, content), platform=platform
    )


# ---------------------------------------------------------------------------
# Group selection happens before the marker lines are hidden
# ---------------------------------------------------------------------------

def test_should_keep_only_detected_platform_group_when_markers_present():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    # The Claude group's route survives...
    assert "dispatch `trellis-implement`" in out
    # ...the other group's route does not...
    assert "trellis-before-dev" not in out
    # ...and the marker lines themselves are hidden.
    assert "[Claude Code, Cursor]" not in out
    assert "[/Claude Code, Cursor]" not in out


def test_should_not_duplicate_the_shared_planning_route():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    assert out.count("Planning or unclear requirements -> `trellis-brainstorm`.") == 1


def test_should_keep_labeled_guidance_for_unknown_platform():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        path = write_workflow(Path(tmp))
        out = hook.module._build_workflow_overview(path, platform="unknown-host")
    # Both groups stay, each labeled, so nothing is silently guessed.
    assert "trellis-before-dev" in out
    assert "dispatch `trellis-implement`" in out


# ---------------------------------------------------------------------------
# Ordinary Markdown, bracket text, and fenced code are preserved
# ---------------------------------------------------------------------------

def test_should_not_treat_ordinary_bracket_text_as_a_platform_marker():
    hook = load_hook()
    content = (
        "### Active Task Routing\n\n"
        "- [note] and [release-notes] appear mid-line and must survive as written.\n"
        "- `[sample]:` directive-looking bracket text is ordinary Markdown.\n"
    )
    selected = hook.module._select_platform_groups(content, "Claude Code")
    assert "[note]" in selected and "[release-notes]" in selected
    assert "`[sample]:` directive-looking" in selected


def test_should_not_treat_a_bracket_only_line_without_a_close_as_a_marker():
    hook = load_hook()
    content = (
        "### Active Task Routing\n\n"
        "A bracket-only line without a close is still ordinary text:\n\n"
        "[release-notes]\n\n"
        "### Guardrails\n\n- keep gates\n"
    )
    selected = hook.module._select_platform_groups(content, "Claude Code")
    assert "[release-notes]" in selected
    assert "A bracket-only line without a close" in selected


def test_should_preserve_fenced_blocks():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    # The Phase Index fenced block is the one kept section that is fenced;
    # its fences and contents stay intact (no marker parsing inside).
    assert "```" in out
    assert "Phase 1: Plan" in out and "Phase 3: Finish" in out


def test_should_not_pair_markers_inside_a_fence():
    hook = load_hook()
    fenced = (
        "## Phase Index\n\n### Active Task Routing\n\n"
        "```text\n[Claude Code, Cursor]\n[/Claude Code, Cursor]\n```\n\n"
        "### Guardrails\n\n- keep gates\n"
    )
    selected = hook.module._select_platform_groups(fenced, "Claude Code")
    # The fenced sample survives untouched: it is not a real marker pair, so
    # nothing is selected, dropped, or hidden inside the fence.
    assert "[Claude Code, Cursor]" in selected
    assert "keep gates" in selected


def test_should_ignore_a_malformed_or_unmatched_group():
    hook = load_hook()
    malformed_close = (
        "### Active Task Routing\n\n"
        "[Claude Code, Cursor]\n"
        "- route text\n"
        "[/Some Other Tool]\n\n"
        "### Guardrails\n- keep gates\n"
    )
    nested_open = (
        "### Active Task Routing\n\n"
        "[Claude Code, Cursor]\n"
        "- outer route\n"
        "[Kilo]\n"
        "[/Kilo]\n\n"
        "### Guardrails\n- keep gates\n"
    )
    for content in (malformed_close, nested_open):
        selected = hook.module._select_platform_groups(content, "Claude Code")
        # Malformed pairs are ordinary Markdown: nothing is dropped or hidden.
        assert "[Claude Code, Cursor]" in selected
        assert "keep gates" in selected


def test_should_fall_back_to_the_local_label_table_without_scripts():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        empty_trellis = Path(tmp)  # no .trellis/scripts on disk
        for platform, expected in (
            ("claude", "Claude Code"),
            ("KimI", "Kimi Code"),
            ("omp", "Oh My Pi"),
            ("cursor", "cursor"),
        ):
            assert hook.module._effective_platform_label(platform, empty_trellis) == expected
    assert hook.module._effective_platform_label(None, Path(tmp)) is None


def test_should_namespace_codex_by_its_configured_dispatch_mode():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / ".trellis").mkdir()
        (project / ".trellis" / "workflow.md").write_text(FIXTURE_WORKFLOW, encoding="utf-8")
        trellis_dir = project / ".trellis"
        # No config at all -> the shared default, sub-agent dispatch.
        assert hook.module._effective_platform_label("codex", trellis_dir) == "codex-sub-agent"
        # Explicit inline -> the inline group, never the sub-agent group.
        (trellis_dir / "config.yaml").write_text(
            "codex:\n  dispatch_mode: inline\n", encoding="utf-8"
        )
        assert hook.module._effective_platform_label("codex", trellis_dir) == "codex-inline"
        # Explicit auto (and its legacy alias) -> sub-agent dispatch.
        (trellis_dir / "config.yaml").write_text(
            "codex:\n  dispatch_mode: sub-agent\n", encoding="utf-8"
        )
        assert hook.module._effective_platform_label("codex", trellis_dir) == "codex-sub-agent"
        # Invalid value falls back to inline so a typo cannot force dispatch.
        (trellis_dir / "config.yaml").write_text(
            "codex:\n  dispatch_mode: nonsense\n", encoding="utf-8"
        )
        assert hook.module._effective_platform_label("codex", trellis_dir) == "codex-inline"


def test_should_read_codex_mode_without_the_shared_scripts():
    """The local fallback read must match the shared parser's contract."""
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / ".trellis").mkdir()
        trellis_dir = project / ".trellis"
        config = trellis_dir / "config.yaml"
        mode = hook.module._read_codex_dispatch_mode
        assert mode(config) is None  # no file
        config.write_text("codex:\n  dispatch_mode: inline\n", encoding="utf-8")
        assert mode(config) == "inline"
        config.write_text("codex:\n  dispatch_mode: sub-agent  # legacy alias\n", encoding="utf-8")
        assert mode(config) == "sub-agent"
        config.write_text("codex:\n  dispatch_mode: inline\n\nother:\n  key: v\n", encoding="utf-8")
        assert mode(config) == "inline"
        # A dispatch_mode under a different section must not leak through.
        config.write_text("other:\n  dispatch_mode: inline\n", encoding="utf-8")
        assert mode(config) is None


def test_should_resolve_codex_mode_through_real_scripts_and_config_shapes():
    """Exercise `_codex_dispatch_mode` on a fixture with real scripts."""
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        project = minimal_project(Path(tmp))
        trellis_dir = project / ".trellis"
        mode = hook.module._codex_dispatch_mode
        assert mode(trellis_dir) == "auto"  # copied config has codex commented out
        (trellis_dir / "config.yaml").write_text("codex:\n  dispatch_mode: inline\n", encoding="utf-8")
        assert mode(trellis_dir) == "inline"
        (trellis_dir / "config.yaml").write_text("codex: nonsense\n", encoding="utf-8")
        assert mode(trellis_dir) == "inline"  # non-dict section fails safe
        (trellis_dir / "config.yaml").write_text("codex:\n  dispatch_mode: nonsense\n", encoding="utf-8")
        assert mode(trellis_dir) == "inline"


def test_should_strip_breadcrumb_tag_blocks():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    assert "[workflow-state:no_task]" not in out
    assert "First classify the current turn" not in out


# ---------------------------------------------------------------------------
# Missing / malformed / oversized sources fall back safely
# ---------------------------------------------------------------------------

def test_should_fall_back_when_workflow_file_is_missing():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp), content=None)
    assert "Phase 1" in out and "Phase 2" in out and "Phase 3" in out
    assert "consent" in out.lower()
    assert len(out) <= OVERVIEW_LIMIT


def test_should_fall_back_when_phase_index_is_absent():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp), content="# Workflow\n\nNo phase index here.\n")
    assert "Phase 1" in out and "Phase 2" in out and "Phase 3" in out
    assert len(out) <= OVERVIEW_LIMIT
    # Fallbacks ship the same gate summary as a healthy render: consent,
    # artifact review, activation, and validation.
    for needle in ("Consent", "Artifacts", "Activation", "Validation"):
        assert needle in out


def test_should_not_copy_non_allowlisted_sections():
    """The overview is a summary; triage/step prose stays on demand."""
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    assert "Request Triage" not in out
    assert "Parent / Child Task Trees" not in out
    assert "1.1 Requirement exploration" not in out


def test_should_use_the_fallback_instead_of_blind_truncation():
    """An oversized index is replaced whole, never cut mid-way."""
    hook = load_hook()
    filler = "\n".join(f"- filler line {i} describing routine detail" for i in range(400))
    padded = FIXTURE_WORKFLOW.replace("### Guardrails", f"{filler}\n\n### Guardrails")
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp), content=padded)
    assert len(out) <= OVERVIEW_LIMIT
    assert "filler line" not in out
    assert "could not be summarized safely" in out


# ---------------------------------------------------------------------------
# Length budget, measured on both fixture and repository content
# ---------------------------------------------------------------------------

def test_should_render_within_the_character_budget_for_fixture():
    hook = load_hook()
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp))
    assert len(out) <= OVERVIEW_LIMIT


def test_should_render_within_the_character_budget_for_repo_workflow():
    hook = load_hook()
    workflow = REPO_ROOT / ".trellis" / "workflow.md"
    if not workflow.is_file():  # pragma: no cover - fixture-only environments
        return
    out = hook.module._build_workflow_overview(workflow, platform="claude")
    assert len(out) <= OVERVIEW_LIMIT
    # The real repository also exercises the shared-helper path: with
    # `.trellis/scripts` present, `claude` resolves to the `Claude Code` marker
    # label and the marker lines must be hidden, not the contents.
    assert "dispatch `trellis-implement`" in out
    assert "trellis-before-dev" not in out


def test_should_skip_an_allowlisted_section_that_is_absent():
    hook = load_hook()
    without_guardrails = (
        "## Phase Index\n\n```\nPhase 1: Plan\n```\n\n"
        "### Active Task Routing\n\n- route\n\n## Phase 1: Plan\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        out = render(hook, Path(tmp), content=without_guardrails)
    assert "Phase 1: Plan" in out
    assert "Guardrails" not in out


# ---------------------------------------------------------------------------
# Surrounding contracts: disable switches, envelopes, tolerant stdin
# ---------------------------------------------------------------------------

def run_hook(input_data: dict, cwd: Path, env_overrides: dict[str, str] | None = None):
    env = dict(os.environ)
    env.pop("TRELLIS_CONTEXT_ID", None)
    env.pop("CLAUDE_ENV_FILE", None)
    env.pop("TRELLIS_HOOKS", None)
    env.pop("TRELLIS_DISABLE_HOOKS", None)
    if env_overrides:
        env.update(env_overrides)
    return subprocess.run(
        [sys.executable, str(HOOK_PATH)],
        input=json.dumps(input_data),
        capture_output=True,
        text=True,
        cwd=str(cwd),
        env=env,
        timeout=60,
    )


def minimal_project(tmp_path: Path) -> Path:
    """A fixture .trellis project: workflow.md plus the repo's own scripts.

    The scripts are copied, not imported in-process, because the hook loads
    `common.*` from `<project>/.trellis/scripts`; a fixture without them dies
    on import before reaching the contract under test.
    """
    import shutil

    (tmp_path / ".trellis").mkdir(parents=True, exist_ok=True)
    (tmp_path / ".trellis" / "workflow.md").write_text(FIXTURE_WORKFLOW, encoding="utf-8")
    shutil.copytree(REPO_ROOT / ".trellis" / "scripts", tmp_path / ".trellis" / "scripts")
    config = REPO_ROOT / ".trellis" / "config.yaml"
    if config.is_file():
        shutil.copy2(config, tmp_path / ".trellis" / "config.yaml")
    return tmp_path


def test_should_exit_silently_when_hooks_are_disabled():
    with tempfile.TemporaryDirectory() as tmp:
        project = minimal_project(Path(tmp))
        result = run_hook({"cwd": str(project)}, project, {"TRELLIS_HOOKS": "0"})
    assert result.returncode == 0
    assert result.stdout.strip() == ""


def test_should_emit_claude_envelope_with_bounded_overview():
    with tempfile.TemporaryDirectory() as tmp:
        project = minimal_project(Path(tmp))
        result = run_hook({"cwd": str(project)}, project)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    context = payload["hookSpecificOutput"]["additionalContext"]
    assert "Phase 1" in context
    start = context.index("<trellis-workflow>")
    end = context.index("</trellis-workflow>")
    overview = context[start:end]
    assert len(overview) <= OVERVIEW_LIMIT + len("<trellis-workflow>\n\n")


def test_should_tolerate_invalid_stdin_json():
    with tempfile.TemporaryDirectory() as tmp:
        project = minimal_project(Path(tmp))
        env = dict(os.environ)
        env.pop("TRELLIS_CONTEXT_ID", None)
        env.pop("CLAUDE_ENV_FILE", None)
        result = subprocess.run(
            [sys.executable, str(HOOK_PATH)],
            input="{not json",
            capture_output=True,
            text=True,
            cwd=str(project),
            env=env,
            timeout=60,
        )
    assert result.returncode == 0


def test_should_measure_total_session_context_separately():
    """Report the whole additionalContext, not only the overview slice."""
    with tempfile.TemporaryDirectory() as tmp:
        project = minimal_project(Path(tmp))
        result = run_hook({"cwd": str(project)}, project)
    payload = json.loads(result.stdout)
    context = payload["hookSpecificOutput"]["additionalContext"]
    assert len(context) > 0
    # The overview is the part under test; the rest is repository state.
    start = context.index("<trellis-workflow>")
    end = context.index("</trellis-workflow>")
    assert (end - start) <= OVERVIEW_LIMIT + 32
