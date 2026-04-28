from __future__ import annotations

from pathlib import Path
import subprocess
import sys

import pytest

from scripts.run_perf_baseline import (
    SCENARIO_MEASURED_COUNT,
    SCENARIO_WARMUP_COUNT,
    _build_scenarios,
    _cleanup_temp_docx,
    _create_temp_docx_upload,
    _read_summary,
    _should_record_iteration,
    _validate_response_status,
)
from src.services.docx_import_service import DocxImportService

EXPECTED_SCENARIO_COUNT = 15


def test_create_temp_docx_upload_roundtrips_with_docx_service(tmp_path: Path) -> None:
    source = tmp_path / "perf.docx"
    source.write_bytes(b"PK\x03\x04perf-docx")

    temp_id, stored_path = _create_temp_docx_upload(source)
    try:
        resolved_path = DocxImportService.get_temp_path(temp_id)
        assert resolved_path == stored_path
        assert stored_path.exists()
    finally:
        _cleanup_temp_docx(temp_id)



def test_build_scenarios_places_projects_reorder_before_project_creating_mutations() -> None:
    ids = {
        "project_id": 101,
        "form_id": 201,
        "visit_id": 301,
        "codelist_id": 401,
        "unit_ids": [501, 502],
        "visit_ids": [301, 302],
        "form_ids": [201, 202],
        "field_definition_ids": [601, 602],
        "form_field_ids": [701, 702],
        "visit_form_form_ids": [201, 202],
        "codelist_ids": [401, 402],
    }

    scenarios = _build_scenarios("perf-temp-id", ids, b"docx", b"import-db", b"merge-db")
    scenario_names = [scenario.name for scenario in scenarios]

    assert len(scenarios) == EXPECTED_SCENARIO_COUNT
    assert scenario_names[:5] == ["docx_preview", "word_export", "projects_reorder", "visits_reorder", "forms_reorder"]
    assert scenario_names.index("forms_reorder") < scenario_names.index("docx_execute")
    assert scenario_names.index("field_definitions_reorder") < scenario_names.index("docx_execute")
    assert scenario_names.index("projects_reorder") < scenario_names.index("project_copy")
    assert scenario_names.index("projects_reorder") < scenario_names.index("project_db_import")
    assert scenario_names.index("projects_reorder") < scenario_names.index("database_merge")

    projects_reorder = next(scenario for scenario in scenarios if scenario.name == "projects_reorder")
    assert projects_reorder.payload == [ids["project_id"]]



def test_validate_response_status_rejects_unexpected_client_error() -> None:
    with pytest.raises(RuntimeError, match="projects_reorder"):
        _validate_response_status(
            scenario_name="projects_reorder",
            actual_status=400,
            expected_status=204,
            response_text='{"detail":"bad request"}',
        )



def test_should_record_iteration_skips_warmup_runs() -> None:
    assert SCENARIO_WARMUP_COUNT == 1
    assert SCENARIO_MEASURED_COUNT == 5
    assert _should_record_iteration(is_warmup=True) is False
    assert _should_record_iteration(is_warmup=False) is True



def test_read_summary_marks_success_responses_ok() -> None:
    row = _read_summary(
        {
            "status_code": 204,
            "request_total_ms": 12.5,
            "route_template": "/api/projects/reorder",
        },
        "projects_reorder",
        "cold",
        2,
        False,
        {"projects": 1},
    )

    assert row["status"] == "ok"
    assert row["iteration"] == 2
    assert row["is_warmup"] is False
    assert row["metrics"]["status_code"] == 204



def test_backend_perf_harness_script_compiles() -> None:
    subprocess.run(
        [sys.executable, '-m', 'py_compile', 'backend/scripts/run_perf_baseline.py'],
        cwd=Path(__file__).resolve().parents[1].parent,
        check=True,
    )
