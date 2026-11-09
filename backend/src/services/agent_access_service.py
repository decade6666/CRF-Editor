"""Agent 访问凭据管理：发放、吊销、列表与属主审批管理（服务层）。"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.agent_dependencies import (
    AGENT_IP_RULE,
    AGENT_READ_RULE,
    AGENT_WRITE_RULE,
    AgentToolError,
    agent_limiter,
)
from src.models.agent_access import AgentAuditEvent, AgentCredential, AgentOperation
from src.models.project import Project
from src.models.user import User
from src.rate_limit import RateLimitRule
from src.schemas.agent_tools import (
    CODE_APPROVAL_REJECTED,
    CODE_PROPOSAL_EXPIRED,
    CODE_STALE_STATE,
)

MAX_ACTIVE_CREDENTIALS_PER_PROJECT = 20
MAX_CREDENTIAL_HOURS = 24 * 7
DEFAULT_CREDENTIAL_HOURS = 24
PROPOSAL_EXPIRY_MINUTES = 10

# 属主发放桶：始终启用（隔离于浏览器登录/导入的开发态开关限流）
ISSUE_CREDENTIAL_RULE = RateLimitRule(limit=10, window_seconds=60)

CREDENTIAL_DENIED_MSG = "凭据无效或已失效"


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_credential(
    session: Session,
    project: Project,
    owner: User,
    name: str,
    permission: str,
    expires_hours: float,
) -> tuple[AgentCredential, str]:
    """发放凭据；返回 (记录, 一次性明文令牌)。调用方事务内提交。

    发放限流走始终启用的 agent 隔离桶（不随浏览器限流开发态开关关闭）。
    """
    agent_limiter.check(f"agent-owner-issue:{owner.id}", ISSUE_CREDENTIAL_RULE)

    name = (name or "").strip()
    if not name:
        raise HTTPException(422, "凭据名称不能为空")
    if permission not in ("read", "read_write"):
        raise HTTPException(422, "permission 仅支持 read / read_write")
    if expires_hours <= 0 or expires_hours > MAX_CREDENTIAL_HOURS:
        raise HTTPException(422, f"有效期必须在 0 到 {MAX_CREDENTIAL_HOURS} 小时之间")

    active_count = session.scalar(
        select(func.count(AgentCredential.id)).where(
            AgentCredential.project_id == project.id,
            AgentCredential.revoked.is_(False),
            AgentCredential.expires_at > datetime.now(),
        )
    )
    if active_count is not None and active_count >= MAX_ACTIVE_CREDENTIALS_PER_PROJECT:
        raise HTTPException(400, f"每个项目最多同时持有 {MAX_ACTIVE_CREDENTIALS_PER_PROJECT} 个有效凭据")

    duplicate = session.scalar(
        select(AgentCredential.id).where(AgentCredential.project_id == project.id, AgentCredential.name == name)
    )
    if duplicate is not None:
        from src.schemas.agent_tools import CODE_CONFLICT

        raise AgentToolError(409, "同名凭据已存在", CODE_CONFLICT)

    raw_token = "crfag_" + secrets.token_urlsafe(32)
    credential = AgentCredential(
        project_id=project.id,
        owner_id=owner.id,
        name=name,
        token_hash=_hash_token(raw_token),
        permission=permission,
        auth_version=owner.auth_version,
        expires_at=datetime.now() + _hours_delta(expires_hours),
    )
    session.add(credential)
    session.flush()
    session.add(
        AgentAuditEvent(
            credential_id=credential.id,
            project_id=project.id,
            actor_user_id=owner.id,
            tool_name="credential.issue",
            result_code="issued",
            summary_json=_compact_json({"name": name, "permission": permission}),
        )
    )
    return credential, raw_token


def _hours_delta(hours: float):
    from datetime import timedelta

    return timedelta(hours=hours)


def _compact_json(data: dict) -> str:
    import json

    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def revoke_credential(session: Session, project: Project, credential_id: int) -> AgentCredential:
    credential = session.get(AgentCredential, credential_id)
    if credential is None or credential.project_id != project.id:
        raise HTTPException(404, "凭据不存在")
    if credential.revoked:
        return credential
    credential.revoked = True
    session.flush()
    session.add(
        AgentAuditEvent(
            credential_id=credential.id,
            project_id=project.id,
            actor_user_id=project.owner_id,
            tool_name="credential.revoke",
            result_code="revoked",
            summary_json=_compact_json({"credential_id": credential.id}),
        )
    )
    return credential


def list_credentials(session: Session, project: Project) -> list[AgentCredential]:
    return list(
        session.scalars(
            select(AgentCredential).where(AgentCredential.project_id == project.id).order_by(AgentCredential.id.desc())
        ).all()
    )


def authenticate_credential(session: Session, raw_token: str) -> AgentCredential:
    """校验凭据并返回其记录；任何失败一律 401（不区分原因，避免探测）。"""
    if not raw_token:
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)
    token_hash = _hash_token(raw_token)
    credential = session.scalar(select(AgentCredential).where(AgentCredential.token_hash == token_hash))
    if credential is None:
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)
    if credential.revoked or credential.expires_at <= datetime.now():
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)

    owner = session.get(User, credential.owner_id)
    if owner is None or owner.auth_version != credential.auth_version:
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)

    project = session.get(Project, credential.project_id)
    if project is None:
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)
    if project.deleted_at is not None:
        # 凭据仍有效，但项目处于回收站：拒绝访问项目内容（403，非认证失败）
        raise HTTPException(403, "项目已在回收站中，凭据暂不可用")
    if project.owner_id != owner.id:
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)
    return credential


def credential_scope(session: Session, credential: AgentCredential) -> tuple[Project, User]:
    """在当前事务内重新解析凭据的项目与属主（写事务内的权威状态）。"""
    project = session.get(Project, credential.project_id)
    owner = session.get(User, credential.owner_id)
    if (
        project is None
        or project.deleted_at is not None
        or owner is None
        or owner.auth_version != credential.auth_version
        or project.owner_id != owner.id
    ):
        raise HTTPException(401, CREDENTIAL_DENIED_MSG)
    return project, owner


def require_project_in_scope(session: Session, credential: AgentCredential, project_id: int) -> Project:
    project, _owner = credential_scope(session, credential)
    if project.id != project_id:
        raise HTTPException(403, "凭据无权访问该项目")
    return project


def list_changes(session: Session, project: Project, limit: int = 50, offset: int = 0) -> list[AgentOperation]:
    return list(
        session.scalars(
            select(AgentOperation)
            .where(
                AgentOperation.project_id == project.id,
                AgentOperation.change_kind.isnot(None),
            )
            .order_by(AgentOperation.id.desc())
            .offset(offset)
            .limit(min(limit, 100))
        ).all()
    )


def get_change(session: Session, project: Project, change_id: int) -> AgentOperation:
    operation = session.get(AgentOperation, change_id)
    if operation is None or operation.project_id != project.id or operation.change_kind is None:
        raise HTTPException(404, "共享变更提案不存在")
    return operation


def decide_change(
    session: Session,
    project: Project,
    approver: User,
    change_id: int,
    approve: bool,
    proposal_digest: Optional[str],
) -> AgentOperation:
    """属主审批/驳回；校验提案摘要仍与展示一致且基线未失效。不应用 CRF 变更。"""
    operation = get_change(session, project, change_id)
    if operation.approval_state != "pending":
        raise AgentToolError(409, "该提案已被处理", CODE_APPROVAL_REJECTED)
    if operation.expires_at is None or operation.expires_at <= datetime.now():
        raise AgentToolError(410, "提案已过期，请让 agent 重新生成", CODE_PROPOSAL_EXPIRED)
    if proposal_digest is not None and operation.proposal_digest != proposal_digest:
        raise AgentToolError(409, "提案内容已变化，请刷新后重试", CODE_STALE_STATE)
    # 审批必须发生在当前基线上：项目内容在预览后变化 → 拒绝（fail closed），
    # 不允许属主批准一个已经描述不了现状的提案
    from src.services.agent_state_service import compute_project_fingerprint

    if operation.base_fingerprint and compute_project_fingerprint(session, project.id) != operation.base_fingerprint:
        raise AgentToolError(409, "项目内容已变化，提案基线已失效；请让 agent 重新预览", CODE_STALE_STATE)

    operation.approval_state = "approved" if approve else "rejected"
    operation.approved_by = approver.id
    operation.approved_at = datetime.now()
    session.flush()
    session.add(
        AgentAuditEvent(
            credential_id=operation.credential_id,
            project_id=project.id,
            operation_id=operation.id,
            actor_user_id=approver.id,
            tool_name="shared_change." + ("approve" if approve else "reject"),
            result_code=operation.approval_state,
            summary_json=_compact_json({"change_id": operation.id}),
        )
    )
    return operation
