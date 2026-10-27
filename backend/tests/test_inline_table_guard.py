"""单横向表格编辑守卫（R1–R6）测试矩阵。

只约束编辑入口：直接创建实例、field-profile 草稿落库、binding-profile
属性/换绑、字段重排。导入 / 整表复制 / 整项目复制不经本守卫。
规则：横向块 = 按 (order_index, id) 顺序连续 truthy inline_mark 的一段；
允许 after_count <= max(1, before_count)（遗留多块可保留或减少，不可增加）。
被拒绝的请求必须整体回滚：定义 / 绑定 / 实例 / 顺序均不得产生副作用。
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "inline_table_block_cases.json"


def _shared_cases():
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def guard_context(client: TestClient, engine):
    """alice 的项目 + 空表单 + 六个文本定义 + 一个标签定义，供各用例布置横向块。"""
    token = login_as(client, "alice")
    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        project = Project(name="横向守卫项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.flush()
        form = Form(project_id=project.id, name="守卫表单", code="GUARD", order_index=1)
        session.add(form)
        session.flush()
        definition_ids = {}
        for index, name in enumerate(["DEF_A", "DEF_B", "DEF_C", "DEF_D", "DEF_E", "DEF_F"], start=1):
            fd = FieldDefinition(
                project_id=project.id,
                variable_name=name,
                label=f"字段{index}",
                field_type="文本",
                order_index=index,
            )
            session.add(fd)
            session.flush()
            definition_ids[name] = fd.id
        label_fd = FieldDefinition(
            project_id=project.id,
            variable_name="LABEL_1",
            label="节段一",
            field_type="标签",
            order_index=len(definition_ids) + 1,
        )
        session.add(label_fd)
        session.flush()
        session.commit()
        context = {
            "project_id": project.id,
            "form_id": form.id,
            "definition_ids": definition_ids,
            "label_definition_id": label_fd.id,
        }
    context["token"] = token
    return context


def _add_field(client, form_id, token, *, definition_id=None, inline_mark=0, order_index=None, is_log_row=0):
    payload = {"inline_mark": inline_mark, "is_log_row": is_log_row}
    if definition_id is not None:
        payload["field_definition_id"] = definition_id
    if order_index is not None:
        payload["order_index"] = order_index
    return client.post(f"/api/forms/{form_id}/fields", json=payload, headers=auth_headers(token))


def _read_fields(engine, form_id):
    """独立会话读回 (order_index, inline_mark, field_definition_id)，验证最终落库状态。"""
    with Session(engine) as session:
        rows = session.scalars(
            select(FormField).where(FormField.form_id == form_id).order_by(FormField.order_index, FormField.id)
        ).all()
        return [(row.order_index, row.inline_mark, row.field_definition_id) for row in rows]


def _read_definition(engine, definition_id):
    with Session(engine) as session:
        fd = session.get(FieldDefinition, definition_id)
        return None if fd is None else (fd.variable_name, fd.field_type)


def _count_project_definitions(engine, project_id):
    with Session(engine) as session:
        return len(session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == project_id)).all())


# ── 共享用例表：纯计数与 R6 策略 ─────────────────────────────────────────


def test_guard_helper_counts_and_policy_match_shared_fixture():
    from src.services.inline_table_guard import count_inline_blocks, is_block_count_allowed

    data = _shared_cases()
    for case in data["count_cases"]:
        assert count_inline_blocks(case["markers"]) == case["blocks"], case["name"]
    for case in data["policy_cases"]:
        assert is_block_count_allowed(case["before"], case["after"]) == case["allowed"], case["name"]


def test_guard_message_matches_shared_fixture():
    from src.services.inline_table_guard import INLINE_TABLE_LIMIT_MSG

    assert INLINE_TABLE_LIMIT_MSG == _shared_cases()["limit_message"]


# ── 直接创建实例 ─────────────────────────────────────────────────────────


def test_first_block_and_adjacent_expansion_allowed(guard_context, client, engine):
    """空表单允许第一块；紧邻扩展仍是一个块（AC1/AC2）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1).status_code == 201
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1).status_code == 201
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 1, ids["DEF_B"])]


