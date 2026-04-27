from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
CHANGE_NAME = 'research-performance-constraints'


def _resolve_baseline_dir() -> Path:
  active_dir = REPO_ROOT / 'openspec' / 'changes' / CHANGE_NAME / 'baselines'
  if active_dir.exists():
    return active_dir
  archive_root = REPO_ROOT / 'openspec' / 'changes' / 'archive'
  archived_dirs = sorted(archive_root.glob(f'*-{CHANGE_NAME}/baselines'))
  if archived_dirs:
    return archived_dirs[-1]
  return active_dir


BASELINE_DIR = _resolve_baseline_dir()
OUTPUT_PATH = BASELINE_DIR / 'evidence-summary.json'
FIXTURE_ID = 'heavy-1600-seed-20260425'
FIXTURE_SCHEMA_VERSION = 1

BACKEND_FILES = [
  BASELINE_DIR / 'backend-cold-heavy-1600.jsonl',
  BASELINE_DIR / 'backend-warm-heavy-1600.jsonl',
]
FRONTEND_FILES = [
  BASELINE_DIR / 'frontend-cold-heavy-1600.jsonl',
  BASELINE_DIR / 'frontend-warm-heavy-1600.jsonl',
]
BUILD_METRICS_FILE = BASELINE_DIR / 'frontend-build-heavy-1600.json'

BACKEND_ROUTE_TEMPLATES = {
  'docx_preview': '/api/projects/{project_id}/import-docx/preview',
  'docx_execute': '/api/projects/{project_id}/import-docx/execute',
  'word_export': '/api/projects/{project_id}/export/word',
  'project_copy': '/api/projects/{project_id}/copy',
  'project_db_import': '/api/projects/import/project-db',
  'database_merge': '/api/projects/import/database-merge',
  'projects_reorder': '/api/projects/reorder',
  'visits_reorder': '/api/projects/{project_id}/visits/reorder',
  'forms_reorder': '/api/projects/{project_id}/forms/reorder',
  'field_definitions_reorder': '/api/projects/{project_id}/field-definitions/reorder',
  'form_fields_reorder': '/api/forms/{form_id}/fields/reorder',
  'visit_forms_reorder': '/api/visits/{visit_id}/forms/reorder',
  'codelists_reorder': '/api/projects/{project_id}/codelists/reorder',
  'codelist_options_reorder': '/api/projects/{project_id}/codelists/{cl_id}/options/reorder',
  'units_reorder': '/api/projects/{project_id}/units/reorder',
}
FRONTEND_ALLOWED_CANDIDATES = {'frontend-bundle', 'frontend-lazy', 'frontend-render'}
BACKEND_ALLOWED_CANDIDATES = {'index', 'query-shape', 'migration', 'flush-batching', 'transaction-lifetime', 'docx-cpu', 'file-io'}



def _load_jsonl(path: Path) -> list[dict[str, Any]]:
  if not path.exists():
    return []
  return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]



def _percentile(sorted_values: list[float], ratio: float) -> float:
  if not sorted_values:
    return 0.0
  index = min(len(sorted_values) - 1, max(0, int(round((len(sorted_values) - 1) * ratio))))
  return float(sorted_values[index])



def _safe_ratio(numerator: float, denominator: float) -> float:
  if denominator <= 0:
    return 0.0
  return numerator / denominator



def _summarize_backend(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
  grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
  for row in rows:
    if row.get('is_warmup'):
      continue
    grouped[(row['scenario'], row['mode'])].append(row)

  summaries = []
  for (scenario, mode), group in sorted(grouped.items()):
    request_totals = sorted(float(row['metrics'].get('request_total_ms') or 0.0) for row in group)
    sql_totals = sorted(float(row['metrics'].get('sql_total_ms') or 0.0) for row in group)
    sql_counts = [int(row['metrics'].get('sql_count') or 0) for row in group]
    flushes = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('flush_ms') or 0.0) for row in group)
    commits = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('commit_ms') or 0.0) for row in group)
    sqlite_busy = sorted(float(row['metrics'].get('sqlite_busy_count') or 0.0) for row in group)
    docx_parse = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('docx_parse_ms') or 0.0) for row in group)
    docx_generate = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('docx_generate_ms') or 0.0) for row in group)
    temp_file_write = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('temp_file_write_ms') or 0.0) for row in group)
    file_response_prepare = sorted(float((row['metrics'].get('phase_timings_ms') or {}).get('file_response_prepare_ms') or 0.0) for row in group)

    thresholds_triggered = []
    candidate_types = []
    median_request_total = float(median(request_totals)) if request_totals else 0.0
    median_sql_total = float(median(sql_totals)) if sql_totals else 0.0
    if _safe_ratio(median_sql_total, median_request_total) >= 0.25:
      thresholds_triggered.append('SQL-1')
    if any(count > 100 for count in sql_counts):
      thresholds_triggered.append('SQL-2')
    if _percentile(sqlite_busy, 0.95) >= 200.0:
      thresholds_triggered.extend(['SQL-4', 'TX-3'])
    if _percentile(flushes, 0.95) >= 200.0:
      thresholds_triggered.append('TX-1')
    if _percentile(commits, 0.95) >= 200.0:
      thresholds_triggered.append('TX-2')
    if sum(1 for value in flushes if value > 0) > 10 and _safe_ratio(float(median(flushes)) if flushes else 0.0, median_request_total) >= 0.15:
      thresholds_triggered.append('TX-4')
    if _safe_ratio(float(median(docx_parse)) if docx_parse else 0.0, median_request_total) >= 0.30:
      thresholds_triggered.append('CPU-1')
    if _safe_ratio(float(median(docx_generate)) if docx_generate else 0.0, median_request_total) >= 0.30:
      thresholds_triggered.append('CPU-2')
    if _safe_ratio(float(median(temp_file_write)) if temp_file_write else 0.0, median_request_total) >= 0.20:
      thresholds_triggered.append('IO-1')
    if _safe_ratio(float(median(file_response_prepare)) if file_response_prepare else 0.0, median_request_total) >= 0.20:
      thresholds_triggered.append('IO-2')

    if any(code.startswith('SQL-') for code in thresholds_triggered):
      candidate_types.extend(['query-shape'])
    if any(code.startswith('TX-') for code in thresholds_triggered):
      candidate_types.extend(['flush-batching'])
    if any(code.startswith('CPU-') for code in thresholds_triggered):
      candidate_types.extend(['docx-cpu'])
    if any(code.startswith('IO-') for code in thresholds_triggered):
      candidate_types.extend(['file-io'])

    candidate_types = [candidate for candidate in dict.fromkeys(candidate_types) if candidate in BACKEND_ALLOWED_CANDIDATES]
    reason = 'accepted' if candidate_types else 'below-threshold'
    summaries.append({
      'scenario': scenario,
      'route_template': BACKEND_ROUTE_TEMPLATES.get(scenario, ''),
      'mode': mode,
      'median_request_total_ms': median_request_total,
      'p95_request_total_ms': _percentile(request_totals, 0.95),
      'median_sql_total_ms': median_sql_total,
      'max_sql_count': max(sql_counts) if sql_counts else 0,
      'p95_flush_ms': _percentile(flushes, 0.95),
      'p95_commit_ms': _percentile(commits, 0.95),
      'p95_sqlite_busy_wait_ms': _percentile(sqlite_busy, 0.95),
      'explain_findings': [],
      'thresholds_triggered': thresholds_triggered,
      'candidate_types': candidate_types if reason == 'accepted' else [],
      'reason': reason,
    })
  return summaries



