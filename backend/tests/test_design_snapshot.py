"""Persisted-design snapshots are complete, private-safe and independent of live ORM state."""

from __future__ import annotations

import hashlib
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from pathlib import Path
from datetime import date, datetime
from typing import Any

import pytest
from sqlalchemy import create_engine, event, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.models import Base
from src.models.codelist import CodeList, CodeListOption
from src.models.field import Field
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services import design_snapshot_service as snapshots
from src.services.design_revision_service import read_design_revision


def _seed_projects(session: Session) -> tuple[Project, Project]:
    project = Project(
        name="冻结设计",
        version="legacy-v1",
        crf_version="vMixed",
        crf_version_date=date(2026, 11, 20),
        sponsor="申办方",
        trial_name="研究",
        company_logo_path="private-runtime-logo.png",
        data_management_unit="数据管理",
    )
    foreign = Project(name="外部项目", version="1")
    session.add_all([project, foreign])
    session.flush()
    return project, foreign


def _seed_library(session: Session, project: Project) -> dict[str, int]:
    unit = Unit(project_id=project.id, symbol="岁", code="unit.lower")
    unplaced_unit = Unit(project_id=project.id, symbol="天", code=None)
    codelist = CodeList(project_id=project.id, name="选项", code="cl.lower", description=None)
    unplaced_list = CodeList(project_id=project.id, name="未放置字典", code=None)
    session.add_all([unit, unplaced_unit, codelist, unplaced_list])
    session.flush()
    definition = FieldDefinition(
        project_id=project.id,
        variable_name="legacy.AGE",
        label="原始标签",
        field_type="单选",
        integer_digits=3,
        decimal_digits=None,
        codelist_id=codelist.id,
        unit_id=unit.id,
    )
    unplaced = FieldDefinition(
        project_id=project.id,
        variable_name="unplaced.lower",
        label="未放置字段",
        field_type="文本",
    )
    option = CodeListOption(codelist_id=codelist.id, code="自由 code-中", decode="是", order_index=None)
    session.add_all([definition, unplaced, option])
    session.flush()
    return {
        "unit": unit.id,
        "unplaced_unit": unplaced_unit.id,
        "codelist": codelist.id,
        "unplaced_list": unplaced_list.id,
        "definition": definition.id,
        "unplaced_definition": unplaced.id,
        "option": option.id,
    }


@pytest.fixture
def graph(engine: Engine) -> dict[str, int]:
    with Session(engine) as session:
        project, foreign = _seed_projects(session)
        ids = _seed_library(session, project)
        form = Form(
            project_id=project.id,
            name="表单",
            code="form.lower",
            domain="Lb Mixed",
            annotation_positions='{"legacy.AGE":{"y":25},"_form":{"y":-18}}',
            design_notes="说明",
            paper_orientation="landscape",
            order_index=None,
        )
        foreign_form = Form(project_id=foreign.id, name="FOREIGN_FORM", code="foreign")
        foreign_unit = Unit(project_id=foreign.id, symbol="FOREIGN_UNIT")
        foreign_list = CodeList(project_id=foreign.id, name="FOREIGN_CODELIST")
        session.add_all([form, foreign_form, foreign_unit, foreign_list])
        session.flush()
        instance = FormField(
            form_id=form.id,
            field_definition_id=ids["definition"],
            order_index=1,
            label_override="别名",
            default_value="第一行\n第二行",
            inline_mark=2,
            bg_color="ABCDEF",
            text_color="123456",
            label_font_size="large",
        )
        log_row = FormField(form_id=form.id, field_definition_id=None, is_log_row=1, order_index=2)
        visit = Visit(project_id=project.id, name="基线", code="visit.lower", sequence=1)
        session.add_all([instance, log_row, visit])
        session.flush()
        link = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
        session.add(link)
        session.commit()
        return {
            **ids,
            "project": project.id,
            "foreign_project": foreign.id,
            "form": form.id,
            "foreign_form": foreign_form.id,
            "foreign_unit": foreign_unit.id,
            "foreign_list": foreign_list.id,
            "instance": instance.id,
            "log_row": log_row.id,
            "visit": visit.id,
            "visit_form": link.id,
        }


def _capture(engine: Engine, graph: dict[str, int]) -> Any:
    with Session(engine) as session:
        return snapshots.capture_project_design(session, graph["project"])