def test_ordinary_sections_around_block_allowed(guard_context, client, engine):
    """N→I→N：普通段与横向块共存不受限（R1）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert _add_field(client, form_id, token, definition_id=ids["DEF_A"], order_index=1).status_code == 201
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).status_code == 201
    )
    assert _add_field(client, form_id, token, definition_id=ids["DEF_C"], order_index=3).status_code == 201
    assert _read_fields(engine, form_id) == [(1, 0, ids["DEF_A"]), (2, 1, ids["DEF_B"]), (3, 0, ids["DEF_C"])]


def test_direct_create_second_separated_block_rejected(guard_context, client, engine):
    """合规表单（1 块）上追加被普通字段分隔的横向字段：400 + 零副作用（AC1/AC5）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1).status_code == 201
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], order_index=2).status_code == 201

    resp = _add_field(client, form_id, token, definition_id=ids["DEF_C"], inline_mark=1)

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"])]


def test_direct_create_at_position_splitting_or_second_block_rejected(guard_context, client, engine):
    """显式插入位制造第二块同样 400，且顺序保持不变（AC5）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).status_code == 201
    )
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], order_index=2).status_code == 201
    assert _add_field(client, form_id, token, definition_id=ids["DEF_C"], order_index=3).status_code == 201

    resp = _add_field(client, form_id, token, inline_mark=1, order_index=3, is_log_row=1)

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert [row[0] for row in _read_fields(engine, form_id)] == [1, 2, 3]


def test_noncanonical_truthy_marker_cannot_evade_guard(guard_context, client, engine):
    """非规范 2 / 负数标记与 1 同样按 truthy 计入（design §2.6）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=2, order_index=1).status_code == 201
    )
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], order_index=2).status_code == 201

    resp = _add_field(client, form_id, token, definition_id=ids["DEF_C"], inline_mark=-1)

    assert resp.status_code == 400, resp.text
    assert _read_fields(engine, form_id) == [(1, 2, ids["DEF_A"]), (2, 0, ids["DEF_B"])]


# ── binding-profile：属性 / 换绑 / 归一终态 ──────────────────────────────


def test_binding_profile_disabling_middle_marker_splits_block_and_rejected(guard_context, client, engine):
    """RED：块中间关闭横向标记会拆出第二块，必须 400 且标记不落库（AC2）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).status_code == 201
    )
    middle = _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).json()
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_C"], inline_mark=1, order_index=3).status_code == 201
    )

    resp = client.put(
        f"/api/form-fields/{middle['id']}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": {"inline_mark": 0}}},
        headers=auth_headers(token),
    )

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 1, ids["DEF_B"]), (3, 1, ids["DEF_C"])]


def test_binding_profile_edge_disable_allowed(guard_context, client, engine):
    """块尾关闭标记：块数 1→1，允许。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).status_code == 201
    )
    tail = _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).json()

    resp = client.put(
        f"/api/form-fields/{tail['id']}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": {"inline_mark": 0}}},
        headers=auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"])]


def test_binding_profile_type_normalization_final_state_rejected(guard_context, client, engine):
    """终态归一计入守卫：块中间改类型为「日志行」标记强制归零并拆块 → 400（AC5）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).status_code == 201
    )
    middle = _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).json()
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_C"], inline_mark=1, order_index=3).status_code == 201
    )

    resp = client.put(
        f"/api/form-fields/{middle['id']}/binding-profile",
        json={
            "definition_operation": {
                "operation": "update_shared",
                "update_shared": {
                    "target_definition_id": ids["DEF_B"],
                    "definition": {"variable_name": "DEF_B", "label": "字段2", "field_type": "日志行"},
                },
            },
            "instance": {"mode": "upsert", "upsert": {}},
        },
        headers=auth_headers(token),
    )

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 1, ids["DEF_B"]), (3, 1, ids["DEF_C"])]
    assert _read_definition(engine, ids["DEF_B"]) == ("DEF_B", "文本")


def test_binding_profile_marker_omitted_counts_final_state(guard_context, client, engine):
    """载荷省略 inline_mark 时仍按归一终态计数：合规操作放行且标记归一为 1。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    created = _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=2, order_index=1).json()
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], order_index=2).status_code == 201

    resp = client.put(
        f"/api/form-fields/{created['id']}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": {"label_override": "覆盖标签"}}},
        headers=auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"])]


