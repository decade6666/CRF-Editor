"""Agent 共享定义变更：savepoint 预览、不可变提案、全引用归一/校验与审批后应用。

预览在显式 savepoint 中执行提案（含派生清理与实例归一）→ 记录完整前后
差异 → 回滚 savepoint → 断言回到基线指纹 → 仅持久化不可变提案。应用在
写事务内重新校验授权/审批/有效期/指纹后经同一执行阶梯原子执行，并按
after_fingerprint 重放精确的应用结果。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.agent_dependencies import AgentToolError
from src.models.agent_access import AgentAuditEvent, AgentCredential, AgentOperation
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.schemas.agent_tools import (
    AGENT_CONTRACT_VERSION,
    ApplySharedDefinitionChangeInput,
    CHOICE_FIELD_TYPES,
    CODE_APPROVAL_REJECTED,
    CODE_APPROVAL_REQUIRED,
    CODE_INCOMPATIBLE_DATA,
    CODE_PROPOSAL_EXPIRED,
    CODE_STALE_STATE,
    DATE_FORMAT_FIELD_TYPES,
    PreviewSharedDefinitionChangeInput,
    SharedDefinitionPatch,
)
from src.services.agent_access_service import PROPOSAL_EXPIRY_MINUTES
from src.services.agent_edit_service import _agent_user, _check_fingerprint, _validate_date_format
from src.services.agent_operation_service import bind_or_reject, canonical_input_payload, canonical_json, load_result
from src.services.agent_state_service import (
    compute_project_fingerprint,
    definition_affected_forms,
    ensure_no_foreign_links,
    ensure_visit_form_links_in_project,
    resolve_project_codelist,
    resolve_project_definition,
    resolve_project_unit,
)
from src.services.field_profile_service import apply_shared_definition_changes
from src.services.field_type_policy import allows_multiselect, is_multiselect_field_type

PATCH_KEYS = (
    "label",
    "field_type",
    "checkbox_label",
    "integer_digits",
    "decimal_digits",
    "date_format",
    "codelist_id",
    "unit_id",
)

# 显式 null 允许清值的键（其余键的 null 已在 DTO 拒绝）
CLEARABLE_KEYS = frozenset({"checkbox_label", "date_format", "codelist_id", "unit_id"})


def _validate_patch(session: Session, project: Project, fd: FieldDefinition, patch: SharedDefinitionPatch) -> dict:
    """共享补丁校验：省略=不变，显式 null=清值（仅可空键），新写值走服务端策略。"""
    changes: dict = {}
    for key in PATCH_KEYS:
        if key not in patch.model_fields_set:
            continue
        value = getattr(patch, key)
        if value is None:
            if key not in CLEARABLE_KEYS:
                raise AgentToolError(422, f"{key} 不接受 null", CODE_INCOMPATIBLE_DATA)
            changes[key] = None
            continue
        if key == "field_type":
            from src.schemas.agent_tools import REGULAR_FIELD_TYPES

            if value not in REGULAR_FIELD_TYPES:
                raise HTTPException(422, "不支持的字段类型")
            if is_multiselect_field_type(value) and not allows_multiselect(project.db_type):
                raise HTTPException(400, "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型")
        if key == "integer_digits" and not (1 <= value <= 20):
            raise HTTPException(422, "integer_digits 必须在 1..20")
        if key == "decimal_digits" and not (0 <= value <= 15):
            raise HTTPException(422, "decimal_digits 必须在 0..15")
        if key in ("label", "checkbox_label") and not str(value).strip():
            raise HTTPException(422, f"{key} 不能为空白")
        if key == "date_format":
            # 显式日期格式：canonical 大小写归一存储（契约外 422，不回显原始大小写）
            effective_type = changes.get("field_type", fd.field_type)
            if effective_type in DATE_FORMAT_FIELD_TYPES:
                value = _validate_date_format(effective_type, value)
        changes[key] = value

    final_type = changes.get("field_type", fd.field_type)
    if "field_type" in changes and changes["field_type"] in DATE_FORMAT_FIELD_TYPES and "date_format" in changes:
        _validate_date_format(changes["field_type"], changes["date_format"])
    if "date_format" in changes and changes["date_format"] is None and final_type in DATE_FORMAT_FIELD_TYPES:
        raise HTTPException(422, "日期类字段的 date_format 不能为空")

    # 选择类字段的新创作（类型转换/显式链接编辑）必须有项目内字典；复选不接受显式字典。
    # 未触及的遗留值保持豁免（不因无关编辑拒绝历史数据）；切到 复选 时未显式提供
    # 字典的场景由派生清理（derive_shared_definition_changes）自动清链接并披露。
    final_codelist = changes.get("codelist_id", fd.codelist_id)
    if final_type == "复选" and changes.get("codelist_id") is not None:
        raise HTTPException(422, "复选字段不支持编码字典")
    if (
        final_type in CHOICE_FIELD_TYPES
        and ("field_type" in changes or "codelist_id" in changes)
        and final_codelist is None
    ):
        raise HTTPException(422, "选择类字段（单选/多选/纵向）必须指定项目内编码字典")

    if "codelist_id" in changes:
        if changes["codelist_id"] is not None:
            resolve_project_codelist(session, project.id, changes["codelist_id"])
    if "unit_id" in changes:
        if changes["unit_id"] is not None:
            resolve_project_unit(session, project.id, changes["unit_id"])
    return changes


def _definition_before_snapshot(fd: FieldDefinition) -> dict:
    return {
        "variable_name": fd.variable_name,
        "label": fd.label,
        "field_type": fd.field_type,
        "checkbox_label": fd.checkbox_label,
        "integer_digits": fd.integer_digits,
        "decimal_digits": fd.decimal_digits,
        "date_format": fd.date_format,
        "codelist_id": fd.codelist_id,
        "unit_id": fd.unit_id,
        "is_multi_record": fd.is_multi_record,
        "table_type": fd.table_type,
    }


def _capture_inline_baseline(session: Session, forms: list[Form]) -> dict[int, int]:
    """每个受影响表单的整表横向块基线（编辑前）。"""
    from src.services.inline_table_guard import capture_inline_block_count

    return {form.id: capture_inline_block_count(session, form.id) for form in forms}


def preview_shared_definition_change(
    session: Session,
    credential: AgentCredential,
    project: Project,
    data: PreviewSharedDefinitionChangeInput,
) -> dict:
    """校验提案 → savepoint 试算（完整前后差异）→ 回滚 → 持久化不可变提案。"""
    # 幂等身份：逐层保留显式字段存在性（省略 ≠ 显式 null）
    payload = canonical_input_payload(data)

    existing = bind_or_reject(
        session, credential, project.id, "crf_preview_shared_definition_change", data.request_id, payload
    )
    if existing is not None:
        result = load_result(existing)
        result["replay"] = True
        return result

    base_fingerprint = _check_fingerprint(session, project.id, data.expected_project_fingerprint)

    fd = resolve_project_definition(session, project.id, data.definition_id)
    ensure_no_foreign_links(session, project.id, fd)
    if fd.field_type in ("标签", "日志行"):
        raise AgentToolError(422, "结构性字段定义不支持共享变更提案", CODE_INCOMPATIBLE_DATA)

    changes = _validate_patch(session, project, fd, data.patch)
    if not changes:
        raise HTTPException(422, "提案不包含任何变更")

    # 隐藏跨项目引用（定义被外部表单引用 / 受影响表单被外部访视链接）→ fail closed
    affected_forms = definition_affected_forms(session, project.id, fd.id)
    if len(affected_forms) > 500:
        raise AgentToolError(413, "受影响表单超出上限", CODE_INCOMPATIBLE_DATA)
    ensure_visit_form_links_in_project(session, project.id, form_ids=[form.id for form in affected_forms])

    before_snapshot = _definition_before_snapshot(fd)
    inline_baseline = _capture_inline_baseline(session, affected_forms)

    # 显式 savepoint：试算（显式 + 派生 + 实例归一 + 整表横向校验），随后整体回滚
    savepoint = session.begin_nested()
    try:
        simulation = apply_shared_definition_changes(session, fd, changes, affected_forms, inline_baseline)
    finally:
        savepoint.rollback()
    session.expire_all()

    # 回滚后必须回到基线指纹（CRF 元数据未被预览改变）
    if compute_project_fingerprint(session, project.id) != base_fingerprint:
        raise HTTPException(500, "预览回滚失败，未持久化任何变更")

    after_snapshot = dict(before_snapshot)
    after_snapshot.update({**changes, **simulation["derived"]})
    semantic_diff = [
        {
            "key": key,
            "before": before_snapshot.get(key),
            "after": after_snapshot.get(key),
            "derived": key in simulation["derived"],
        }
        for key in sorted({**changes, **simulation["derived"]})
    ]
    impact = _build_impact(session, project.id, fd, changes, simulation, affected_forms, before_snapshot)
    normalized_command = {"definition_id": fd.id, "patch": changes}
    proposal_digest = hashlib.sha256(
        (
            canonical_json(normalized_command)
            + "|"
            + base_fingerprint
            + "|"
            + canonical_json(semantic_diff)
            + "|"
            + canonical_json(impact)
            + "|"
            + AGENT_CONTRACT_VERSION
        ).encode("utf-8")
    ).hexdigest()
    expires_at = datetime.now() + timedelta(minutes=PROPOSAL_EXPIRY_MINUTES)

    operation = AgentOperation(
        credential_id=credential.id,
        project_id=project.id,
        request_id=data.request_id,
        tool_name="crf_preview_shared_definition_change",
        input_digest=hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest(),
        status="done",
        change_kind="shared_definition",
        definition_id=fd.id,
        normalized_command_json=canonical_json(normalized_command),
        impact_json=canonical_json(impact),
        base_fingerprint=base_fingerprint,
        proposal_digest=proposal_digest,
        contract_version=AGENT_CONTRACT_VERSION,
        expires_at=expires_at,
        approval_state="pending",
        result_json=canonical_json(
            {
                "change_id": None,  # flush 后回填
                "approval_state": "pending",
                "expires_at": expires_at.isoformat(),
                "proposal_digest": proposal_digest,
                "impact": impact,
                "semantic_diff": semantic_diff,
                "project_fingerprint": base_fingerprint,
            }
        ),
    )
    session.add(operation)
    session.flush()
    outcome = json.loads(operation.result_json)
    outcome["change_id"] = operation.id
    operation.result_json = canonical_json(outcome)
    session.flush()
    session.add(
        AgentAuditEvent(
            credential_id=credential.id,
            project_id=project.id,
            operation_id=operation.id,
            tool_name="crf_preview_shared_definition_change",
            result_code="proposed",
            summary_json=canonical_json({"change_id": operation.id, "definition_id": fd.id}),
        )
    )
    return outcome


def apply_shared_definition_change(
    session: Session,
    credential: AgentCredential,
    project: Project,
    data: ApplySharedDefinitionChangeInput,
) -> dict:
    """应用已审批提案：写事务内重查授权/审批/有效期/版本/指纹，原子执行一次。"""
    operation = session.get(AgentOperation, data.change_id)
    if (
        operation is None
        or operation.project_id != project.id
        or operation.change_kind != "shared_definition"
        or operation.credential_id != credential.id
    ):
        raise HTTPException(404, "共享变更提案不存在")

    if operation.status == "done" and operation.approval_state == "approved" and operation.after_fingerprint:
        # 幂等重放：精确返回首次应用结果（仅 replay 标记不同）
        return {
            "change_id": operation.id,
            "applied": True,
            "replay": True,
            "project_fingerprint": operation.after_fingerprint,
        }

    if operation.approval_state != "approved":
        state = operation.approval_state or "pending"
        if state == "pending":
            raise AgentToolError(409, "提案等待属主审批，尚不可应用", CODE_APPROVAL_REQUIRED)
        if state == "rejected":
            raise AgentToolError(409, "提案已被属主驳回", CODE_APPROVAL_REJECTED)
        raise AgentToolError(409, "提案状态不允许应用", CODE_STALE_STATE)
    if operation.expires_at is None or operation.expires_at <= datetime.now():
        raise AgentToolError(410, "提案已过期，请重新预览", CODE_PROPOSAL_EXPIRED)
    if operation.contract_version != AGENT_CONTRACT_VERSION:
        raise AgentToolError(409, "提案契约版本不匹配，请重新预览", CODE_STALE_STATE)

    # 指纹覆盖引用集与被引用字典/单位内容（含选项顺序等全部设计列）
    current = compute_project_fingerprint(session, project.id)
    if current != operation.base_fingerprint:
        raise AgentToolError(409, "项目内容已变化（含引用集），提案失效；请重新预览", CODE_STALE_STATE)

    command = json.loads(operation.normalized_command_json)
    fd = session.get(FieldDefinition, operation.definition_id)
    if fd is None or fd.project_id != project.id:
        raise HTTPException(404, "共享变更提案不存在")
    ensure_no_foreign_links(session, project.id, fd)

    affected_forms = definition_affected_forms(session, project.id, fd.id)
    if len(affected_forms) > 500:
        raise AgentToolError(413, "受影响表单超出上限", CODE_INCOMPATIBLE_DATA)
    ensure_visit_form_links_in_project(session, project.id, form_ids=[form.id for form in affected_forms])
    inline_baseline = _capture_inline_baseline(session, affected_forms)

    simulation = apply_shared_definition_changes(session, fd, command["patch"], affected_forms, inline_baseline)

    after_fingerprint = compute_project_fingerprint(session, project.id)
    operation.status = "done"
    operation.after_fingerprint = after_fingerprint
    session.flush()

    session.add(
        AgentAuditEvent(
            credential_id=credential.id,
            project_id=project.id,
            operation_id=operation.id,
            tool_name="crf_apply_shared_definition_change",
            result_code="applied",
            summary_json=canonical_json({"change_id": operation.id, "definition_id": fd.id}),
        )
    )
    return {
        "change_id": operation.id,
        "applied": True,
        "replay": False,
        "project_fingerprint": after_fingerprint,
    }


def _build_impact(
    session: Session,
    project_id: int,
    fd: FieldDefinition,
    changes: dict,
    simulation: dict,
    affected_forms: list[Form],
    before_snapshot: dict,
) -> list[dict]:
    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    derived = simulation.get("derived") or {}
    after_snapshot = dict(before_snapshot)
    after_snapshot.update({**changes, **derived})
    definition_changes = [
        {
            "key": key,
            "before": before_snapshot.get(key),
            "after": after_snapshot.get(key),
            "derived": key in derived,
        }
        for key in sorted({**changes, **derived})
    ]
    # instance_changes 仅有 instance_id，需要映射回表单
    instance_form_map = dict(
        session.execute(
            select(FormField.id, FormField.form_id).where(
                FormField.field_definition_id == fd.id,
                FormField.form_id.in_([f.id for f in affected_forms]),
            )
        ).all()
    )
    grouped: dict[int, list[dict]] = {}
    for entry in simulation.get("instance_changes") or []:
        form_id = instance_form_map.get(entry["instance_id"])
        if form_id is not None:
            grouped.setdefault(form_id, []).append(entry)

    impact = []
    for form in affected_forms:
        visit_names = list(
            session.scalars(
                select(Visit.name)
                .join(VisitForm, VisitForm.visit_id == Visit.id)
                .where(VisitForm.form_id == form.id)
                .order_by(Visit.sequence, Visit.id)
            ).all()
        )
        instance_ids = list(
            session.scalars(
                select(FormField.id)
                .where(FormField.form_id == form.id, FormField.field_definition_id == fd.id)
                .order_by(FormField.id)
            ).all()
        )
        overrides = list(
            session.execute(
                select(FormField.id, FormField.label_override).where(
                    FormField.form_id == form.id,
                    FormField.field_definition_id == fd.id,
                    FormField.label_override.isnot(None),
                )
            ).all()
        )
        impact.append(
            {
                "form_id": form.id,
                "form_oid": form.code,
                "form_name": form.name,
                "visit_names": visit_names,
                "instance_ids": instance_ids,
                "attribute_changes": definition_changes,
                "instance_changes": grouped.get(form.id, []),
                "label_overrides_preserved": [
                    {"instance_id": iid, "label_override": value} for iid, value in overrides
                ],
            }
        )
    return impact
