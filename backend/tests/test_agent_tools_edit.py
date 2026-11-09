"""Agent 本地写工具测试：插入/补丁/重排的 RED→GREEN 与幂等、回滚、指纹。"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from agent_access_helpers import agent_tool, issue_credential, seed_full_project, reset_agent_limiter
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField

pytestmark = pytest.mark.integration


def _rw(client, ctx):
    return issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]


def _fp(client, raw, ctx):
    resp = agent_tool(client, raw, "crf_list_projects", {})
    assert resp.status_code == 200
    return resp.json()["project_fingerprint"]


def _add(client, raw, ctx, payload_overrides=None):
    payload = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "position": None,
        "expected_project_fingerprint": _fp(client, raw, ctx),
        "request_id": "add-1",
    }
    payload.update(payload_overrides or {})
    return agent_tool(client, raw, "crf_add_form_field", payload)


def test_add_form_field_with_existing_definition(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    # 先把种子实例移除，避免同定义重复
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        session.delete(ff)
        session.commit()

    fp_before = _fp(client, raw, ctx)
    resp = _add(client, raw, ctx)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["definition_id"] == ctx["field_definition_id"]
    assert data["definition_created"] is False
    new_fp = resp.json()["project_fingerprint"]
    assert new_fp != fp_before  # 指纹已变（后续读取以新指纹为准）
    assert new_fp == _fp(client, raw, ctx)


def test_add_form_field_at_requested_position(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        # 一个日志行置前
        log = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=1)
        session.add(log)
        # 种子实例移到后面
        ff = session.get(FormField, ctx["form_field_id"])
        ff.order_index = 2
        session.commit()

    # position=1 插到日志行前（先删种子实例腾出定义唯一约束；删除本身改变指纹，取新指纹）
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    fp = _fp(client, raw, ctx)
    resp = _add(client, raw, ctx, {"position": 1, "expected_project_fingerprint": fp})
    assert resp.status_code == 200, resp.text
    form_field_id = resp.json()["data"]["form_field_id"]

    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == ctx["form_id"])
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert rows[0].id == form_field_id  # position=1 在最前
        assert rows[1].is_log_row == 1


def test_add_form_field_new_definition_uppercases_oid(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {
                "new_definition": {
                    "variable_name": "new_lower_oid",
                    "label": "新字段",
                    "field_type": "文本",
                }
            },
            "instance": {"required": 1},
            "position": None,
            "expected_project_fingerprint": fp,
            "request_id": "add-new-1",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["definition_created"] is True
    with Session(engine) as session:
        fd = session.get(FieldDefinition, data["definition_id"])
        assert fd.variable_name == "NEW_LOWER_OID"  # 新写 OID ASCII 大写


def test_add_form_field_saimeisi_oid_length_cap(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice", db_type="赛美斯")
    raw = _rw(client, ctx)
    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {"new_definition": {"variable_name": "TOO_LONG_OID", "label": "超长", "field_type": "文本"}},
            "instance": {},
            "position": None,
            "expected_project_fingerprint": fp,
            "request_id": "add-long-1",
        },
    )
    assert resp.status_code == 422


def test_add_form_field_duplicate_definition_in_form(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = _add(client, raw, ctx)
    assert resp.status_code == 409  # 种子实例已绑定该定义（无显式指纹失配 → 默认 CONFLICT）
    assert resp.json()["code"] == "CONFLICT"


def test_add_form_field_stale_fingerprint_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = _add(client, raw, ctx, {"expected_project_fingerprint": "0" * 64})
    assert resp.status_code == 409


def test_add_form_field_replay_same_request_id(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()

    fp = _fp(client, raw, ctx)
    payload = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "position": None,
        "expected_project_fingerprint": fp,
        "request_id": "replay-1",
    }
    first = agent_tool(client, raw, "crf_add_form_field", payload)
    assert first.status_code == 200
    ff_id = first.json()["data"]["form_field_id"]

    # 指纹已变，但同 ID 重放返回原结果（不执行第二次写入）
    second = agent_tool(client, raw, "crf_add_form_field", payload)
    assert second.status_code == 200, second.text
    assert second.json()["data"]["form_field_id"] == ff_id
    assert second.json()["data"].get("replay") is True

    with Session(engine) as session:
        count = len(list(session.scalars(select(FormField).where(FormField.form_id == ctx["form_id"])).all()))
        assert count == 1


def test_request_id_conflict_different_input(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    fp = _fp(client, raw, ctx)
    base = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "position": None,
        "expected_project_fingerprint": fp,
        "request_id": "conflict-1",
    }
    assert agent_tool(client, raw, "crf_add_form_field", base).status_code == 200
    # 同 ID 不同输入 → 409
    different = dict(base, instance={"required": 1})
    resp = agent_tool(client, raw, "crf_add_form_field", different)
    assert resp.status_code == 409


def test_update_instance_patch_only(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"required": 1, "label_override": "实例标签"},
            "expected_project_fingerprint": fp,
            "request_id": "upd-1",
        },
    )
    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert ff.required == 1
        assert ff.label_override == "实例标签"
        assert fd.label == "基础字段"  # 共享定义未被隐式修改


def test_update_instance_omission_preserves_and_null_clears(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp0 = _fp(client, raw, ctx)
    # 设置帮助文本
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"help_text": "帮助"},
            "expected_project_fingerprint": fp0,
            "request_id": "upd-a",
        },
    )
    assert resp.status_code == 200
    fp1 = resp.json()["project_fingerprint"]

    # 省略键保持值
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"required": 0},
            "expected_project_fingerprint": fp1,
            "request_id": "upd-b",
        },
    )
    assert resp.status_code == 200
    fp2 = resp.json()["project_fingerprint"]
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        assert ff.help_text == "帮助"

    # 显式 null 清值
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"help_text": None},
            "expected_project_fingerprint": fp2,
            "request_id": "upd-c",
        },
    )
    assert resp.status_code == 200
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        assert ff.help_text is None


def test_update_instance_rejects_log_row(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        log = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        session.add(log)
        session.commit()
        log_id = log.id

    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": log_id,
            "patch": {"required": 1},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "upd-log",
        },
    )
    assert resp.status_code == 422


def test_update_instance_rejects_unknown_patch_key(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"field_definition_id": 999},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "upd-bad",
        },
    )
    assert resp.status_code == 422  # 不允许换绑/结构键


def test_reorder_complete_permutation_with_log_rows(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        log_a = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        session.add(log_a)
        session.commit()
        log_id = log_a.id

    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "ordered_form_field_ids": [ctx["form_field_id"], log_id],
            "expected_project_fingerprint": fp,
            "request_id": "reorder-1",
        },
    )
    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField).where(FormField.form_id == ctx["form_id"]).order_by(FormField.order_index)
            ).all()
        )
        assert [r.id for r in rows] == [ctx["form_field_id"], log_id]


def test_reorder_incomplete_permutation_rollback(client: TestClient, engine):
    from src.models.agent_access import AgentOperation

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        log_a = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        session.add(log_a)
        session.commit()
        log_id = log_a.id

    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "ordered_form_field_ids": [ctx["form_field_id"]],  # 缺日志行 → 不完整
            "expected_project_fingerprint": fp,
            "request_id": "reorder-bad",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "VALIDATION"
    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField).where(FormField.form_id == ctx["form_id"]).order_by(FormField.order_index)
            ).all()
        )
        assert [r.id for r in rows] == [log_id, ctx["form_field_id"]]  # 原顺序回滚
        ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == "reorder-bad")).all())
        assert ops == []  # 失败不落结果记录


def test_reorder_merging_inline_runs_within_baseline_succeeds(client: TestClient, engine):
    """基线 2 个横向块的重排把两段 inline 相邻合并为 1 块：块数未超基线（允许收敛）→ 200。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.flush()
        # 定义 4 个文本字段：基线顺序为 INL_A | SEP | INL_B | TAIL，即 2 个横向块
        ids = []
        for name in ("INL_A", "SEP", "INL_B", "TAIL"):
            fd = FieldDefinition(
                project_id=ctx["project_id"],
                variable_name=name,
                label=name,
                field_type="文本",
                order_index=10 + len(ids),
            )
            session.add(fd)
            session.flush()
            ff = FormField(
                form_id=ctx["form_id"],
                field_definition_id=fd.id,
                order_index=len(ids) + 1,
                inline_mark=1 if name.startswith("INL") else 0,
            )
            session.add(ff)
            session.flush()
            ids.append(ff.id)
        session.commit()

    fp = _fp(client, raw, ctx)
    # 重排让 INL_A、INL_B 相邻合并，终态只有 1 块：after_count ≤ max(1, before_count)
    # （基线以每次编辑时的当前状态为准，块数收敛合法）→ 守卫放行，重排成功。
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "ordered_form_field_ids": [ids[0], ids[2], ids[1], ids[3]],
            "expected_project_fingerprint": fp,
            "request_id": "reorder-inline",
        },
    )
    assert resp.status_code == 200, resp.text


