"""排序列回填迁移（`_migrate_add_order_index`）的特征测试。

锁定旧库回填语义：旧 schema 样例（含「分组已有最大序号」与「整表缺 order_index 列」两种情况）
的编号结果、函数级幂等，以及连续两次 `init_db()` 结果一致（AC4）。
"""

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from src.config import AdminConfig, AppConfig, AuthConfig, DatabaseConfig

# 旧库样例：unit 已有 order_index（含预存最大序号 5），visit 已有 sequence（含预存最大序号 4），
# 其余四表完全缺 order_index 列，由迁移 Phase 1 补列、Phase 2 从 1 回填。
_LEGACY_TABLES = {
    "unit": "CREATE TABLE unit (id INTEGER PRIMARY KEY, project_id INTEGER, symbol TEXT, order_index INTEGER)",
    "field_definition": (
        "CREATE TABLE field_definition (id INTEGER PRIMARY KEY, project_id INTEGER, variable_name TEXT, "
        "label TEXT, field_type TEXT, date_format TEXT, codelist_id INTEGER, unit_id INTEGER)"
    ),
    "form": "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, code TEXT)",
    "codelist": "CREATE TABLE codelist (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT)",
    "codelist_option": "CREATE TABLE codelist_option (id INTEGER PRIMARY KEY, codelist_id INTEGER, decode TEXT)",
    "visit": "CREATE TABLE visit (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, sequence INTEGER)",
}

_LEGACY_ROWS = {
    "unit": [
        (1, 1, "kg", None),
        (2, 1, "g", 5),  # 预存最大序号：后续 NULL 行必须从 6 起
        (3, 1, "mg", None),
        (4, 1, "lb", None),
        (5, 2, "mL", None),
        (6, 2, "L", None),
        (7, None, "游离", None),  # 分组键为 NULL：不回填
    ],
    "field_definition": [
        (1, 1, "AGE", "年龄", "文本", "yyyy-MM-dd", None, None),
        (2, 1, "HEIGHT", "身高", "文本", None, None, None),
        (3, 2, "WEIGHT", "体重", "文本", None, None, None),
    ],
    "form": [
        (1, 1, "访视表", "VS"),
        (2, 1, "化验表", "LB"),
    ],
    "codelist": [
        (1, 1, "性别"),
        (2, 1, "民族"),
    ],
    "codelist_option": [
        (1, 1, "男"),
        (2, 1, "女"),
        (3, 2, "是"),
    ],
    "visit": [
        (1, 1, "筛选期", None),
        (2, 1, "基线", 4),  # 预存最大序号：后续 NULL 行必须从 5 起
        (3, 1, "终点", None),
        (4, 2, "随访", None),
        (5, None, "游离访视", None),  # 分组键为 NULL：不回填
    ],
}


