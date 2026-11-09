"""Agent 访问私有状态模型：凭据、操作/提案、审计事件。

服务器授权状态，不是 CRF 设计资产：导出副本一律剥离（见
`database_export_service` 与 `agent_access_exports` 测试）。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from . import Base

if TYPE_CHECKING:
    from .project import Project
    from .user import User


class AgentCredential(Base):
    """项目专属 agent 凭据；只存令牌哈希，永不回传原文。"""

    __tablename__ = "agent_credential"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_agent_credential_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    permission: Mapped[str] = mapped_column(String(16), nullable=False, default="read", server_default="read")
    # 发放时的 auth_version 快照；当前版本不一致即失效（改密/重置）
    auth_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    project: Mapped["Project"] = relationship()
    owner: Mapped["User"] = relationship()


class AgentOperation(Base):
    """agent 本地变更/共享提案的幂等记录与不可变提案。"""

    __tablename__ = "agent_operation"
    __table_args__ = (UniqueConstraint("credential_id", "request_id", name="uq_agent_operation_request"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    credential_id: Mapped[int] = mapped_column(
        ForeignKey("agent_credential.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True)
    # 幂等身份：request_id（本地/预览）或服务端 change_id（共享应用）
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False)
    # 规范化完整输入的 SHA-256；同 ID 不同输入即 409
    input_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    # pending | done | rejected；共享提案另有 approval 状态
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 共享提案专用（不可变）
    change_kind: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    definition_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("field_definition.id", ondelete="CASCADE"), nullable=True
    )
    normalized_command_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    impact_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    base_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    proposal_digest: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    contract_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    approval_state: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    after_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AgentAuditEvent(Base):
    """append-only 审计事件；与业务写同事务提交。"""

    __tablename__ = "agent_audit_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    credential_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agent_credential.id", ondelete="CASCADE"), nullable=True, index=True
    )
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True)
    operation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agent_operation.id", ondelete="CASCADE"), nullable=True, index=True
    )
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False)
    result_code: Mapped[str] = mapped_column(String(32), nullable=False)
    summary_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


def default_expiry(hours: float) -> datetime:
    return datetime.now() + timedelta(hours=hours)