@pytest.mark.integration
def test_should_capture_every_design_table_including_unplaced_library_entries(
    engine: Engine, graph: dict[str, int]
) -> None:
    payload = _capture(engine, graph).to_dict()

    assert _capture(engine, graph).project_id == graph["project"]
    assert payload["schema_version"] == 1
    assert payload["project"]["id"] == graph["project"]
    assert {name: len(rows) for name, rows in payload["tables"].items()} == {
        "unit": 2,
        "codelist": 2,
        "codelist_option": 1,
        "field_definition": 2,
        "form": 1,
        "form_field": 2,
        "field": 0,
        "visit": 1,
        "visit_form": 1,
    }
    assert graph["unplaced_definition"] in {row["id"] for row in payload["tables"]["field_definition"]}


@pytest.mark.integration
def test_should_preserve_legacy_case_nulls_order_and_annotation_keys(engine: Engine, graph: dict[str, int]) -> None:
    payload = _capture(engine, graph).to_dict()
    definition = next(row for row in payload["tables"]["field_definition"] if row["id"] == graph["definition"])
    form = payload["tables"]["form"][0]

    assert (definition["variable_name"], definition["decimal_digits"]) == ("legacy.AGE", None)
    assert (form["code"], form["domain"], form["order_index"]) == ("form.lower", "Lb Mixed", None)
    assert json.loads(form["annotation_positions"]) == {"legacy.AGE": {"y": 25}, "_form": {"y": -18}}
    assert payload["tables"]["codelist_option"][0]["code"] == "自由 code-中"
    assert payload["project"]["crf_version_date"] == "2026-11-20"
    assert payload["tables"]["form_field"][1]["field_definition_id"] is None


@pytest.mark.integration
def test_should_not_expose_runtime_paths_accounts_timestamps_or_foreign_rows(
    engine: Engine, graph: dict[str, int]
) -> None:
    snapshot = _capture(engine, graph)
    payload = snapshot.to_dict()

    assert "private-runtime-logo.png" not in snapshot.payload_json
    assert "FOREIGN_" not in snapshot.payload_json
    assert not {"owner_id", "created_at", "deleted_at", "company_logo_path"}.intersection(payload["project"])
    assert all("updated_at" not in row for row in payload["tables"]["field_definition"])
    assert set(payload["asset_references"]) == {"company_logo"}
    assert payload["asset_references"]["company_logo"] == hashlib.sha256(b"private-runtime-logo.png").hexdigest()


@pytest.mark.integration
def test_should_not_change_captured_bytes_or_returned_clones_after_live_edit(
    engine: Engine, graph: dict[str, int]
) -> None:
    snapshot = _capture(engine, graph)
    saved = snapshot.payload_json
    clone = snapshot.to_dict()
    clone["tables"]["form"][0]["name"] = "仅修改返回副本"
    with Session(engine) as session:
        session.execute(update(Form).where(Form.id == graph["form"]).values(name="后续正式修改"))
        session.commit()

    assert snapshot.payload_json == saved
    assert snapshot.to_dict()["tables"]["form"][0]["name"] == "表单"
    assert _capture(engine, graph).content_hash != snapshot.content_hash
    with pytest.raises(FrozenInstanceError):
        setattr(snapshot, "content_hash", "replacement")


@pytest.mark.integration
def test_should_read_persisted_values_without_flushing_dirty_orm_objects(engine: Engine, graph: dict[str, int]) -> None:
    with Session(engine) as session:
        before = read_design_revision(session, graph["project"])
        project = session.get(Project, graph["project"])
        project.name = "未保存的会话值"

        snapshot = snapshots.capture_project_design(session, graph["project"])

        with session.no_autoflush:
            assert session.scalar(select(Project.name).where(Project.id == graph["project"])) == "冻结设计"
            assert read_design_revision(session, graph["project"]) == before
        assert snapshot.to_dict()["project"]["name"] == "冻结设计"
        assert project.name == "未保存的会话值"


@pytest.mark.integration
def test_should_keep_hash_stable_for_runtime_timestamps_and_recycle_state(
    engine: Engine, graph: dict[str, int]
) -> None:
    before = _capture(engine, graph)
    with Session(engine) as session:
        session.execute(update(Project).where(Project.id == graph["project"]).values(deleted_at=datetime(2026, 11, 21)))
        session.execute(
            update(FieldDefinition)
            .where(FieldDefinition.id == graph["definition"])
            .values(updated_at=datetime(2030, 1, 1))
        )
        session.commit()

    after = _capture(engine, graph)
    assert after.content_hash == before.content_hash
    assert after.payload_json == before.payload_json