def test_reorder_rejects_duplicate_instance_id(client: TestClient, engine):
    """重复实例 id 的置换 → 400 VALIDATION，零副作用（顺序不变、无结果记录）。"""
    from src.models.agent_access import AgentOperation

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        log = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        session.add(log)
        session.commit()
        log_id = log.id

    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "ordered_form_field_ids": [ctx["form_field_id"], ctx["form_field_id"]],
            "expected_project_fingerprint": fp,
            "request_id": "reorder-dup",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "VALIDATION"
    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField).where(FormField.form_id == ctx["form_id"]).order_by(FormField.order_index)
            ).all()
        )
        assert [r.id for r in rows] == [log_id, ctx["form_field_id"]]
        ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == "reorder-dup")).all())
        assert ops == []


def test_reorder_rejects_cross_form_instance_id(client: TestClient, engine):
    """置换混入其他表单的实例 id → 400 VALIDATION，零副作用。"""
    from src.models.agent_access import AgentOperation
    from src.models.form import Form

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        log = FormField(form_id=ctx["form_id"], is_log_row=1, order_index=0)
        other_form = Form(project_id=ctx["project_id"], name="表单B", code="F_B", order_index=2)
        session.add(log)
        session.add(other_form)
        session.flush()
        other_ff = FormField(form_id=other_form.id, field_definition_id=ctx["field_definition_id"], order_index=1)
        session.add(other_ff)
        session.commit()
        log_id, other_ff_id = log.id, other_ff.id

    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "ordered_form_field_ids": [ctx["form_field_id"], other_ff_id],
            "expected_project_fingerprint": fp,
            "request_id": "reorder-cross",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "VALIDATION"
    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField).where(FormField.form_id == ctx["form_id"]).order_by(FormField.order_index)
            ).all()
        )
        assert [r.id for r in rows] == [log_id, ctx["form_field_id"]]
        ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == "reorder-cross")).all())
        assert ops == []