# ── field-profile：草稿落库 ──────────────────────────────────────────────


def test_profile_create_separated_inline_rolls_back_definition(guard_context, client, engine):
    """草稿落库在分隔位建横向块：400 且定义/实例/清理全部回滚（AC5）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    assert (
        _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).status_code == 201
    )
    assert _add_field(client, form_id, token, definition_id=ids["DEF_B"], order_index=2).status_code == 201
    definitions_before = _count_project_definitions(engine, guard_context["project_id"])

    resp = client.post(
        f"/api/forms/{form_id}/field-profile",
        json={
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "definition": {"variable_name": "NEW_SEP", "label": "新字段", "field_type": "文本"}
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"inline_mark": 1}},
        },
        headers=auth_headers(token),
    )

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert _count_project_definitions(engine, guard_context["project_id"]) == definitions_before
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"])]


def test_profile_create_first_block_allowed(guard_context, client, engine):
    """空表单草稿落库第一块照常放行。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    resp = client.post(
        f"/api/forms/{form_id}/field-profile",
        json={
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "definition": {"variable_name": "NEW_BLOCK", "label": "新字段", "field_type": "文本"}
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"inline_mark": 1}},
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["form_field"]["inline_mark"] == 1


# ── 重排 ────────────────────────────────────────────────────────────────


def test_reorder_splitting_block_rejected_and_order_unchanged(guard_context, client, engine):
    """RED：拖拽把块内字段移出会拆块，必须 400 且顺序原样（AC3/AC5）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    first = _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).json()
    second = _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).json()
    third = _add_field(client, form_id, token, definition_id=ids["DEF_C"], order_index=3).json()

    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": [first["id"], third["id"], second["id"]]},
        headers=auth_headers(token),
    )

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert [row[2] for row in _read_fields(engine, form_id)] == [ids["DEF_A"], ids["DEF_B"], ids["DEF_C"]]


def test_reorder_within_single_block_allowed(guard_context, client, engine):
    """块内换位 / 普通段内移动仍 204 并正常落库（AC3 有效重排）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    first = _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).json()
    second = _add_field(client, form_id, token, definition_id=ids["DEF_B"], inline_mark=1, order_index=2).json()
    third = _add_field(client, form_id, token, definition_id=ids["DEF_C"], order_index=3).json()

    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": [second["id"], first["id"], third["id"]]},
        headers=auth_headers(token),
    )

    assert resp.status_code == 204, resp.text
    assert [row[2] for row in _read_fields(engine, form_id)] == [ids["DEF_B"], ids["DEF_A"], ids["DEF_C"]]


def test_reorder_incomplete_id_list_still_400(guard_context, client):
    """既有完整性校验先于新守卫：ID 列表不完整保持 400（R8 行为不变）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    first = _add_field(client, form_id, token, definition_id=guard_context["definition_ids"]["DEF_A"]).json()
    _add_field(client, form_id, token, definition_id=guard_context["definition_ids"]["DEF_B"], order_index=2)
    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": [first["id"]]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400, resp.text


# ── 遗留多块（R6 / AC7） ─────────────────────────────────────────────────


def _seed_legacy_blocks(engine, form_id, placements):
    """直接经 ORM 造守卫上线前的遗留多块布局：placements = [(definition_id, order, marker)]。"""
    with Session(engine) as session:
        for definition_id, order_index, inline_mark in placements:
            session.add(
                FormField(
                    form_id=form_id,
                    field_definition_id=definition_id,
                    order_index=order_index,
                    inline_mark=inline_mark,
                )
            )
        session.commit()


def _set_inline_mark(client, token, ff_id, inline_mark):
    return client.put(
        f"/api/form-fields/{ff_id}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": {"inline_mark": inline_mark}}},
        headers=auth_headers(token),
    )


def test_legacy_two_blocks_may_persist_but_not_increase(guard_context, client, engine):
    """2 块遗留布局：维持 / 递减 / 布局无关编辑允许；重新拉起第 2 块 400（AC7）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    _seed_legacy_blocks(engine, form_id, [(ids["DEF_A"], 1, 1), (ids["DEF_B"], 2, 0), (ids["DEF_C"], 3, 1)])
    ff_c = _field_id_by_definition(engine, form_id, ids["DEF_C"])

    # 布局无关编辑照常可用
    resp = client.put(
        f"/api/form-fields/{ff_c}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": {"label_override": "重命名"}}},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text

    # 递减：2 块 → 1 块允许
    resp = _set_inline_mark(client, token, ff_c, 0)
    assert resp.status_code == 200, resp.text
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"]), (3, 0, ids["DEF_C"])]

    # 修复成 1 块后不得再长出第二块
    resp = _set_inline_mark(client, token, ff_c, 1)
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    assert _read_fields(engine, form_id) == [(1, 1, ids["DEF_A"]), (2, 0, ids["DEF_B"]), (3, 0, ids["DEF_C"])]


