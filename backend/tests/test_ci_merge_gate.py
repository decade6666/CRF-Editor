"""CI 合并门禁契约测试：读取 .github/workflows 下的 YAML，锁定 merge-owner-pr 的合并语义。

This test runs inside the "Backend tests" CI job, so the gate checks its own
configuration. YAML 1.1 parses the top-level key ``on`` as boolean ``True``.
"""

import re
from pathlib import Path

import yaml

WORKFLOWS_DIR = Path(__file__).resolve().parents[2] / ".github" / "workflows"
CI_FILE = WORKFLOWS_DIR / "ci.yml"
OLD_AUTO_MERGE_FILE = WORKFLOWS_DIR / "auto-merge-draft-to-main.yml"

MERGE_JOB_ID = "merge-owner-pr"
KNOWN_CI_JOBS = {
    "backend-tests",
    "frontend-tests",
    "frontend-lint",
    "frontend-build",
}
MERGE_JOB_IF_CLAUSES = (
    "github.event_name == 'pull_request'",
    "github.event.pull_request.user.login == 'decade6666'",
    "github.event.pull_request.base.ref == 'main'",
    "github.event.pull_request.head.repo.full_name == github.repository",
    "github.event.pull_request.draft == false",
)


def _load_ci_workflow():
    with CI_FILE.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def _merge_job(ci=None):
    ci = ci if ci is not None else _load_ci_workflow()
    return ci["jobs"][MERGE_JOB_ID]


def _job_steps(job):
    return job.get("steps", [])


def _step_by_name(job, keyword):
    for step in _job_steps(job):
        if keyword.lower() in str(step.get("name", "")).lower():
            return step
    raise AssertionError(f"no step whose name contains {keyword!r}")


def test_old_auto_merge_workflow_is_removed():
    assert not OLD_AUTO_MERGE_FILE.exists()


def test_no_workflow_enables_auto_merge():
    for workflow_file in sorted(WORKFLOWS_DIR.glob("*.yml")):
        # Join shell line continuations so a split `gh pr merge \` + `--auto` is still caught.
        text = re.sub(r"\\\n\s*", " ", workflow_file.read_text(encoding="utf-8"))
        assert not re.search(r"gh pr merge[^\n]*--auto\b", text), (
            f"{workflow_file.name} must not use `gh pr merge --auto`"
        )


def test_ci_pull_request_trigger_targets_main_only():
    ci = _load_ci_workflow()
    triggers = ci.get("on", ci.get(True))

    assert triggers["pull_request"]["branches"] == ["main"]


def test_ci_pull_request_trigger_types_cover_pr_lifecycle():
    ci = _load_ci_workflow()
    triggers = ci.get("on", ci.get(True))

    assert set(triggers["pull_request"]["types"]) >= {
        "opened",
        "reopened",
        "synchronize",
        "ready_for_review",
    }


def test_ci_concurrency_groups_by_pr_number_and_cancels_stale_runs():
    ci = _load_ci_workflow()
    concurrency = ci["concurrency"]

    assert "github.event.pull_request.number" in concurrency["group"]
    assert concurrency["cancel-in-progress"] is True


def test_ci_concurrency_gives_push_runs_their_own_group():
    concurrency = _load_ci_workflow()["concurrency"]

    # Without the run_id fallback every push run shares one group and cancels the previous one.
    assert "|| github.run_id" in concurrency["group"]


def test_merge_job_needs_every_other_ci_job():
    ci = _load_ci_workflow()
    other_jobs = set(ci["jobs"]) - {MERGE_JOB_ID}

    assert set(_merge_job(ci)["needs"]) == other_jobs
    assert other_jobs == KNOWN_CI_JOBS


def test_merge_job_if_holds_every_qualifying_condition():
    if_condition = str(_merge_job()["if"])
    normalized = re.sub(r"\s+", " ", if_condition)

    for clause in MERGE_JOB_IF_CLAUSES:
        assert clause in normalized, f"missing qualifying clause: {clause}"


def test_merge_job_if_uses_no_status_function():
    if_condition = str(_merge_job()["if"])

    for status_function in ("always(", "failure(", "cancelled("):
        assert status_function not in if_condition, (
            f"status function {status_function} would break the implicit success() gate"
        )


def test_merge_job_permissions_are_exactly_the_write_scope_needed():
    permissions = _merge_job()["permissions"]

    assert permissions == {
        "contents": "write",
        "pull-requests": "write",
        "checks": "read",
    }


def test_workflow_permissions_stay_read_only():
    ci = _load_ci_workflow()

    assert ci["permissions"] == {"contents": "read"}


def test_test_jobs_declare_no_extra_permissions():
    ci = _load_ci_workflow()

    for job_id in KNOWN_CI_JOBS:
        assert "permissions" not in ci["jobs"][job_id], (
            f"{job_id} must inherit the workflow-level contents: read"
        )


def test_gitleaks_wait_step_runs_before_the_merge_step():
    steps = _job_steps(_merge_job())

    wait_index = next(
        index
        for index, step in enumerate(steps)
        if "gitleaks" in str(step.get("name", "")).lower()
    )
    merge_index = next(
        index
        for index, step in enumerate(steps)
        if "merge" in str(step.get("name", "")).lower()
    )

    assert wait_index < merge_index


def test_gitleaks_wait_polls_named_check_on_the_pr_head():
    job = _merge_job()
    wait_step = _step_by_name(job, "gitleaks")
    wait_script = wait_step["run"]

    assert "commits/$HEAD_SHA/check-runs?check_name=gitleaks" in wait_script
    assert wait_step["env"]["HEAD_SHA"] == "${{ github.event.pull_request.head.sha }}"


def test_gitleaks_wait_is_bounded_by_a_deadline():
    wait_script = _step_by_name(_merge_job(), "gitleaks")["run"]

    assert "deadline=$((SECONDS + 600))" in wait_script


def test_gitleaks_wait_fails_closed_when_check_fails():
    wait_script = _step_by_name(_merge_job(), "gitleaks")["run"]

    assert "failure)" in wait_script
    assert "::error::gitleaks did not pass" in wait_script
    assert "exit 1" in wait_script


def test_gitleaks_wait_fails_closed_on_timeout():
    wait_script = _step_by_name(_merge_job(), "gitleaks")["run"]

    assert "::error::Timed out waiting for gitleaks" in wait_script
    assert "exit 1" in wait_script


def test_gitleaks_wait_retries_when_the_status_query_fails():
    wait_script = _step_by_name(_merge_job(), "gitleaks")["run"]

    # A transient API error keeps polling under the deadline and is never read as success.
    assert "if ! state=$(gh api" in wait_script
    assert "::warning::Could not read gitleaks check runs" in wait_script
    assert "state=query-failed" in wait_script


def test_merge_step_uses_merge_commit_pinned_to_pr_head():
    merge_script = _step_by_name(_merge_job(), "merge")["run"]
    normalized = " ".join(merge_script.split())

    assert normalized == (
        'gh pr merge "$PR_URL" --merge --match-head-commit "$HEAD_SHA"'
    )
    assert "--auto" not in normalized


def test_merge_step_head_sha_env_targets_the_pr_head():
    merge_step = _step_by_name(_merge_job(), "merge")

    assert merge_step["env"]["HEAD_SHA"] == "${{ github.event.pull_request.head.sha }}"


def test_merge_job_scripts_pass_values_via_env_only():
    for step in _job_steps(_merge_job()):
        if "run" in step:
            assert "${{" not in step["run"], (
                f"step {step.get('name')!r} must not inline expressions in run:"
            )
