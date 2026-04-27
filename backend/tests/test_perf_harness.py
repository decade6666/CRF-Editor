from __future__ import annotations

import json
from pathlib import Path

from scripts.run_perf_baseline import BACKEND_OUTPUTS, SCENARIO_MEASURED_COUNT, SCENARIO_WARMUP_COUNT


EXPECTED_SCENARIO_COUNT = 15



def test_backend_cold_baseline_file_has_expected_shape() -> None:
    path = BACKEND_OUTPUTS["cold"]
    assert path.exists()
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == EXPECTED_SCENARIO_COUNT * (SCENARIO_WARMUP_COUNT + SCENARIO_MEASURED_COUNT)
    assert len({row["scenario"] for row in rows}) == EXPECTED_SCENARIO_COUNT
    assert sum(1 for row in rows if row["is_warmup"]) == EXPECTED_SCENARIO_COUNT * SCENARIO_WARMUP_COUNT
    assert sum(1 for row in rows if not row["is_warmup"]) == EXPECTED_SCENARIO_COUNT * SCENARIO_MEASURED_COUNT

    sample = rows[0]
    assert sample["fixture_id"] == "heavy-1600-seed-20260425"
    assert sample["fixture_schema_version"] == 1
    assert sample["mode"] == "cold"
    assert "request_total_ms" in sample["metrics"]
    assert "route_template" in sample["metrics"]
