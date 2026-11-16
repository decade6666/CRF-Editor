"""Explicit raw-client coverage matrix, authorization and browser/Agent interaction."""

from datetime import datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from agent_access_helpers import agent_tool, issue_credential, reset_agent_limiter
from src.agent_dependencies import get_agent_engine
from main import app
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.services.agent_state_service import compute_project_fingerprint
from src.services.auth_service import create_access_token
from test_design_revision import design_context, load_state, write_headers, HEADER

pytestmark = pytest.mark.integration

CORE_CASES = [
    ("POST", "/projects/{project_id}/forms", {"name": "N"}),
    ("PUT", "/forms/{form_id}", {"name": "N"}),
    ("PATCH", "/forms/{form_id}", {"design_notes": "N"}),
    ("DELETE", "/forms/{form_id}", None),
    ("POST", "/projects/{project_id}/forms/batch-delete", {"ids": []}),
    ("POST", "/projects/{project_id}/forms/reorder", []),
    ("POST", "/projects/{project_id}/field-definitions", {"variable_name": "NEW", "label": "N", "field_type": "文本"}),
    ("PUT", "/projects/{project_id}/field-definitions/{fd_id}", {"label": "N"}),
    ("DELETE", "/field-definitions/{fd_id}", None),
    ("POST", "/projects/{project_id}/field-definitions/batch-delete", {"ids": []}),
    ("POST", "/projects/{project_id}/field-definitions/reorder", []),
    ("POST", "/field-definitions/{fd_id}/copy", {}),
    ("POST", "/forms/{form_id}/fields", {"is_log_row": 1}),
    ("POST", "/forms/{form_id}/field-profile", {"instance": {"mode": "upsert", "upsert": {}}}),
    ("PUT", "/form-fields/{ff_id}/binding-profile", {"instance": {"mode": "upsert", "upsert": {}}}),
    ("DELETE", "/form-fields/{ff_id}", None),
    ("POST", "/forms/{form_id}/fields/reorder", {"ordered_ids": []}),
    ("POST", "/forms/{form_id}/fields/restore-batch", {"items": []}),
    ("POST", "/forms/{form_id}/fields/batch-delete", {"ids": []}),
]


@pytest.mark.parametrize("method,path,payload", CORE_CASES)
def test_should_require_loaded_state_on_each_of_nineteen_core_endpoints(design_context, method, path, payload):
    client, engine, context = design_context
    before = load_state(client, context).headers[HEADER]
    response = client.request(method, "/api" + path.format(**context), json=payload, headers=context["headers"])
    assert response.status_code == 428, response.text
    assert response.json()["code"] == "PRECONDITION_REQUIRED"
    assert load_state(client, context).headers[HEADER] == before


def test_should_fail_closed_when_design_dependency_receives_an_already_open_physical_transaction(design_context):
    from starlette.requests import Request
    from src.design_dependencies import get_design_session

    _, engine, _ = design_context
    with engine.connect() as connection:
        connection.exec_driver_sql("BEGIN")
        with Session(bind=connection, join_transaction_mode="control_fully") as session:
            request = Request({"type": "http", "state": {"design_read": True}})
            with pytest.raises(RuntimeError, match="鉴权和数据读取前启动"):
                next(get_design_session(request, session))


def test_should_reject_noninteger_scope_before_precondition_disclosure(design_context):
    client, _, context = design_context
    response = client.put("/api/forms/not-an-integer", json={"name": "N"}, headers=context["headers"])
    assert response.status_code == 422
    assert HEADER not in response.headers


def test_should_keep_writer_registry_equal_to_published_endpoint_matrix():
    from src.design_dependencies import CORE_MUTATIONS

    assert CORE_MUTATIONS == {(method, path) for method, path, _ in CORE_CASES}
    assert len(CORE_MUTATIONS) == 19


@pytest.mark.parametrize(
    "path",
    [
        "/projects/{project_id}/forms/batch-references",
        "/projects/{project_id}/field-definitions/batch-references",
    ],
)
def test_should_not_gate_post_reference_reads_or_invalidate_design(design_context, path):
    client, _, context = design_context
    before = load_state(client, context).headers[HEADER]
    response = client.post(
        "/api" + path.format(**context),
        json={"ids": [context["form_id"] if "/forms/" in path else context["fd_id"]]},
        headers=context["headers"],
    )
    assert response.status_code == 200
    assert response.headers[HEADER] == before


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("DELETE", "/forms/{form_id}", None),
        ("DELETE", "/field-definitions/{fd_id}", None),
        ("DELETE", "/form-fields/{ff_id}", None),
        ("POST", "/forms/{form_id}/fields/reorder", "reorder"),
    ],
)
def test_should_return_committed_revision_on_all_four_no_content_endpoints(design_context, method, path, body):
    client, engine, context = design_context
    if path == "/field-definitions/{fd_id}":
        with engine.begin() as conn:
            conn.exec_driver_sql("DELETE FROM form_field")
    before = load_state(client, context).headers[HEADER]
    kwargs = {"json": {"ordered_ids": [context["ff_id"]]}} if body == "reorder" else {}
    response = client.request(method, "/api" + path.format(**context), headers=write_headers(context, before), **kwargs)
    assert response.status_code == 204, response.text
    assert response.content == b""
    assert response.headers[HEADER] == load_state(client, context).headers[HEADER]
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/projects/{project_id}/codelists", {"name": "独立字典"}),
        ("/projects/{project_id}/units", {"symbol": "kg"}),
        ("/projects/{project_id}/visits", {"name": "独立访视", "sequence": 1}),
        ("/forms/{form_id}/copy", {}),
    ],
)
def test_should_allow_invalidation_only_writers_without_header_and_stale_old_core_edit(design_context, path, payload):
    client, _, context = design_context
    before = load_state(client, context).headers[HEADER]
    independent = client.post("/api" + path.format(**context), json=payload, headers=context["headers"])
    assert independent.status_code == 201, independent.text
    after = load_state(client, context).headers[HEADER]
    assert after != before
    stale = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "不得覆盖"}, headers=write_headers(context, before)
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "STALE_STATE"
    assert load_state(client, context).headers[HEADER] == after