def _create_legacy_db(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        for ddl in _LEGACY_TABLES.values():
            conn.execute(ddl)
        conn.executemany(
            "INSERT INTO unit (id, project_id, symbol, order_index) VALUES (?, ?, ?, ?)",
            _LEGACY_ROWS["unit"],
        )
        conn.executemany(
            "INSERT INTO field_definition "
            "(id, project_id, variable_name, label, field_type, date_format, codelist_id, unit_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            _LEGACY_ROWS["field_definition"],
        )
        conn.executemany("INSERT INTO form (id, project_id, name, code) VALUES (?, ?, ?, ?)", _LEGACY_ROWS["form"])
        conn.executemany("INSERT INTO codelist (id, project_id, name) VALUES (?, ?, ?)", _LEGACY_ROWS["codelist"])
        conn.executemany(
            "INSERT INTO codelist_option (id, codelist_id, decode) VALUES (?, ?, ?)",
            _LEGACY_ROWS["codelist_option"],
        )
        conn.executemany(
            "INSERT INTO visit (id, project_id, name, sequence) VALUES (?, ?, ?, ?)", _LEGACY_ROWS["visit"]
        )
        conn.commit()
    finally:
        conn.close()


def _engine_for(db_path: Path):
    return create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")


def _order_columns(engine, table: str, column: str) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT id, {column} FROM {table} ORDER BY id")).fetchall()
    return {row_id: value for row_id, value in rows}


def _index_names(engine) -> set:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'index'")).fetchall()
    return {name for (name,) in rows}


def _table_columns(engine, table: str) -> set:
    return {column["name"] for column in inspect(engine).get_columns(table)}


def _full_snapshot(engine) -> dict:
    tables = {
        "unit": "SELECT id, project_id, order_index FROM unit ORDER BY id",
        "field_definition": "SELECT id, project_id, order_index FROM field_definition ORDER BY id",
        "form": "SELECT id, project_id, order_index FROM form ORDER BY id",
        "codelist": "SELECT id, project_id, order_index FROM codelist ORDER BY id",
        "codelist_option": "SELECT id, codelist_id, order_index FROM codelist_option ORDER BY id",
        "visit": "SELECT id, project_id, sequence FROM visit ORDER BY id",
    }
    snapshot = {}
    with engine.connect() as conn:
        for name, sql in tables.items():
            snapshot[name] = [tuple(row) for row in conn.execute(text(sql))]
    return snapshot


def test_backfill_numbers_null_orders_after_existing_max_per_group(tmp_path: Path) -> None:
    from src.database import _migrate_add_order_index

    db_path = tmp_path / "legacy-order.db"
    _create_legacy_db(db_path)
    engine = _engine_for(db_path)

    _migrate_add_order_index(engine)

    # Phase 1：四张缺列的表补上 order_index
    for table in ("field_definition", "form", "codelist", "codelist_option"):
        assert "order_index" in _table_columns(engine, table), table

    assert _order_columns(engine, "unit", "order_index") == {1: 6, 2: 5, 3: 7, 4: 8, 5: 1, 6: 2, 7: None}
    assert _order_columns(engine, "field_definition", "order_index") == {1: 1, 2: 2, 3: 1}
    assert _order_columns(engine, "form", "order_index") == {1: 1, 2: 2}
    assert _order_columns(engine, "codelist", "order_index") == {1: 1, 2: 2}
    assert _order_columns(engine, "codelist_option", "order_index") == {1: 1, 2: 2, 3: 1}
    assert _order_columns(engine, "visit", "sequence") == {1: 5, 2: 4, 3: 6, 4: 1, 5: None}

    assert {
        "idx_unit_project_order",
        "idx_field_def_project_order",
        "idx_form_project_order",
        "idx_codelist_project_order",
        "idx_codelist_option_order",
    }.issubset(_index_names(engine))


def test_migrate_add_order_index_is_idempotent_on_same_schema(tmp_path: Path) -> None:
    from src.database import _migrate_add_order_index

    db_path = tmp_path / "legacy-order-idempotent.db"
    _create_legacy_db(db_path)
    engine = _engine_for(db_path)

    _migrate_add_order_index(engine)
    first = _full_snapshot(engine)

    _migrate_add_order_index(engine)
    second = _full_snapshot(engine)

    assert first == second


def _run_init_db_for_test(db_path: Path, monkeypatch) -> None:
    """在独立 SQLite 文件上执行 init_db（模式同 test_user_admin._run_init_db_for_test）。"""
    import src.database as database_module

    test_config = AppConfig(
        database=DatabaseConfig(path=str(db_path)),
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username="admin", bootstrap_password="bootstrap-pass-123"),
    )
    previous_engine = database_module._engine
    database_module._engine = None
    monkeypatch.setattr(database_module, "get_config", lambda: test_config)
    monkeypatch.setattr("src.services.admin_bootstrap_service.get_config", lambda: test_config)
    monkeypatch.delenv("CRF_ENV", raising=False)
    try:
        database_module.init_db()
    finally:
        current_engine = database_module._engine
        if current_engine is not None:
            current_engine.dispose()
        database_module._engine = previous_engine


def test_backfill_null_order_rejects_unregistered_target(tmp_path: Path) -> None:
    from src.database import _backfill_null_order

    db_path = tmp_path / "unregistered.db"
    _create_legacy_db(db_path)
    engine = _engine_for(db_path)

    with engine.begin() as conn, pytest.raises(ValueError, match="未登记的回填目标"):
        # 标识符不允许来自调用方：表/列未登记即拒绝（SQL 注入防线）
        _backfill_null_order(conn, "unit", "project_id", "symbol")


def test_init_db_twice_yields_identical_order_rows(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "legacy-order-init-twice.db"
    _create_legacy_db(db_path)
    engine = _engine_for(db_path)

    _run_init_db_for_test(db_path, monkeypatch)
    first = _full_snapshot(engine)
    assert first["unit"] == [(1, 1, 6), (2, 1, 5), (3, 1, 7), (4, 1, 8), (5, 2, 1), (6, 2, 2), (7, None, None)]
    assert first["visit"] == [(1, 1, 5), (2, 1, 4), (3, 1, 6), (4, 2, 1), (5, None, None)]

    _run_init_db_for_test(db_path, monkeypatch)
    second = _full_snapshot(engine)

    assert first == second