def test_reorder_splitting_inline_blocks_rejected(client: TestClient, engine):
    """基线 1 块的重排拆出 2 个横向块：终态扩张 → 400 VALIDATION（横向块守卫），零副作用。"""
    from src.models.agent_access import AgentOperation
    from src.services.inline_table_guard import INLINE_TABLE_LIMIT_MSG

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.flush()
        # 基线顺序 INL_A, INL_B, SEP, TAIL：两段 inline 相邻 → 1 个横向块
        ids = []
        for name in ("INL_A", "INL_B", "SEP", "TAIL"):
            fd = FieldDefinition(
                project_id=ctx["project_id"],
                variable_name=name,
                label=name,
                field_type="文本",
                order_index=10 + len(ids),
            )
            session.add(fd)
            session.flush()
            ff = FormField(
                form_id=ctx["form_id"],
                field_definition_id=fd.id,
                order_index=len(ids) + 1,
                inline_mark=1 if name.startswith("INL") else 0,
            )
            session.add(ff)
            session.flush()
            ids.append(ff.id)
        session.commit()

    fp = _fp(client, raw, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_reorder_form_fields",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            # 分隔行插进两段 inline 之间 → 终态 2 块 > max(1, 基线 1) → 拒绝
            "ordered_form_field_ids": [ids[0], ids[2], ids[1], ids[3]],
            "expected_project_fingerprint": fp,
            "request_id": "reorder-split",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "VALIDATION"
    assert resp.json()["detail"] == INLINE_TABLE_LIMIT_MSG
    with Session(engine) as session:
        rows = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == ctx["form_id"])
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [r.id for r in rows] == ids
        ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == "reorder-split")).all())
        assert ops == []


