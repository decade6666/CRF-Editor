"""weekly-release workflow 装配契约测试：解析真实 workflow YAML，断言触发/权限/密钥边界。

这些是静态装配测试，不等于真实 GitHub 定时运行验证；首次真实运行属于另行授权的操作。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

WORKFLOW_PATH = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "weekly-release.yml"
GITLEAKS_VERSION = "8.30.1"
GITLEAKS_SHA256 = "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
_ALLOWED_ACTIONS = {
    "actions/checkout",
    "actions/setup-python",
    "actions/setup-node",
    "actions/upload-artifact",
    "actions/download-artifact",
}


@pytest.fixture(scope="module")
def workflow() -> dict:
    raw = WORKFLOW_PATH.read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    assert isinstance(data, dict), "workflow 必须是合法 YAML 映射"
    return data


@pytest.fixture(scope="module")
def workflow_raw() -> str:
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def jobs(workflow: dict) -> dict:
    return workflow["jobs"]


def run_blocks(job: dict) -> list[str]:
    blocks = []
    for step in job.get("steps", []):
        script = step.get("run")
        if script:
            blocks.append(script)
    return blocks


def checkout_steps(job: dict) -> list[dict]:
    return [s for s in job.get("steps", []) if str(s.get("uses", "")).startswith("actions/checkout")]


# ---------------------------------------------------------------------------
# 触发与模式（AC1）
# ---------------------------------------------------------------------------


def test_only_schedule_and_dispatch_triggers(workflow: dict) -> None:
    on = workflow[True] if True in workflow else workflow.get("on")
    assert on is not None, "缺少触发器定义"
    assert set(on) == {"schedule", "workflow_dispatch"}


def test_weekly_cron_at_0117_utc(workflow: dict, workflow_raw: str) -> None:
    on = workflow[True] if True in workflow else workflow.get("on")
    crons = [item["cron"] for item in on["schedule"]]
    assert crons == ["17 1 * * 1"]
    assert "北京时间" in workflow_raw, "必须书面注明对应北京时间"


def test_manual_dispatch_dry_run_defaults_true(workflow: dict) -> None:
    on = workflow[True] if True in workflow else workflow.get("on")
    dry_run = on["workflow_dispatch"]["inputs"]["dry_run"]
    assert dry_run["default"] is True


def test_fixed_concurrency_group_without_cancellation(workflow: dict) -> None:
    concurrency = workflow["concurrency"]
    assert concurrency["group"] == "weekly-release"
    assert concurrency["cancel-in-progress"] is False


# ---------------------------------------------------------------------------
# 权限与信任边界（AC4）
# ---------------------------------------------------------------------------


def test_top_level_permissions_read_only(workflow: dict) -> None:
    assert workflow["permissions"] == {"contents": "read"}


def test_only_publish_job_has_contents_write(workflow: dict) -> None:
    for name, job in jobs(workflow).items():
        perms = job.get("permissions")
        if name == "publish":
            assert perms["contents"] == "write"
        else:
            assert (perms or {}).get("contents") != "write"


def test_no_pull_request_target(workflow_raw: str) -> None:
    assert "pull_request_target" not in workflow_raw


def test_all_uses_are_sha_pinned_official_actions(workflow: dict) -> None:
    for name, job in jobs(workflow).items():
        for step in job.get("steps", []):
            uses = step.get("uses")
            if not uses:
                continue
            action, _, ref = uses.partition("@")
            assert action in _ALLOWED_ACTIONS, f"{name}: 未知 action {action}"
            assert re.fullmatch(r"[0-9a-f]{40}", ref.strip()), f"{name}: {uses} 必须以 40 位 commit SHA 固定"


def test_gitleaks_pinned_version_with_checksum(workflow_raw: str) -> None:
    assert f"gitleaks_{GITLEAKS_VERSION}_linux_x64.tar.gz" in workflow_raw
    assert GITLEAKS_SHA256 in workflow_raw


def test_untrusted_values_never_interpolated_into_shell(workflow: dict) -> None:
    for name, job in jobs(workflow).items():
        for index, block in enumerate(run_blocks(job)):
            assert "${{" not in block, f"{name} 第 {index} 个 run 块直接内插了表达式，必须走 env 间接引用"


def test_trusted_main_guard_is_first_inspect_step(workflow: dict) -> None:
    inspect = jobs(workflow)["inspect"]
    steps = inspect["steps"]
    guard = steps[0]
    assert guard.get("id") == "guards"
    guard_script = guard["run"]
    assert "GIT_REF" in guard_script and "refs/heads/main" in guard_script
    assert guard.get("env", {}).get("GIT_REF") == "${{ github.ref }}"


def test_enabled_flag_guard_skips_schedule_before_ai(workflow: dict) -> None:
    guard = jobs(workflow)["inspect"]["steps"][0]["run"]
    assert "WEEKLY_RELEASE_ENABLED" in guard
    assert "mode=skip" in guard


def test_api_key_only_referenced_in_inspect_job(workflow: dict) -> None:
    for name, job in jobs(workflow).items():
        dumped = yaml.safe_dump(job, allow_unicode=True)
        if name == "inspect":
            assert "RELEASE_AI_API_KEY" in dumped
        else:
            assert "RELEASE_AI_API_KEY" not in dumped, f"{name} 不得接触 AI 密钥"


def test_checkouts_in_inspect_and_validate_do_not_persist_credentials(workflow: dict) -> None:
    for name in ("inspect", "validate"):
        for step in checkout_steps(jobs(workflow)[name]):
            assert step["with"]["persist-credentials"] is False


def test_run_token_scoping_matches_read_and_write_needs(workflow: dict) -> None:
    # inspect 需要只读令牌（gh release list + git fetch），publish 需要写令牌；
    # validate 只有待恢复路径的 verify-pending 步骤允许只读令牌，常规验证路径全程无令牌。
    inspect_plan = next(s for s in jobs(workflow)["inspect"]["steps"] if s.get("id") == "plan")
    assert inspect_plan["env"]["GH_TOKEN"] == "${{ github.token }}"
    assert "gh auth setup-git" in (inspect_plan.get("run") or "")
    publish = jobs(workflow)["publish"]
    assert any(step.get("env", {}).get("GH_TOKEN") == "${{ github.token }}" for step in publish["steps"])
    validate = jobs(workflow)["validate"]
    token_steps = [s for s in validate["steps"] if (s.get("env") or {}).get("GH_TOKEN")]
    assert token_steps, "validate 的待恢复路径需要只读令牌（verify-pending 依赖 gh 与 git fetch）"
    for step in token_steps:
        assert step.get("if") == "env.PENDING_TAG != ''", "validate 中令牌只能出现在待恢复路径步骤"
        assert "verify-pending" in (step.get("run") or "")


# ---------------------------------------------------------------------------
# 作业装配（AC1/AC5/AC6）
# ---------------------------------------------------------------------------


def test_jobs_chain_inspect_validate_publish(workflow: dict) -> None:
    def as_list(value: object) -> list[object]:
        return value if isinstance(value, list) else [value]

    names = set(jobs(workflow))
    assert {"inspect", "validate", "publish"} <= names
    assert set(as_list(jobs(workflow)["validate"]["needs"])) == {"inspect"}
    assert set(as_list(jobs(workflow)["publish"]["needs"])) == {"inspect", "validate"}


def test_dry_run_never_reaches_publish(workflow: dict) -> None:
    publish_if = jobs(workflow)["publish"]["if"]
    assert "mode == 'publish'" in publish_if


def test_no_change_skips_downstream_jobs(workflow: dict) -> None:
    for name in ("validate", "publish"):
        assert "no_change" in jobs(workflow)[name]["if"], f"{name} 必须在无净变更时跳过"


def test_plan_artifact_is_the_only_upload(workflow: dict) -> None:
    uploads = [
        step
        for job in jobs(workflow).values()
        for step in job.get("steps", [])
        if str(step.get("uses", "")).startswith("actions/upload-artifact")
    ]
    assert len(uploads) == 1
    assert uploads[0]["with"]["path"] == "release-plan.json"


def test_runner_versions(workflow: dict) -> None:
    python_versions, node_versions = [], []
    for job in jobs(workflow).values():
        for step in job.get("steps", []):
            uses = str(step.get("uses", ""))
            if uses.startswith("actions/setup-python"):
                python_versions.append(step["with"]["python-version"])
            if uses.startswith("actions/setup-node"):
                node_versions.append(step["with"]["node-version"])
    assert python_versions and all(v == "3.11" for v in python_versions)
    assert node_versions and all(v == "24" for v in node_versions)


def test_validate_runs_full_gates_and_binds_tree(workflow: dict) -> None:
    script = "\n".join(run_blocks(jobs(workflow)["validate"]))
    assert "bump-versions" in script
    assert "tree-hash" in script
    assert "pytest" in script
    assert "--cov-fail-under=80" in script, "发布模块覆盖率门禁必须在验证作业中执行"
    assert "ruff format --check" in script
    assert "npm test" in script
    assert "npm run lint" in script
    assert "npm run build" in script
    assert "gitleaks_8.30.1_linux_x64.tar.gz" in script, "validate 作业须安装 gitleaks（真实扫描器集成用例依赖）"


def test_frontend_build_uses_root_base(workflow_raw: str) -> None:
    assert "VITE_BASE_PATH: /" in workflow_raw


def test_publish_invokes_cli_and_never_inline_release_creation(workflow: dict, workflow_raw: str) -> None:
    script = "\n".join(run_blocks(jobs(workflow)["publish"]))
    assert "weekly_release.py publish" in script
    assert "--plan-file" in script
    assert "gh release create" not in workflow_raw, "Release 创建必须走 CLI（--verify-tag + notes 文件）"


def test_publish_passes_weekly_release_enabled_to_cli(workflow: dict) -> None:
    publish = jobs(workflow)["publish"]
    publish_step = next(s for s in publish["steps"] if "weekly_release.py publish" in (s.get("run") or ""))
    assert publish_step.get("env", {}).get("WEEKLY_RELEASE_ENABLED") == "${{ vars.WEEKLY_RELEASE_ENABLED }}", (
        "publish 步骤必须显式传递 WEEKLY_RELEASE_ENABLED 环境变量，供 CLI 进行独立开关校验"
    )


def test_validate_and_publish_checkout_pinned_source(workflow: dict) -> None:
    for name in ("validate", "publish"):
        steps = checkout_steps(jobs(workflow)[name])
        assert len(steps) == 1
        ref = str(steps[0]["with"]["ref"])
        assert "PENDING_TAG" in ref, f"{name}: 待恢复路径必须可检出该版本标签"
        assert "github.sha" in ref, f"{name}: 常规路径必须固定在运行源码 SHA"


def test_all_checkouts_fetch_full_history_and_tags(workflow: dict) -> None:
    # 浅克隆无法解析基线标签（如 0.4.0）、无法计算跨版本差异与提交主题。
    for name, job in jobs(workflow).items():
        steps = checkout_steps(job)
        assert len(steps) == 1, f"{name}: 应恰好一次 checkout"
        opts = steps[0]["with"]
        assert opts["fetch-depth"] == 0, f"{name}: 必须拉全量历史"
        assert opts["fetch-tags"] is True, f"{name}: 必须拉取标签"


def test_pending_recovery_is_wired_end_to_end(workflow: dict) -> None:
    inspect = jobs(workflow)["inspect"]
    assert "pending_tag" in inspect.get("outputs", {})
    validate = jobs(workflow)["validate"]
    publish = jobs(workflow)["publish"]
    assert "pending_tag" in str(validate.get("if")), "validate 必须在待恢复路径上验证该标签"
    assert "pending_tag" in str(publish.get("if")), "publish 必须能走待恢复补建路径"
    validate_script = "\n".join(run_blocks(validate))
    assert "verify-pending" in validate_script, "validate 必须只读校验待恢复信封"
    publish_script = "\n".join(run_blocks(publish))
    assert "recover" in publish_script and "--tag" in publish_script, "publish 必须调用 CLI recover 补建 Release"
    assert inspect["outputs"]["pending_tag"] == "${{ steps.plan.outputs.pending_tag }}"


def test_all_jobs_have_timeout(workflow: dict) -> None:
    for name, job in jobs(workflow).items():
        assert "timeout-minutes" in job, f"{name} 作业缺少超时上限"
