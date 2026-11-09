"""Agent 共享定义变更测试：预览不改元数据、属主审批绑定、过期/篡改/引用变化拒绝、幂等应用。"""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from agent_access_helpers import agent_tool, issue_credential, seed_full_project, reset_agent_limiter
from src.models.agent_access import AgentAuditEvent, AgentOperation
from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from helpers import auth_headers

pytestmark = pytest.mark.integration


def _rw(client, ctx):
    return issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]


def _fp(client, raw, ctx):
    resp = agent_tool(client, raw, "crf_list_projects", {})
    return resp.json()["project_fingerprint"]


def _preview(client, raw, ctx, patch, request_id="prev-1", fingerprint=None):
    return agent_tool(
        client,
        raw,
        "crf_preview_shared_definition_change",
        {
            "project_id": ctx["project_id"],
            "definition_id": ctx["field_definition_id"],
            "patch": patch,
            "expected_project_fingerprint": fingerprint or _fp(client, raw, ctx),
            "request_id": request_id,
        },
    )


def _decide(client, token, ctx, change_id, approve, digest):
    action = "approve" if approve else "reject"
    return client.post(
        f"/api/projects/{ctx['project_id']}/agent-access/changes/{change_id}/{action}",
        json={"proposal_digest": digest},
        headers=auth_headers(token),
    )


def test_preview_persists_proposal_only(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp_before = _fp(client, raw, ctx)

    resp = _preview(client, raw, ctx, {"label": "新标签"})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    change_id = data["change_id"]
    assert data["approval_state"] == "pending"
    assert data["proposal_digest"] and len(data["proposal_digest"]) == 64
    assert data["semantic_diff"] == [{"key": "label", "before": "基础字段", "after": "新标签", "derived": False}]

    # CRF 元数据未被预览改变
    assert _fp(client, raw, ctx) == fp_before
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert fd.label == "基础字段"

    # 提案记录存在
    with Session(engine) as session:
        op = session.get(AgentOperation, change_id)
        assert op is not None and op.approval_state == "pending"
        assert op.definition_id == ctx["field_definition_id"]


def test_preview_replay_same_request(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    first = _preview(client, raw, ctx, {"label": "X"}, request_id="prev-replay")
    assert first.status_code == 200
    second = _preview(client, raw, ctx, {"label": "X"}, request_id="prev-replay")
    assert second.status_code == 200
    assert second.json()["data"]["change_id"] == first.json()["data"]["change_id"]


def test_apply_before_approval_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    change_id = _preview(client, raw, ctx, {"label": "Y"}).json()["data"]["change_id"]

    resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert resp.status_code == 409


def test_owner_approve_then_apply_exactly_once(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "审批后标签"}).json()["data"]
    change_id = preview["change_id"]
    digest = preview["proposal_digest"]

    # 属主审批（绑定摘要）
    resp = _decide(client, ctx["token"], ctx, change_id, True, digest)
    assert resp.status_code == 204, resp.text

    # 应用一次
    resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["applied"] is True

    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert fd.label == "审批后标签"

    # 重复应用 → 幂等重放
    resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["replay"] is True


def test_rejected_proposal_cannot_apply(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "驳回目标"}).json()["data"]
    resp = _decide(client, ctx["token"], ctx, preview["change_id"], False, preview["proposal_digest"])
    assert resp.status_code == 204

    resp = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": preview["change_id"]},
    )
    assert resp.status_code == 409


def test_approval_with_wrong_digest_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "摘要绑定"}).json()["data"]
    resp = _decide(client, ctx["token"], ctx, preview["change_id"], True, "0" * 64)
    assert resp.status_code == 409  # 展示摘要与提案不一致


def test_expired_proposal_cannot_apply(client: TestClient, engine):
    from datetime import datetime, timedelta

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "过期目标"}).json()["data"]
    change_id = preview["change_id"]
    _decide(client, ctx["token"], ctx, change_id, True, preview["proposal_digest"])

    with Session(engine) as session:
        op = session.get(AgentOperation, change_id)
        op.expires_at = datetime.now() - timedelta(minutes=1)
        session.commit()

    resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert resp.status_code == 410


