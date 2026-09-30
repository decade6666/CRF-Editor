"""_migrate_normalize_date_formats 与离线脚本的规范化/幂等/保真测试。"""

import re
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from src.database import _DATE_FORMAT_CANONICALS, _migrate_normalize_date_formats


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE field_definition ("
                "id INTEGER PRIMARY KEY, field_type VARCHAR(20), date_format VARCHAR(50))"
            )
        )
    return engine


def _seed(conn, rows):
    conn.execute(
        text("INSERT INTO field_definition (id, field_type, date_format) VALUES (:id, :field_type, :date_format)"),
        rows,
    )


def _dump(conn):
    rows = conn.execute(text("SELECT id, field_type, date_format FROM field_definition ORDER BY id")).fetchall()
    return [(r[0], r[1], r[2]) for r in rows]


def test_migrates_uppercase_and_keeps_unknown_values(engine):
    with engine.begin() as conn:
        _seed(conn, [
            {"id": 1, "field_type": "日期", "date_format": "YYYY-MM-DD"},
            {"id": 2, "field_type": "日期", "date_format": "yyyy-MM-dd"},
            {"id": 3, "field_type": "时间", "date_format": "HH:mm"},
            {"id": 4, "field_type": "日期", "date_format": "MM-dd-yyyy"},
            {"id": 5, "field_type": "日期", "date_format": None},
            {"id": 6, "field_type": "文本", "date_format": "YYYY-MM-DD"},
        ])

    _migrate_normalize_date_formats(engine)

    with engine.begin() as conn:
        assert _dump(conn) == [
            (1, "日期", "yyyy-MM-dd"),
            (2, "日期", "yyyy-MM-dd"),
            (3, "时间", "HH:mm"),
            (4, "日期", "MM-dd-yyyy"),
            (5, "日期", None),
            (6, "文本", "YYYY-MM-DD"),
        ]


def test_migration_is_idempotent(engine):
    with engine.begin() as conn:
        _seed(conn, [
            {"id": 1, "field_type": "日期", "date_format": "YYYY-MM-DD"},
            {"id": 2, "field_type": "日期时间", "date_format": "yyyy-MM-dd hh:mm:ss"},
            {"id": 3, "field_type": "时间", "date_format": "HH:mm"},
        ])

    _migrate_normalize_date_formats(engine)
    _migrate_normalize_date_formats(engine)

    with engine.begin() as conn:
        assert _dump(conn) == [
            (1, "日期", "yyyy-MM-dd"),
            (2, "日期时间", "yyyy-MM-dd HH:mm:ss"),
            (3, "时间", "HH:mm"),
        ]


def test_migration_skips_missing_table():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    _migrate_normalize_date_formats(engine)  # 不抛异常


def test_migrates_legacy_uppercase_hour_format_and_keeps_hour_only_values(engine):
    with engine.begin() as conn:
        _seed(conn, [
            {"id": 1, "field_type": "日期时间", "date_format": "YYYY-MM-DD HH"},
            {"id": 2, "field_type": "时间", "date_format": "HH"},
            {"id": 3, "field_type": "时间", "date_format": "hh AP"},
        ])

    _migrate_normalize_date_formats(engine)
    _migrate_normalize_date_formats(engine)

    with engine.begin() as conn:
        assert _dump(conn) == [
            (1, "日期时间", "yyyy-MM-dd HH"),
            (2, "时间", "HH"),
            (3, "时间", "hh AP"),
        ]


def _read_frontend_date_format_options():
    """从前端共享模块 dateFormatOptions.js 解析 DATE_FORMAT_OPTIONS（唯一事实来源）。"""
    repo_root = Path(__file__).resolve().parents[2]
    source = (repo_root / "frontend" / "src" / "composables" / "dateFormatOptions.js").read_text(
        encoding="utf-8"
    )
    body_match = re.search(r"export const DATE_FORMAT_OPTIONS = \{(.*?)\n\}", source, re.S)
    assert body_match, "dateFormatOptions.js 缺少 DATE_FORMAT_OPTIONS 导出"
    options = {}
    # 键名交替按最长优先（日期时间 先于 日期），避免前缀键误吞
    for key, list_body in re.findall(
        r"['\"]?(日期时间|日期|时间)['\"]?\s*:\s*\[(.*?)\]", body_match.group(1), re.S
    ):
        options[key] = re.findall(r"['\"]([^'\"]+)['\"]", list_body)
    assert set(options) == {"日期", "日期时间", "时间"}, f"前端选项键不符: {sorted(options)}"
    assert all(options.values()), "前端选项列表存在空列表"
    return options


def test_canonical_map_covers_frontend_option_lists():
    # 与前端 dateFormatOptions.js 的 DATE_FORMAT_OPTIONS 逐项对齐
    frontend_options = _read_frontend_date_format_options()
    for field_type, opts in frontend_options.items():
        lowered = {opt.lower(): opt for opt in opts}
        assert len(lowered) == len(opts), f"{field_type} 选项小写后存在重复，映射表会冲突"
        for opt in opts:
            assert _DATE_FORMAT_CANONICALS[field_type][opt.lower()] == opt


def test_offline_script_normalizes_a_copy(tmp_path):
    from scripts.normalize_date_formats import normalize_db

    src = tmp_path / "src.db"
    conn = sqlite3.connect(str(src))
    conn.execute(
        "CREATE TABLE field_definition (id INTEGER PRIMARY KEY, field_type VARCHAR(20), date_format VARCHAR(50))"
    )
    conn.execute("INSERT INTO field_definition VALUES (1, '日期', 'YYYY-MM-DD')")
    conn.execute("INSERT INTO field_definition VALUES (2, '日期', 'yyyy-MM-dd')")
    conn.commit()
    conn.close()

    out = tmp_path / "out.db"
    report = normalize_db(src, out, dry_run=False)

    assert report["success"] is True
    assert len(report["changes"]) == 1
    assert report["changes"][0]["from"] == "YYYY-MM-DD"
    assert report["changes"][0]["to"] == "yyyy-MM-dd"
    assert src.read_bytes() != out.read_bytes()  # 原文件保持不变

    conn2 = sqlite3.connect(str(out))
    values = [r[0] for r in conn2.execute("SELECT date_format FROM field_definition ORDER BY id")]
    conn2.close()
    assert values == ["yyyy-MM-dd", "yyyy-MM-dd"]
