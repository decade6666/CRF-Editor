"""C4: real SQLite editor snapshots, physical writes and private revision state."""

from concurrent.futures import ThreadPoolExecutor
import threading

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session

from main import app
from src.database import get_session
from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.services.auth_service import create_access_token

pytestmark = pytest.mark.integration
HEADER = "X-CRF-Design-Revision"


@pytest.fixture
def design_context(raw_client, tmp_path):
    """Two independent file-backed connections; no production config or data."""
    client = raw_client
    engine = create_engine(
        f"sqlite:///{tmp_path / 'design.db'}",
        connect_args={"check_same_thread": False, "timeout": 5},
    )

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")

    Base.metadata.create_all(engine)
    from src.services.design_revision_service import initialize_design_state

    initialize_design_state(engine)
    with Session(engine) as session:
        user = User(username="design-owner", auth_version=0)
        session.add(user)
        session.flush()
        project = Project(name="隔离并发项目", version="1", owner_id=user.id)
        session.add(project)
        session.flush()
        form = Form(project_id=project.id, name="初始名称", code="FORM", order_index=1)
        definition = FieldDefinition(
            project_id=project.id, variable_name="FIELD", label="初始字段", field_type="文本", order_index=1
        )
        session.add_all([form, definition])
        session.flush()
        instance = FormField(form_id=form.id, field_definition_id=definition.id, order_index=1)
        session.add(instance)
        session.flush()
        context = dict(project_id=project.id, form_id=form.id, fd_id=definition.id, ff_id=instance.id)
        context["headers"] = {"Authorization": f"Bearer {create_access_token(user.id, user.username, 0)}"}
        session.commit()

    def file_session():
        with Session(engine) as session, session.begin():
            yield session

    previous = app.dependency_overrides[get_session]
    app.dependency_overrides[get_session] = file_session
    try:
        yield client, engine, context
    finally:
        app.dependency_overrides[get_session] = previous
        engine.dispose()


def load_state(client, context):
    response = client.get(f"/api/projects/{context['project_id']}/forms", headers=context["headers"])
    assert response.status_code == 200, response.text
    return response


def write_headers(context, revision):
    return {**context["headers"], "If-Match": revision}


def test_should_reject_second_real_session_save_from_same_loaded_state(design_context):
    client, engine, context = design_context
    first_view = load_state(client, context)
    second_view = load_state(client, context)
    # Legacy fallback exists only to exercise the pre-C4 stale-write symptom in RED.
    revision = first_view.headers.get(HEADER, '"pre-c4-state"')
    assert first_view.json() == second_view.json()
    first = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "第一会话"}, headers=write_headers(context, revision)
    )
    second = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "过期第二会话"}, headers=write_headers(context, revision)
    )
    assert (first.status_code, second.status_code) == (200, 409)
    assert second.json()["code"] == "STALE_STATE"
    with Session(engine) as session:
        assert session.get(Form, context["form_id"]).name == "第一会话"


def test_should_reject_missing_precondition_without_mutation(design_context):
    client, engine, context = design_context
    response = client.put(f"/api/forms/{context['form_id']}", json={"name": "不得保存"}, headers=context["headers"])
    assert response.status_code == 428
    assert response.json()["code"] == "PRECONDITION_REQUIRED"
    with Session(engine) as session:
        assert session.get(Form, context["form_id"]).name == "初始名称"


