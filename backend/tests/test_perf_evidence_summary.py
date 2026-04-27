from __future__ import annotations

import json
from pathlib import Path

from scripts.summarize_perf_evidence import OUTPUT_PATH, summarize_perf_evidence



def test_perf_evidence_summary_has_expected_top_level_shape() -> None:
    payload = summarize_perf_evidence()
    assert payload['fixture_id'] == 'heavy-1600-seed-20260425'
    assert payload['fixture_schema_version'] == 1
    assert isinstance(payload['routes'], list)
    assert isinstance(payload['frontend'], list)
    assert OUTPUT_PATH.exists()



def test_perf_evidence_summary_emits_below_threshold_without_candidates() -> None:
    payload = json.loads(OUTPUT_PATH.read_text(encoding='utf-8')) if OUTPUT_PATH.exists() else summarize_perf_evidence()
    below_threshold_routes = [route for route in payload['routes'] if route['reason'] == 'below-threshold']
    assert below_threshold_routes
    assert all(route['candidate_types'] == [] for route in below_threshold_routes)



def test_perf_evidence_summary_limits_frontend_candidates() -> None:
    payload = summarize_perf_evidence()
    allowed = {'frontend-bundle', 'frontend-lazy', 'frontend-render'}
    frontend_candidates = [candidate for row in payload['frontend'] for candidate in row['candidate_types']]
    assert all(candidate in allowed for candidate in frontend_candidates)