def test_operation_result_lookup(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    fp = _fp(client, raw, ctx)
    payload = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "position": None,
        "expected_project_fingerprint": fp,
        "request_id": "lookup-1",
    }
    resp = agent_tool(client, raw, "crf_add_form_field", payload)
    assert resp.status_code == 200

    from agent_access_helpers import agent_headers

    def _lookup(request_id, tool="crf_add_form_field", arguments=None):
        body = arguments if arguments is not None else {**payload, "request_id": request_id}
        return client.post(
            f"/api/agent/operations/{request_id}",
            json={"tool_name": tool, "arguments": body},
            headers=agent_headers(raw),
        )

    r = _lookup("lookup-1")
    assert r.status_code == 200
    assert r.json()["data"]["form_field_id"] == resp.json()["data"]["form_field_id"]

    # 未提交结果 → 404 UNKNOWN_OUTCOME（schema 合法参数 + 对应 request_id）
    r = _lookup("never-submitted")
    assert r.status_code == 404
    assert r.json()["code"] == "UNKNOWN_OUTCOME"


def test_operation_lookup_binds_tool_and_input_identity(client: TestClient, engine):
    """结果查询与派发同一身份规则：同 request_id 不同输入/不同工具 → 409 IDENTITY_REUSED。"""
    from agent_access_helpers import agent_headers

    from src.models.agent_access import AgentOperation

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    fp = _fp(client, raw, ctx)
    payload = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "position": None,
        "expected_project_fingerprint": fp,
        "request_id": "lookup-identity-1",
    }
    committed = agent_tool(client, raw, "crf_add_form_field", payload)
    assert committed.status_code == 200, committed.text

    # 同工具、不同参数（instance 键存在性参与身份）→ 409
    different = {**payload, "instance": {"required": 1}}
    resp = client.post(
        "/api/agent/operations/lookup-identity-1",
        json={"tool_name": "crf_add_form_field", "arguments": different},
        headers=agent_headers(raw),
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "IDENTITY_REUSED"

    # 不同工具、该工具自身的合法参数 → 409
    update_args = {
        "project_id": ctx["project_id"],
        "form_field_id": committed.json()["data"]["form_field_id"],
        "patch": {"help_text": "x"},
        "expected_project_fingerprint": "0" * 64,
        "request_id": "lookup-identity-1",
    }
    resp = client.post(
        "/api/agent/operations/lookup-identity-1",
        json={"tool_name": "crf_update_form_field_instance", "arguments": update_args},
        headers=agent_headers(raw),
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "IDENTITY_REUSED"

    # 查询只读：无新操作记录、项目指纹不变
    with Session(engine) as session:
        ops = list(
            session.scalars(select(AgentOperation).where(AgentOperation.request_id == "lookup-identity-1")).all()
        )
        assert len(ops) == 1
    assert _fp(client, raw, ctx) == committed.json()["project_fingerprint"]


def test_operation_lookup_rejects_invalid_body_and_scope(client: TestClient, engine):
    """查询体封闭校验：额外键/白名单外工具/DTO 违规/路径不一致 → 422；外部项目 → 403；旧 GET → 405。"""
    from agent_access_helpers import agent_headers

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp = _fp(client, raw, ctx)
    base_args = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {},
        "expected_project_fingerprint": fp,
        "request_id": "lookup-validation-1",
    }

    def _post(arguments, tool="crf_add_form_field", request_id="lookup-validation-1", extra=None):
        body = {"tool_name": tool, "arguments": arguments}
        if extra:
            body.update(extra)
        return client.post(
            f"/api/agent/operations/{request_id}",
            json=body,
            headers=agent_headers(raw),
        )

    # 顶部额外键（封闭 schema）
    resp = _post(base_args, extra={"unexpected": True})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION"

    # 只读工具不在查询白名单
    resp = _post(base_args, tool="crf_list_projects")
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION"

    # 共享应用工具不在查询白名单（其幂等身份是 change_id）
    resp = _post({"project_id": ctx["project_id"], "change_id": 1}, tool="crf_apply_shared_definition_change")
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION"

    # arguments 不满足该工具 DTO（额外键）
    resp = _post({**base_args, "unexpected_key": 1})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION"

    # 路径 request_id ≠ arguments.request_id
    resp = _post(base_args, request_id="lookup-validation-2")
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION"

    # 另一项目的 project_id → 403 GRANT_DENIED
    other = seed_full_project(client, engine, "lookup_foreign_owner")
    resp = _post({**base_args, "project_id": other["project_id"]})
    assert resp.status_code == 403
    assert resp.json()["code"] == "GRANT_DENIED"

    # 旧 GET 方法 → 405
    resp = client.get("/api/agent/operations/x", headers=agent_headers(raw))
    assert resp.status_code == 405


def test_operation_lookup_rejects_malformed_json(client: TestClient, engine: Engine) -> None:
    """非法 JSON 由查询路由转换为 422 VALIDATION，响应禁止缓存。"""
    from agent_access_helpers import agent_headers

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)

    response = client.post(
        "/api/agent/operations/lookup-malformed-json",
        content=b'{"tool_name":',
        headers={**agent_headers(raw), "Content-Type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "请求体必须是有效 JSON", "code": "VALIDATION"}
    assert response.headers["cache-control"] == "no-store"


def test_operation_lookup_logs_unexpected_failure_without_exposing_details(
    client: TestClient, engine: Engine, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """存储连接异常统一返回 500 INTERNAL，完整异常仅进入服务端日志。"""
    import logging

    from agent_access_helpers import agent_headers

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    request_id = "lookup-storage-failure"
    arguments = {
        "project_id": ctx["project_id"],
        "form_field_id": ctx["form_field_id"],
        "patch": {"label_override": "查询异常回归"},
        "expected_project_fingerprint": _fp(client, raw, ctx),
        "request_id": request_id,
    }
    failure = RuntimeError("synthetic lookup storage failure")

    def fail_connect() -> None:
        raise failure

    with caplog.at_level(logging.ERROR, logger="src.routers.agent_tools"), monkeypatch.context() as patch:
        patch.setattr(engine, "connect", fail_connect)
        response = client.post(
            f"/api/agent/operations/{request_id}",
            json={"tool_name": "crf_update_form_field_instance", "arguments": arguments},
            headers=agent_headers(raw),
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "内部服务器错误", "code": "INTERNAL"}
    assert response.headers["cache-control"] == "no-store"
    records = [record for record in caplog.records if record.name == "src.routers.agent_tools"]
    assert len(records) == 1
    assert records[0].getMessage() == f"agent 结果查询失败 {request_id}"
    assert records[0].exc_info is not None and records[0].exc_info[1] is failure


# ── 修复轮回归（选择类新创作必须有字典 / request_id 路径歧义拒绝） ──


def test_new_choice_definition_requires_dictionary(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    response = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {"new_definition": {"variable_name": "CHOICE", "label": "Choice", "field_type": "单选"}},
            "instance": {},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "new-choice-no-dictionary",
        },
    )
    assert response.status_code == 422
    assert "字典" in response.json()["detail"]


def test_new_choice_with_dictionary_is_accepted(client: TestClient, engine):
    from src.models.codelist import CodeList
    from sqlalchemy.orm import Session

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="新字典", code="CL_NEW")
        session.add(codelist)
        session.commit()
        codelist_id = codelist.id

    response = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {
                "new_definition": {
                    "variable_name": "CHOICE",
                    "label": "Choice",
                    "field_type": "单选",
                    "codelist_id": codelist_id,
                }
            },
            "instance": {},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "new-choice-with-dictionary",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["definition_created"] is True


def test_reserved_authoring_flags_are_not_exposed(client: TestClient, engine):
    """is_multi_record / table_type 不在创作输入面：额外键一律 422。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    response = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {
                "new_definition": {
                    "variable_name": "FLAGGED",
                    "label": "F",
                    "field_type": "文本",
                    "table_type": "固定行",
                }
            },
            "instance": {},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "reserved-flag",
        },
    )
    assert response.status_code == 422


def test_request_id_dot_segments_rejected(client: TestClient, engine):
    """ "." 与 ".." 在结果查询 URL 规范化中丢失 → 输入校验拒绝。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    for bad in (".", ".."):
        response = agent_tool(
            client,
            raw,
            "crf_update_form_field_instance",
            {
                "project_id": ctx["project_id"],
                "form_field_id": ctx["form_field_id"],
                "patch": {"help_text": "x"},
                "expected_project_fingerprint": _fp(client, raw, ctx),
                "request_id": bad,
            },
        )
        assert response.status_code == 422


def test_instance_patch_rejects_null_booleans(client: TestClient, engine):
    """required/label_bold/inline_mark 非 nullable：显式 null → 422。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    response = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"required": None},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "null-required",
        },
    )
    assert response.status_code == 422


def test_instance_patch_null_clears_default_value(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FormField, ctx["form_field_id"]).default_value = "to-clear"
        session.commit()
    response = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"default_value": None},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "clear-default",
        },
    )
    assert response.status_code == 200, response.text
    with Session(engine) as session:
        assert session.get(FormField, ctx["form_field_id"]).default_value is None


def test_null_and_omitted_nested_patch_are_distinct_identities(client: TestClient, engine):
    """同一 request_id 下省略键与显式 null 是不同请求身份（重放不得吞并冲突输入）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FormField, ctx["form_field_id"]).label_override = "Must stay unless explicitly cleared"
        session.commit()

    payload = {
        "project_id": ctx["project_id"],
        "form_field_id": ctx["form_field_id"],
        "patch": {"help_text": "Updated help"},
        "expected_project_fingerprint": _fp(client, raw, ctx),
        "request_id": "local-null-identity",
    }
    first = agent_tool(client, raw, "crf_update_form_field_instance", payload)
    assert first.status_code == 200, first.text

    conflict = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {**payload, "patch": {"help_text": "Updated help", "label_override": None}},
    )
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "IDENTITY_REUSED"
    with Session(engine) as session:
        assert session.get(FormField, ctx["form_field_id"]).label_override == "Must stay unless explicitly cleared"


