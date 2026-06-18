from __future__ import annotations

import hashlib
import os
import re
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from typing import Any, Iterator

_CURRENT_METRICS: ContextVar[dict[str, Any] | None] = ContextVar(
    "crf_perf_current_metrics",
    default=None,
)

_PHASE_KEYS = {
    "auth_owner": "auth_owner_ms",
    "rate_limit": "rate_limit_ms",
    "upload_read": "upload_read_ms",
    "temp_file_write": "temp_file_write_ms",
    "temp_lookup": "temp_lookup_ms",
    "docx_parse": "docx_parse_ms",
    "docx_generate": "docx_generate_ms",
    "response_build": "response_build_ms",
    "project_tree_load": "project_tree_load_ms",
    "schema_validate": "schema_validate_ms",
    "host_schema_validate": "host_schema_validate_ms",
    "external_graph_load": "external_graph_load_ms",
    "clone_entities": "clone_entities_ms",
    "logo_copy": "logo_copy_ms",
    "order_scope_load": "order_scope_load_ms",
    "order_validate": "order_validate_ms",
    "order_safe_offset_update": "order_safe_offset_update_ms",
    "order_final_update": "order_final_update_ms",
    "db_read": "db_read_ms",
    "db_write": "db_write_ms",
    "flush": "flush_ms",
    "commit": "commit_ms",
    "file_response_prepare": "file_response_prepare_ms",
    "output_validate": "output_validate_ms",
    "cleanup": "cleanup_ms",
}

_STATIC_ROUTE_SEGMENTS = {
    "api",
    "auth",
    "admin",
    "projects",
    "project-db",
    "database-merge",
    "import",
    "import-docx",
    "preview",
    "execute",
    "export",
    "word",
    "copy",
    "reorder",
    "forms",
    "fields",
    "field-definitions",
    "form-fields",
    "visits",
    "visit-form-matrix",
    "codelists",
    "options",
    "units",
    "settings",
    "me",
    "password",
    "logo",
    "auto",
    "batch-delete",
    "cleanup-screenshots",
    "start",
    "status",
    "pages",
    "database",
}

_NUMBER_SEGMENT_RE = re.compile(r"^\d+$")
_UUID_SEGMENT_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$")
_TOKEN_SEGMENT_RE = re.compile(r"^[0-9a-fA-F]{12,64}$")
_SQL_STRING_RE = re.compile(r"'(?:''|[^'])*'")
_SQL_NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")
_SQL_WHITESPACE_RE = re.compile(r"\s+")
_SQL_SLOW_THRESHOLD_MS = 50.0
_SQL_SHAPE_LIMIT = 160
_SQL_SHAPE_LIST_LIMIT = 10


def is_perf_baseline_enabled() -> bool:
    return os.environ.get("CRF_PERF_BASELINE") == "1"



def begin_request_metrics(method: str, route_template: str | None) -> str:
    request_id = uuid.uuid4().hex[:12]
    _CURRENT_METRICS.set(
        {
            "request_id": request_id,
            "method": method,
            "route_template": sanitize_route_path(route_template or ""),
            "started_at": time.perf_counter(),
            "phase_timings_ms": {},
            "counters": {},
            "sql_count": 0,
            "sql_total_ms": 0.0,
            "sql_max_ms": 0.0,
            "slow_sql_count": 0,
            "sql_shapes": [],
            "slow_sql_shapes": [],
            "sqlite_busy_count": 0,
            "sqlite_busy_wait_ms": 0.0,
            "payload_size_bytes": None,
        }
    )
    return request_id



def set_route_template(route_template: str | None) -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None or not route_template:
        return
    metrics["route_template"] = route_template



def finish_request_metrics(status_code: int, error_type: str | None = None) -> dict[str, Any]:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return {}

    request_total_ms = _elapsed_ms(metrics["started_at"])
    summary: dict[str, Any] = {
        "request_id": metrics["request_id"],
        "method": metrics["method"],
        "route_template": metrics["route_template"],
        "status_code": status_code,
        "request_total_ms": request_total_ms,
        "phase_timings_ms": deepcopy(metrics["phase_timings_ms"]),
        "sql_count": metrics["sql_count"],
        "sql_total_ms": _round_ms(metrics["sql_total_ms"]),
        "sql_max_ms": _round_ms(metrics["sql_max_ms"]),
        "slow_sql_count": metrics["slow_sql_count"],
        "sql_shapes": deepcopy(metrics["sql_shapes"]),
        "slow_sql_shapes": deepcopy(metrics["slow_sql_shapes"]),
        "sqlite_busy_count": metrics["sqlite_busy_count"],
        "sqlite_busy_wait_ms": _round_ms(metrics["sqlite_busy_wait_ms"]),
        "payload_size_bytes": metrics["payload_size_bytes"],
    }
    if error_type is not None:
        summary["error_type"] = error_type
    summary.update(deepcopy(metrics["counters"]))
    _CURRENT_METRICS.set(None)
    return summary


