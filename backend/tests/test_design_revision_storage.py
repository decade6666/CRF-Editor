"""Online-only revision migration/invalidation/exchange contracts."""

import sqlite3

import pytest
from sqlalchemy import create_engine, event, text

from src.models import Base

pytestmark = pytest.mark.integration


@pytest.fixture
def design_db(tmp_path):
    from src.services.design_revision_service import initialize_design_state

    path = tmp_path / "online.db"
    engine = create_engine(f"sqlite:///{path}")

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    initialize_design_state(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("INSERT INTO user(id,username,auth_version,is_admin) VALUES(1,'owner',0,0)")
        conn.exec_driver_sql("INSERT INTO project(id,name,version,owner_id) VALUES(1,'P','1',1),(2,'Q','1',1)")
        conn.exec_driver_sql("INSERT INTO form(id,project_id,name,code) VALUES(1,1,'F','F'),(2,2,'G','G')")
        conn.exec_driver_sql(
            "INSERT INTO field_definition(id,project_id,variable_name,label,field_type,is_multi_record,table_type) VALUES(1,1,'A','A','文本',0,'固定行')"
        )
        conn.exec_driver_sql(
            "INSERT INTO form_field(id,form_id,field_definition_id,order_index,is_log_row,required,inline_mark) VALUES(1,1,1,1,0,0,0)"
        )
    yield engine, path
    engine.dispose()


def state(engine, project_id=1):
    with engine.connect() as conn:
        return tuple(
            conn.execute(
                text("SELECT incarnation,revision FROM project_design_state WHERE project_id=:id"), {"id": project_id}
            ).one()
        )


def test_should_install_idempotently_without_resetting_online_state(design_db):
    from src.services.design_revision_service import initialize_design_state

    engine, _ = design_db
    before = state(engine)
    initialize_design_state(engine)
    assert state(engine) == before
    with engine.connect() as conn:
        assert (
            conn.exec_driver_sql(
                "SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'crf_design_v1_%'"
            ).scalar_one()
            >= 28
        )


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE project SET name='changed' WHERE id=1",
        "UPDATE form SET domain='dM' WHERE id=1",
        "UPDATE field_definition SET label='changed' WHERE id=1",
        "UPDATE form_field SET label_override='changed' WHERE id=1",
        "INSERT INTO unit(id,project_id,symbol) VALUES(1,1,'kg')",
        "INSERT INTO codelist(id,project_id,name) VALUES(1,1,'CL')",
        "INSERT INTO visit(id,project_id,name,sequence) VALUES(1,1,'V',1)",
        "INSERT INTO field(id,form_id,variable_name,label,field_type,is_multi_record,table_type) VALUES(1,1,'OLD','旧字段','文本',0,'固定行')",
    ],
)
def test_should_invalidate_each_direct_design_writer_but_not_other_project(design_db, sql):
    engine, _ = design_db
    before, other = state(engine), state(engine, 2)
    with engine.begin() as conn:
        conn.exec_driver_sql(sql)
    assert state(engine)[1] > before[1]
    assert state(engine, 2) == other


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE form SET project_id=2 WHERE id=1",
        "UPDATE field_definition SET project_id=2 WHERE id=1",
        "UPDATE form_field SET form_id=2 WHERE id=1",
    ],
)
def test_should_invalidate_old_new_and_reverse_reference_project_on_membership_change(design_db, sql):
    engine, _ = design_db
    before = [state(engine, project)[1] for project in (1, 2)]
    with engine.begin() as conn:
        conn.exec_driver_sql(sql)
    assert all(state(engine, project)[1] > before[project - 1] for project in (1, 2))


def test_should_invalidate_foreign_consumers_before_codelist_cascade_and_set_null(design_db):
    engine, _ = design_db
    with engine.begin() as conn:
        conn.exec_driver_sql("INSERT INTO codelist(id,project_id,name) VALUES(1,1,'CL')")
        conn.exec_driver_sql("INSERT INTO codelist_option(codelist_id,code,decode) VALUES(1,'A','A')")
        conn.exec_driver_sql(
            "INSERT INTO field_definition(id,project_id,variable_name,label,field_type,is_multi_record,table_type,codelist_id) VALUES(2,2,'B','B','单选',0,'固定行',1)"
        )
    before = [state(engine, project)[1] for project in (1, 2)]
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM codelist WHERE id=1")
        assert conn.exec_driver_sql("SELECT codelist_id FROM field_definition WHERE id=2").scalar_one() is None
        assert conn.exec_driver_sql("SELECT count(*) FROM codelist_option").scalar_one() == 0
    assert all(state(engine, project)[1] > before[project - 1] for project in (1, 2))


def test_should_invalidate_form_deletion_and_instance_cascade_only_in_affected_project(design_db):
    engine, _ = design_db
    before, other = state(engine), state(engine, 2)
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM form WHERE id=1")
        assert conn.exec_driver_sql("SELECT count(*) FROM form_field").scalar_one() == 0
    assert state(engine)[1] > before[1]
    assert state(engine, 2) == other


def test_should_invalidate_option_and_link_parent_moves_for_both_projects(design_db):
    engine, _ = design_db
    with engine.begin() as conn:
        conn.exec_driver_sql("INSERT INTO codelist(id,project_id,name) VALUES(1,1,'A'),(2,2,'B')")
        conn.exec_driver_sql(
            "INSERT INTO codelist_option(id,codelist_id,code,decode,order_index) VALUES(1,1,'A','A',1)"
        )
        conn.exec_driver_sql("INSERT INTO visit(id,project_id,name,sequence) VALUES(1,1,'V',1),(2,2,'W',1)")
        conn.exec_driver_sql("INSERT INTO visit_form(visit_id,form_id,sequence) VALUES(1,1,1)")
    before = [state(engine, p)[1] for p in (1, 2)]
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE codelist_option SET codelist_id=2 WHERE id=1")
        conn.exec_driver_sql("UPDATE visit_form SET visit_id=2,form_id=2 WHERE visit_id=1 AND form_id=1")
    assert all(state(engine, p)[1] > before[p - 1] for p in (1, 2))