def test_add_instance_null_vs_omitted_keys_are_distinct_identities(client: TestClient, engine):
    """add.instance 的嵌套键存在性同样参与幂等身份（绑定与记录口径一致）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    # 先移除种子实例，避免同定义重复放置被拒
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    payload = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "source": {"definition_id": ctx["field_definition_id"]},
        "instance": {"help_text": "Added help"},
        "expected_project_fingerprint": _fp(client, raw, ctx),
        "request_id": "add-null-identity",
    }
    first = agent_tool(client, raw, "crf_add_form_field", payload)
    assert first.status_code == 200, first.text
    conflict = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {**payload, "instance": {"help_text": "Added help", "label_override": None}},
    )
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "IDENTITY_REUSED"


# ── C13 回归（IR1 已提交结果查询信封 / IR5 插入位置 / IR6 损坏前向链接 / IR4 新写归一） ──


def test_committed_result_lookup_matches_registered_output(client: TestClient, engine):
    """IR1：已提交本地写的结果查询必须与原派发同一封闭信封（data 无指纹键），
    并通过该工具注册的输出 schema 校验。"""
    from agent_access_helpers import agent_headers

    from src.schemas.agent_tools import get_tool_output_adapter

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    payload = {
        "project_id": ctx["project_id"],
        "form_field_id": ctx["form_field_id"],
        "patch": {"label_override": "查询信封回归"},
        "expected_project_fingerprint": _fp(client, raw, ctx),
        "request_id": "lookup-envelope-1",
    }
    dispatch = agent_tool(client, raw, "crf_update_form_field_instance", payload)
    assert dispatch.status_code == 200, dispatch.text

    lookup = client.post(
        "/api/agent/operations/lookup-envelope-1",
        json={"tool_name": "crf_update_form_field_instance", "arguments": payload},
        headers=agent_headers(raw),
    )
    assert lookup.status_code == 200, lookup.text
    get_tool_output_adapter("crf_update_form_field_instance").validate_python(lookup.json())
    assert lookup.json() == dispatch.json()
    # 封闭 data DTO：project_fingerprint 只在信封顶层
    assert "project_fingerprint" not in lookup.json()["data"]


@pytest.mark.parametrize("position", [0, 10000])
def test_invalid_insert_position_is_client_error(client: TestClient, engine, position):
    """IR5：position 1-based；越界位置返回 400/422 且零副作用（实例/定义/结果记录均无）。"""
    from src.models.agent_access import AgentOperation

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.delete(session.get(FormField, ctx["form_field_id"]))
        session.commit()
    before_instances = len(list(session.scalars(select(FormField).where(FormField.form_id == ctx["form_id"])).all()))
    before_definitions = len(
        list(session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == ctx["project_id"])).all())
    )

    resp = _add(client, raw, ctx, {"position": position, "request_id": f"pos-{position}"})
    assert resp.status_code in (400, 422), f"越界位置产生 HTTP {resp.status_code}: {resp.text}"

    with Session(engine) as session:
        assert len(list(session.scalars(select(FormField).where(FormField.form_id == ctx["form_id"])).all())) == (
            before_instances
        )
        assert (
            len(
                list(
                    session.scalars(
                        select(FieldDefinition).where(FieldDefinition.project_id == ctx["project_id"])
                    ).all()
                )
            )
            == before_definitions
        )
        pos_ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == f"pos-{position}")))
        assert len(pos_ops) == 0


def test_update_instance_rejects_corrupt_foreign_definition_link(client: TestClient, engine):
    """IR6：绑定的定义属其他项目（损坏前向链接）→ 实例更新 fail closed（404/422），
    不改实例、不静默换绑修复、不泄露外部细节。"""
    from agent_access_helpers import seed_full_project as _seed_full

    other = _seed_full(client, engine, "foreign_def_owner")
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        ff.field_definition_id = other["field_definition_id"]  # 构造跨项目损坏链接
        session.commit()
        foreign_id = other["field_definition_id"]

    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"label_override": "不得写入损坏链接"},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "corrupt-link-1",
        },
    )
    assert resp.status_code in (404, 422), f"损坏链接的实例编辑返回 HTTP {resp.status_code}"
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        assert ff.label_override is None  # 零变更
        assert ff.field_definition_id == foreign_id  # 不静默换绑/修复
    from src.models.agent_access import AgentOperation

    with Session(engine) as session:
        corrupt_ops = list(session.scalars(select(AgentOperation).where(AgentOperation.request_id == "corrupt-link-1")))
        assert len(corrupt_ops) == 0


def test_new_date_format_is_persisted_canonically(client: TestClient, engine):
    """IR4：新写日期定义显式 'YYYY-MM-DD' → canonical 'yyyy-MM-dd'（非原样存储）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {
                "new_definition": {
                    "variable_name": "CANON_DATE",
                    "label": "规范日期",
                    "field_type": "日期",
                    "date_format": "YYYY-MM-DD",
                }
            },
            "instance": {},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "canon-date-1",
        },
    )
    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        fd = session.get(FieldDefinition, resp.json()["data"]["definition_id"])
        assert fd.date_format == "yyyy-MM-dd", f"非规范日期格式被存储: {fd.date_format!r}"