def test_state_change_after_preview_invalidates(client: TestClient, engine):
    """预览后项目内容变化（引用集/字典内容）→ 应用拒绝，需重新预览。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "陈旧提案"}).json()["data"]
    change_id = preview["change_id"]
    _decide(client, ctx["token"], ctx, change_id, True, preview["proposal_digest"])

    # 无关变更：加一个单位（改变项目指纹）
    from src.models.unit import Unit

    with Session(engine) as session:
        session.add(Unit(project_id=ctx["project_id"], symbol="mg", order_index=2))
        session.commit()

    resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert resp.status_code == 409


def test_change_cannot_apply_via_other_credential(client: TestClient, engine):
    """提案绑定创建它的凭据：另一凭据不可应用。"""
    ctx = seed_full_project(client, engine, "alice")
    raw_a = _rw(client, ctx)
    preview = _preview(client, raw_a, ctx, {"label": "凭据绑定"}).json()["data"]
    _decide(client, ctx["token"], ctx, preview["change_id"], True, preview["proposal_digest"])

    # 第二个凭据（同项目）
    raw_b = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write", name="第二个")["token"]
    resp = agent_tool(
        client,
        raw_b,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": preview["change_id"]},
    )
    assert resp.status_code == 404


def test_type_change_normalizes_affected_instances(client: TestClient, engine):
    """类型改为复选：清默认值等归一 + 受影响表单校验；审批后应用。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        ff = session.get(FormField, ctx["form_field_id"])
        ff.default_value = "旧默认"
        session.commit()

    preview = _preview(client, raw, ctx, {"field_type": "复选", "checkbox_label": "已同意"}).json()["data"]
    _decide(client, ctx["token"], ctx, preview["change_id"], True, preview["proposal_digest"])
    resp = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": preview["change_id"]},
    )
    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        ff = session.get(FormField, ctx["form_field_id"])
        assert fd.field_type == "复选"
        assert fd.codelist_id is None  # 复选清字典
        assert ff.default_value is None  # 归一：复选不支持默认值


def test_preview_rejects_invalid_date_format_without_change(client: TestClient, engine):
    """非法新写日期格式（目标类型为日期）在预览即拒绝，且定义保持原值不变。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        snapshot = (fd.field_type, fd.date_format, fd.label)

    resp = _preview(
        client,
        raw,
        ctx,
        {"field_type": "日期", "date_format": "not-a-format"},
        request_id="prev-invalid",
    )
    assert resp.status_code == 422
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert (fd.field_type, fd.date_format, fd.label) == snapshot


def test_preview_patch_empty_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    resp = _preview(client, raw, ctx, {}, request_id="prev-empty")
    assert resp.status_code == 422


def test_structural_definition_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    with Session(engine) as session:
        session.add(
            FieldDefinition(
                project_id=ctx["project_id"], variable_name="LBL_X", label="标签行", field_type="标签", order_index=2
            )
        )
        session.commit()
        lbl_id = session.scalar(select(FieldDefinition.id).where(FieldDefinition.variable_name == "LBL_X"))

    raw = _rw(client, ctx)
    resp = agent_tool(
        client,
        raw,
        "crf_preview_shared_definition_change",
        {
            "project_id": ctx["project_id"],
            "definition_id": lbl_id,
            "patch": {"label": "改标签"},
            "expected_project_fingerprint": _fp(client, raw, ctx),
            "request_id": "prev-lbl",
        },
    )
    assert resp.status_code == 422


def test_owner_change_list_and_detail(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "列表标签"}).json()["data"]

    resp = client.get(f"/api/projects/{ctx['project_id']}/agent-access/changes", headers=auth_headers(ctx["token"]))
    assert resp.status_code == 200
    listing = resp.json()
    assert listing["total"] >= 1
    assert any(item["change_id"] == preview["change_id"] for item in listing["changes"])

    resp = client.get(
        f"/api/projects/{ctx['project_id']}/agent-access/changes/{preview['change_id']}",
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["patch"] == {"label": "列表标签"}
    assert detail["proposal_digest"] == preview["proposal_digest"]
    assert detail["impact"][0]["form_id"] == ctx["form_id"]

    # 非属主不可见
    from helpers import login_as

    token_b = login_as(client, "bob")
    resp = client.get(f"/api/projects/{ctx['project_id']}/agent-access/changes", headers=auth_headers(token_b))
    assert resp.status_code == 403


# ── 修复轮回归（跨项目 fail closed / null 语义 / 派生披露 / 遗留横向基线 / 选择类字典 / 应用重放） ──


def test_apply_replay_returns_exact_applied_outcome(client: TestClient, engine):
    """第二次应用返回与首次一致的应用结果与指纹（仅 replay 标记不同）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    proposal = _preview(client, raw, ctx, {"label": "Reviewed label"}).json()["data"]
    assert (
        _decide(client, ctx["token"], ctx, proposal["change_id"], True, proposal["proposal_digest"]).status_code == 204
    )

    payload = {"project_id": ctx["project_id"], "change_id": proposal["change_id"]}
    first = agent_tool(client, raw, "crf_apply_shared_definition_change", payload)
    second = agent_tool(client, raw, "crf_apply_shared_definition_change", payload)
    assert first.status_code == second.status_code == 200
    assert second.json()["data"]["applied"] is True
    assert second.json()["data"]["replay"] is True
    assert second.json()["project_fingerprint"] == first.json()["project_fingerprint"]
    # 幂等重放只发生一次变更/审计
    with Session(engine) as session:
        audits = list(
            session.scalars(
                select(AgentAuditEvent).where(AgentAuditEvent.tool_name == "crf_apply_shared_definition_change")
            ).all()
        )
        assert len(audits) == 1