@contextmanager
def perf_span(name: str) -> Iterator[None]:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        yield
        return

    phase_key = _normalize_phase_name(name)
    started_at = time.perf_counter()
    try:
        yield
    finally:
        phase_timings = metrics["phase_timings_ms"]
        phase_timings[phase_key] = _round_ms(
            phase_timings.get(phase_key, 0.0) + _elapsed_ms(started_at)
        )



def record_counter(name: str, value: int | float = 1) -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return
    counters = metrics["counters"]
    counters[name] = counters.get(name, 0) + value



def record_payload_size(size_bytes: int | None) -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None or size_bytes is None:
        return
    metrics["payload_size_bytes"] = max(int(size_bytes), 0)



def get_current_metrics_snapshot() -> dict[str, Any]:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return {}
    snapshot = deepcopy(metrics)
    snapshot.pop("started_at", None)
    return snapshot



def record_sql_statement(statement: str, elapsed_ms: float) -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return

    elapsed_ms = max(float(elapsed_ms), 0.0)
    shape = sanitize_sql_shape(statement)
    shape_hash = _shape_hash(shape)

    metrics["sql_count"] += 1
    metrics["sql_total_ms"] += elapsed_ms
    metrics["sql_max_ms"] = max(metrics["sql_max_ms"], elapsed_ms)
    _append_sql_shape(metrics["sql_shapes"], shape, shape_hash, elapsed_ms)

    if elapsed_ms >= _SQL_SLOW_THRESHOLD_MS:
        metrics["slow_sql_count"] += 1
        _append_sql_shape(metrics["slow_sql_shapes"], shape, shape_hash, elapsed_ms)



def increment_sqlite_busy_count() -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return
    metrics["sqlite_busy_count"] += 1



def record_sqlite_busy_wait(elapsed_ms: float) -> None:
    metrics = _CURRENT_METRICS.get()
    if metrics is None:
        return
    metrics["sqlite_busy_wait_ms"] += max(float(elapsed_ms), 0.0)



def sanitize_route_path(path: str) -> str:
    if not path:
        return "/"

    sanitized_segments: list[str] = []
    for segment in path.split("/"):
        if not segment:
            continue
        if segment in _STATIC_ROUTE_SEGMENTS:
            sanitized_segments.append(segment)
            continue
        if (
            _NUMBER_SEGMENT_RE.fullmatch(segment)
            or _UUID_SEGMENT_RE.fullmatch(segment)
            or _TOKEN_SEGMENT_RE.fullmatch(segment)
        ):
            sanitized_segments.append("{param}")
            continue
        sanitized_segments.append(segment)
    return "/" + "/".join(sanitized_segments)



def sanitize_sql_shape(statement: str) -> str:
    sanitized = _SQL_STRING_RE.sub("?", statement)
    sanitized = _SQL_NUMBER_RE.sub("?", sanitized)
    sanitized = _SQL_WHITESPACE_RE.sub(" ", sanitized).strip()
    if len(sanitized) > _SQL_SHAPE_LIMIT:
        sanitized = sanitized[: _SQL_SHAPE_LIMIT - 3] + "..."
    return sanitized



def _normalize_phase_name(name: str) -> str:
    if name in _PHASE_KEYS:
        return _PHASE_KEYS[name]
    if name.endswith("_ms") and name[:-3] in _PHASE_KEYS:
        return name
    raise ValueError(f"Unsupported perf phase: {name}")



def _elapsed_ms(started_at: float) -> float:
    return max((time.perf_counter() - started_at) * 1000.0, 0.0)



def _round_ms(value: float) -> float:
    return round(max(float(value), 0.0), 3)



def _shape_hash(shape: str) -> str:
    return hashlib.sha1(shape.encode("utf-8")).hexdigest()[:12]



def _append_sql_shape(shapes: list[dict[str, Any]], shape: str, shape_hash: str, elapsed_ms: float) -> None:
    for item in shapes:
        if item["hash"] == shape_hash:
            item["max_elapsed_ms"] = max(item["max_elapsed_ms"], _round_ms(elapsed_ms))
            return
    if len(shapes) >= _SQL_SHAPE_LIST_LIMIT:
        return
    shapes.append(
        {
            "hash": shape_hash,
            "shape": shape,
            "max_elapsed_ms": _round_ms(elapsed_ms),
        }
    )