def test_new_date_definition_defaults_to_type_format_when_omitted(client: TestClient, engine):
    """IR4：新写日期类定义省略 date_format → 该类型默认格式（normalizeDateFormat 同契约）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {"new_definition": {"variable_name": "DEF_DATE", "label": "默认格式日期", "field_type": "时间"}},
            "instance": {},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "default-date-1",
        },
    )
    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        fd = session.get(FieldDefinition, resp.json()["data"]["definition_id"])
        assert fd.date_format == "HH:mm", f"日期类缺省应取类型默认格式: {fd.date_format!r}"


def test_new_definition_authoring_normalizes_inapplicable_type_props(client: TestClient, engine):
    """IR4：新写定义的类型不适用键按浏览器 sync 契约归一清空；适用键保留。"""
    from src.models.codelist import CodeList
    from src.models.unit import Unit

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="适用性字典", code="CL_SYNC")
        unit = Unit(project_id=ctx["project_id"], symbol="sync", code="U_SYNC", order_index=1)
        session.add_all([codelist, unit])
        session.commit()
        codelist_id, unit_id = codelist.id, unit.id

    base = {
        "project_id": ctx["project_id"],
        "form_id": ctx["form_id"],
        "instance": {},
    }
    # 文本字段：字典/复选文本/位数/日期格式均不适用 → 全部清空；单位保留
    text_resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            **base,
            "source": {
                "new_definition": {
                    "variable_name": "SYNC_TEXT",
                    "label": "适用性文本",
                    "field_type": "文本",
                    "codelist_id": codelist_id,
                    "checkbox_label": "不应保留",
                    "integer_digits": 5,
                    "decimal_digits": 2,
                    "date_format": "yyyy-MM-dd",
                    "unit_id": unit_id,
                }
            },
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "sync-text-1",
        },
    )
    assert text_resp.status_code == 200, text_resp.text
    with Session(engine) as session:
        fd = session.get(FieldDefinition, text_resp.json()["data"]["definition_id"])
        assert fd.codelist_id is None
        assert fd.checkbox_label is None
        assert fd.integer_digits is None and fd.decimal_digits is None
        assert fd.date_format is None
        assert fd.unit_id == unit_id  # 文本适用单位 → 保留

    # 复选字段：不接受字典（既有 422 契约保持），复选文本保留。
    # 文本新增已提交并改变项目内容：第二次独立写入前必须读取当前指纹
    # （复用旧指纹会被 409 STALE_STATE 拒绝），两个请求身份保持互异。
    checkbox_resp = agent_tool(
        client,
        raw,
        "crf_add_form_field",
        {
            **base,
            "source": {
                "new_definition": {
                    "variable_name": "SYNC_CHECK",
                    "label": "适用性复选",
                    "field_type": "复选",
                    "checkbox_label": "已阅读",
                    "unit_id": unit_id,
                }
            },
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "sync-check-1",
        },
    )
    assert checkbox_resp.status_code == 200, checkbox_resp.text
    with Session(engine) as session:
        fd = session.get(FieldDefinition, checkbox_resp.json()["data"]["definition_id"])
        assert fd.checkbox_label == "已阅读"
        assert fd.unit_id is None  # 复选不适用单位
        assert fd.integer_digits is None
