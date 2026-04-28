from __future__ import annotations

import argparse
import json
import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any, Callable, Iterator
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app
from scripts.generate_perf_fixture import (
    FIXTURE_ID,
    FIXTURE_SCHEMA_VERSION,
    FIXTURE_SEED,
    generate_heavy_fixture,
)
from src.config import AdminConfig, AppConfig, AuthConfig
from src.database import attach_perf_sql_listeners, get_read_session, get_session
from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.models.codelist import CodeList
from src.models.unit import Unit
from src.services.docx_import_service import DocxImportService
from tests.helpers import auth_headers, login_as

CHANGE_NAME = "research-performance-constraints"


def _resolve_baseline_dir() -> Path:
    active_dir = REPO_ROOT / "openspec" / "changes" / CHANGE_NAME / "baselines"
    if active_dir.exists():
        return active_dir
    archive_root = REPO_ROOT / "openspec" / "changes" / "archive"
    archived_dirs = sorted(archive_root.glob(f"*-{CHANGE_NAME}/baselines"))
    if archived_dirs:
        return archived_dirs[-1]
    return active_dir


BASELINE_DIR = _resolve_baseline_dir()
BACKEND_OUTPUTS = {
    "cold": BASELINE_DIR / "backend-cold-heavy-1600.jsonl",
    "warm": BASELINE_DIR / "backend-warm-heavy-1600.jsonl",
}
SCENARIO_WARMUP_COUNT = 1
SCENARIO_MEASURED_COUNT = 5


@dataclass(frozen=True)
class ScenarioSpec:
    name: str
    path: str
    payload: dict[str, Any] | list[int] | None
    files: dict[str, tuple[str, bytes, str]] | None
    expected_status: int

_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin", bootstrap_password="bootstrap-pass-123"),
)


class BaselineCollector:
    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []

    def log_summary(self, summary: dict[str, Any]) -> None:
        self.records.append(summary)

    def pop_last(self) -> dict[str, Any]:
        if not self.records:
            raise RuntimeError("missing perf summary")
        return self.records.pop()



def _create_engine(db_path: Path):
    from sqlalchemy import create_engine

    engine = create_engine(
        f"sqlite+pysqlite:///{db_path.as_posix()}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=5000")
        dbapi_conn.execute("PRAGMA synchronous=NORMAL")

    attach_perf_sql_listeners(engine)
    Base.metadata.create_all(engine)
    return engine



def _seed_fixture_into_engine(engine, fixture_db_path: Path) -> None:
    import sqlite3

    source = sqlite3.connect(str(fixture_db_path))
    destination = sqlite3.connect(engine.url.database)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()



def _load_owner(engine, username: str) -> User:
    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == username))
        if owner is None:
            raise RuntimeError(f"missing owner: {username}")
        return owner



def _read_summary(record: dict[str, Any], scenario: str, mode: str, iteration: int, is_warmup: bool, fixture_counts: dict[str, int]) -> dict[str, Any]:
    status_code = int(record.get("status_code") or 0)
    status = "ok" if 200 <= status_code < 300 else "expected_error"
    return {
        "run_id": f"{scenario}-{mode}-{iteration}",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "git_sha": os.environ.get("GIT_SHA", "local"),
        "fixture_id": FIXTURE_ID,
        "fixture_schema_version": FIXTURE_SCHEMA_VERSION,
        "mode": mode,
        "scenario": scenario,
        "iteration": iteration,
        "is_warmup": is_warmup,
        "status": status,
        "duration_ms": record["request_total_ms"],
        "metrics": record,
        "fixture_counts": fixture_counts,
    }



def _should_record_iteration(*, is_warmup: bool) -> bool:
    return not is_warmup



def _validate_response_status(*, scenario_name: str, actual_status: int, expected_status: int, response_text: str) -> None:
    if actual_status != expected_status:
        raise RuntimeError(
            f"scenario {scenario_name} failed: expected {expected_status}, got {actual_status} {response_text}"
        )



def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")



def _create_temp_docx_upload(path: Path) -> tuple[str, Path]:
    temp_id, stored_path = DocxImportService.save_temp_file(path.read_bytes(), path.name)
    return temp_id, Path(stored_path)



def _cleanup_temp_docx(temp_id: str) -> None:
    DocxImportService.cleanup_temp(temp_id)



