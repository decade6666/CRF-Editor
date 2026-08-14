"""字段 profile 原子端点测试矩阵。

覆盖：新增草稿（新建/绑定既有）、实例部分更新、共享更新、换绑、OID 分叉、
同表单重复、跨项目、log 行拒绝、校验、归一、事务回滚、原定义清理语义、权限。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField

from helpers import auth_headers, login_as


def _add_field(client, form_id, field_definition_id, token):
    resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_profile(client, form_id, token, payload):
    resp = client.post(
        f"/api/forms/{form_id}/field-profile",
        json=payload,
        headers=auth_headers(token),
    )
    return resp


def _update_profile(client, ff_id, token, payload):
    resp = client.put(
        f"/api/form-fields/{ff_id}/binding-profile",
        json=payload,
        headers=auth_headers(token),
    )
    return resp


def _new_definition_payload(variable_name="NEW_DEF", label="新字段", field_type="文本"):
    return {
        "variable_name": variable_name,
        "label": label,
        "field_type": field_type,
    }


@pytest.fixture
def field_context(client: TestClient, engine):
    from src.models.project import Project
    from src.models.user import User

    token = login_as(client, "alice")
    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        project = Project(name="字段profile项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.flush()
        from src.models.form import Form

        form = Form(project_id=project.id, name="表单A", code="F_A", order_index=1)
        session.add(form)
        session.flush()
        fd = FieldDefinition(
            project_id=project.id, variable_name="BASE_DEF", label="基础字段", field_type="文本",
            order_index=1,
        )
        session.add(fd)
        session.flush()
        context = {
            "project_id": project.id,
            "form_id": form.id,
            "field_definition_id": fd.id,
        }
        session.commit()
    context["token"] = token
    return context


# ── 新增草稿 ────────────────────────────────────────────────────────────


def test_create_profile_with_new_definition(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload()},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"required": 1, "default_value": "A"}},
        },
    )
    assert resp.status_code == 201, resp.text
    payload = resp.json()
    assert payload["definition_created"] is True
    assert payload["form_field"]["field_definition"]["variable_name"] == "NEW_DEF"
    assert payload["form_field"]["required"] == 1
    assert payload["form_field"]["default_value"] == "A"


def test_create_profile_attach_existing_definition(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": field_context["field_definition_id"]},
            "instance": {"mode": "upsert", "upsert": {"required": 1}},
        },
    )
    assert resp.status_code == 201, resp.text
    payload = resp.json()
    assert payload["definition_created"] is False
    assert payload["form_field"]["field_definition_id"] == field_context["field_definition_id"]


def test_create_profile_attach_duplicate_definition_conflicts(field_context, client):
    _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": field_context["field_definition_id"]},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 409, resp.text
    assert "已在表单中" in resp.json()["detail"]


def test_create_profile_fork_conflicts_with_existing_oid(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="BASE_DEF")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 409, resp.text
    assert "OID" in resp.json()["detail"]


def test_create_profile_create_or_restore_requires_operation_result_binding(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload()},
            },
            "binding": {"mode": "keep"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 400, resp.text


def test_create_profile_normalizes_default_value_for_choice_type(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="DATE_DEF", field_type="日期")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"default_value": "2026-01-01"}},
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["form_field"]["default_value"] is None


def test_create_profile_inline_field_keeps_multiline_default(field_context, client):
    resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="INLINE_DEF")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"inline_mark": 1, "default_value": "A\nB"}},
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["form_field"]["default_value"] == "A\nB"


# ── 实例部分更新（快编 / inline）──────────────────────────────────────


def test_binding_profile_instance_only_update(field_context, client):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {"instance": {"mode": "upsert", "upsert": {"label_override": "快编标签", "bg_color": "FFEEDD"}}},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()["form_field"]
    assert updated["label_override"] == "快编标签"
    assert updated["bg_color"] == "FFEEDD"
    assert updated["field_definition_id"] == field_context["field_definition_id"]


def test_binding_profile_instance_only_keeps_omitted_fields(field_context, client):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {"instance": {"mode": "upsert", "upsert": {"text_color": "112233"}}},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["form_field"]["label_override"] is None
    assert resp.json()["form_field"]["text_color"] == "112233"


def test_binding_profile_rejects_log_row(field_context, client):
    resp = client.post(
        f"/api/forms/{field_context['form_id']}/fields",
        json={"is_log_row": 1, "label_override": "以下为log行"},
        headers=auth_headers(field_context["token"]),
    )
    assert resp.status_code == 201, resp.text
    log_ff = resp.json()

    resp = _update_profile(
        client,
        log_ff["id"],
        field_context["token"],
        {"instance": {"mode": "upsert", "upsert": {"label_override": "x"}}},
    )
    assert resp.status_code == 400, resp.text
    assert "日志行" in resp.json()["detail"]


# ── 共享更新与 OID 分叉 ──────────────────────────────────────────────


def test_binding_profile_update_shared_definition(field_context, client):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": field_context["field_definition_id"],
                    "definition": _new_definition_payload(variable_name="BASE_DEF", label="改名后的标签"),
                },
            },
            "instance": {"mode": "upsert", "upsert": {"default_value": "B"}},
        },
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["definition_created"] is False
    assert payload["form_field"]["field_definition"]["label"] == "改名后的标签"
    assert payload["form_field"]["default_value"] == "B"


def test_binding_profile_shared_update_rejects_oid_change(field_context, client):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": field_context["field_definition_id"],
                    "definition": _new_definition_payload(variable_name="CHANGED_OID"),
                },
            },
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 422, resp.text


def test_binding_profile_fork_creates_definition_and_rebinds(field_context, client, engine):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="FORK_DEF", label="分叉字段")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"default_value": "C"}},
            "cleanup_definition_id": field_context["field_definition_id"],
        },
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["definition_created"] is True
    assert payload["final_definition_id"] != field_context["field_definition_id"]
    assert payload["form_field"]["field_definition"]["variable_name"] == "FORK_DEF"

    # 原定义已无引用 → 清理
    with Session(engine) as session:
        original = session.get(FieldDefinition, field_context["field_definition_id"])
        assert original is None
        forked = session.get(FieldDefinition, payload["final_definition_id"])
        assert forked is not None
        assert forked.label == "分叉字段"


def test_binding_profile_fork_retains_original_when_referenced_elsewhere(field_context, client, engine):
    from src.models.form import Form

    with Session(engine) as session:
        other_form = Form(project_id=field_context["project_id"], name="表单B", code="F_B", order_index=2)
        session.add(other_form)
        session.flush()
        session.add(FormField(form_id=other_form.id, field_definition_id=field_context["field_definition_id"], order_index=1))
        session.commit()
        other_form_id = other_form.id

    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="FORK_KEEP")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
            "cleanup_definition_id": field_context["field_definition_id"],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["cleanup"] == {"deleted": False, "retained_in_use": True}

    with Session(engine) as session:
        assert session.get(FieldDefinition, field_context["field_definition_id"]) is not None
        assert session.get(Form, other_form_id) is not None


def test_binding_profile_fork_restore_reuses_preferred_definition(field_context, client, engine):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    # 先分叉创建 FORK_REDO
    fork_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="FORK_REDO")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
            "cleanup_definition_id": field_context["field_definition_id"],
        },
    )
    assert fork_resp.status_code == 200, fork_resp.text
    fork_id = fork_resp.json()["final_definition_id"]

    # 撤销分叉：换回原定义（原定义已被清理 → 用恢复语义重建）
    undo_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "preferred_definition_id": field_context["field_definition_id"],
                    "definition": _new_definition_payload(variable_name="BASE_DEF", label="基础字段"),
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
            "cleanup_definition_id": fork_id,
        },
    )
    assert undo_resp.status_code == 200, undo_resp.text
    undo_payload = undo_resp.json()
    assert undo_payload["definition_restored"] is False  # OID 已不存在 → 重新创建
    assert undo_payload["definition_created"] is True
    assert undo_payload["form_field"]["field_definition"]["variable_name"] == "BASE_DEF"

    # 重做分叉：FORK_REDO 已因 undo 清理被删 → preferred 不命中 → 按 OID 重建
    redo_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "preferred_definition_id": fork_id,
                    "definition": _new_definition_payload(variable_name="FORK_REDO"),
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
            "cleanup_definition_id": undo_payload["final_definition_id"],
        },
    )
    assert redo_resp.status_code == 200, redo_resp.text
    redo_payload = redo_resp.json()
    assert redo_payload["definition_created"] is True
    assert redo_payload["form_field"]["field_definition"]["variable_name"] == "FORK_REDO"


def test_binding_profile_fork_redo_reuses_preferred_when_kept(field_context, client):
    from src.models.form import Form

    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    # 分叉但保留原定义（不传 cleanup_definition_id）
    fork_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="FORK_KEEP2")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert fork_resp.status_code == 200, fork_resp.text
    fork_id = fork_resp.json()["final_definition_id"]

    # 撤销：换回原定义（分叉定义保留）
    undo_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": field_context["field_definition_id"]},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert undo_resp.status_code == 200, undo_resp.text
    assert undo_resp.json()["form_field"]["field_definition_id"] == field_context["field_definition_id"]

    # 重做：preferred 命中保留的分叉定义 → 复用、OID 不漂移
    redo_resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "preferred_definition_id": fork_id,
                    "definition": _new_definition_payload(variable_name="FORK_KEEP2"),
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert redo_resp.status_code == 200, redo_resp.text
    assert redo_resp.json()["definition_restored"] is True
    assert redo_resp.json()["final_definition_id"] == fork_id
    assert redo_resp.json()["form_field"]["field_definition"]["variable_name"] == "FORK_KEEP2"


def test_binding_profile_rebind_existing_definition(field_context, client, engine):
    from src.models.form import Form

    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    with Session(engine) as session:
        other_fd = FieldDefinition(
            project_id=field_context["project_id"], variable_name="OTHER_DEF", label="另一个字段",
            field_type="数值", order_index=2,
        )
        session.add(other_fd)
        session.commit()
        other_fd_id = other_fd.id

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": other_fd_id},
            "instance": {"mode": "upsert", "upsert": {"default_value": "5\n6"}},
        },
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()["form_field"]
    assert payload["field_definition_id"] == other_fd_id
    # 数值非 inline → 默认值截首行
    assert payload["default_value"] == "5"


def test_binding_profile_rebind_conflicts_when_target_already_in_form(field_context, client, engine):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    with Session(engine) as session:
        other_fd = FieldDefinition(
            project_id=field_context["project_id"], variable_name="OTHER_DEF2", label="另一个字段2",
            field_type="文本", order_index=2,
        )
        session.add(other_fd)
        session.flush()
        session.add(FormField(form_id=field_context["form_id"], field_definition_id=other_fd.id, order_index=2))
        session.commit()
        other_fd_id = other_fd.id

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": other_fd_id},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 409, resp.text


def test_binding_profile_rebind_rejects_cross_project_definition(field_context, client, engine):
    from src.models.project import Project
    from src.models.user import User

    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        other_project = Project(name="另一个项目", version="1.0", owner_id=alice.id, order_index=2)
        session.add(other_project)
        session.flush()
        foreign_fd = FieldDefinition(
            project_id=other_project.id, variable_name="FOREIGN_DEF", label="跨项目字段",
            field_type="文本", order_index=1,
        )
        session.add(foreign_fd)
        session.commit()
        foreign_fd_id = foreign_fd.id

    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "binding": {"mode": "existing", "target_field_definition_id": foreign_fd_id},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 403, resp.text


# ── 事务回滚 ───────────────────────────────────────────────────────────


def test_binding_profile_rolls_back_definition_and_instance_on_shared_update_failure(field_context, client, engine):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    # update_shared 变更 OID → 422；实例属性不得生效
    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": field_context["field_definition_id"],
                    "definition": _new_definition_payload(variable_name="ILLEGAL_CHANGE"),
                },
            },
            "instance": {"mode": "upsert", "upsert": {"label_override": "不应生效"}},
        },
    )
    assert resp.status_code == 422, resp.text

    with Session(engine) as session:
        original = session.get(FieldDefinition, field_context["field_definition_id"])
        assert original.variable_name == "BASE_DEF"
        instance = session.get(FormField, ff["id"])
        assert instance.label_override is None


def test_binding_profile_rolls_back_fork_on_instance_failure(field_context, client, engine):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])

    # 实例载荷非法（非法颜色）→ 422；分叉定义不得创建
    resp = _update_profile(
        client,
        ff["id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="ROLLBACK_FORK")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"bg_color": "ZZZZZZ"}},
        },
    )
    assert resp.status_code == 422, resp.text

    with Session(engine) as session:
        result = session.scalar(
            select(FieldDefinition).where(FieldDefinition.variable_name == "ROLLBACK_FORK")
        )
        assert result is None
        instance = session.get(FormField, ff["id"])
        assert instance.field_definition_id == field_context["field_definition_id"]


# ── 撤销新增字段（instance delete）──────────────────────────────────


def test_binding_profile_delete_instance_and_cleanup_definition(field_context, client, engine):
    create_resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="UNDO_NEW")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    ff_id = created["form_field"]["id"]
    fd_id = created["final_definition_id"]

    delete_resp = _update_profile(
        client,
        ff_id,
        field_context["token"],
        {
            "instance": {"mode": "delete"},
            "cleanup_definition_id": fd_id,
        },
    )
    assert delete_resp.status_code == 200, delete_resp.text
    payload = delete_resp.json()
    assert payload["form_field"] is None
    assert payload["cleanup"] == {"deleted": True, "retained_in_use": False}

    with Session(engine) as session:
        assert session.get(FormField, ff_id) is None
        assert session.get(FieldDefinition, fd_id) is None


def test_binding_profile_delete_retains_definition_when_referenced(field_context, client, engine):
    from src.models.form import Form

    create_resp = _create_profile(
        client,
        field_context["form_id"],
        field_context["token"],
        {
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {"definition": _new_definition_payload(variable_name="UNDO_NEW_KEEP")},
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    ff_id = created["form_field"]["id"]
    fd_id = created["final_definition_id"]

    with Session(engine) as session:
        other_form = Form(project_id=field_context["project_id"], name="表单C", code="F_C", order_index=3)
        session.add(other_form)
        session.flush()
        session.add(FormField(form_id=other_form.id, field_definition_id=fd_id, order_index=1))
        session.commit()

    delete_resp = _update_profile(
        client,
        ff_id,
        field_context["token"],
        {
            "instance": {"mode": "delete"},
            "cleanup_definition_id": fd_id,
        },
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["cleanup"] == {"deleted": False, "retained_in_use": True}

    with Session(engine) as session:
        assert session.get(FieldDefinition, fd_id) is not None


# ── 权限 ──────────────────────────────────────────────────────────────


def test_binding_profile_requires_owner(field_context, client):
    ff = _add_field(client, field_context["form_id"], field_context["field_definition_id"], field_context["token"])
    other_token = login_as(client, "bob")

    resp = _update_profile(
        client,
        ff["id"],
        other_token,
        {"instance": {"mode": "upsert", "upsert": {"label_override": "劫持"}}},
    )
    assert resp.status_code == 403, resp.text


def test_field_profile_requires_form_owner(field_context, client):
    other_token = login_as(client, "bob")

    resp = _create_profile(
        client,
        field_context["form_id"],
        other_token,
        {
            "binding": {"mode": "existing", "target_field_definition_id": field_context["field_definition_id"]},
            "instance": {"mode": "upsert", "upsert": {}},
        },
    )
    assert resp.status_code == 403, resp.text
