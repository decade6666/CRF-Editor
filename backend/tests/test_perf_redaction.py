from __future__ import annotations

import json
from pathlib import Path

from src.perf import sanitize_sql_shape

SENTINELS = [
    "PERF_SECRET_TOKEN_20260425",
    "PERF_SECRET_FIELD_LABEL_20260425",
    "PERF_SECRET_DOCX_BODY_20260425",
    "PERF_SECRET_AI_PAYLOAD_20260425",
    "/home/perf-secret/path/20260425",
    r"C:\\perf-secret\\path\\20260425",
]



def test_sanitize_sql_shape_redacts_secret_literals() -> None:
    statement = (
        "SELECT * FROM demo WHERE token='PERF_SECRET_TOKEN_20260425' "
        "AND field='PERF_SECRET_FIELD_LABEL_20260425' "
        "AND path='/home/perf-secret/path/20260425'"
    )
    shape = sanitize_sql_shape(statement)
    for sentinel in SENTINELS:
        assert sentinel not in shape



def test_perf_artifact_scan_detects_no_sentinels(tmp_path: Path) -> None:
    artifact = tmp_path / "artifact.jsonl"
    rows = [{"shape": sanitize_sql_shape("SELECT * FROM demo WHERE token='PERF_SECRET_TOKEN_20260425'") }]
    artifact.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows), encoding="utf-8")
    content = artifact.read_text(encoding="utf-8")
    for sentinel in SENTINELS:
        assert sentinel not in content