@pytest.mark.integration
@pytest.mark.parametrize("link", ["definition_unit", "definition_codelist", "visit_form"])
def test_should_refuse_cross_project_forward_dependencies(engine: Engine, graph: dict[str, int], link: str) -> None:
    with Session(engine) as session:
        if link == "visit_form":
            session.execute(
                update(VisitForm).where(VisitForm.id == graph["visit_form"]).values(form_id=graph["foreign_form"])
            )
        else:
            column = "unit_id" if link == "definition_unit" else "codelist_id"
            target = graph["foreign_unit"] if link == "definition_unit" else graph["foreign_list"]
            session.execute(
                update(FieldDefinition).where(FieldDefinition.id == graph["definition"]).values({column: target})
            )
        session.commit()

    with pytest.raises(snapshots.SnapshotError) as failure:
        _capture(engine, graph)
    assert failure.value.code == "SNAPSHOT_INVALID"
    assert "FOREIGN_" not in str(failure.value)


@pytest.mark.integration
def test_should_capture_legacy_field_rows_without_silently_claiming_formal_support(
    engine: Engine, graph: dict[str, int]
) -> None:
    with Session(engine) as session:
        session.add(
            Field(form_id=graph["form"], variable_name="old.lower", label="旧表字段", field_type="文本", precision=None)
        )
        session.commit()
    snapshot = _capture(engine, graph)

    assert snapshot.to_dict()["tables"]["field"][0]["variable_name"] == "old.lower"
    with pytest.raises(snapshots.SnapshotError) as failure:
        snapshots.assert_formal_renderable(snapshot)
    assert failure.value.code == "SNAPSHOT_LEGACY_UNSUPPORTED"


