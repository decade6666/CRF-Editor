"""weekly_release Git 事务与恢复测试：真实一次性本地仓库 + 桩 gh 边界。

绝不把真实工作树或真实远端当发布沙盒；GitHub 边界通过注入的 runner 模拟。
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

import scripts.weekly_release as wr

CONFIG_ENV = {
    "RELEASE_AI_API_URL": "https://ai.example.com/v1",
    "RELEASE_AI_MODEL": "test-model",
    "RELEASE_AI_API_FORMAT": "openai",
    "RELEASE_AI_API_KEY": "test-key",
}

PACKAGE_JSON = json.dumps({"name": "crf-editor", "version": "0.4.0", "private": True})
PACKAGE_LOCK = json.dumps(
    {
        "name": "crf-editor",
        "version": "0.4.0",
        "lockfileVersion": 3,
        "packages": {"": {"name": "crf-editor", "version": "0.4.0"}},
    }
)

REPO_CONFIG = Path(__file__).resolve().parents[2] / ".gitleaks.toml"

DECISION_TEXT = json.dumps(
    {
        "bump": "minor",
        "rationale": "功能升级",
        "notes_zh": "## 更新\n- 新增能力",
        "sufficient_context": True,
        "breaking_change": False,
    },
    ensure_ascii=False,
)


def cp(args: list[str], code: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args, code, stdout, stderr)


class FakeGh:
    """有状态的 gh 桩：release list / view / create。"""

    def __init__(self, releases: list[dict[str, object]]) -> None:
        self.releases = releases
        self.created: list[list[str]] = []
        self.fail_next_create = False

    def runner(self, args: list[str]) -> subprocess.CompletedProcess:
        if args[:2] == ["release", "list"]:
            return cp(args, 0, stdout=json.dumps(self.releases))
        if args[:2] == ["release", "view"]:
            tag = args[2]
            exists = any(r["tagName"] == tag for r in self.releases) or any(c[2] == tag for c in self.created)
            if exists:
                return cp(args, 0, stdout="{}")
            return cp(args, 1, stderr=f"release {tag} not found")
        if args[:2] == ["release", "create"]:
            if self.fail_next_create:
                self.fail_next_create = False
                return cp(args, 1, stderr="server error")
            self.created.append(args)
            return cp(args, 0, stdout="")
        return cp(args, 1, stderr="unexpected gh call")

    def client(self) -> wr.GhClient:
        return wr.GhClient("owner/repo", runner=self.runner)


def make_repo(path: Path) -> wr.Git:
    path.mkdir(parents=True, exist_ok=True)
    git = wr.Git(path)
    git.run("init", "-b", "main")
    return git


def commit_all(git: wr.Git, files: dict[str, str], message: str, remove: list[str] | None = None) -> str:
    for rel, content in files.items():
        target = git.worktree / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    if remove:
        git.run("rm", "-q", "--", *remove)
    git.run("add", "--all")
    git.run("commit", "-m", message)
    return git.run("rev-parse", "HEAD").strip()


def base_files(**version_overrides: str) -> dict[str, str]:
    version = version_overrides.get("version", "0.4.0")
    package = json.dumps({"name": "crf-editor", "version": version, "private": True})
    lock = json.dumps(
        {
            "name": "crf-editor",
            "version": version,
            "lockfileVersion": 3,
            "packages": {"": {"name": "crf-editor", "version": version}},
        }
    )
    return {
        "frontend/package.json": package,
        "frontend/package-lock.json": lock,
        "backend/src/services/feature.py": "VALUE = 1\n",
        "backend/src/services/extra.py": "EXTRA = 1\n",
    }


@pytest.fixture
def repo(tmp_path: Path) -> wr.Git:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat(backend): 新增导出能力")
    git.run("push", "-u", "origin", "main")
    return git


def ai_config() -> wr.ReleaseAIConfig:
    return wr.load_release_config(CONFIG_ENV)


def build_plan(git: wr.Git, gh: wr.GhClient, requester=None) -> wr.ReleasePlan | None:
    return wr.build_release_plan(
        git,
        gh,
        CONFIG_ENV,
        Path(".gitleaks.toml"),
        git.run("rev-parse", "HEAD").strip(),
        ai_requester=requester or fake_ai(),
        scan_runner=clean_scan_runner,
    )


def fake_ai(text: str = DECISION_TEXT):
    calls: list[str] = []

    def requester(config: wr.ReleaseAIConfig, prompt: str) -> str:
        calls.append(prompt)
        return text

    requester.calls = calls  # type: ignore[attr-defined]
    return requester


def clean_scan_runner(text: str, config_path: Path) -> wr.ScanOutcome:
    return wr.ScanOutcome(returncode=0, findings=[])


# ---------------------------------------------------------------------------
# 基线解析（AC2）
# ---------------------------------------------------------------------------


def test_resolve_baseline_prefers_latest_stable(repo: wr.Git) -> None:
    gh = FakeGh(
        [
            {"tagName": "0.5.0-rc1", "isDraft": False, "isPrerelease": True, "publishedAt": "2026-08-01"},
            {"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"},
            {"tagName": "0.3.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-06-01"},
        ]
    )
    tag, sha, version = wr.resolve_baseline(repo, gh.client())
    assert tag == "0.4.0"
    assert version == wr.Version(0, 4, 0)
    assert repo.run("rev-parse", "0.4.0^{commit}").strip() == sha


def test_resolve_baseline_takes_max_semver_not_list_order(repo: wr.Git) -> None:
    gh = FakeGh(
        [
            {"tagName": "0.3.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-09-01"},
            {"tagName": "legacy-tag", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-08-15"},
            {"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"},
        ]
    )
    tag, _sha, version = wr.resolve_baseline(repo, gh.client())
    assert (tag, version) == ("0.4.0", wr.Version(0, 4, 0))


def test_resolve_baseline_rejects_when_no_stable_release(repo: wr.Git) -> None:
    gh = FakeGh([{"tagName": "0.5.0-rc1", "isDraft": False, "isPrerelease": True, "publishedAt": "2026-08-01"}])
    with pytest.raises(wr.PlanError):
        wr.resolve_baseline(repo, gh.client())


def test_resolve_baseline_rejects_non_semver_tag(repo: wr.Git) -> None:
    gh = FakeGh([{"tagName": "release-42", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    with pytest.raises(wr.PlanError):
        wr.resolve_baseline(repo, gh.client())


def test_resolve_baseline_rejects_unresolvable_tag(repo: wr.Git) -> None:
    gh = FakeGh([{"tagName": "9.9.9", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    with pytest.raises(wr.PlanError):
        wr.resolve_baseline(repo, gh.client())


def test_baseline_must_be_ancestor_of_source(repo: wr.Git, tmp_path: Path) -> None:
    git = make_repo(tmp_path / "orphan-work")
    first = commit_all(git, base_files(), "chore: 初始化")
    git.run("tag", "0.4.0", first)
    git.run("checkout", "--orphan", "lonely")
    source = commit_all(git, {"backend/src/services/other.py": "X = 1\n"}, "feat: 孤立历史")
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    with pytest.raises(wr.PlanError):
        wr.build_release_plan(
            git,
            gh.client(),
            CONFIG_ENV,
            Path(".gitleaks.toml"),
            source,
            ai_requester=fake_ai(),
            scan_runner=clean_scan_runner,
        )


def test_manifest_version_drift_stops(repo: wr.Git) -> None:
    commit_all(repo, base_files(version="0.9.9"), "chore: 版本漂移")
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    source = repo.run("rev-parse", "HEAD").strip()
    with pytest.raises(wr.PlanError):
        wr.build_release_plan(
            repo,
            gh.client(),
            CONFIG_ENV,
            Path(".gitleaks.toml"),
            source,
            ai_requester=fake_ai(),
            scan_runner=clean_scan_runner,
        )


# ---------------------------------------------------------------------------
# 净变更与树哈希（AC2/AC5）
# ---------------------------------------------------------------------------


def test_fully_reverted_change_has_no_eligible_diff(repo: wr.Git) -> None:
    baseline = repo.run("rev-parse", "0.4.0").strip()
    commit_all(repo, {"backend/src/services/feature.py": "VALUE = 1\n"}, "revert: 完整回退")
    source = repo.run("rev-parse", "HEAD").strip()
    entries = repo.diff_entries(baseline, source)
    assert entries == []


def test_rename_deletion_and_addition_classified(repo: wr.Git) -> None:
    baseline = repo.run("rev-parse", "0.4.0").strip()
    commit_all(
        repo,
        {
            "backend/src/services/extra_moved.py": "EXTRA = 1\n",
            "backend/src/services/added.py": "ADDED = 1\n",
        },
        "feat: 重命名、删除与新增",
        remove=["backend/src/services/extra.py", "backend/src/services/feature.py"],
    )
    source = repo.run("rev-parse", "HEAD").strip()
    entries = repo.diff_entries(baseline, source)
    result = wr.classify_entries(entries, lambda sha: repo.run("cat-file", "blob", sha))
    statuses = {change.status for change in result.eligible}
    assert statuses == {"A", "D", "R100"}
    renamed = next(change for change in result.eligible if change.status.startswith("R"))
    assert renamed.path == "backend/src/services/extra_moved.py"
    assert renamed.old_path == "backend/src/services/extra.py"
    assert renamed.insertions is not None and renamed.deletions is not None


def test_version_only_tree_changes_exactly_two_files(repo: wr.Git) -> None:
    source = repo.run("rev-parse", "HEAD").strip()
    bumped_pkg, bumped_lock = wr.bump_manifests(PACKAGE_JSON, PACKAGE_LOCK, wr.Version(0, 5, 0))
    base_tree = repo.run("rev-parse", f"{source}^{{tree}}").strip()
    tree = repo.write_tree_from_files(
        base_tree, {"frontend/package.json": bumped_pkg, "frontend/package-lock.json": bumped_lock}
    )
    assert tree == repo.write_tree_from_files(
        base_tree, {"frontend/package.json": bumped_pkg, "frontend/package-lock.json": bumped_lock}
    )
    entries = repo.diff_entries(source, tree)
    assert {(entry.status, entry.old_path) for entry in entries} == {
        ("M", "frontend/package.json"),
        ("M", "frontend/package-lock.json"),
    }


def test_commit_envelope_round_trip_in_real_repo(repo: wr.Git) -> None:
    source = repo.run("rev-parse", "HEAD").strip()
    bumped_pkg, bumped_lock = wr.bump_manifests(PACKAGE_JSON, PACKAGE_LOCK, wr.Version(0, 5, 0))
    base_tree = repo.run("rev-parse", f"{source}^{{tree}}").strip()
    tree = repo.write_tree_from_files(
        base_tree, {"frontend/package.json": bumped_pkg, "frontend/package-lock.json": bumped_lock}
    )
    plan = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha=repo.run("rev-parse", "0.4.0").strip(),
        source_sha=source,
        tree_hash=tree,
        version="0.5.0",
        bump="minor",
        rationale="功能升级",
        notes_zh="## 更新\n- 内容",
        model="test-model",
    )
    commit = repo.commit_tree(tree, source, wr.build_commit_message(plan))
    restored = wr.parse_commit_envelope(repo.read_commit_message(commit))
    assert restored == plan
    entries = repo.diff_entries(source, commit)
    assert {(entry.status, entry.old_path) for entry in entries} == {
        ("M", "frontend/package.json"),
        ("M", "frontend/package-lock.json"),
    }


# ---------------------------------------------------------------------------
# 规划编排（AC1/AC2）
# ---------------------------------------------------------------------------


def test_build_plan_happy_path(repo: wr.Git) -> None:
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    requester = fake_ai()
    plan = build_plan(repo, gh.client(), requester=requester)
    assert plan is not None
    assert plan.version == "0.5.0"
    assert plan.bump == "minor"
    assert plan.baseline_tag == "0.4.0"
    assert len(requester.calls) == 1
    assert "feat(backend): 新增导出能力" in requester.calls[0]
    assert "backend/src/services/feature.py" in requester.calls[0]


def test_build_plan_skips_without_eligible_changes_and_never_calls_ai(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"README.md": "# 变更后的文档\n"}, "docs: 仅文档")
    git.run("push", "-u", "origin", "main")
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    requester = fake_ai()

    def exploding_requester(config: wr.ReleaseAIConfig, prompt: str) -> str:
        raise AssertionError("无净变更时不得调用 AI")

    plan = build_plan(git, gh.client(), requester=exploding_requester)
    assert plan is None


def test_plan_without_eligible_changes_does_not_require_ai_config(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"README.md": "# 文档\n"}, "docs: 仅文档")
    git.run("push", "-u", "origin", "main")
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    plan = wr.build_release_plan(
        git,
        gh.client(),
        {},
        Path(".gitleaks.toml"),
        git.run("rev-parse", "HEAD").strip(),
        ai_requester=fake_ai(),
        scan_runner=clean_scan_runner,
    )
    assert plan is None


def test_cli_tree_hash_binds_bumped_worktree(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    source = git.run("rev-parse", "HEAD").strip()
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    assert wr.main(["bump-versions", "--version", plan.version, "--cwd", str(git.worktree / "frontend")]) == 0
    import contextlib
    import io as io_module

    buffer = io_module.StringIO()
    with contextlib.redirect_stdout(buffer):
        assert wr.main(["tree-hash", "--source-sha", source, "--cwd", str(git.worktree)]) == 0
    assert buffer.getvalue().strip() == plan.tree_hash


def test_build_plan_stops_when_pending_release_exists(repo: wr.Git) -> None:
    gh = FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])
    plan = build_plan(repo, gh.client())
    assert plan is not None
    commit = repo.commit_tree(plan.tree_hash, plan.source_sha, wr.build_commit_message(plan))
    repo.run("tag", "0.5.0", commit)
    repo.run("update-ref", "refs/heads/main", commit)
    repo.run("push", "origin", "main", "0.5.0")
    with pytest.raises(wr.PlanError, match="待恢复"):
        build_plan(repo, gh.client())


def test_plan_skips_own_version_only_change(tmp_path: Path) -> None:
    git = make_repo(tmp_path / "version-only")
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    bumped_pkg, bumped_lock = wr.bump_manifests(PACKAGE_JSON, PACKAGE_LOCK, wr.Version(0, 5, 0))
    commit_all(
        git,
        {"frontend/package.json": bumped_pkg, "frontend/package-lock.json": bumped_lock},
        "chore(release): 仅版本号",
    )
    baseline = git.run("rev-parse", "0.4.0").strip()
    source = git.run("rev-parse", "HEAD").strip()
    entries = git.diff_entries(baseline, source)
    result = wr.classify_entries(entries, lambda sha: git.run("cat-file", "blob", sha))
    assert result.eligible == []
    assert wr.has_eligible_changes(result) is False


# ---------------------------------------------------------------------------
# 发布事务与恢复（AC5）
# ---------------------------------------------------------------------------


def make_remote_and_clone(tmp_path: Path) -> tuple[wr.Git, wr.Git, Path]:
    bare_path = tmp_path / "remote.git"
    bare_path.mkdir()
    wr.Git(bare_path).run("init", "--bare", "-b", "main")
    work_path = tmp_path / "work"
    git = make_repo(work_path)
    git.run("remote", "add", "origin", str(bare_path))
    return git, wr.Git(work_path), bare_path


def published_gh() -> FakeGh:
    return FakeGh([{"tagName": "0.4.0", "isDraft": False, "isPrerelease": False, "publishedAt": "2026-07-21"}])


def test_publish_pushes_main_and_tag_then_creates_release(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    source = commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat(backend): 新增导出能力")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    commit = wr.publish_release(
        git,
        gh.client(),
        plan,
        remote="origin",
        repo="owner/repo",
        config_path=Path(".gitleaks.toml"),
        scan_runner=clean_scan_runner,
    )
    remote_refs = git.ls_remote("origin", "refs/heads/main refs/tags/0.5.0")
    assert remote_refs["refs/heads/main"] == commit
    assert remote_refs["refs/tags/0.5.0"] == commit
    assert len(gh.created) == 1
    create_args = gh.created[0]
    assert "--verify-tag" in create_args
    assert "--notes-file" in create_args
    assert any("0.5.0" in part for part in create_args)


def test_stale_main_rejects_whole_publication(tmp_path: Path) -> None:
    git, _, bare_path = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    source = commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    # 远端 main 在规划之后被并发推进
    rival = make_repo(tmp_path / "rival")
    rival.run("remote", "add", "origin", str(bare_path))
    rival.run("fetch", "origin")
    rival.run("checkout", "-b", "main", "origin/main")
    commit_all(rival, {"backend/src/services/feature.py": "VALUE = 3\n"}, "feat: 并发提交")
    rival.run("push", "origin", "main")
    with pytest.raises(wr.PublishError):
        wr.publish_release(
            git,
            gh.client(),
            plan,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
    refs = git.ls_remote("origin", "refs/heads/main refs/tags/0.5.0")
    assert refs["refs/heads/main"] == rival.run("rev-parse", "HEAD").strip()
    assert "refs/tags/0.5.0" not in refs


def test_conflicting_tag_fails_closed(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    git.run("tag", "0.5.0", first)
    git.run("push", "origin", "0.5.0")
    with pytest.raises(wr.PublishError):
        wr.publish_release(
            git,
            gh.client(),
            plan,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
    refs = git.ls_remote("origin", "refs/heads/main")
    assert refs["refs/heads/main"] == git.run("rev-parse", "HEAD").strip()


def test_release_failure_leaves_pending_and_recovery_completes(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    source = commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    gh.fail_next_create = True
    with pytest.raises(wr.PublishError):
        wr.publish_release(
            git,
            gh.client(),
            plan,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
    # push 成功、Release 失败：远端处于待恢复状态
    refs = git.ls_remote("origin", "refs/heads/main refs/tags/0.5.0")
    assert refs["refs/tags/0.5.0"] == refs["refs/heads/main"]
    baseline_version = wr.Version(0, 4, 0)
    pending = wr.find_pending_release(git, gh.client(), baseline_version)
    assert pending is not None
    assert pending.plan == plan
    assert pending.commit == refs["refs/tags/0.5.0"]
    # 恢复期间 main 上出现新提交：不得混入该版本
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 4\n"}, "feat: 待发布的后续改动")
    pending_again = wr.find_pending_release(git, gh.client(), baseline_version)
    assert pending_again is not None
    assert pending_again.plan.version == "0.5.0"
    assert pending_again.plan == plan
    assert (
        wr.complete_pending_release(
            pending_again,
            git,
            gh.client(),
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
        is True
    )
    assert len(gh.created) == 1
    refs_after = git.ls_remote("origin", "refs/heads/main")
    assert refs_after["refs/heads/main"] == refs["refs/heads/main"]


def test_recovery_is_idempotent_when_release_already_exists(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    wr.publish_release(
        git,
        gh.client(),
        plan,
        remote="origin",
        repo="owner/repo",
        config_path=Path(".gitleaks.toml"),
        scan_runner=clean_scan_runner,
    )
    baseline_version = wr.Version(0, 4, 0)
    pending = wr.find_pending_release(git, gh.client(), baseline_version)
    assert pending is None
    assert (
        wr.complete_pending_release(
            pending,
            git,
            gh.client(),
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
        is False
    )
    assert len(gh.created) == 1


def test_multiple_pending_versions_stop(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    gh = published_gh()
    source = git.run("rev-parse", "HEAD").strip()
    plan = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha=first,
        source_sha=source,
        tree_hash=git.run("rev-parse", "HEAD^{tree}").strip(),
        version="0.5.0",
        bump="minor",
        rationale="r",
        notes_zh="n",
        model="m",
    )
    commit_a = git.commit_tree(plan.tree_hash, source, wr.build_commit_message(plan))
    git.run("tag", "0.5.0", commit_a)
    plan_b = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha=first,
        source_sha=commit_a,
        tree_hash=git.run("rev-parse", "HEAD^{tree}").strip(),
        version="0.6.0",
        bump="minor",
        rationale="r",
        notes_zh="n",
        model="m",
    )
    commit_b = git.commit_tree(plan_b.tree_hash, commit_a, wr.build_commit_message(plan_b))
    git.run("tag", "0.6.0", commit_b)
    git.run("update-ref", "refs/heads/main", commit_b)
    git.run("push", "-u", "origin", "main")
    git.run("push", "origin", "0.5.0", "0.6.0")
    with pytest.raises(wr.PlanError):
        wr.find_pending_release(git, gh.client(), wr.Version(0, 4, 0))


def test_manual_tag_without_envelope_stops(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    manual = commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 手动标签指向的提交")
    git.run("tag", "0.5.0", manual)
    git.run("push", "-u", "origin", "main")
    git.run("push", "origin", "0.5.0")
    gh = published_gh()
    with pytest.raises(wr.PlanError):
        wr.find_pending_release(git, gh.client(), wr.Version(0, 4, 0))


def test_publish_rejects_tampered_notes_text(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    tampered = wr.ReleasePlan(
        baseline_tag=plan.baseline_tag,
        baseline_sha=plan.baseline_sha,
        source_sha=plan.source_sha,
        tree_hash=plan.tree_hash,
        version=plan.version,
        bump=plan.bump,
        rationale=plan.rationale,
        notes_zh="参见 https://evil.example.com",
        model=plan.model,
    )
    with pytest.raises(wr.NotesError):
        wr.publish_release(
            git,
            gh.client(),
            tampered,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )


def test_publish_rejects_version_not_matching_baseline_plus_bump(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    wrong_version = wr.ReleasePlan(
        baseline_tag=plan.baseline_tag,
        baseline_sha=plan.baseline_sha,
        source_sha=plan.source_sha,
        tree_hash=plan.tree_hash,
        version="0.6.0",
        bump="patch",
        rationale=plan.rationale,
        notes_zh=plan.notes_zh,
        model=plan.model,
    )
    source = git.run("rev-parse", "HEAD").strip()
    with pytest.raises(wr.PublishError, match="重算结果不一致"):
        wr.publish_release(
            git,
            gh.client(),
            wrong_version,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
    refs = git.ls_remote("origin", "refs/heads/main")
    assert refs["refs/heads/main"] == source


def test_pending_tag_with_dependency_change_is_rejected(tmp_path: Path) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    source = git.run("rev-parse", "HEAD").strip()
    bumped_pkg = json.dumps(
        {"name": "crf-editor", "version": "0.5.0", "private": True, "dependencies": {"vue": "^3.5.0"}}
    )
    bumped_lock = json.dumps(
        {
            "name": "crf-editor",
            "version": "0.5.0",
            "lockfileVersion": 3,
            "packages": {"": {"name": "crf-editor", "version": "0.5.0"}},
        }
    )
    base_tree = git.run("rev-parse", f"{source}^{{tree}}").strip()
    tree = git.write_tree_from_files(
        base_tree, {"frontend/package.json": bumped_pkg, "frontend/package-lock.json": bumped_lock}
    )
    plan = wr.ReleasePlan(
        baseline_tag="0.4.0",
        baseline_sha=first,
        source_sha=source,
        tree_hash=tree,
        version="0.5.0",
        bump="minor",
        rationale="r",
        notes_zh="n",
        model="m",
    )
    commit = git.commit_tree(tree, source, wr.build_commit_message(plan))
    git.run("tag", "0.5.0", commit)
    git.run("update-ref", "refs/heads/main", commit)
    git.run("push", "-u", "origin", "main")
    git.run("push", "origin", "0.5.0")
    gh = published_gh()
    with pytest.raises(wr.PlanError, match="非版本字段"):
        wr.find_pending_release(git, gh.client(), wr.Version(0, 4, 0))


def patch_gh_client(monkeypatch: pytest.MonkeyPatch, gh: FakeGh) -> None:
    """把 CLI 构造的 GhClient 桥接到 FakeGh 的 runner（保留原类，避免递归）。"""
    real_client = wr.GhClient
    monkeypatch.setattr(wr, "GhClient", lambda repo, runner=None: real_client(repo, runner=gh.runner))


def make_pending_state(tmp_path: Path) -> tuple[wr.Git, FakeGh, str]:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    gh.fail_next_create = True
    with pytest.raises(wr.PublishError):
        wr.publish_release(
            git,
            gh.client(),
            plan,
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
    head = git.run("rev-parse", "HEAD").strip()
    return git, gh, head


def test_recover_release_completes_matching_tag_and_rejects_wrong(tmp_path: Path) -> None:
    git, gh, _head = make_pending_state(tmp_path)
    assert (
        wr.recover_release(
            git,
            gh.client(),
            "0.5.0",
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )
        is True
    )
    assert len(gh.created) == 1
    with pytest.raises(wr.PublishError):
        wr.recover_release(
            git,
            gh.client(),
            "9.9.9",
            remote="origin",
            repo="owner/repo",
            config_path=Path(".gitleaks.toml"),
            scan_runner=clean_scan_runner,
        )


def test_cli_plan_emits_pending_marker_without_ai(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    git, gh, _head = make_pending_state(tmp_path)
    patch_gh_client(monkeypatch, gh)
    plan_output = tmp_path / "plan.json"
    exit_code = wr.main(
        [
            "plan",
            "--repo",
            "owner/repo",
            "--source-sha",
            git.run("rev-parse", "HEAD").strip(),
            "--plan-output",
            str(plan_output),
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 0
    assert "pending_recovery=0.5.0" in capsys.readouterr().out
    assert not plan_output.exists()


def test_cli_plan_writes_plan_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    git, _, _ = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    patch_gh_client(monkeypatch, gh)
    monkeypatch.setattr(wr, "request_ai_decision", lambda config, prompt: DECISION_TEXT)
    for key, value in CONFIG_ENV.items():
        monkeypatch.setenv(key, value)
    plan_output = tmp_path / "plan.json"
    exit_code = wr.main(
        [
            "plan",
            "--repo",
            "owner/repo",
            "--source-sha",
            git.run("rev-parse", "HEAD").strip(),
            "--plan-output",
            str(plan_output),
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 0
    assert "已生成发布计划: 0.5.0" in capsys.readouterr().out
    assert wr.load_plan(plan_output.read_text(encoding="utf-8")).version == "0.5.0"


def test_cli_publish_requires_opt_in_flag_then_publishes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    git, gh, _head = make_remote_and_clone(tmp_path)
    first = commit_all(git, base_files(), "chore: 初始化 0.4.0")
    git.run("tag", "0.4.0", first)
    commit_all(git, {"backend/src/services/feature.py": "VALUE = 2\n"}, "feat: 功能")
    git.run("push", "-u", "origin", "main")
    gh = published_gh()
    plan = build_plan(git, gh.client())
    assert plan is not None
    plan_file = tmp_path / "release-plan.json"
    plan_file.write_text(wr.plan_to_json(plan), encoding="utf-8")
    patch_gh_client(monkeypatch, gh)
    monkeypatch.delenv("WEEKLY_RELEASE_ENABLED", raising=False)
    exit_code = wr.main(
        [
            "publish",
            "--repo",
            "owner/repo",
            "--plan-file",
            str(plan_file),
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 1
    assert "WEEKLY_RELEASE_ENABLED" in capsys.readouterr().err
    source = git.run("rev-parse", "HEAD").strip()
    assert git.ls_remote("origin", "refs/heads/main")["refs/heads/main"] == source
    monkeypatch.setenv("WEEKLY_RELEASE_ENABLED", "true")
    exit_code = wr.main(
        [
            "publish",
            "--repo",
            "owner/repo",
            "--plan-file",
            str(plan_file),
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 0
    assert len(gh.created) == 1


def test_cli_recover_requires_opt_in_flag_and_completes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    git, gh, _head = make_pending_state(tmp_path)
    patch_gh_client(monkeypatch, gh)
    monkeypatch.delenv("WEEKLY_RELEASE_ENABLED", raising=False)
    exit_code = wr.main(
        [
            "recover",
            "--tag",
            "0.5.0",
            "--repo",
            "owner/repo",
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 1
    assert "WEEKLY_RELEASE_ENABLED" in capsys.readouterr().err
    monkeypatch.setenv("WEEKLY_RELEASE_ENABLED", "true")
    exit_code = wr.main(
        [
            "recover",
            "--tag",
            "0.5.0",
            "--repo",
            "owner/repo",
            "--cwd",
            str(git.worktree),
            "--gitleaks-config",
            str(REPO_CONFIG),
        ]
    )
    assert exit_code == 0
    assert "已补建 Release: 0.5.0" in capsys.readouterr().out
    assert len(gh.created) == 1