def test_should_not_invalidate_noop_timestamps_or_auth_bookkeeping(design_db):
    engine, _ = design_db
    before = state(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE field_definition SET label=label,updated_at=CURRENT_TIMESTAMP WHERE id=1")
        conn.exec_driver_sql("UPDATE project SET deleted_at=CURRENT_TIMESTAMP,owner_id=NULL WHERE id=1")
        conn.exec_driver_sql("UPDATE user SET auth_version=auth_version+1 WHERE id=1")
        # Synthetic future C2/C6 history, protection and review records are not design tables.
        conn.exec_driver_sql("CREATE TABLE c4_synthetic_bookkeeping(id INTEGER PRIMARY KEY,kind TEXT)")
        conn.exec_driver_sql("INSERT INTO c4_synthetic_bookkeeping(kind) VALUES('auto'),('protection'),('review')")
    assert state(engine) == before


def test_should_rollback_revision_and_preserve_agent_fingerprint_on_savepoint_preview(design_db):
    from sqlalchemy.orm import Session
    from src.services.agent_state_service import compute_project_fingerprint

    engine, _ = design_db
    before = state(engine)
    with engine.connect() as conn:
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        session = Session(bind=conn, join_transaction_mode="control_fully")
        fingerprint = compute_project_fingerprint(session, 1)
        with session.begin_nested() as preview:
            session.execute(text("UPDATE form SET name='preview' WHERE id=1"))
            preview.rollback()
        assert compute_project_fingerprint(session, 1) == fingerprint
        session.commit()
        session.close()
    assert state(engine) == before


def test_should_advance_monotonically_on_graph_replacement_without_restoring_old_revision(design_db):
    engine, _ = design_db
    before = state(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM form_field WHERE form_id=1")
        conn.exec_driver_sql("DELETE FROM form WHERE id=1")
        conn.exec_driver_sql("INSERT INTO form(id,project_id,name,code) VALUES(1,1,'F','F')")
    assert state(engine)[0] == before[0]
    assert state(engine)[1] > before[1]


def test_should_mint_new_incarnation_for_reused_project_id(design_db):
    engine, _ = design_db
    before = state(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM project WHERE id=1")
        conn.exec_driver_sql("INSERT INTO project(id,name,version,owner_id) VALUES(1,'replacement','1',1)")
    assert state(engine)[0] != before[0]


def test_should_rebuild_form_field_without_losing_other_tables_triggers(design_db):
    from src.database import _rebuild_form_field_table

    engine, _ = design_db
    before = state(engine)
    with engine.begin() as conn:
        _rebuild_form_field_table(conn, log_message="C4 isolated rebuild")
        conn.exec_driver_sql("UPDATE form_field SET required=1 WHERE id=1")
    assert state(engine)[0] == before[0]
    assert state(engine)[1] > before[1]


def test_should_invalidate_pre_upgrade_states_when_startup_migrations_suspend_triggers(design_db, monkeypatch):
    import src.database as database

    engine, _ = design_db
    before = state(engine)
    monkeypatch.setattr(database, "get_engine", lambda: engine)
    monkeypatch.setattr(database, "heal_reserved_admin_account", lambda _: None)
    database.init_db()
    assert state(engine)[0] == before[0]
    assert state(engine)[1] > before[1]


def test_should_advance_and_rollback_explicit_c6_replacement_invalidation(design_db):
    from sqlalchemy.orm import Session
    from src.services.design_revision_service import invalidate_project_design

    engine, _ = design_db
    before = state(engine)
    with Session(engine) as session:
        invalidate_project_design(session, 1)
        session.rollback()
    assert state(engine) == before
    with Session(engine) as session, session.begin():
        invalidate_project_design(session, 1)
    assert state(engine) == (before[0], before[1] + 1)


def test_should_fail_closed_if_online_state_is_uninitialized(design_db):
    from sqlalchemy.orm import Session
    from src.services.design_revision_service import invalidate_project_design, read_design_revision

    engine, _ = design_db
    with Session(engine) as session:
        with pytest.raises(RuntimeError, match="在线设计状态未初始化"):
            read_design_revision(session, 999)
        with pytest.raises(RuntimeError, match="在线设计状态未初始化"):
            invalidate_project_design(session, 999)


@pytest.mark.parametrize("kind", ["full", "project", "user"])
def test_should_strip_online_revision_triggers_and_state_from_every_product_export(design_db, kind):
    from src.services.database_export_service import (
        export_full_database,
        export_project_database,
        export_user_projects_database,
    )

    engine, path = design_db
    before = state(engine)
    exporter, args = {
        "full": (export_full_database, (str(path),)),
        "project": (export_project_database, (str(path), 1, "P")),
        "user": (export_user_projects_database, (str(path), 1)),
    }[kind]
    exported = exporter(*args)
    with sqlite3.connect(exported) as conn:
        assert (
            conn.execute(
                "SELECT name FROM sqlite_master WHERE name='project_design_state' OR (type='trigger' AND name LIKE 'crf_design_v1_%')"
            ).fetchall()
            == []
        )
        conn.execute("UPDATE form SET name='exchange copy'")
        conn.commit()
    assert state(engine) == before
