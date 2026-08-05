import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection

from src.database import (
    _migrate_drop_codelist_option_trailing_underscore,
    _rebuild_codelist_option_without_trailing_underscore,
)
from src.models import Base
from src.models.codelist import CodeList, CodeListOption


def test_drop_codelist_option_trailing_underscore_from_legacy_table(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER NOT NULL,
            code TEXT,
            decode TEXT NOT NULL,
            order_index INTEGER,
            trailing_underscore INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        "INSERT INTO codelist_option (id, codelist_id, code, decode, order_index, trailing_underscore) "
        "VALUES (1, 1, 'C.1', '选项A', 1, 1)"
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _migrate_drop_codelist_option_trailing_underscore(engine)
    _migrate_drop_codelist_option_trailing_underscore(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("codelist_option")}
    assert "trailing_underscore" not in columns
    with engine.connect() as db:
        row = db.execute(
            text("SELECT code, decode, order_index FROM codelist_option WHERE id = 1")
        ).one()
    assert row == ("C.1", "选项A", 1)


def test_drop_codelist_option_trailing_underscore_is_safe_for_current_schema(tmp_path: Path) -> None:
    db_path = tmp_path / "current.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)

    _migrate_drop_codelist_option_trailing_underscore(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("codelist_option")}
    assert "trailing_underscore" not in columns


def _legacy_db_with_trailing_column(
    tmp_path: Path, ddl: str
) -> tuple[Path, str]:
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(ddl)
    conn.execute(
        "INSERT INTO codelist_option (id, codelist_id, code, decode, order_index, trailing_underscore) "
        "VALUES (1, 1, 'C.1', '选项A', 1, 1)"
    )
    conn.commit()
    conn.close()
    return db_path, f"sqlite+pysqlite:///{db_path.as_posix()}"


def test_drop_falls_back_to_table_rebuild_when_drop_column_unsupported(
    monkeypatch, tmp_path: Path
) -> None:
    db_path, url = _legacy_db_with_trailing_column(
        tmp_path,
        """
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER NOT NULL,
            code TEXT,
            decode TEXT NOT NULL,
            order_index INTEGER,
            trailing_underscore INTEGER NOT NULL
        )
        """,
    )
    engine = create_engine(url)

    real_execute = Connection.execute

    def failing_execute(self, statement, *args, **kwargs):
        if "DROP COLUMN" in str(statement):
            raise RuntimeError("simulated unsupported DROP COLUMN")
        return real_execute(self, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "execute", failing_execute)
    _migrate_drop_codelist_option_trailing_underscore(engine)
    monkeypatch.undo()

    columns = {column["name"] for column in inspect(engine).get_columns("codelist_option")}
    assert "trailing_underscore" not in columns
    with engine.connect() as db:
        row = db.execute(
            text("SELECT code, decode, order_index FROM codelist_option WHERE id = 1")
        ).one()
        indexes = {
            index_row[1]
            for index_row in db.execute(text("PRAGMA index_list('codelist_option')"))
        }
    assert row == ("C.1", "选项A", 1)
    assert "idx_codelist_option_order" in indexes


def test_rebuild_keeps_legacy_data_and_allows_inserts_without_server_default(
    tmp_path: Path,
) -> None:
    """老库该列为无 server default 的 NOT NULL：重建后新选项必须能真实插入。"""
    _, url = _legacy_db_with_trailing_column(
        tmp_path,
        """
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER NOT NULL,
            code TEXT,
            decode TEXT NOT NULL,
            order_index INTEGER,
            trailing_underscore INTEGER NOT NULL
        )
        """,
    )
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    _rebuild_codelist_option_without_trailing_underscore(engine)

    from sqlalchemy.orm import Session

    with Session(engine) as session:
        codelist = CodeList(project_id=1, name="性别", code="CL1", order_index=1)
        session.add(codelist)
        session.flush()
        session.add(
            CodeListOption(
                codelist_id=codelist.id,
                code="1",
                decode="男",
                order_index=2,
            )
        )
        session.commit()
        assert session.query(CodeListOption).filter_by(decode="男").one().decode == "男"


def test_drop_failure_with_failed_rebuild_raises_to_block_startup(
    monkeypatch,
) -> None:
    """DROP COLUMN 与重建兜底均失败时，必须抛异常阻止启动而非带病继续。"""
    import src.database as database_module

    class FakeInspector:
        def has_table(self, table_name: str) -> bool:
            return table_name == "codelist_option"

        def get_columns(self, table_name: str) -> list[dict[str, str]]:
            assert table_name == "codelist_option"
            return [{"name": "id"}, {"name": "trailing_underscore"}]

    class FailingBegin:
        def __enter__(self):
            raise RuntimeError("drop failed")

        def __exit__(self, exc_type, exc, tb) -> bool:
            return False

    class FailingEngine:
        def begin(self) -> FailingBegin:
            return FailingBegin()

        def raw_connection(self):
            raise RuntimeError("rebuild failed")

    monkeypatch.setattr(database_module, "inspect", lambda engine: FakeInspector())
    monkeypatch.setattr(
        database_module,
        "_rebuild_codelist_option_without_trailing_underscore",
        lambda engine: (_ for _ in ()).throw(RuntimeError("rebuild failed")),
    )

    with pytest.raises(RuntimeError, match="无法删除 codelist_option.trailing_underscore"):
        _migrate_drop_codelist_option_trailing_underscore(FailingEngine())