def test_explicit_null_clears_shared_unit_link(client: TestClient, engine):
    from src.models.unit import Unit

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        unit = Unit(project_id=ctx["project_id"], symbol="review-unit", order_index=1)
        session.add(unit)
        session.flush()
        session.get(FieldDefinition, ctx["field_definition_id"]).unit_id = unit.id
        session.commit()

    response = _preview(client, raw, ctx, {"unit_id": None}, request_id="clear-unit")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["semantic_diff"][0]["after"] is None


def test_null_and_omission_are_distinct_request_identities(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    first = _preview(client, raw, ctx, {"label": "Same label"}, request_id="null-identity")
    assert first.status_code == 200
    conflict = _preview(client, raw, ctx, {"label": "Same label", "unit_id": None}, request_id="null-identity")
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDENTITY_REUSED"


def test_label_only_edit_preserves_legacy_two_inline_blocks(client: TestClient, engine):
    """合法遗留 [inline, normal, inline] 表单做 label-only 共享修改 → 200（整表基线口径）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FormField, ctx["form_field_id"]).inline_mark = 1
        for order, mark in [(2, 0), (3, 1)]:
            definition = FieldDefinition(
                project_id=ctx["project_id"],
                variable_name=f"LEGACY_{order}",
                label="Legacy field",
                field_type="文本",
                order_index=order,
            )
            session.add(definition)
            session.flush()
            session.add(
                FormField(
                    form_id=ctx["form_id"], field_definition_id=definition.id, order_index=order, inline_mark=mark
                )
            )
        session.commit()

    response = _preview(client, raw, ctx, {"label": "Label-only edit"})
    assert response.status_code == 200, response.text


def test_preview_discloses_derived_instance_default_clear(client: TestClient, engine):
    """类型切到 复选：实例默认值被清空且出现在提案差异中（派生效果可审）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FormField, ctx["form_field_id"]).default_value = "review-default"
        session.commit()

    response = _preview(client, raw, ctx, {"field_type": "复选"}, request_id="derived-clear")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "default_value" in json.dumps(data, ensure_ascii=False)
    derived_keys = {entry["key"] for entry in data["semantic_diff"] if entry.get("derived")}
    # 种子定义是 文本 且无字典：切到 复选 不派生字典清理
    assert "codelist_id" not in derived_keys
    # 实例级差异也带 default_value
    flat = json.dumps(data["impact"], ensure_ascii=False)
    assert "default_value" in flat