def test_should_authorize_before_exposing_revision_or_precondition_error(design_context):
    client, engine, context = design_context
    with Session(engine) as session:
        foreign = User(username="foreign", auth_version=0)
        session.add(foreign)
        session.flush()
        headers = {"Authorization": f"Bearer {create_access_token(foreign.id, foreign.username, 0)}"}
        session.commit()
    response = client.put(f"/api/forms/{context['form_id']}", json={"name": "forbidden"}, headers=headers)
    assert response.status_code == 403
    assert HEADER not in response.headers
    assert "crf-design" not in response.text


def test_should_revalidate_revoked_auth_and_recycled_project_inside_write(design_context):
    client, engine, context = design_context
    before = load_state(client, context).headers[HEADER]
    with Session(engine) as session:
        project = session.get(Project, context["project_id"])
        project.deleted_at = datetime.now()
        session.commit()
    recycled = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "forbidden"}, headers=write_headers(context, before)
    )
    assert recycled.status_code == 404
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE user SET auth_version=auth_version+1")
    expired = client.put(
        f"/api/forms/{context['form_id']}", json={"name": "forbidden"}, headers=write_headers(context, before)
    )
    assert expired.status_code == 401
    assert HEADER not in expired.headers


def test_should_keep_business_validation_and_revision_atomic(design_context):
    client, _, context = design_context
    before = load_state(client, context).headers[HEADER]
    response = client.post(
        f"/api/forms/{context['form_id']}/fields/reorder",
        json={"ordered_ids": []},
        headers=write_headers(context, before),
    )
    assert response.status_code == 400
    assert load_state(client, context).headers[HEADER] == before


def test_should_invalidate_browser_state_on_agent_write_and_preserve_exact_replay(design_context):
    client, engine, context = design_context

    def agent_engine():
        yield engine

    previous = app.dependency_overrides[get_agent_engine]
    app.dependency_overrides[get_agent_engine] = agent_engine
    try:
        before = load_state(client, context).headers[HEADER]
        grant = issue_credential(
            client, context["headers"]["Authorization"][7:], context["project_id"], permission="read_write"
        )
        assert load_state(client, context).headers[HEADER] == before
        with Session(engine) as session:
            fingerprint = compute_project_fingerprint(session, context["project_id"])
        arguments = dict(
            project_id=context["project_id"],
            form_field_id=context["ff_id"],
            patch={"help_text": "Agent write"},
            expected_project_fingerprint=fingerprint,
            request_id="c4-mixed",
        )
        first = agent_tool(client, grant["token"], "crf_update_form_field_instance", arguments)
        assert first.status_code == 200, first.text
        stale = client.put(
            f"/api/form-fields/{context['ff_id']}/binding-profile",
            json={"instance": {"mode": "upsert", "upsert": {"help_text": "stale browser"}}},
            headers=write_headers(context, before),
        )
        assert stale.status_code == 409
        current = load_state(client, context).headers[HEADER]
        browser = client.put(
            f"/api/forms/{context['form_id']}", json={"name": "later browser"}, headers=write_headers(context, current)
        )
        assert browser.status_code == 200
        replay = agent_tool(client, grant["token"], "crf_update_form_field_instance", arguments)
        assert replay.status_code == 200
        assert replay.json()["project_fingerprint"] == first.json()["project_fingerprint"]
        assert replay.json()["warnings"] == first.json()["warnings"]
        assert {key: value for key, value in replay.json()["data"].items() if key != "replay"} == first.json()["data"]
        assert load_state(client, context).headers[HEADER] == browser.headers[HEADER]
    finally:
        app.dependency_overrides[get_agent_engine] = previous


def test_should_rollback_late_storage_failure_in_compound_undo(design_context):
    client, engine, context = design_context
    before = load_state(client, context).headers[HEADER]
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TRIGGER fail_compound_delete BEFORE DELETE ON form_field BEGIN SELECT RAISE(ABORT,'injected storage fault'); END"
        )
    response = client.put(
        f"/api/form-fields/{context['ff_id']}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": context["fd_id"],
                    "definition": {"variable_name": "FIELD", "label": "rolled back", "field_type": "文本"},
                },
            },
            "instance": {"mode": "delete"},
        },
        headers=write_headers(context, before),
    )
    assert response.status_code == 409
    assert response.json().get("code") != "STALE_STATE"
    assert load_state(client, context).headers[HEADER] == before
    with Session(engine) as session:
        assert session.get(FormField, context["ff_id"]) is not None
        assert session.get(FieldDefinition, context["fd_id"]).label == "初始字段"