def _summarize_frontend(rows: list[dict[str, Any]], build_metrics: dict[str, Any]) -> list[dict[str, Any]]:
  grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
  for row in rows:
    if row.get('is_warmup'):
      continue
    grouped[(row['scenario'], row['mode'])].append(row)

  summaries = []
  for (scenario, mode), group in sorted(grouped.items()):
    durations = sorted(float((row.get('metrics') or {}).get('interaction_duration_ms') or 0.0) for row in group)
    network_counts = [int((row.get('metrics') or {}).get('network_count') or 0) for row in group]
    chunk_load_counts = [int((row.get('metrics') or {}).get('chunk_load_count') or 0) for row in group]
    candidate_types = []
    reason = 'below-threshold'
    if any(row.get('status') == 'blocked' for row in group):
      reason = 'below-threshold'
    elif max(chunk_load_counts or [0]) > 0:
      candidate_types.append('frontend-lazy')
      reason = 'accepted'
    elif _percentile(durations, 0.95) > 0:
      candidate_types.append('frontend-render')
      reason = 'accepted'

    candidate_types = [candidate for candidate in dict.fromkeys(candidate_types) if candidate in FRONTEND_ALLOWED_CANDIDATES]
    summaries.append({
      'scenario': scenario,
      'mode': mode,
      'median_interaction_duration_ms': float(median(durations)) if durations else 0.0,
      'p95_interaction_duration_ms': _percentile(durations, 0.95),
      'network_count': max(network_counts) if network_counts else 0,
      'chunk_load_count': max(chunk_load_counts) if chunk_load_counts else 0,
      'candidate_types': candidate_types if reason == 'accepted' else [],
      'reason': reason,
    })

  buckets = build_metrics.get('buckets') or {}
  total_js = (buckets.get('total-js') or {}).get('raw_bytes', 0)
  vendor_ep = (buckets.get('vendor-ep') or {}).get('raw_bytes', 0)
  if total_js or vendor_ep:
    bundle_reason = 'accepted' if vendor_ep > 0 else 'below-threshold'
    summaries.append({
      'scenario': 'frontend_build',
      'mode': 'build',
      'median_interaction_duration_ms': 0.0,
      'p95_interaction_duration_ms': 0.0,
      'network_count': 0,
      'chunk_load_count': 0,
      'candidate_types': ['frontend-bundle'] if bundle_reason == 'accepted' else [],
      'reason': bundle_reason,
    })
  return summaries



def summarize_perf_evidence() -> dict[str, Any]:
  backend_rows = []
  for path in BACKEND_FILES:
    backend_rows.extend(_load_jsonl(path))
  frontend_rows = []
  for path in FRONTEND_FILES:
    frontend_rows.extend(_load_jsonl(path))
  build_metrics = json.loads(BUILD_METRICS_FILE.read_text(encoding='utf-8')) if BUILD_METRICS_FILE.exists() else {}

  payload = {
    'fixture_id': FIXTURE_ID,
    'fixture_schema_version': FIXTURE_SCHEMA_VERSION,
    'generated_at_utc': datetime.now(timezone.utc).isoformat(),
    'routes': _summarize_backend(backend_rows),
    'frontend': _summarize_frontend(frontend_rows, build_metrics),
  }
  OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
  return payload


if __name__ == '__main__':
  print(json.dumps(summarize_perf_evidence(), ensure_ascii=False, indent=2))