def test_preview_rejects_hidden_foreign_form_reference(client: TestClient, engine):
    """own 定义被外部表单引用 → 预览 422（不静默排除外部表单）。"""
    from agent_access_helpers import seed_full_project as seed_foreign

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    foreign = seed_foreign(client, engine, "review_foreign_owner")
    with Session(engine) as session:
        session.get(FormField, foreign["form_field_id"]).field_definition_id = ctx["field_definition_id"]
        session.commit()

    response = _preview(client, raw, ctx, {"label": "Must not affect another project"})
    assert response.status_code == 422
    assert "跨项目" in response.json()["detail"]


def test_shared_choice_transition_requires_codelist(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    response = _preview(client, raw, ctx, {"field_type": "单选"}, request_id="choice-no-cl")
    assert response.status_code == 422


def test_preview_with_choice_and_codelist_together_is_accepted(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="新字典", code="CL_NEW")
        session.add(codelist)
        session.commit()
        codelist_id = codelist.id
    response = _preview(
        client, raw, ctx, {"field_type": "单选", "codelist_id": codelist_id}, request_id="choice-with-cl"
    )
    assert response.status_code == 200, response.text


# ── 修复轮回归（保留覆盖呈现 / 派生清字典披露 / 遗留值豁免 / 外部访视 fail closed） ──


def test_shared_preview_preserves_local_label_override(client: TestClient, engine):
    """保留的实例级 label_override 安全呈现（不 500、不改动存储值、审批与应用完整可用）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FormField, ctx["form_field_id"]).label_override = "Local visible label"
        session.commit()

    response = _preview(client, raw, ctx, {"label": "New shared label"}, request_id="override-preview")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["impact"][0]["label_overrides_preserved"] == [
        {"instance_id": ctx["form_field_id"], "label_override": "Local visible label"}
    ]

    # 预览不改存储覆盖；审批后精确应用
    with Session(engine) as session:
        assert session.get(FormField, ctx["form_field_id"]).label_override == "Local visible label"
    assert _decide(client, ctx["token"], ctx, data["change_id"], True, data["proposal_digest"]).status_code == 204
    applied = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": data["change_id"]},
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["data"]["applied"] is True
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert fd.label == "New shared label"
        assert session.get(FormField, ctx["form_field_id"]).label_override == "Local visible label"


def test_choice_to_checkbox_previews_automatic_dictionary_clear(client: TestClient, engine):
    """单选→复选类型转换：未显式提供字典时派生清链接并在差异中披露（不 422）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Choices", code="CHOICES")
        session.add(codelist)
        session.flush()
        codelist_id = codelist.id
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        fd.field_type = "单选"
        fd.codelist_id = codelist_id
        session.commit()

    response = _preview(client, raw, ctx, {"field_type": "复选"}, request_id="choice-to-checkbox")
    assert response.status_code == 200, response.text
    diff = {entry["key"]: entry for entry in response.json()["data"]["semantic_diff"]}
    assert diff["codelist_id"]["before"] == codelist_id
    assert diff["codelist_id"]["after"] is None
    assert diff["codelist_id"]["derived"] is True

    # 审批后应用：字典链接被真实清除
    assert (
        _decide(
            client,
            ctx["token"],
            ctx,
            response.json()["data"]["change_id"],
            True,
            response.json()["data"]["proposal_digest"],
        ).status_code
        == 204
    )
    applied = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": response.json()["data"]["change_id"]},
    )
    assert applied.status_code == 200, applied.text
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        assert fd.field_type == "复选"
        assert fd.codelist_id is None


def test_checkbox_transition_rejects_explicit_dictionary(client: TestClient, engine):
    """显式提供字典的复选转换仍拒绝（派生自动清理只覆盖未显式提供的键）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Explicit dict", code="EXPLICIT_CL")
        session.add(codelist)
        session.flush()
        codelist_id = codelist.id
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        fd.field_type = "单选"
        fd.codelist_id = codelist_id
        session.commit()

    response = _preview(
        client, raw, ctx, {"field_type": "复选", "codelist_id": codelist_id}, request_id="checkbox-explicit-cl"
    )
    assert response.status_code == 422
    assert "复选" in response.json()["detail"]


def test_label_only_patch_preserves_untouched_legacy_choice_without_dictionary(client: TestClient, engine):
    """遗留单选缺字典（未触及值）：label-only 编辑不被新创作字典策略拒绝。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        fd.field_type = "单选"
        fd.codelist_id = None
        session.commit()

    response = _preview(client, raw, ctx, {"label": "Legacy label-only update"}, request_id="legacy-choice")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["semantic_diff"] == [
        {"key": "label", "before": "基础字段", "after": "Legacy label-only update", "derived": False}
    ]


