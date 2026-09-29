import logging
import re
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text

from src.config import AdminConfig, AppConfig, AuthConfig, DatabaseConfig
from src.database import _normalize_label_variable_names

# 系统占位 OID 前缀规则（跨栈契约：前端 SYSTEM_FIELD_VARIABLE_NAME_RE ↔ 后端 _LABEL_PLACEHOLDER_RE）。
# 测试内独立复写，避免实现与断言同源。
_PLACEHOLDER_RE = re.compile(r"^FIELD_\d{14}_[A-Z0-9]{6}")


def _create_field_definition_table(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE field_definition (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            variable_name TEXT NOT NULL,
            label TEXT,
            field_type TEXT,
            UNIQUE(project_id, variable_name)
        )
        """
    )
    conn.commit()
    conn.close()


def _insert(
    conn: sqlite3.Connection,
    row_id: int,
    project_id: int,
    variable_name: str,
    label: str,
    field_type: str,
) -> None:
    conn.execute(
        "INSERT INTO field_definition (id, project_id, variable_name, label, field_type) "
        "VALUES (?, ?, ?, ?, ?)",
        (row_id, project_id, variable_name, label, field_type),
    )


def _fetch_variable_names(engine) -> dict:
    with engine.connect() as db:
        return {
            row_id: variable_name
            for row_id, variable_name in db.execute(
                text("SELECT id, variable_name FROM field_definition ORDER BY id")
            )
        }


def test_normalize_label_variable_names_remints_only_user_typed_label_oids(tmp_path: Path) -> None:
    db_path = tmp_path / "label-oid.db"
    _create_field_definition_table(db_path)
    conn = sqlite3.connect(str(db_path))
    _insert(conn, 1, 1, "AGE", "年龄", "标签")
    _insert(conn, 2, 1, "标签A", "标签一", "标签")
    _insert(conn, 3, 1, "", "空OID标签", "标签")
    _insert(conn, 4, 1, "FIELD_20260101120000_ABC123", "生成标签", "标签")
    _insert(conn, 5, 1, "FIELD_20260101120000_ABC123_copy", "复制标签", "标签")
    _insert(conn, 6, 1, "FIELD_20260101120000_ABC123_IMP2", "导入标签", "标签")
    _insert(conn, 7, 1, "FIELD_20260101120000_abc123", "小写后缀标签", "标签")
    _insert(conn, 8, 1, "SEX", "性别", "文本")
    _insert(conn, 9, 1, "FIELD_20260101120000_QQQQQQ", "占位OID文本字段", "文本")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_label_variable_names(engine)

    names = _fetch_variable_names(engine)
    reminted = [names[row_id] for row_id in (1, 2, 3, 7)]
    for name in reminted:
        assert _PLACEHOLDER_RE.match(name), name
    assert len(set(reminted)) == len(reminted)
    assert names[4] == "FIELD_20260101120000_ABC123"
    assert names[5] == "FIELD_20260101120000_ABC123_copy"
    assert names[6] == "FIELD_20260101120000_ABC123_IMP2"
    assert names[8] == "SEX"
    assert names[9] == "FIELD_20260101120000_QQQQQQ"


def test_normalize_label_variable_names_retries_when_code_collides(
    tmp_path: Path, monkeypatch
) -> None:
    db_path = tmp_path / "label-oid-collision.db"
    _create_field_definition_table(db_path)
    conn = sqlite3.connect(str(db_path))
    _insert(conn, 1, 1, "AGE", "年龄", "标签")
    _insert(conn, 2, 1, "标签A", "标签一", "标签")
    _insert(conn, 3, 1, "FIELD_20260101120000_ZZZZZZ", "占用占位值的文本字段", "文本")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    draws = iter(
        [
            "FIELD_20260101120000_ZZZZZZ",  # 首次抽取与项目内既有 OID 冲突，必须重抽
            "FIELD_20260101120000_FIRST",
            "FIELD_20260101120000_SECOND",
        ]
    )
    monkeypatch.setattr("src.database.generate_code", lambda prefix: next(draws))

    _normalize_label_variable_names(engine)

    names = _fetch_variable_names(engine)
    assert {names[1], names[2]} == {"FIELD_20260101120000_FIRST", "FIELD_20260101120000_SECOND"}
    assert names[3] == "FIELD_20260101120000_ZZZZZZ"


def test_normalize_label_variable_names_is_idempotent(tmp_path: Path, caplog) -> None:
    db_path = tmp_path / "label-oid-idempotent.db"
    _create_field_definition_table(db_path)
    conn = sqlite3.connect(str(db_path))
    _insert(conn, 1, 1, "AGE", "年龄", "标签")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_label_variable_names(engine)
    names_after_first = _fetch_variable_names(engine)

    caplog.set_level(logging.INFO, logger="src.database")
    # 首次运行的 INFO 日志可能因套件内其他测试抬高的日志级别进入 caplog，清空后只观察第二次运行
    caplog.clear()
    _normalize_label_variable_names(engine)

    assert _fetch_variable_names(engine) == names_after_first
    assert "已为" not in caplog.text


def test_normalize_label_variable_names_skips_missing_table(tmp_path: Path) -> None:
    db_path = tmp_path / "label-oid-missing-table.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT)")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_label_variable_names(engine)  # 无 field_definition 表时不抛异常


def test_normalize_label_variable_names_skips_incomplete_table(tmp_path: Path) -> None:
    db_path = tmp_path / "label-oid-incomplete-table.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE field_definition (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            variable_name TEXT NOT NULL,
            label TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO field_definition (id, project_id, variable_name, label) "
        "VALUES (1, 1, 'AGE', '缺 field_type 列的旧表')"
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_label_variable_names(engine)

    assert _fetch_variable_names(engine) == {1: "AGE"}


def test_released_oid_can_be_reused_in_same_project(tmp_path: Path) -> None:
    db_path = tmp_path / "label-oid-reuse.db"
    _create_field_definition_table(db_path)
    conn = sqlite3.connect(str(db_path))
    _insert(conn, 1, 1, "AGE", "年龄", "标签")
    _insert(conn, 2, 1, "SEX", "性别", "文本")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_label_variable_names(engine)

    with engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO field_definition (project_id, variable_name, label, field_type) "
                "VALUES (1, 'AGE', '年龄文本', '文本')"
            )
        )

    names = _fetch_variable_names(engine)
    assert "AGE" in names.values()
    assert "SEX" in names.values()


def test_normalize_label_variable_names_releases_oid_per_project(
    tmp_path: Path, monkeypatch
) -> None:
    db_path = tmp_path / "label-oid-multi-project.db"
    _create_field_definition_table(db_path)
    conn = sqlite3.connect(str(db_path))
    _insert(conn, 1, 1, "AGE", "年龄标签一", "标签")
    _insert(conn, 2, 1, "SEX", "性别", "文本")
    _insert(conn, 3, 2, "AGE", "年龄标签二", "标签")
    _insert(conn, 4, 2, "HEIGHT", "身高", "文本")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    # 有界迭代器只供应两次相同占位值：唯一性按项目判定时恰好两次抽取即够；
    # 若 used 集合误成全局，第二次抽取会命中重抽并耗尽迭代器（StopIteration 而非挂起）
    draws = iter(["FIELD_20260101120000_SAME01", "FIELD_20260101120000_SAME01"])
    monkeypatch.setattr("src.database.generate_code", lambda prefix: next(draws))

    _normalize_label_variable_names(engine)

    names = _fetch_variable_names(engine)
    assert names[1] == "FIELD_20260101120000_SAME01"
    assert names[3] == "FIELD_20260101120000_SAME01"
    assert names[2] == "SEX"
    assert names[4] == "HEIGHT"

    # AGE 在两个项目内都已释放：UNIQUE(project_id, variable_name) 同时接受两条插入
    with engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO field_definition (project_id, variable_name, label, field_type) "
                "VALUES (1, 'AGE', '项目一年龄文本', '文本')"
            )
        )
        db.execute(
            text(
                "INSERT INTO field_definition (project_id, variable_name, label, field_type) "
                "VALUES (2, 'AGE', '项目二年龄文本', '文本')"
            )
        )

    with engine.connect() as db:
        age_projects = [
            project_id
            for (project_id,) in db.execute(
                text(
                    "SELECT DISTINCT project_id FROM field_definition "
                    "WHERE variable_name = 'AGE' ORDER BY project_id"
                )
            )
        ]
    assert age_projects == [1, 2]


def test_init_db_invokes_label_variable_name_normalization(
    tmp_path: Path, monkeypatch
) -> None:
    """init_db 启动必须接线 _normalize_label_variable_names，防止存量用户 OID 标签遗留。"""
    import src.database as database_module

    db_path = tmp_path / "label-oid-init-wiring.db"
    test_config = AppConfig(
        database=DatabaseConfig(path=str(db_path)),
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username="admin", bootstrap_password="bootstrap-pass-123"),
    )
    seen_engines = []
    monkeypatch.setattr(
        database_module,
        "_normalize_label_variable_names",
        lambda engine_arg: seen_engines.append(engine_arg),
    )

    previous_engine = database_module._engine
    database_module._engine = None
    monkeypatch.setattr(database_module, "get_config", lambda: test_config)
    monkeypatch.delenv("CRF_ENV", raising=False)
    try:
        database_module.init_db()
        # 恰好调用一次，且用的是 init_db 实际创建并缓存的那台 engine
        assert seen_engines == [database_module.get_engine()]
    finally:
        current_engine = database_module._engine
        if current_engine is not None:
            current_engine.dispose()
        database_module._engine = previous_engine