def _collect_ids(engine) -> dict[str, Any]:
    with Session(engine) as session:
        project = session.scalar(select(Project).where(Project.name == FIXTURE_ID.replace("seed", "seed")))
        project = session.scalar(select(Project).order_by(Project.id))
        assert project is not None
        visits = session.scalars(select(Visit).where(Visit.project_id == project.id).order_by(Visit.sequence)).all()
        forms = session.scalars(select(Form).where(Form.project_id == project.id).order_by(Form.order_index)).all()
        field_defs = session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == project.id).order_by(FieldDefinition.order_index)).all()
        codelists = session.scalars(select(CodeList).where(CodeList.project_id == project.id).order_by(CodeList.order_index)).all()
        units = session.scalars(select(Unit).where(Unit.project_id == project.id).order_by(Unit.order_index)).all()
        form_fields = session.scalars(select(FormField).where(FormField.form_id == forms[0].id).order_by(FormField.order_index)).all()
        visit_forms = session.scalars(select(VisitForm).where(VisitForm.visit_id == visits[0].id).order_by(VisitForm.sequence)).all()
        return {
            "project_id": project.id,
            "form_id": forms[0].id,
            "visit_id": visits[0].id,
            "codelist_id": codelists[0].id,
            "unit_ids": [unit.id for unit in units],
            "visit_ids": [visit.id for visit in visits],
            "form_ids": [form.id for form in forms],
            "field_definition_ids": [field_definition.id for field_definition in field_defs],
            "form_field_ids": [form_field.id for form_field in form_fields],
            "visit_form_form_ids": [item.form_id for item in visit_forms],
            "codelist_ids": [codelist.id for codelist in codelists],
        }