def test_explicit_null_codelist_on_choice_rejected(client: TestClient, engine):
    """显式 null 清字典在选择类字段上拒绝（选择类必须有字典；遗留未触及值豁免）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        codelist = CodeList(project_id=ctx["project_id"], name="Linked dict", code="LINKED_CL")
        session.add(codelist)
        session.flush()
        codelist_id = codelist.id
        fd = session.get(FieldDefinition, ctx["field_definition_id"])
        fd.field_type = "单选"
        fd.codelist_id = codelist_id
        session.commit()

    response = _preview(client, raw, ctx, {"codelist_id": None}, request_id="choice-null-cl")
    assert response.status_code == 422


def test_shared_preview_rejects_foreign_visit_link_on_affected_form(client: TestClient, engine):
    """受影响表单被外部访视链接 → 预览 fail closed 422（不序列化外部访视名）。"""
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    from agent_access_helpers import seed_full_project as seed_foreign

    ctx = seed_full_project(client, engine, "alice")
    foreign = seed_foreign(client, engine, "shared_foreign_visit_owner")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        visit = Visit(project_id=foreign["project_id"], name="Shared foreign visit", code="SHARED_F_VISIT", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=ctx["form_id"], sequence=1))
        session.commit()

    response = _preview(client, raw, ctx, {"label": "Should not preview"}, request_id="foreign-visit-preview")
    assert response.status_code == 422
    assert "Shared foreign visit" not in response.text


def test_project_metadata_change_invalidates_approval_and_apply(client: TestClient, engine):
    """项目行设计元数据（screening_number_format）变更 → 审批与应用都按当前基线拒绝。"""
    from src.models.project import Project

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    preview = _preview(client, raw, ctx, {"label": "元数据基线"}, request_id="meta-baseline").json()["data"]
    change_id = preview["change_id"]

    # 预览后项目元数据变化：属主审批按当前基线拒绝
    with Session(engine) as session:
        session.get(Project, ctx["project_id"]).screening_number_format = "CHANGED-FORMAT"
        session.commit()
    approval = _decide(client, ctx["token"], ctx, change_id, True, preview["proposal_digest"])
    assert approval.status_code == 409, approval.text

    # 重新预览并获批后，应用前元数据再变化：应用拒绝（STALE_STATE）
    second = _preview(client, raw, ctx, {"label": "元数据基线二"}, request_id="meta-baseline-2").json()["data"]
    assert _decide(client, ctx["token"], ctx, second["change_id"], True, second["proposal_digest"]).status_code == 204
    with Session(engine) as session:
        session.get(Project, ctx["project_id"]).screening_number_format = "CHANGED-AGAIN"
        session.commit()
    applied = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": second["change_id"]},
    )
    assert applied.status_code == 409
    assert applied.json()["code"] == "STALE_STATE"
    with Session(engine) as session:
        assert session.get(FieldDefinition, ctx["field_definition_id"]).label == "基础字段"


# ── C13 回归（IR4 类型适用性同步 / IR1 预览结果查询信封） ──


def test_shared_explicit_date_format_is_stored_canonically(client, engine):
    """IR4：共享补丁显式 date_format 'YYYY-MM-DD' 按 canonical 'yyyy-MM-dd' 存储，
    预览披露的就是应用写入的值；显式键带 derived=false。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        session.get(FieldDefinition, ctx["field_definition_id"]).field_type = "日期"
        session.commit()

    preview_resp = _preview(client, raw, ctx, {"date_format": "YYYY-MM-DD"}, request_id="prev-canon-date")
    assert preview_resp.status_code == 200, preview_resp.text
    data = preview_resp.json()["data"]
    assert {"key": "date_format", "before": None, "after": "yyyy-MM-dd", "derived": False} in data["semantic_diff"]

    assert _decide(client, ctx["token"], ctx, data["change_id"], True, data["proposal_digest"]).status_code == 204
    applied = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": data["change_id"]},
    )
    assert applied.status_code == 200, applied.text
    with Session(engine) as session:
        assert session.get(FieldDefinition, ctx["field_definition_id"]).date_format == "yyyy-MM-dd"


