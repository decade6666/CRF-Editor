"""weekly_release 单元测试：版本算术、配置校验、净变更判定、AI 载荷/决策、密钥扫描。

这些测试只覆盖纯逻辑与可注入边界的 HTTP/扫描行为；Git 事务与 workflow 装配
分别在 test_weekly_release_git.py / test_weekly_release_workflow.py 中验证。
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

import httpx
import pytest

import scripts.weekly_release as wr

REPO_CONFIG = Path(__file__).resolve().parents[2] / ".gitleaks.toml"

VALID_CONFIG_ENV = {
    "RELEASE_AI_API_URL": "https://ai.example.com/v1",
    "RELEASE_AI_MODEL": "test-model",
    "RELEASE_AI_API_FORMAT": "openai",
    "RELEASE_AI_API_KEY": "test-key",
}


def make_config(**overrides: str) -> wr.ReleaseAIConfig:
    env = dict(VALID_CONFIG_ENV)
    env.update(overrides)
    for key, value in list(env.items()):
        if value is None:
            env.pop(key)
    return wr.load_release_config(env)


def make_entry(status: str, path: str, **overrides: object) -> wr.DiffEntry:
    kwargs: dict[str, object] = {
        "old_path": path,
        "new_path": None,
        "old_blob": "aaa",
        "new_blob": "bbb",
        "insertions": 1,
        "deletions": 0,
    }
    kwargs.update(overrides)
    return wr.DiffEntry(status=status, **kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 版本算术（AC3）
# ---------------------------------------------------------------------------


def test_should_parse_three_part_version() -> None:
    assert wr.parse_version("0.4.0") == wr.Version(0, 4, 0)
    assert wr.parse_version("0.4.10") == wr.Version(0, 4, 10)


@pytest.mark.parametrize(
    "raw",
    ["0.4", "0.4.0.1", "v0.4.0", "0.4.x", "-1.0.0", "", "01.4.0", "0.4.0-beta"],
)
def test_should_reject_malformed_versions(raw: str) -> None:
    with pytest.raises(wr.ReleaseError):
        wr.parse_version(raw)


def test_should_bump_minor_and_reset_patch() -> None:
    assert wr.bump_version(wr.Version(0, 4, 0), "minor") == wr.Version(0, 5, 0)
    assert wr.bump_version(wr.Version(0, 4, 9), "minor") == wr.Version(0, 5, 0)


def test_should_bump_patch_with_integer_carry() -> None:
    assert wr.bump_version(wr.Version(0, 4, 0), "patch") == wr.Version(0, 4, 1)
    assert wr.bump_version(wr.Version(0, 4, 9), "patch") == wr.Version(0, 4, 10)


def test_should_reject_major_bump() -> None:
    with pytest.raises(wr.ReleaseError):
        wr.bump_version(wr.Version(0, 4, 0), "major")


# ---------------------------------------------------------------------------
# 清单版本同步（AC3）
# ---------------------------------------------------------------------------


PACKAGE_JSON = json.dumps({"name": "crf-editor", "version": "0.4.0", "private": True})
PACKAGE_LOCK = json.dumps(
    {
        "name": "crf-editor",
        "version": "0.4.0",
        "lockfileVersion": 3,
        "packages": {"": {"name": "crf-editor", "version": "0.4.0"}},
    }
)


def test_should_bump_exactly_three_version_fields() -> None:
    pkg, lock = wr.bump_manifests(PACKAGE_JSON, PACKAGE_LOCK, wr.Version(0, 5, 0))
    assert json.loads(pkg)["version"] == "0.5.0"
    lock_data = json.loads(lock)
    assert lock_data["version"] == "0.5.0"
    assert lock_data["packages"][""]["version"] == "0.5.0"
    assert lock_data["lockfileVersion"] == 3


def test_should_keep_non_version_manifest_content_unchanged() -> None:
    pkg, lock = wr.bump_manifests(PACKAGE_JSON, PACKAGE_LOCK, wr.Version(0, 4, 1))
    assert wr.is_version_only_manifest_change(PACKAGE_JSON, pkg)
    assert wr.is_version_only_manifest_change(PACKAGE_LOCK, lock)
    assert not wr.is_version_only_manifest_change(PACKAGE_JSON, json.dumps({"version": "0.4.0"}))


def test_version_only_manifest_detection_distinguishes_dependency_changes() -> None:
    changed = json.loads(PACKAGE_JSON)
    changed["dependencies"] = {"vue": "^3.5.0"}
    assert not wr.is_version_only_manifest_change(PACKAGE_JSON, json.dumps(changed))


# ---------------------------------------------------------------------------
# 配置校验（AC4）
# ---------------------------------------------------------------------------


def test_should_load_full_config_from_env() -> None:
    config = make_config()
    assert config.api_url == "https://ai.example.com/v1"
    assert config.model == "test-model"
    assert config.api_format == "openai"
    assert config.timeout_seconds == 60
    assert config.api_key == "test-key"


def test_should_default_format_and_timeout() -> None:
    env = dict(VALID_CONFIG_ENV)
    env.pop("RELEASE_AI_API_FORMAT")
    config = wr.load_release_config(env)
    assert config.api_format == "openai"
    assert config.timeout_seconds == 60


@pytest.mark.parametrize(
    "missing",
    ["RELEASE_AI_API_URL", "RELEASE_AI_MODEL", "RELEASE_AI_API_KEY"],
)
def test_should_name_missing_required_variables(missing: str) -> None:
    env = dict(VALID_CONFIG_ENV)
    env.pop(missing)
    with pytest.raises(wr.ConfigError, match=missing):
        wr.load_release_config(env)


def test_should_reject_non_https_base_url() -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_API_URL="http://ai.example.com/v1")


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pass@ai.example.com/v1",
        "https://ai.example.com/v1?token=abc",
    ],
)
def test_should_reject_embedded_credentials_or_query(url: str) -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_API_URL=url)


@pytest.mark.parametrize(
    "url",
    ["https://ai.example.com/v1/chat/completions", "https://ai.example.com/v1/messages"],
)
def test_should_reject_already_suffixed_url(url: str) -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_API_URL=url)


def test_should_reject_bad_format_enum() -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_API_FORMAT="gemini")


@pytest.mark.parametrize("value", ["0", "-5", "abc", "601"])
def test_should_reject_invalid_timeout(value: str) -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_TIMEOUT_SECONDS=value)


def test_should_reject_blank_model() -> None:
    with pytest.raises(wr.ConfigError):
        make_config(RELEASE_AI_MODEL="   ")


# ---------------------------------------------------------------------------
# 净产品变更判定（AC2）
# ---------------------------------------------------------------------------


def always_loader(sha: str) -> str:
    return {"aaa": PACKAGE_JSON, "bbb": PACKAGE_JSON}.get(sha, "")


def test_runtime_code_change_is_eligible() -> None:
    result = wr.classify_entries([make_entry("M", "backend/src/services/x.py")], always_loader)
    assert len(result.eligible) == 1
    assert result.eligible[0].ai_diff_allowed


@pytest.mark.parametrize(
    "path",
    [
        "README.md",
        "docs/setup.md",
        "backend/tests/test_x.py",
        "frontend/tests/a.spec.js",
        ".trellis/spec/guides/x.md",
        ".context/history/commits.md",
        ".claude/index.json",
        ".github/workflows/weekly-release.yml",
        ".githooks/pre-commit",
        "frontend/scripts/generatePlannerFixtures.mjs",
        "backend/scripts/weekly_release.py",
    ],
)
def test_non_product_only_changes_are_ignored(path: str) -> None:
    result = wr.classify_entries([make_entry("M", path)], always_loader)
    assert result.eligible == []
    assert result.ignored[0].path == path


def test_mixed_change_reports_only_eligible_subset() -> None:
    entries = [
        make_entry("M", "README.md"),
        make_entry("M", "backend/src/services/x.py"),
    ]
    result = wr.classify_entries(entries, always_loader)
    assert [c.path for c in result.eligible] == ["backend/src/services/x.py"]


def test_rename_reports_new_path_for_runtime_code() -> None:
    entry = make_entry("R100", "backend/src/services/old.py", new_path="backend/src/services/new.py")
    result = wr.classify_entries([entry], always_loader)
    assert [c.path for c in result.eligible] == ["backend/src/services/new.py"]


def test_rename_into_docs_is_ignored() -> None:
    entry = make_entry("R100", "backend/src/services/x.py", new_path="docs/x.md")
    result = wr.classify_entries([entry], always_loader)
    assert result.eligible == []


def test_deletion_of_runtime_file_is_eligible() -> None:
    result = wr.classify_entries([make_entry("D", "backend/src/services/x.py", new_blob=None)], always_loader)
    assert len(result.eligible) == 1
    assert result.eligible[0].status == "D"


def test_config_examples_are_eligible_but_excluded_from_ai_diff() -> None:
    entries = [
        make_entry("M", ".env.example"),
        make_entry("M", "deploy/crf-editor.env.example"),
        make_entry("M", "config.yaml.example"),
    ]
    result = wr.classify_entries(entries, always_loader)
    assert len(result.eligible) == 3
    assert all(not c.ai_diff_allowed for c in result.eligible)


@pytest.mark.parametrize(
    "path",
    [".env", "config.yaml", "data.db", "uploads/form.png", "secrets/key.pem"],
)
def test_denied_paths_are_never_eligible(path: str) -> None:
    result = wr.classify_entries([make_entry("M", path)], always_loader)
    assert result.eligible == []


def test_version_only_manifest_change_is_ignored() -> None:
    bumped_pkg = json.dumps({"name": "crf-editor", "version": "0.5.0", "private": True})
    loader = lambda sha: {"aaa": PACKAGE_JSON, "bbb": bumped_pkg}[sha]  # noqa: E731
    result = wr.classify_entries([make_entry("M", "frontend/package.json")], loader)
    assert result.eligible == []
    assert result.ignored[0].reason


def test_manifest_dependency_change_is_eligible() -> None:
    changed = json.loads(PACKAGE_JSON)
    changed["dependencies"] = {"vue": "^3.5.0"}
    loader = lambda sha: {"aaa": PACKAGE_JSON, "bbb": json.dumps(changed)}[sha]  # noqa: E731
    result = wr.classify_entries([make_entry("M", "frontend/package.json")], loader)
    assert len(result.eligible) == 1
    assert result.eligible[0].ai_diff_allowed


def test_empty_diff_has_no_eligible_changes() -> None:
    result = wr.classify_entries([], always_loader)
    assert result.eligible == []
    assert not wr.has_eligible_changes(result)


# ---------------------------------------------------------------------------
# AI 载荷构造（AC4）
# ---------------------------------------------------------------------------


def _eligible_change(path: str = "backend/src/services/x.py") -> wr.FileChange:
    return wr.FileChange(
        status="M",
        path=path,
        old_path=None,
        insertions=2,
        deletions=1,
        ai_diff_allowed=True,
        category="runtime",
    )


def _build(changes: list[wr.FileChange] | None = None, **kwargs: object) -> str:
    defaults: dict[str, object] = {
        "baseline_tag": "0.4.0",
        "candidate_sha": "abc1234def5678",
        "changes": changes if changes is not None else [_eligible_change()],
        "commit_subjects": ["fix(backend): 修复导出空值"],
        "diff_provider": lambda change: f"--- a/{change.path}\n+++ b/{change.path}\n@@ -1 +1 @@\n-a\n+b\n",
    }
    defaults.update(kwargs)
    return wr.build_ai_request(**defaults)  # type: ignore[arg-type]


def test_payload_contains_summary_and_diff() -> None:
    payload = _build()
    assert "fix(backend): 修复导出空值" in payload
    assert "backend/src/services/x.py" in payload
    assert "+b" in payload
    assert "0.4.0" in payload


def test_payload_omits_author_identity_fields() -> None:
    payload = _build(commit_subjects=["fix(backend): 修复问题"])
    assert "Author" not in payload
    assert "<" not in payload.split("## 源码差异")[0].split("### 提交主题")[1]


def test_payload_truncates_large_file_diff_with_marker() -> None:
    big_diff = "x" * (wr.PER_FILE_DIFF_BUDGET + 100)

    def provider(change: wr.FileChange) -> str:
        return big_diff

    payload = _build(diff_provider=provider)
    assert "[TRUNCATED]" in payload
    assert len(payload.encode("utf-8")) <= wr.TOTAL_BUDGET


def test_payload_enforces_total_diff_budget_and_lists_omitted() -> None:
    big = "y" * (wr.PER_FILE_DIFF_BUDGET + 10)
    changes = [_eligible_change(f"backend/src/services/{i}.py") for i in range(40)]

    def provider(change: wr.FileChange) -> str:
        return big

    payload = _build(changes=changes, diff_provider=provider)
    assert len(payload.encode("utf-8")) <= wr.TOTAL_BUDGET
    assert "未包含差异" in payload


def test_payload_rejects_when_summary_alone_exceeds_budget() -> None:
    huge_subjects = ["fix: " + "长" * 200 for _ in range(300)]
    with pytest.raises(wr.PayloadError):
        _build(commit_subjects=huge_subjects)


def test_payload_is_deterministic() -> None:
    changes = [_eligible_change("backend/src/services/b.py"), _eligible_change("backend/src/services/a.py")]
    assert _build(changes=list(changes)) == _build(changes=list(changes))


def test_payload_lists_summary_only_files() -> None:
    config_change = wr.FileChange(
        status="M",
        path=".env.example",
        old_path=None,
        insertions=1,
        deletions=0,
        ai_diff_allowed=False,
        category="config_example",
    )
    payload = _build(changes=[_eligible_change(), config_change])
    assert "仅摘要" in payload or "summary only" in payload


# ---------------------------------------------------------------------------
# AI 决策解析（AC4）
# ---------------------------------------------------------------------------


def decision_json(**overrides: object) -> str:
    data: dict[str, object] = {
        "bump": "minor",
        "rationale": "包含新功能与修复",
        "notes_zh": "## 更新\n- 新增导出能力",
        "sufficient_context": True,
        "breaking_change": False,
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


def test_should_parse_valid_decision() -> None:
    decision = wr.parse_decision(decision_json())
    assert decision.bump == "minor"
    assert decision.sufficient_context is True
    assert decision.breaking_change is False


def test_should_reject_fenced_json() -> None:
    fenced = "```json\n" + decision_json() + "\n```"
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(fenced)


def test_should_reject_multiple_json_values() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json() + "\n" + decision_json())


def test_should_reject_extra_fields() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(suggested_version="0.9.0"))


def test_should_reject_invalid_bump_enum() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(bump="major"))


def test_should_reject_wrong_bool_types() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(sufficient_context=1))


def test_should_reject_oversized_rationale() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(rationale="r" * 1025))


def test_should_reject_oversized_notes() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(notes_zh="n" * 8193))


def test_should_reject_unsafe_control_chars() -> None:
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(decision_json(notes_zh="bad\x07note"))


def test_insufficient_context_blocks_publication() -> None:
    decision = wr.parse_decision(decision_json(sufficient_context=False))
    assert not wr.decision_allows_publication(decision)


def test_breaking_change_blocks_publication() -> None:
    decision = wr.parse_decision(decision_json(breaking_change=True))
    assert not wr.decision_allows_publication(decision)


def test_normal_decision_allows_publication() -> None:
    assert wr.decision_allows_publication(wr.parse_decision(decision_json()))


# ---------------------------------------------------------------------------
# HTTP 适配（AC4）：全部使用 MockTransport，无真实网络
# ---------------------------------------------------------------------------


def openai_handler_builder(responses: list[httpx.Response], captured: list[httpx.Request]) -> httpx.MockTransport:
    state = {"calls": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        index = min(state["calls"], len(responses) - 1)
        state["calls"] += 1
        return responses[index]

    return httpx.MockTransport(handler)


def test_openai_request_shape_and_parse() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": decision_json()}}]},
        )

    config = make_config()
    text = wr.request_ai_decision(config, "prompt-body", transport=httpx.MockTransport(handler))
    assert wr.parse_decision(text).bump == "minor"
    assert captured[0].url.path.endswith("/chat/completions")
    assert captured[0].headers["Authorization"] == "Bearer test-key"
    body = json.loads(captured[0].content)
    assert body["model"] == "test-model"
    assert body["messages"][-1]["content"] == "prompt-body"


def test_anthropic_request_shape_and_parse() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"content": [{"type": "text", "text": decision_json()}]})

    config = make_config(RELEASE_AI_API_FORMAT="anthropic")
    text = wr.request_ai_decision(config, "prompt-body", transport=httpx.MockTransport(handler))
    assert "minor" in text
    assert captured[0].url.path.endswith("/messages")
    assert captured[0].headers["x-api-key"] == "test-key"
    assert captured[0].headers["anthropic-version"]
    assert "Authorization" not in captured[0].headers


def test_retries_transient_then_succeeds() -> None:
    captured: list[httpx.Request] = []
    transport = openai_handler_builder(
        [httpx.Response(500), httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})],
        captured,
    )
    config = make_config()
    text = wr.request_ai_decision(config, "p", transport=transport)
    with pytest.raises(wr.DecisionError):
        wr.parse_decision(text)
    assert len(captured) == 2


def test_fails_after_bounded_retries() -> None:
    captured: list[httpx.Request] = []
    transport = openai_handler_builder([httpx.Response(503)], captured)
    config = make_config()
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=transport)
    assert len(captured) == 2


def test_client_error_does_not_retry() -> None:
    captured: list[httpx.Request] = []
    transport = openai_handler_builder([httpx.Response(401)], captured)
    config = make_config()
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=transport)
    assert len(captured) == 1


def test_redirect_is_not_followed() -> None:
    seen_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_urls.append(str(request.url))
        return httpx.Response(302, headers={"Location": "https://evil.example.com/steal"})

    config = make_config()
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=httpx.MockTransport(handler))
    assert len(seen_urls) == 1


def test_oversized_response_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"z" * (wr.RESPONSE_BUDGET + 1))

    config = make_config()
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=httpx.MockTransport(handler))


def test_timeout_is_retried_then_reported_sanitized() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.ConnectTimeout("timeout detail", request=request)

    config = wr.ReleaseAIConfig(
        api_url="https://ai.example.com/v1",
        model="test-model",
        api_format="openai",
        timeout_seconds=60,
        api_key="sk-very-secret-value",
    )
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=httpx.MockTransport(handler))
    assert calls["n"] == 2


def test_malformed_success_envelope_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    config = make_config()
    with pytest.raises(wr.AiRequestError):
        wr.request_ai_decision(config, "p", transport=httpx.MockTransport(handler))


# ---------------------------------------------------------------------------
# 密钥扫描门禁（AC4）
# ---------------------------------------------------------------------------


class FakeRunner:
    def __init__(
        self, findings: list[dict[str, object]] | None = None, error: Exception | None = None, rc: int = 0
    ) -> None:
        self.findings = findings or []
        self.error = error
        self.rc = rc
        self.scanned: list[str] = []

    def __call__(self, text: str, config_path: Path) -> wr.ScanOutcome:
        self.scanned.append(text)
        if self.error:
            raise self.error
        return wr.ScanOutcome(returncode=self.rc, findings=list(self.findings))


def finding(rule: str = "github-pat", line: int = 3) -> dict[str, object]:
    return {"RuleID": rule, "StartLine": line}


def test_scan_blocks_transmission_when_finding() -> None:
    runner = FakeRunner(findings=[finding()])
    with pytest.raises(wr.SecretScanError) as excinfo:
        wr.assert_no_secrets("payload", "outgoing-payload", REPO_CONFIG, runner)
    assert "github-pat" in str(excinfo.value)
    assert "outgoing-payload" in str(excinfo.value)


def test_scan_fail_closed_when_scanner_missing() -> None:
    runner = FakeRunner(error=FileNotFoundError("gitleaks"))
    with pytest.raises(wr.SecretScanError):
        wr.assert_no_secrets("payload", "outgoing-payload", REPO_CONFIG, runner)


def test_scan_fail_closed_on_scanner_error() -> None:
    runner = FakeRunner(rc=2)
    with pytest.raises(wr.SecretScanError):
        wr.assert_no_secrets("payload", "outgoing-payload", REPO_CONFIG, runner)


@pytest.mark.skipif(shutil.which("gitleaks") is None, reason="gitleaks 不在 PATH")
def test_real_gitleaks_detects_fake_token() -> None:
    fake = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
    with pytest.raises(wr.SecretScanError) as excinfo:
        wr.assert_no_secrets(f"token={fake}", "outgoing-payload", REPO_CONFIG, None)
    message = str(excinfo.value)
    assert fake not in message
    assert "outgoing-payload" in message


def test_rationale_secret_blocks_plan_persistence(tmp_path: Path) -> None:
    runner = FakeRunner(findings=[finding()])
    plan = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha="a" * 40,
        source_sha="b" * 40,
        tree_hash="c" * 40,
        version="0.5.0",
        bump="minor",
        rationale="key ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
        notes_zh="干净的说明",
        model="test-model",
    )
    target = tmp_path / "plan.json"
    with pytest.raises(wr.SecretScanError):
        wr.persist_plan(plan, target, REPO_CONFIG, runner)
    assert not target.exists()
    assert runner.scanned, "plan 字段必须实际进入扫描"


def test_clean_plan_persists_scanned_fields(tmp_path: Path) -> None:
    runner = FakeRunner()
    plan = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha="a" * 40,
        source_sha="b" * 40,
        tree_hash="c" * 40,
        version="0.5.0",
        bump="minor",
        rationale="正常理由",
        notes_zh="正常说明",
        model="test-model",
    )
    target = tmp_path / "plan.json"
    wr.persist_plan(plan, target, REPO_CONFIG, runner)
    assert target.exists()
    assert len(runner.scanned) >= 2  # rationale 与 notes 均被扫描


# ---------------------------------------------------------------------------
# 发布者独立开关（Mi1 / design §5）
# ---------------------------------------------------------------------------


def test_publication_requires_opt_in_flag() -> None:
    with pytest.raises(wr.PublishError):
        wr.assert_publication_enabled({})
    with pytest.raises(wr.PublishError):
        wr.assert_publication_enabled({"WEEKLY_RELEASE_ENABLED": "TRUE"})
    assert wr.assert_publication_enabled({"WEEKLY_RELEASE_ENABLED": "true"}) is None


# ---------------------------------------------------------------------------
# 更新说明策略（AC4）
# ---------------------------------------------------------------------------


def test_accepts_clean_chinese_notes() -> None:
    assert wr.validate_notes("## 更新\n- 修复若干问题") == "## 更新\n- 修复若干问题"


@pytest.mark.parametrize(
    "bad",
    [
        "详见 https://example.com/x",
        "联系 @maintainer",
        "<script>alert(1)</script>",
        "bad\x07note",
        "点击 [链接](https://x.y)",
    ],
)
def test_rejects_unsafe_notes(bad: str) -> None:
    with pytest.raises(wr.NotesError):
        wr.validate_notes(bad)


# ---------------------------------------------------------------------------
# 发布计划信封（AC5）
# ---------------------------------------------------------------------------


def make_plan(**overrides: object) -> wr.ReleasePlan:
    data: dict[str, object] = {
        "baseline_tag": "0.4.0",
        "baseline_sha": "a" * 40,
        "source_sha": "b" * 40,
        "tree_hash": "c" * 40,
        "version": "0.5.0",
        "bump": "minor",
        "rationale": "功能升级",
        "notes_zh": "## 更新\n- 内容",
        "model": "test-model",
    }
    data.update(overrides)
    return wr.ReleasePlan(**data)  # type: ignore[arg-type]


def test_commit_message_round_trip() -> None:
    plan = make_plan()
    message = wr.build_commit_message(plan)
    assert message.startswith("chore(release): 发布 0.5.0")
    restored = wr.parse_commit_envelope(message)
    assert restored == plan


def test_tampered_envelope_rejected() -> None:
    message = wr.build_commit_message(make_plan())
    tampered = message.replace("0.5.0", "9.9.9")
    with pytest.raises(wr.PlanError):
        wr.parse_commit_envelope(tampered)


def test_envelope_digest_binds_fields() -> None:
    assert wr.build_commit_message(make_plan()) != wr.build_commit_message(make_plan(rationale="另一个理由"))


def test_plan_json_round_trip() -> None:
    plan = make_plan()
    restored = wr.load_plan(wr.plan_to_json(plan))
    assert restored == plan


def test_load_plan_rejects_tampered_digest() -> None:
    raw = wr.plan_to_json(make_plan())
    data = json.loads(raw)
    data["version"] = "0.4.1"
    with pytest.raises(wr.PlanError):
        wr.load_plan(json.dumps(data, ensure_ascii=False))


def test_load_plan_rejects_unknown_fields() -> None:
    raw = wr.plan_to_json(make_plan())
    data = json.loads(raw)
    data["injected"] = True
    with pytest.raises(wr.PlanError):
        wr.load_plan(json.dumps(data, ensure_ascii=False))


# ---------------------------------------------------------------------------
# 日志净化（AC4）
# ---------------------------------------------------------------------------


def test_ai_failure_logs_do_not_contain_key_or_body(caplog: pytest.LogCaptureFixture) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream exploded with prompt-body inside")

    config = wr.ReleaseAIConfig(
        api_url="https://ai.example.com/v1",
        model="test-model",
        api_format="openai",
        timeout_seconds=60,
        api_key="sk-super-secret-key-value",
    )
    with caplog.at_level(logging.DEBUG, logger="scripts.weekly_release"):
        with pytest.raises(wr.AiRequestError):
            wr.request_ai_decision(config, "prompt-body-XYZ", transport=httpx.MockTransport(handler))
    assert "sk-super-secret-key-value" not in caplog.text
    assert "prompt-body-XYZ" not in caplog.text


# ---------------------------------------------------------------------------
# CLI 入口（最小行为）
# ---------------------------------------------------------------------------


def test_cli_bump_versions_updates_manifests(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(PACKAGE_JSON, encoding="utf-8")
    (tmp_path / "package-lock.json").write_text(PACKAGE_LOCK, encoding="utf-8")
    exit_code = wr.main(["bump-versions", "--version", "0.5.0", "--cwd", str(tmp_path)])
    assert exit_code == 0
    assert json.loads((tmp_path / "package.json").read_text(encoding="utf-8"))["version"] == "0.5.0"


def test_cli_returns_nonzero_on_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = wr.main(["bump-versions", "--version", "not-a-version", "--cwd", str(tmp_path)])
    assert exit_code == 1
    captured = capsys.readouterr()
    assert "版本" in captured.err or "version" in captured.err
