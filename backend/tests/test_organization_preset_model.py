"""机构预设模型：建表幂等、NOCASE 唯一约束、空单位共存。"""

import pytest
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.models import Base
from src.models.organization_preset import OrganizationPreset


@pytest.fixture
def engine():
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    yield _engine
    _engine.dispose()


def _commit_preset(session, **kwargs):
    preset = OrganizationPreset(**kwargs)
    session.add(preset)
    session.commit()
    return preset


def test_init_db_creates_organization_preset_table_idempotently(engine):
    Base.metadata.create_all(engine)
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    assert "organization_preset" in inspector.get_table_names()


def test_preset_columns_and_nocase_collation(engine):
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    columns = {col["name"]: col for col in inspector.get_columns("organization_preset")}
    assert set(columns) >= {"id", "name", "data_management_unit", "logo_path", "created_at", "updated_at"}
    with engine.connect() as conn:
        ddl = conn.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='organization_preset'"
        ).fetchone()[0]
    # SQLite 唯一约束继承列级 collation；inspect 不暴露 collation，读原始 DDL 锁定
    assert 'name VARCHAR(255) COLLATE "NOCASE"' in ddl
    assert 'data_management_unit VARCHAR(255) COLLATE "NOCASE"' in ddl


def test_name_unique_constraint_nocase(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        _commit_preset(session, name="武汉知止", data_management_unit="单位A")
        with pytest.raises(IntegrityError):
            session.add(OrganizationPreset(name="武汉知止", data_management_unit="单位B"))
            session.commit()


def test_name_unique_is_case_insensitive(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        _commit_preset(session, name="武汉知止", data_management_unit="单位A")
        with pytest.raises(IntegrityError):
            session.add(OrganizationPreset(name="武汉知止", data_management_unit="单位B"))
            session.commit()


def test_unit_unique_constraint_nocase(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        _commit_preset(session, name="机构一", data_management_unit="数据管理部")
        with pytest.raises(IntegrityError):
            session.add(OrganizationPreset(name="机构二", data_management_unit="数据管理部"))
            session.commit()


def test_multiple_null_units_coexist(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        _commit_preset(session, name="机构一", data_management_unit=None)
        _commit_preset(session, name="机构二", data_management_unit=None)
        _commit_preset(session, name="机构三", data_management_unit="")
        assert len(session.scalars(select(OrganizationPreset)).all()) == 3


def test_trim_not_applied_at_model_layer(engine):
    # trim 是 schema 层职责；模型层原样存储，测试记录该契约
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        _commit_preset(session, name="  带空格名称  ", data_management_unit=None)
        stored = session.scalar(select(OrganizationPreset))
        assert stored.name == "  带空格名称  "