def test_should_allow_only_one_concurrent_write_with_same_precondition(design_context):
    client, engine, context = design_context
    revision = load_state(client, context).headers.get(HEADER, '"pre-c4-state"')
    barrier = threading.Barrier(2)

    def save(name):
        barrier.wait(timeout=5)
        return client.put(
            f"/api/forms/{context['form_id']}", json={"name": name}, headers=write_headers(context, revision)
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, ["并发A", "并发B"]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = responses[0].json()["name"] if responses[0].status_code == 200 else responses[1].json()["name"]
    with Session(engine) as session:
        assert session.get(Form, context["form_id"]).name == winner


def test_should_return_body_and_revision_from_one_real_read_snapshot(design_context):
    client, engine, context = design_context
    initial = load_state(client, context)
    statements = []
    changed = False

    def concurrent_change(conn, cursor, statement, parameters, execution_context, executemany):
        nonlocal changed
        statements.append(statement)
        if not changed and statement.startswith("SELECT form."):
            changed = True
            with engine.begin() as writer:
                writer.execute(text("UPDATE form SET name='读取期间变化' WHERE id=:id"), {"id": context["form_id"]})

    event.listen(engine, "after_cursor_execute", concurrent_change)
    try:
        snapshot = load_state(client, context)
    finally:
        event.remove(engine, "after_cursor_execute", concurrent_change)
    latest = load_state(client, context)
    assert changed
    assert snapshot.json()[0]["name"] == "初始名称"
    assert snapshot.headers[HEADER] == initial.headers[HEADER]
    assert latest.headers[HEADER] != snapshot.headers[HEADER]
    assert any(statement == "BEGIN" for statement in statements)


def test_should_check_authorization_after_physical_write_begin(design_context):
    client, engine, context = design_context
    revision = load_state(client, context).headers.get(HEADER, '"pre-c4-state"')
    statements = []

    def record(conn, cursor, statement, parameters, execution_context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = client.put(
            f"/api/forms/{context['form_id']}", json={"name": "安全保存"}, headers=write_headers(context, revision)
        )
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200
    assert statements[0] == "BEGIN IMMEDIATE"
    assert next(i for i, sql in enumerate(statements) if "FROM user" in sql) > 0


def test_should_reject_third_write_after_review_without_advancing_revision(design_context):
    client, engine, context = design_context
    review = load_state(client, context).headers.get(HEADER, '"pre-c4-state"')
    changed = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "第三次写入"}, headers=write_headers(context, review)
    )
    rejected = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "覆盖已审阅状态"}, headers=write_headers(context, review)
    )
    assert rejected.status_code == 409
    assert HEADER not in rejected.headers
    assert load_state(client, context).headers[HEADER] == changed.headers[HEADER]


def test_should_atomically_restore_definition_and_delete_instance(design_context):
    client, engine, context = design_context
    revision = load_state(client, context).headers.get(HEADER, '"pre-c4-state"')
    response = client.put(
        f"/api/form-fields/{context['ff_id']}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": context["fd_id"],
                    "definition": {"variable_name": "FIELD", "label": "真实覆盖前内容", "field_type": "文本"},
                },
            },
            "binding": {"mode": "keep"},
            "instance": {"mode": "delete"},
        },
        headers=write_headers(context, revision),
    )
    assert response.status_code == 200, response.text
    with Session(engine) as session:
        assert session.get(FormField, context["ff_id"]) is None
        assert session.get(FieldDefinition, context["fd_id"]).label == "真实覆盖前内容"


@pytest.mark.parametrize("current_type", ["文本", "标签"])
def test_should_preserve_preexisting_unplaced_label_definition_after_compound_undo(design_context, current_type):
    client, engine, context = design_context
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM form_field")
        conn.exec_driver_sql("UPDATE field_definition SET field_type='标签',label='原有独立标签' WHERE id=1")
    before_create = load_state(client, context).headers[HEADER]
    created = client.post(
        f"/api/forms/{context['form_id']}/field-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": context["fd_id"],
                    "definition": {"variable_name": "FIELD", "label": "保存后的内容", "field_type": current_type},
                },
            },
            "binding": {"mode": "existing", "target_field_definition_id": context["fd_id"]},
            "instance": {"mode": "upsert", "upsert": {}},
        },
        headers=write_headers(context, before_create),
    )
    assert created.status_code == 201, created.text
    assert created.json()["definition_created"] is False
    restored = client.put(
        f"/api/form-fields/{created.json()['form_field_id']}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": context["fd_id"],
                    "definition": {"variable_name": "FIELD", "label": "原有独立标签", "field_type": "标签"},
                },
            },
            "binding": {"mode": "keep"},
            "instance": {"mode": "delete"},
        },
        headers=write_headers(context, created.headers[HEADER]),
    )
    assert restored.status_code == 200, restored.text
    with Session(engine) as session:
        assert session.get(FormField, created.json()["form_field_id"]) is None
        original = session.get(FieldDefinition, context["fd_id"])
        assert original is not None
        assert original.field_type == "标签"
        assert original.label == "原有独立标签"


def test_should_rollback_definition_and_instance_when_compound_restore_is_invalid(design_context):
    client, engine, context = design_context
    revision = load_state(client, context).headers.get(HEADER, '"pre-c4-state"')
    response = client.put(
        f"/api/form-fields/{context['ff_id']}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": context["fd_id"],
                    "definition": {"variable_name": "DIFFERENT", "label": "不应写入", "field_type": "文本"},
                },
            },
            "instance": {"mode": "delete"},
        },
        headers=write_headers(context, revision),
    )
    assert response.status_code == 422
    with Session(engine) as session:
        assert session.get(FormField, context["ff_id"]) is not None
        assert session.get(FieldDefinition, context["fd_id"]).label == "初始字段"
