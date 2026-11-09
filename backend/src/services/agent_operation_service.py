"""Agent 操作服务：规范请求身份、幂等重放与事务内审计。"""

from __future__ import annotations

import hashlib
import json
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.agent_dependencies import AgentToolError
from src.models.agent_access import AgentAuditEvent, AgentCredential, AgentOperation
from src.schemas.agent_tools import CODE_IDENTITY_REUSED


def canonical_json(data) -> str:
    """规范化 JSON：排序键、紧凑分隔符，供摘要与绑定使用。"""
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_input_payload(model: BaseModel) -> dict:
    """类型化输入的幂等身份载荷：逐层只保留显式提供的字段。

    省略与显式 null 是不同请求身份（补丁/嵌套模型里的默认值不得抹平
    字段存在性）；绑定检查与结果记录必须使用同一规范化。
    """

    def _convert(value):
        if isinstance(value, BaseModel):
            return {key: _convert(getattr(value, key)) for key in value.model_fields_set}
        if isinstance(value, list):
            return [_convert(item) for item in value]
        if isinstance(value, dict):
            return {key: _convert(item) for key, item in value.items()}
        return value

    return _convert(model)


def input_digest(payload: dict) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def find_operation(session: Session, credential: AgentCredential, request_id: str) -> Optional[AgentOperation]:
    return session.scalar(
        select(AgentOperation).where(
            AgentOperation.credential_id == credential.id,
            AgentOperation.request_id == request_id,
        )
    )


def bind_or_reject(
    session: Session,
    credential: AgentCredential,
    project_id: int,
    tool_name: str,
    request_id: str,
    payload: dict,
) -> Optional[AgentOperation]:
    """幂等绑定：同 ID 同输入返回既有记录；不同输入 409（稳定码 IDENTITY_REUSED）。

    返回 None 表示新请求（调用方执行后记录结果）。
    """
    existing = find_operation(session, credential, request_id)
    if existing is None:
        return None
    if existing.input_digest != input_digest(payload) or existing.tool_name != tool_name:
        raise AgentToolError(409, "request_id 已被用于不同请求；请新换一个 request_id", CODE_IDENTITY_REUSED)
    return existing


def record_success(
    session: Session,
    credential: AgentCredential,
    project_id: int,
    tool_name: str,
    request_id: str,
    payload: dict,
    result: dict,
    **extra_fields,
) -> AgentOperation:
    """写事务内记录成功结果 + 审计事件（与业务写同提交）。"""
    outcome = dict(result)
    after_fingerprint = outcome.pop("project_fingerprint", None) or outcome.get("project_fingerprint")
    operation = AgentOperation(
        credential_id=credential.id,
        project_id=project_id,
        request_id=request_id,
        tool_name=tool_name,
        input_digest=input_digest(payload),
        status="done",
        result_json=canonical_json(result),
        after_fingerprint=after_fingerprint,
        **extra_fields,
    )
    session.add(operation)
    session.flush()
    session.add(
        AgentAuditEvent(
            credential_id=credential.id,
            project_id=project_id,
            operation_id=operation.id,
            tool_name=tool_name,
            result_code="success",
            summary_json=canonical_json(
                {
                    "request_id": request_id,
                    "form_field_id": result.get("form_field_id"),
                    "reordered_count": result.get("reordered_count"),
                }
            ),
        )
    )
    return operation


def load_result(operation: AgentOperation) -> dict:
    return json.loads(operation.result_json) if operation.result_json else {}