def _build_scenarios(
    temp_id: str,
    ids: dict[str, Any],
    docx_bytes: bytes,
    import_db_bytes: bytes,
    merge_db_bytes: bytes,
) -> list[ScenarioSpec]:
    reversed_form_ids = list(reversed(ids["form_ids"]))
    reversed_visit_ids = list(reversed(ids["visit_ids"]))
    reversed_field_definition_ids = list(reversed(ids["field_definition_ids"]))
    reversed_form_field_ids = list(reversed(ids["form_field_ids"]))
    reversed_visit_form_form_ids = list(reversed(ids["visit_form_form_ids"]))
    reversed_codelist_ids = list(reversed(ids["codelist_ids"]))
    reversed_unit_ids = list(reversed(ids["unit_ids"]))
    docx_payload = {"temp_id": temp_id, "form_indices": [0, 1, 2]}
    return [
        ScenarioSpec("docx_preview", f"/api/projects/{ids['project_id']}/import-docx/preview", None, {"file": ("perf.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, 200),
        ScenarioSpec("word_export", f"/api/projects/{ids['project_id']}/export/word", None, None, 200),
        ScenarioSpec("projects_reorder", "/api/projects/reorder", [ids["project_id"]], None, 204),
        ScenarioSpec("visits_reorder", f"/api/projects/{ids['project_id']}/visits/reorder", reversed_visit_ids, None, 200),
        ScenarioSpec("forms_reorder", f"/api/projects/{ids['project_id']}/forms/reorder", reversed_form_ids, None, 200),
        ScenarioSpec("field_definitions_reorder", f"/api/projects/{ids['project_id']}/field-definitions/reorder", reversed_field_definition_ids, None, 200),
        ScenarioSpec("form_fields_reorder", f"/api/forms/{ids['form_id']}/fields/reorder", {"ordered_ids": reversed_form_field_ids}, None, 204),
        ScenarioSpec("visit_forms_reorder", f"/api/visits/{ids['visit_id']}/forms/reorder", reversed_visit_form_form_ids, None, 204),
        ScenarioSpec("codelists_reorder", f"/api/projects/{ids['project_id']}/codelists/reorder", reversed_codelist_ids, None, 200),
        ScenarioSpec("codelist_options_reorder", f"/api/projects/{ids['project_id']}/codelists/{ids['codelist_id']}/options/reorder", list(range(1, 21)), None, 200),
        ScenarioSpec("units_reorder", f"/api/projects/{ids['project_id']}/units/reorder", reversed_unit_ids, None, 200),
        ScenarioSpec("docx_execute", f"/api/projects/{ids['project_id']}/import-docx/execute", docx_payload, None, 200),
        ScenarioSpec("project_copy", f"/api/projects/{ids['project_id']}/copy", None, None, 201),
        ScenarioSpec("project_db_import", "/api/projects/import/project-db", None, {"file": ("fixture.db", import_db_bytes, "application/octet-stream")}, 200),
        ScenarioSpec("database_merge", "/api/projects/import/database-merge", None, {"file": ("fixture.db", merge_db_bytes, "application/octet-stream")}, 200),
    ]


@contextmanager
def _patched_test_app(engine, collector: BaselineCollector) -> Iterator[TestClient]:
    def _write_override():
        with Session(engine) as session:
            with session.begin():
                yield session

    def _read_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _write_override
    app.dependency_overrides[get_read_session] = _read_override

    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.user_admin_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.import_docx.review_forms", _fake_review_forms), \
         patch("src.routers.import_docx.DocxScreenshotService.start", lambda **_kwargs: None), \
         patch("main.init_db"), \
         patch("main.logging.getLogger") as get_logger:
        logger = get_logger.return_value
        logger.info.side_effect = lambda _message, *args, **kwargs: collector.log_summary(args[0]) if args else None
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client

    app.dependency_overrides.clear()


async def _fake_review_forms(_forms):
    return {}, None



def run_backend_baseline(*, mode: str, fixture_name: str) -> Path:
    if fixture_name != "heavy-1600":
        raise ValueError("Only --fixture heavy-1600 is supported")
    if mode not in BACKEND_OUTPUTS:
        raise ValueError("Mode must be cold or warm")

    os.environ["CRF_PERF_BASELINE"] = "1"
    collector = BaselineCollector()
    rows: list[dict[str, Any]] = []

    with TemporaryDirectory(prefix=f"backend-baseline-{mode}-") as temp_dir:
        fixture_root = Path(temp_dir)
        with generate_heavy_fixture(seed=FIXTURE_SEED, root_dir=fixture_root) as fixture:
            engine = _create_engine(fixture_root / "runtime.sqlite3")
            try:
                _seed_fixture_into_engine(engine, fixture.db_path)
                ids = _collect_ids(engine)
                docx_bytes = fixture.upload_docx_path.read_bytes()
                import_db_bytes = fixture.db_path.read_bytes()
                merge_db_bytes = fixture.merge_db_path.read_bytes()
                temp_id, _ = _create_temp_docx_upload(fixture.upload_docx_path)
                with _patched_test_app(engine, collector) as client:
                    token = login_as(client, fixture.owner_username, fixture.owner_password)
                    scenarios = _build_scenarios(temp_id, ids, docx_bytes, import_db_bytes, merge_db_bytes)
                    for scenario in scenarios:
                        for iteration in range(1, SCENARIO_WARMUP_COUNT + SCENARIO_MEASURED_COUNT + 1):
                            is_warmup = iteration <= SCENARIO_WARMUP_COUNT
                            scenario_payload = scenario.payload
                            if scenario.name == "docx_execute":
                                temp_id, _ = _create_temp_docx_upload(fixture.upload_docx_path)
                                scenario_payload = {"temp_id": temp_id, "form_indices": [0, 1, 2]}
                            if scenario.files is not None:
                                response = client.post(scenario.path, files=scenario.files, headers=auth_headers(token))
                            elif scenario_payload is None:
                                response = client.post(scenario.path, headers=auth_headers(token))
                            else:
                                response = client.post(scenario.path, json=scenario_payload, headers=auth_headers(token))
                            _validate_response_status(
                                scenario_name=scenario.name,
                                actual_status=response.status_code,
                                expected_status=scenario.expected_status,
                                response_text=response.text,
                            )
                            summary = collector.pop_last()
                            if _should_record_iteration(is_warmup=is_warmup):
                                rows.append(
                                    _read_summary(
                                        summary,
                                        scenario.name,
                                        mode,
                                        iteration,
                                        is_warmup,
                                        fixture.counts,
                                    )
                                )
                            if scenario.name == "docx_execute" and isinstance(scenario_payload, dict):
                                _cleanup_temp_docx(str(scenario_payload["temp_id"]))
                _cleanup_temp_docx(temp_id)
            finally:
                engine.dispose()

    output_path = BACKEND_OUTPUTS[mode]
    _write_jsonl(output_path, rows)
    return output_path



def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run backend heavy-1600 perf baseline")
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--mode", required=True, choices=["cold", "warm"])
    args = parser.parse_args(argv)

    output_path = run_backend_baseline(mode=args.mode, fixture_name=args.fixture)
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
