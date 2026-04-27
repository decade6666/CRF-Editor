from __future__ import annotations

from scripts.summarize_perf_evidence import _summarize_backend, summarize_perf_evidence


def test_perf_evidence_summary_has_expected_top_level_shape() -> None:
    payload = summarize_perf_evidence()
    assert payload['fixture_id'] == 'heavy-1600-seed-20260425'
    assert payload['fixture_schema_version'] == 1
    assert isinstance(payload['routes'], list)
    assert isinstance(payload['frontend'], list)



def test_perf_evidence_summary_emits_below_threshold_without_candidates() -> None:
    payload = summarize_perf_evidence()
    below_threshold_routes = [route for route in payload['routes'] if route['reason'] == 'below-threshold']
    assert below_threshold_routes
    assert all(route['candidate_types'] == [] for route in below_threshold_routes)



def test_perf_evidence_summary_limits_frontend_candidates() -> None:
    payload = summarize_perf_evidence()
    allowed = {'frontend-bundle', 'frontend-lazy', 'frontend-render'}
    frontend_candidates = [candidate for row in payload['frontend'] for candidate in row['candidate_types']]
    assert all(candidate in allowed for candidate in frontend_candidates)



def test_perf_evidence_summary_uses_busy_wait_metric_not_busy_count_for_sqlite_wait_thresholds() -> None:
    rows = [
        {
            'scenario': 'database_merge',
            'mode': 'warm',
            'is_warmup': False,
            'metrics': {
                'request_total_ms': 1000.0,
                'sql_total_ms': 20.0,
                'sql_count': 5,
                'sqlite_busy_count': 999,
                'sqlite_busy_wait_ms': 20.0,
                'phase_timings_ms': {
                    'flush_ms': 10.0,
                    'commit_ms': 10.0,
                    'docx_parse_ms': 0.0,
                    'docx_generate_ms': 0.0,
                    'temp_file_write_ms': 0.0,
                    'file_response_prepare_ms': 0.0,
                },
                'sql_shapes': [],
            },
        }
        for _ in range(5)
    ]

    summary = _summarize_backend(rows)[0]
    assert summary['p95_sqlite_busy_wait_ms'] == 20.0
    assert 'SQL-4' not in summary['thresholds_triggered']
    assert 'TX-3' not in summary['thresholds_triggered']



def test_perf_evidence_summary_surfaces_explain_findings_as_sql3_candidates() -> None:
    rows = [
        {
            'scenario': 'project_copy',
            'mode': 'warm',
            'is_warmup': False,
            'metrics': {
                'request_total_ms': 1000.0,
                'sql_total_ms': 400.0,
                'sql_count': 101,
                'sqlite_busy_count': 0,
                'sqlite_busy_wait_ms': 0.0,
                'phase_timings_ms': {
                    'flush_ms': 0.0,
                    'commit_ms': 0.0,
                    'docx_parse_ms': 0.0,
                    'docx_generate_ms': 0.0,
                    'temp_file_write_ms': 0.0,
                    'file_response_prepare_ms': 0.0,
                },
                'sql_shapes': [
                    {
                        'hash': 'abc123',
                        'shape': 'SELECT * FROM form_field WHERE project_id = ?',
                        'explain': ['SCAN form_field'],
                    }
                ],
            },
        }
        for _ in range(5)
    ]

    summary = _summarize_backend(rows)[0]
    assert 'SQL-3' in summary['thresholds_triggered']
    assert summary['explain_findings']
    assert 'query-shape' in summary['candidate_types']
