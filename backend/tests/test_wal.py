"""WAL 并发安全测试

验证 SQLite WAL 模式下两个线程并发写入不产生 SQLITE_BUSY 异常，
且写入的数据相互独立、均持久化成功。
"""
from __future__ import annotations

import threading

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from src.models import Base
from src.models.project import Project


@pytest.fixture
def wal_engine(tmp_path):
    """文件型 SQLite 引擎，WAL 模式，与 database.py 配置一致。"""
    db_path = tmp_path / "test_wal.db"
    _engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(_engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=5000")
        dbapi_conn.execute("PRAGMA synchronous=NORMAL")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


def test_concurrent_writes_no_busy_error(wal_engine):
    """两个线程并发创建项目，不抛出 SQLITE_BUSY 异常，两条记录均写入成功。"""
    errors: list[str] = []
    created_ids: list[int] = []
    lock = threading.Lock()

    def create_project(name: str) -> None:
        try:
            with Session(wal_engine) as session:
                with session.begin():
                    project = Project(name=name, version="1.0")
                    session.add(project)
                    session.flush()
                    with lock:
                        created_ids.append(project.id)
        except Exception as exc:
            with lock:
                errors.append(str(exc))

    threads = [
        threading.Thread(target=create_project, args=(f"并发项目{i}",))
        for i in range(2)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"并发写入产生异常: {errors}"
    assert len(created_ids) == 2, f"预期写入 2 条，实际 {len(created_ids)} 条"
    assert created_ids[0] != created_ids[1], "两个项目 id 相同，存在重复写入"