@pytest.mark.integration
def test_should_enforce_row_budget_without_returning_truncated_design(
    engine: Engine, graph: dict[str, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(snapshots, "MAX_SNAPSHOT_ROWS", 2)

    with pytest.raises(snapshots.SnapshotError) as failure:
        _capture(engine, graph)
    assert failure.value.code == "SNAPSHOT_LIMIT_EXCEEDED"
    assert failure.value.status_code == 413


@pytest.mark.integration
def test_should_enforce_utf8_payload_budget(
    engine: Engine, graph: dict[str, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(snapshots, "MAX_SNAPSHOT_BYTES", 100)

    with pytest.raises(snapshots.SnapshotError) as failure:
        _capture(engine, graph)
    assert failure.value.code == "SNAPSHOT_LIMIT_EXCEEDED"


@pytest.mark.integration
def test_should_refuse_missing_project_without_constructing_empty_snapshot(engine: Engine) -> None:
    with Session(engine) as session, pytest.raises(snapshots.SnapshotError) as failure:
        snapshots.capture_project_design(session, 999999)
    assert failure.value.status_code == 404


@pytest.mark.integration
def test_should_round_trip_canonical_snapshot_without_live_queries(engine: Engine, graph: dict[str, int]) -> None:
    original = _capture(engine, graph)

    restored = snapshots.decode_project_design(original.payload_json)

    assert restored == original
    assert restored.content_hash == hashlib.sha256(original.payload_json.encode("utf-8")).hexdigest()
    snapshots.assert_formal_renderable(restored)


@pytest.mark.integration
@pytest.mark.parametrize("change", ["version", "extra_table", "foreign_project", "dangling_definition", "duplicate_id"])
def test_should_reject_unsupported_or_corrupt_serialized_snapshots(
    engine: Engine, graph: dict[str, int], change: str
) -> None:
    payload = _capture(engine, graph).to_dict()
    if change == "version":
        payload["schema_version"] = 99
    elif change == "extra_table":
        payload["tables"]["user"] = []
    elif change == "foreign_project":
        payload["tables"]["form"][0]["project_id"] = graph["foreign_project"]
    elif change == "dangling_definition":
        payload["tables"]["form_field"][0]["field_definition_id"] = 987654
    else:
        payload["tables"]["unit"].append(dict(payload["tables"]["unit"][0]))

    with pytest.raises(snapshots.SnapshotError):
        snapshots.decode_project_design(json.dumps(payload, ensure_ascii=False))


@pytest.mark.unit
def test_should_classify_every_registered_design_model_column() -> None:
    roles = snapshots.snapshot_column_roles()

    assert set(roles) == {
        "project",
        "unit",
        "codelist",
        "codelist_option",
        "field_definition",
        "form",
        "form_field",
        "field",
        "visit",
        "visit_form",
    }
    for table, classified in roles.items():
        columns = [name for group in classified.values() for name in group]
        assert len(columns) == len(set(columns))
        assert set(columns) == set(Base.metadata.tables[table].columns.keys())


@pytest.mark.unit
@pytest.mark.parametrize("origin,storage", [("manual", "live_history"), ("scheduled", "full_set")])
def test_should_describe_both_manual_and_scheduled_formal_pairs_as_having_originals(origin: str, storage: str) -> None:
    capabilities = snapshots.describe_history("formal_pair", origin, storage, ("ecrf", "acrf"))

    assert capabilities["originals"] == ["ecrf", "acrf"]
    assert capabilities["layout"] is True
    assert capabilities["origin"] == origin
    assert capabilities["storage_source"] == storage


@pytest.mark.unit
def test_should_describe_quick_snapshots_without_original_or_asset_claims() -> None:
    capabilities = snapshots.describe_history("data_only", "scheduled", "live_history")

    assert capabilities["originals"] == []
    assert capabilities["layout"] is False
    assert capabilities["assets"] is False


@pytest.mark.unit
@pytest.mark.parametrize("kinds", [(), ("ecrf",), ("acrf",), ("ecrf", "ecrf")])
def test_should_not_describe_partial_pairs_as_completed_formal_records(kinds: tuple[str, ...]) -> None:
    with pytest.raises(snapshots.SnapshotError):
        snapshots.describe_history("formal_pair", "manual", "live_history", kinds)


@pytest.mark.integration
@pytest.mark.parametrize("link", ["instance", "visit", "unit", "codelist", "legacy_unit"])
def test_should_refuse_foreign_reverse_references(engine: Engine, graph: dict[str, int], link: str) -> None:
    with Session(engine) as session:
        if link == "instance":
            session.add(FormField(form_id=graph["foreign_form"], field_definition_id=graph["definition"]))
        elif link == "visit":
            visit = Visit(project_id=graph["foreign_project"], name="FOREIGN_VISIT", sequence=1)
            session.add(visit)
            session.flush()
            session.add(VisitForm(visit_id=visit.id, form_id=graph["form"], sequence=1))
        elif link == "legacy_unit":
            session.add(
                Field(
                    form_id=graph["foreign_form"],
                    variable_name="FOREIGN_LEGACY",
                    label="外部",
                    field_type="文本",
                    unit_id=graph["unit"],
                )
            )
        else:
            values = {"unit_id": graph["unit"]} if link == "unit" else {"codelist_id": graph["codelist"]}
            session.add(
                FieldDefinition(
                    project_id=graph["foreign_project"],
                    variable_name="FOREIGN_DEFINITION",
                    label="外部",
                    field_type="单选",
                    **values,
                )
            )
        session.commit()

    with pytest.raises(snapshots.SnapshotError) as failure:
        _capture(engine, graph)
    assert failure.value.code == "SNAPSHOT_INVALID"


@pytest.mark.integration
def test_should_capture_one_real_sqlite_state_when_writer_commits_between_table_reads(tmp_path: Path) -> None:
    file_engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'capture.db'}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(file_engine, "connect")
    def configure_connection(connection: Any, _record: Any) -> None:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(file_engine)
    with Session(file_engine) as session:
        project, _foreign = _seed_projects(session)
        ids = _seed_library(session, project)
        session.commit()
        project_id = project.id
    project_read, writer_done = threading.Event(), threading.Event()

    def pause_after_project(_conn: Any, _cursor: Any, statement: str, _params: Any, _ctx: Any, _many: bool) -> None:
        if threading.current_thread().name.startswith("snapshot-reader") and "FROM project" in statement:
            project_read.set()
            assert writer_done.wait(10), "writer did not complete"

    def read_snapshot() -> Any:
        with Session(file_engine) as session:
            return snapshots.capture_project_design(session, project_id)

    event.listen(file_engine, "after_cursor_execute", pause_after_project)
    try:
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="snapshot-reader") as executor:
            result = executor.submit(read_snapshot)
            try:
                assert project_read.wait(10), "reader did not reach project SELECT"
                with Session(file_engine) as writer:
                    writer.execute(update(Project).where(Project.id == project_id).values(name="并发新项目名"))
                    writer.execute(
                        update(FieldDefinition)
                        .where(FieldDefinition.id == ids["definition"])
                        .values(label="并发新标签")
                    )
                    writer.commit()
            finally:
                writer_done.set()
            payload = result.result(timeout=10).to_dict()
        definition = next(row for row in payload["tables"]["field_definition"] if row["id"] == ids["definition"])
        assert (payload["project"]["name"], definition["label"]) == ("冻结设计", "原始标签")
    finally:
        event.remove(file_engine, "after_cursor_execute", pause_after_project)
        file_engine.dispose()


@pytest.mark.integration
@pytest.mark.parametrize(
    "key,value",
    [
        ("name", None),
        ("name", 42),
        ("id", True),
        ("order_index", 2**63),
        ("crf_version_date", "not-a-date"),
        ("crf_version_date", 42),
    ],
)
def test_should_reject_invalid_serialized_scalar_types(
    engine: Engine, graph: dict[str, int], key: str, value: Any
) -> None:
    payload = _capture(engine, graph).to_dict()
    payload["project"][key] = value

    with pytest.raises(snapshots.SnapshotError):
        snapshots.decode_project_design(json.dumps(payload))


@pytest.mark.integration
@pytest.mark.parametrize(
    "change",
    [
        "top_shape",
        "table_shape",
        "rows_shape",
        "extra_column",
        "null_definition",
        "asset_shape",
        "asset_reference",
        "null_id",
    ],
)
def test_should_reject_malformed_closed_snapshot_shapes(engine: Engine, graph: dict[str, int], change: str) -> None:
    payload = _capture(engine, graph).to_dict()
    if change == "top_shape":
        payload = []
    elif change == "table_shape":
        payload["tables"] = []
    elif change == "rows_shape":
        payload["tables"]["unit"] = {}
    elif change == "extra_column":
        payload["project"]["is_admin"] = True
    elif change == "null_definition":
        payload["tables"]["form_field"][0]["field_definition_id"] = None
    elif change == "asset_shape":
        payload["asset_references"] = {"company_logo": None, "path": "not-accepted"}
    elif change == "asset_reference":
        payload["asset_references"]["company_logo"] = "not-a-hash"
    else:
        payload["tables"]["unit"][0]["id"] = None

    with pytest.raises(snapshots.SnapshotError):
        snapshots.decode_project_design(json.dumps(payload))


@pytest.mark.unit
@pytest.mark.parametrize("payload", [None, "{invalid", "[" * 2000 + "0" + "]" * 2000])
def test_should_translate_unreadable_json_to_safe_snapshot_failure(payload: Any) -> None:
    with pytest.raises(snapshots.SnapshotError):
        snapshots.decode_project_design(payload)


@pytest.mark.integration
def test_should_reject_invalid_unicode_in_serialized_snapshot(engine: Engine, graph: dict[str, int]) -> None:
    payload = _capture(engine, graph).to_dict()
    payload["project"]["name"] = "\ud800"

    with pytest.raises(snapshots.SnapshotError):
        snapshots.decode_project_design(json.dumps(payload, ensure_ascii=True))


@pytest.mark.integration
@pytest.mark.parametrize("limit_name,limit", [("MAX_SNAPSHOT_BYTES", 100), ("MAX_SNAPSHOT_ROWS", 2)])
def test_should_apply_budgets_when_reading_stored_snapshots(
    engine: Engine, graph: dict[str, int], monkeypatch: pytest.MonkeyPatch, limit_name: str, limit: int
) -> None:
    payload_json = _capture(engine, graph).payload_json
    monkeypatch.setattr(snapshots, limit_name, limit)

    with pytest.raises(snapshots.SnapshotError) as failure:
        snapshots.decode_project_design(payload_json)
    assert failure.value.code == "SNAPSHOT_LIMIT_EXCEEDED"


@pytest.mark.unit
@pytest.mark.parametrize("project_id", [True, "1", None, 2**63])
def test_should_refuse_invalid_project_identifiers_before_sql(engine: Engine, project_id: Any) -> None:
    with Session(engine) as session, pytest.raises(snapshots.SnapshotError):
        snapshots.capture_project_design(session, project_id)


@pytest.mark.unit
@pytest.mark.parametrize(
    "kind,origin,storage",
    [
        ("unknown", "manual", "live_history"),
        ("data_only", "unknown", "live_history"),
        ("data_only", "manual", "unknown"),
    ],
)
def test_should_reject_unknown_capability_origin_or_storage(kind: str, origin: str, storage: str) -> None:
    with pytest.raises(snapshots.SnapshotError):
        snapshots.describe_history(kind, origin, storage)


@pytest.mark.unit
def test_should_not_attach_originals_to_a_data_only_snapshot() -> None:
    with pytest.raises(snapshots.SnapshotError):
        snapshots.describe_history("data_only", "scheduled", "live_history", ("ecrf", "acrf"))