@pytest.mark.parametrize(
    "case,seed_attrs,target,attribute,expected",
    [
        ("choice-to-text", {"field_type": "单选", "codelist": True}, "文本", "codelist_id", None),
        ("unit-to-date", {"unit": True}, "日期", "unit_id", None),
        ("date-to-time", {"field_type": "日期", "date_format": "yyyy-MM-dd"}, "时间", "date_format", "HH:mm"),
        ("text-to-date", {}, "日期", "date_format", "yyyy-MM-dd"),
    ],
)
def test_shared_type_change_matches_browser_normalization(
    client, engine, case, seed_attrs, target, attribute, expected
):
    """IR4：类型切换的派生适用性/日期归一与浏览器 syncFieldTypeSpecificProps 同语义：
    非选择类清字典、非文本/数值清单位、日期类缺省取目标类型默认格式；
    预览如实披露派生键，应用精确执行披露的变更。request_id 用稳定 ASCII case 标识
    （REQUEST_ID_PATTERN 只允许安全 ASCII；中文类型展示文本不得进入请求身份）。"""
    from src.models.unit import Unit

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    with Session(engine) as session:
        definition = session.get(FieldDefinition, ctx["field_definition_id"])
        for key, value in seed_attrs.items():
            if key == "codelist":
                linked = CodeList(project_id=ctx["project_id"], name="类型切换字典", code="CL_TSWITCH", order_index=1)
                session.add(linked)
                session.flush()
                definition.codelist_id = linked.id
            elif key == "unit":
                linked = Unit(project_id=ctx["project_id"], symbol="tswitch", code="U_TSWITCH", order_index=1)
                session.add(linked)
                session.flush()
                definition.unit_id = linked.id
            else:
                setattr(definition, key, value)
        session.commit()

    preview_resp = _preview(client, raw, ctx, {"field_type": target}, request_id=f"tswitch-{case}")
    assert preview_resp.status_code == 200, preview_resp.text
    data = preview_resp.json()["data"]
    derived_entry = next((entry for entry in data["semantic_diff"] if entry["key"] == attribute), None)
    assert derived_entry is not None, f"预览未披露 {attribute} 的派生变更: {data['semantic_diff']}"
    assert derived_entry["derived"] is True
    assert derived_entry["after"] == expected

    assert _decide(client, ctx["token"], ctx, data["change_id"], True, data["proposal_digest"]).status_code == 204
    applied = agent_tool(
        client,
        raw,
        "crf_apply_shared_definition_change",
        {"project_id": ctx["project_id"], "change_id": data["change_id"]},
    )
    assert applied.status_code == 200, applied.text
    with Session(engine) as session:
        actual = getattr(session.get(FieldDefinition, ctx["field_definition_id"]), attribute)
    assert actual == expected, f"类型切换后 {attribute}: {actual!r}，期望 {expected!r}"


def test_preview_result_lookup_matches_dispatch_envelope(client, engine):
    """IR1：预览提案的结果查询必须与原派发同一封闭信封，并通过注册输出 schema 校验。"""
    from agent_access_helpers import agent_headers

    from src.schemas.agent_tools import get_tool_output_adapter

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw(client, ctx)
    fp = _fp(client, raw, ctx)
    payload = {
        "project_id": ctx["project_id"],
        "definition_id": ctx["field_definition_id"],
        "patch": {"label": "查询信封预览"},
        "expected_project_fingerprint": fp,
        "request_id": "prev-lookup-1",
    }
    dispatch = agent_tool(client, raw, "crf_preview_shared_definition_change", payload)
    assert dispatch.status_code == 200, dispatch.text

    lookup = client.post(
        "/api/agent/operations/prev-lookup-1",
        json={"tool_name": "crf_preview_shared_definition_change", "arguments": payload},
        headers=agent_headers(raw),
    )
    assert lookup.status_code == 200, lookup.text
    get_tool_output_adapter("crf_preview_shared_definition_change").validate_python(lookup.json())
    assert lookup.json() == dispatch.json()
    assert "project_fingerprint" not in lookup.json()["data"]
