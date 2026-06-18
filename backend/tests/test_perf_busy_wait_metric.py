from __future__ import annotations

from src.perf import begin_request_metrics, finish_request_metrics, increment_sqlite_busy_count, record_sql_statement, record_sqlite_busy_wait


def test_perf_summary_includes_sqlite_busy_wait_ms() -> None:
    begin_request_metrics('GET', '/api/test/perf/busy')
    record_sql_statement('SELECT 1', 5.0)
    increment_sqlite_busy_count()
    record_sqlite_busy_wait(12.5)
    summary = finish_request_metrics(200)

    assert summary['sqlite_busy_count'] == 1
    assert summary['sqlite_busy_wait_ms'] == 12.5