def test_legacy_three_blocks_may_not_increase_and_repair_not_reverted(guard_context, client, engine):
    """3 块遗留布局：布局无关编辑可用；不得增至 4；减到 2 后撤销修复被拒（AC7）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    _seed_legacy_blocks(
        engine,
        form_id,
        [
            (ids["DEF_A"], 1, 1),
            (ids["DEF_B"], 2, 0),
            (ids["DEF_C"], 3, 1),
            (ids["DEF_D"], 4, 0),
            (ids["DEF_E"], 5, 1),
        ],
    )
    ff_c = _field_id_by_definition(engine, form_id, ids["DEF_C"])

    # 增至 4 块：先补一个普通分隔字段（允许），再追加横向字段即被拒
    resp = client.post(
        f"/api/forms/{form_id}/field-profile",
        json={
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "definition": {"variable_name": "NEW_F", "label": "新字段", "field_type": "文本"}
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"inline_mark": 0}},
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/forms/{form_id}/field-profile",
        json={
            "definition_operation": {
                "operation": "create_or_restore",
                "create_or_restore": {
                    "definition": {"variable_name": "NEW_G", "label": "再字段", "field_type": "文本"}
                },
            },
            "binding": {"mode": "operation_result"},
            "instance": {"mode": "upsert", "upsert": {"inline_mark": 1}},
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 400, resp.text
    assert len(_read_fields(engine, form_id)) == 6

    # 修复：3 块 → 2 块允许
    resp = _set_inline_mark(client, token, ff_c, 0)
    assert resp.status_code == 200, resp.text

    # 撤销修复：2 块 → 3 块被拒
    resp = _set_inline_mark(client, token, ff_c, 1)
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == _shared_cases()["limit_message"]
    new_f_definition_id = _find_definition_id_by_name(engine, guard_context["project_id"], "NEW_F")
    assert _read_fields(engine, form_id) == [
        (1, 1, ids["DEF_A"]),
        (2, 0, ids["DEF_B"]),
        (3, 0, ids["DEF_C"]),
        (4, 0, ids["DEF_D"]),
        (5, 1, ids["DEF_E"]),
        (6, 0, new_f_definition_id),
    ]


def _field_id_by_definition(engine, form_id, definition_id):
    with Session(engine) as session:
        return session.scalar(
            select(FormField.id).where(FormField.form_id == form_id, FormField.field_definition_id == definition_id)
        )


def _find_definition_id_by_name(engine, project_id, variable_name):
    with Session(engine) as session:
        return session.scalar(
            select(FieldDefinition.id).where(
                FieldDefinition.project_id == project_id, FieldDefinition.variable_name == variable_name
            )
        )


def test_delete_inline_field_still_allowed(guard_context, client, engine):
    """删除不可能增加块数：不新增限制（R3/R7）。"""
    form_id, token = guard_context["form_id"], guard_context["token"]
    ids = guard_context["definition_ids"]
    field = _add_field(client, form_id, token, definition_id=ids["DEF_A"], inline_mark=1, order_index=1).json()
    resp = client.delete(f"/api/form-fields/{field['id']}", headers=auth_headers(token))
    assert resp.status_code == 204, resp.text
    assert _read_fields(engine, form_id) == []


def test_foreign_user_cannot_edit_guarded_form(guard_context, client):
    """横向守卫不改变权限边界：他人表单仍 403（R8）。"""
    other_token = login_as(client, "bob")
    resp = _add_field(client, guard_context["form_id"], other_token, inline_mark=1)
    assert resp.status_code == 403, resp.text
