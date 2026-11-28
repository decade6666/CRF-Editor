"""Private archive files are bounded, opaque and never destructively guessed."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.config import AppConfig, DatabaseConfig, StorageConfig, load_config
from src.services import design_baseline_storage_service as storage
from src.services.design_snapshot_service import SnapshotError


@pytest.fixture
def config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        database=DatabaseConfig(path=str(tmp_path / "data.db")),
        storage=StorageConfig(upload_path=str(tmp_path / "uploads")),
    )


@pytest.mark.unit
def test_should_default_private_history_to_database_adjacent_directory(config: AppConfig, tmp_path: Path) -> None:
    assert Path(config.design_history_path) == tmp_path / "design_history"
    assert not (tmp_path / "design_history").exists()


@pytest.mark.unit
def test_should_accept_explicit_history_environment_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_STORAGE_DESIGN_HISTORY_PATH", str(tmp_path / "private-history"))

    assert Path(load_config().design_history_path) == tmp_path / "private-history"


@pytest.mark.unit
def test_should_create_opaque_private_stage_without_public_upload_files(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)

    assert len(stage.key) == 32 and int(stage.key, 16) >= 0
    assert stage.directory == Path(config.design_history_path) / "staging" / stage.key
    assert stage.directory.is_dir()
    assert list(stage.directory.iterdir()) == []
    assert not Path(config.upload_path).exists()


@pytest.mark.unit
def test_should_not_delete_old_objects_when_free_space_is_insufficient(
    config: AppConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = storage.history_root(config)
    retained = root / "objects" / ("a" * 32)
    retained.mkdir()
    (retained / "ecrf.docx").write_bytes(b"retained")
    monkeypatch.setattr(storage.shutil, "disk_usage", lambda _root: SimpleNamespace(free=100))

    with pytest.raises(SnapshotError) as failure:
        storage.prepare_stage(config)
    assert failure.value.code == "BASELINE_STORAGE_FULL"
    assert (retained / "ecrf.docx").read_bytes() == b"retained"


@pytest.mark.unit
@pytest.mark.parametrize("location", ["uploads", "database", "database_parent"])
def test_should_refuse_unsafe_overlapping_private_roots(config: AppConfig, location: str) -> None:
    values = {
        "uploads": config.upload_path,
        "database": config.db_path,
        "database_parent": str(Path(config.db_path).parent),
    }
    config.storage.design_history_path = values[location]

    with pytest.raises(SnapshotError):
        storage.history_root(config)


@pytest.mark.unit
def test_should_not_follow_history_root_symlinks(config: AppConfig, tmp_path: Path) -> None:
    target = tmp_path / "outside"
    target.mkdir()
    linked = tmp_path / "history-link"
    linked.symlink_to(target, target_is_directory=True)
    config.storage.design_history_path = str(linked)

    with pytest.raises(SnapshotError):
        storage.history_root(config)
    assert list(target.iterdir()) == []


@pytest.mark.unit
def test_should_publish_stage_without_changing_retained_bytes(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"first")
    (stage.directory / "acrf.docx").write_bytes(b"second")

    target = storage.publish_stage(stage)

    assert target == stage.root / "objects" / stage.key
    assert (target / "ecrf.docx").read_bytes() == b"first"
    assert not stage.directory.exists()


@pytest.mark.unit
def test_should_refuse_publication_over_existing_object(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    existing = stage.root / "objects" / stage.key
    existing.mkdir()
    (existing / "ecrf.docx").write_bytes(b"old")

    with pytest.raises(SnapshotError):
        storage.publish_stage(stage)
    assert (existing / "ecrf.docx").read_bytes() == b"old"
    assert stage.directory.exists()


@pytest.mark.unit
@pytest.mark.parametrize("key", ["../other", "/absolute", "b" * 31, "B" * 32, "x" * 32])
def test_should_reject_untrusted_storage_keys(config: AppConfig, key: str) -> None:
    with pytest.raises(SnapshotError):
        storage.read_original(storage.history_root(config), key, "ecrf", "a" * 64, 1)


@pytest.mark.unit
def test_should_download_only_exact_retained_bytes_and_detect_corruption(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    original = b"immutable-original"
    (stage.directory / "ecrf.docx").write_bytes(original)
    target = storage.publish_stage(stage)
    digest = hashlib.sha256(original).hexdigest()

    assert storage.read_original(stage.root, stage.key, "ecrf", digest, len(original)) == original
    (target / "ecrf.docx").write_bytes(b"changed")
    with pytest.raises(SnapshotError) as failure:
        storage.read_original(stage.root, stage.key, "ecrf", digest, len(original))
    assert failure.value.code == "BASELINE_INTEGRITY_FAILED"


@pytest.mark.unit
def test_should_not_read_symlink_or_hardlink_originals(config: AppConfig, tmp_path: Path) -> None:
    import os

    stage = storage.prepare_stage(config)
    target = tmp_path / "other.docx"
    target.write_bytes(b"private")
    (stage.directory / "ecrf.docx").symlink_to(target)
    os.link(target, stage.directory / "acrf.docx")
    storage.publish_stage(stage)

    for kind in ("ecrf", "acrf"):
        with pytest.raises(SnapshotError):
            storage.read_original(stage.root, stage.key, kind, hashlib.sha256(b"private").hexdigest(), 7)
    assert target.read_bytes() == b"private"


@pytest.mark.unit
def test_should_block_removal_during_active_read_and_release_after_exception(config: AppConfig) -> None:
    root = storage.history_root(config)
    key = "c" * 32
    with storage.history_access(root, key):
        with pytest.raises(SnapshotError) as failure:
            with storage.history_removal(root, key):
                pytest.fail("removal overlapped reader")
    assert failure.value.code == "BASELINE_BUSY"
    with pytest.raises(RuntimeError), storage.history_removal(root, key):
        raise RuntimeError("transaction failed")
    with storage.history_access(root, key):
        pass


@pytest.mark.unit
def test_should_block_new_read_while_removal_is_reserved(config: AppConfig) -> None:
    root = storage.history_root(config)
    with storage.history_removal(root, "d" * 32):
        with pytest.raises(SnapshotError):
            with storage.history_access(root, "d" * 32):
                pytest.fail("reader entered deleting object")


@pytest.mark.unit
def test_should_keep_unknown_files_and_report_postcommit_cleanup_failure(
    config: AppConfig, caplog: pytest.LogCaptureFixture
) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"original")
    target = storage.publish_stage(stage)
    (target / "unexpected.bin").write_bytes(b"must not guess deletion")

    with caplog.at_level(logging.WARNING):
        assert storage.cleanup_published(stage.root, stage.key) is False
    assert (target / "unexpected.bin").read_bytes() == b"must not guess deletion"
    assert "留档文件清理未完成" in caplog.text


@pytest.mark.unit
def test_should_remove_only_known_unshared_object_files_after_explicit_call(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"one")
    (stage.directory / "acrf.docx").write_bytes(b"two")
    (stage.directory / "logo.bitmap").write_bytes(b"asset")
    target = storage.publish_stage(stage)

    assert storage.cleanup_published(stage.root, stage.key) is True
    assert not target.exists()


@pytest.mark.unit
def test_should_reject_linked_ancestor_before_creating_private_files(config: AppConfig, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    linked = tmp_path / "linked-parent"
    linked.symlink_to(outside, target_is_directory=True)
    config.storage.design_history_path = str(linked / "history")

    with pytest.raises(SnapshotError):
        storage.prepare_stage(config)
    assert not (outside / "history").exists()


@pytest.mark.unit
@pytest.mark.parametrize("expected_size,digest", [(1, "a" * 64), (0, "a" * 64), (True, "a" * 64), (1, "invalid")])
def test_should_refuse_invalid_or_mismatched_original_metadata(
    config: AppConfig, expected_size: int, digest: str
) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"x")
    storage.publish_stage(stage)

    with pytest.raises(SnapshotError) as failure:
        storage.read_original(stage.root, stage.key, "ecrf", digest, expected_size)
    assert failure.value.code == "BASELINE_INTEGRITY_FAILED"


@pytest.mark.unit
def test_should_report_missing_original_without_regenerating(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    storage.publish_stage(stage)

    with pytest.raises(SnapshotError) as failure:
        storage.read_original(stage.root, stage.key, "acrf", "a" * 64, 1)
    assert failure.value.code == "BASELINE_INTEGRITY_FAILED"


@pytest.mark.unit
def test_should_keep_shared_files_during_explicit_cleanup(config: AppConfig, tmp_path: Path) -> None:
    stage = storage.prepare_stage(config)
    shared = tmp_path / "shared.docx"
    shared.write_bytes(b"retained by another set")
    os.link(shared, stage.directory / "ecrf.docx")
    target = storage.publish_stage(stage)

    assert storage.cleanup_published(stage.root, stage.key) is False
    assert (target / "ecrf.docx").exists()
    assert shared.read_bytes() == b"retained by another set"


@pytest.mark.unit
def test_should_report_unlink_failure_and_keep_surviving_files(
    config: AppConfig, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"retained")
    target = storage.publish_stage(stage)

    def fail_unlink(*args: object, **kwargs: object) -> None:
        raise PermissionError("synthetic failure")

    monkeypatch.setattr(os, "unlink", fail_unlink)
    monkeypatch.setattr(Path, "unlink", fail_unlink)
    with caplog.at_level(logging.WARNING):
        assert storage.cleanup_published(stage.root, stage.key) is False
    assert (target / "ecrf.docx").read_bytes() == b"retained"
    assert "留档文件清理未完成" in caplog.text


@pytest.mark.unit
def test_should_not_follow_directory_replacement_during_cleanup(
    config: AppConfig, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"delete this test object only")
    target = storage.publish_stage(stage)
    outside = tmp_path / "outside-files"
    outside.mkdir()
    protected = outside / "ecrf.docx"
    protected.write_bytes(b"must survive")
    retired = target.with_name("replaced-test-directory")
    original_unlink = os.unlink
    replaced = False

    def replace_before_unlink(path: object, *args: object, **kwargs: object) -> None:
        nonlocal replaced
        if not replaced:
            target.rename(retired)
            target.symlink_to(outside, target_is_directory=True)
            replaced = True
        original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(os, "unlink", replace_before_unlink)
    monkeypatch.setattr(Path, "unlink", replace_before_unlink)

    assert storage.cleanup_published(stage.root, stage.key) is False
    assert protected.read_bytes() == b"must survive"


@pytest.mark.unit
def test_should_compensate_only_failed_operation_stage(config: AppConfig) -> None:
    stage = storage.prepare_stage(config)
    other = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"partial")
    (other.directory / "ecrf.docx").write_bytes(b"independent")

    assert storage.cleanup_stage(stage) is True
    assert not stage.directory.exists()
    assert (other.directory / "ecrf.docx").read_bytes() == b"independent"
    assert storage.cleanup_stage(stage) is True


@pytest.mark.unit
def test_should_pin_every_ancestor_before_cleanup_can_unlink(
    config: AppConfig, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    stage = storage.prepare_stage(config)
    (stage.directory / "ecrf.docx").write_bytes(b"this test's removable original")
    storage.publish_stage(stage)
    outside = tmp_path / "outside-ancestor"
    external = outside / "objects" / stage.key
    external.mkdir(parents=True)
    protected = external / "ecrf.docx"
    protected.write_bytes(b"must never be unlinked")
    retired = tmp_path / "retired-private-root"
    original_open = os.open
    replaced = False

    def replace_ancestor_at_open(path: object, *args: object, **kwargs: object) -> int:
        nonlocal replaced
        if Path(path).name == "objects" and not replaced:
            stage.root.rename(retired)
            stage.root.symlink_to(outside, target_is_directory=True)
            replaced = True
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(os, "open", replace_ancestor_at_open)
    storage.cleanup_published(stage.root, stage.key)

    assert replaced
    assert protected.read_bytes() == b"must never be unlinked"


@pytest.mark.unit
def test_should_refuse_configured_static_directory_as_private_history(
    config: AppConfig, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    public = tmp_path / "custom-public-static"
    monkeypatch.setenv("CRF_STATIC_DIR", str(public))
    config.storage.design_history_path = str(public / "private-looking-name")

    with pytest.raises(SnapshotError):
        storage.history_root(config)
    assert not public.exists()
