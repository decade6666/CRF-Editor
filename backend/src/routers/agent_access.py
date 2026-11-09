"""Agent 访问属主管理路由（浏览器 JWT + 项目属主专用）。

凭据发放/吊销/列表与共享提案审批。agent 凭据与浏览器 JWT 互不通用。

属主写端点（发放/吊销/审批/驳回）在显式 BEGIN IMMEDIATE 事务内执行，
并在锁内重新校验当前身份（auth_version/用户名）与项目属主/未回收状态；
上限与同名判定在同一写锁内原子完成。全部成功与错误响应 no-store，
错误体含稳定领域错误码。
"""

from __future__ import annotations

import json
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.agent_dependencies import (
    AgentToolError,
    agent_error_response,
    get_agent_engine,
)
from src.models.agent_access import AgentOperation
from src.models.project import Project
from src.models.user import User
from src.schemas.agent_access import (
    AgentChangeDecisionRequest,
    AgentChangeListResponse,
    AgentChangeSummary,
    AgentCredentialCreate,
    AgentCredentialIssuedResponse,
    AgentCredentialResponse,
)
from src.schemas.agent_tools import CODE_INTERNAL, CODE_VALIDATION
from src.services.agent_access_service import (
    ISSUE_CREDENTIAL_RULE,
    decide_change,
    get_change,
    issue_credential,
    list_changes,
    list_credentials,
    revoke_credential,
)
from src.services.auth_service import create_access_token, decode_token
from src.dependencies import _REFRESHED_TOKEN_HEADER


class NoStoreOwnerRoute(APIRoute):
    """属主路由包装：框架层请求校验错误同样 no-store + 稳定码。

    typed body/query/path 在端点体之前由 FastAPI 校验，RequestValidationError
    默认不经过端点内的 no-store 错误翻译；这里在路由层统一拦截，
    只回字段位置与消息（不回显输入值），保持 {detail, code} 契约。
    """

    def get_route_handler(self):
        original = super().get_route_handler()

        async def no_store_handler(request: Request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                messages = []
                for error in exc.errors():
                    loc = " → ".join(str(item) for item in error.get("loc", ()))
                    message = error.get("msg", "参数错误")
                    messages.append(f"{loc}: {message}" if loc else str(message))
                detail = "；".join(messages) or "请求参数无效"
                return JSONResponse(
                    status_code=422,
                    content={"detail": detail, "code": CODE_VALIDATION},
                    headers={"Cache-Control": "no-store"},
                )
            except HTTPException as exc:
                # 端点体未接住的 HTTP 异常同样补齐 no-store + 稳定码
                return agent_error_response(exc, CODE_INTERNAL)

        return no_store_handler


router = APIRouter(tags=["agent-access"], route_class=NoStoreOwnerRoute)


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _principal(request: Request):
    """解码浏览器 JWT principal；失败返回 None（由端点统一转 no-store 401）。"""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        return decode_token(auth[7:].strip())
    except Exception:
        return None


def _unauthorized_response():
    return agent_error_response(HTTPException(401, "未授权", headers={"WWW-Authenticate": "Bearer"}), CODE_INTERNAL)


def _revalidated_owner(session: Session, principal):
    """锁内重新校验当前身份：auth_version/用户名与令牌 principal 一致。"""
    fresh = session.get(User, principal.user_id)
    if fresh is None or fresh.username != principal.username or fresh.auth_version != principal.auth_version:
        raise HTTPException(401, "未授权")
    return fresh


def _owned_active_project(session: Session, project_id: int, owner: User) -> Project:
    """锁内校验项目存在、属主一致且未回收。"""
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != owner.id:
        raise HTTPException(403, "无权访问此项目")
    if project.deleted_at is not None:
        raise HTTPException(404, "项目不存在")
    return project


def _owner_write_transaction(engine: Engine, principal, project_id: int, body: Callable):
    """BEGIN IMMEDIATE 内重校验身份/属主后执行 body(session, owner, project) 并提交。

    返回 (result, refreshed_token)：刷新令牌由端点写入成功响应头（§3 规则 4）。
    """
    with engine.connect() as conn:
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        session = Session(bind=conn, join_transaction_mode="control_fully")
        try:
            owner = _revalidated_owner(session, principal)
            project = _owned_active_project(session, project_id, owner)
            result = body(session, owner, project)
            refreshed = create_access_token(owner.id, owner.username, owner.auth_version)
            session.commit()
        except HTTPException:
            session.rollback()
            raise
        except Exception:
            session.rollback()
            raise
    return result, refreshed


def _no_store_headers(refreshed: Optional[str] = None) -> dict:
    headers = {"Cache-Control": "no-store"}
    if refreshed:
        headers[_REFRESHED_TOKEN_HEADER] = refreshed
    return headers


@router.get("/projects/{project_id}/agent-access/credentials", response_model=list[AgentCredentialResponse])
def list_project_credentials(
    project_id: int,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()
    try:
        with Session(engine) as session:
            owner = _revalidated_owner(session, principal)
            project = _owned_active_project(session, project_id, owner)
            credentials = [
                AgentCredentialResponse(
                    id=c.id,
                    project_id=c.project_id,
                    name=c.name,
                    permission=c.permission,
                    expires_at=_iso(c.expires_at),
                    revoked=c.revoked,
                    created_at=_iso(c.created_at),
                )
                for c in list_credentials(session, project)
            ]
            refreshed = create_access_token(owner.id, owner.username, owner.auth_version)
        return JSONResponse(content=[c.model_dump() for c in credentials], headers=_no_store_headers(refreshed))
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)


@router.post("/projects/{project_id}/agent-access/credentials", response_model=AgentCredentialIssuedResponse)
def create_project_credential(
    project_id: int,
    data: AgentCredentialCreate,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    def _issue(session: Session, owner: User, project: Project) -> dict:
        credential, raw_token = issue_credential(
            session, project, owner, data.name, data.permission, data.expires_hours
        )
        return {
            "id": credential.id,
            "project_id": credential.project_id,
            "name": credential.name,
            "permission": credential.permission,
            "expires_at": _iso(credential.expires_at),
            "revoked": credential.revoked,
            "created_at": _iso(credential.created_at),
            "token": raw_token,
        }

    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()
    try:
        payload, refreshed = _owner_write_transaction(engine, principal, project_id, _issue)
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    return JSONResponse(content=payload, status_code=201, headers=_no_store_headers(refreshed))


@router.post("/projects/{project_id}/agent-access/credentials/{credential_id}/revoke")
def revoke_project_credential(
    project_id: int,
    credential_id: int,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    def _revoke(session: Session, owner: User, project: Project):
        revoke_credential(session, project, credential_id)
        return None

    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()
    try:
        _result, refreshed = _owner_write_transaction(engine, principal, project_id, _revoke)
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    return Response(status_code=204, headers=_no_store_headers(refreshed))


@router.get("/projects/{project_id}/agent-access/changes", response_model=AgentChangeListResponse)
def list_project_changes(
    project_id: int,
    request: Request,
    limit: int = 50,
    offset: int = 0,
    engine: Engine = Depends(get_agent_engine),
):
    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()
    try:
        with Session(engine) as session:
            owner = _revalidated_owner(session, principal)
            project = _owned_active_project(session, project_id, owner)
            if limit < 1 or limit > 100 or offset < 0:
                raise HTTPException(422, "分页参数无效")
            operations = list_changes(session, project, limit=limit, offset=offset)
            total = session.scalar(
                select(func.count(AgentOperation.id)).where(
                    AgentOperation.project_id == project.id, AgentOperation.change_kind.isnot(None)
                )
            )
            changes = AgentChangeListResponse(
                changes=[
                    AgentChangeSummary(
                        change_id=op.id,
                        definition_id=op.definition_id or 0,
                        tool_name=op.tool_name,
                        approval_state=op.approval_state,
                        status=op.status,
                        # 执行指示来自持久化应用证据（after_fingerprint 仅在审批后应用成功时写入）
                        applied=op.after_fingerprint is not None,
                        created_at=_iso(op.created_at),
                        expires_at=_iso(op.expires_at),
                    )
                    for op in operations
                ],
                total=total or 0,
                offset=offset,
                has_more=offset + len(operations) < (total or 0),
            )
        refreshed = create_access_token(owner.id, owner.username, owner.auth_version)
        return JSONResponse(content=changes.model_dump(), headers=_no_store_headers(refreshed))
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)


@router.get("/projects/{project_id}/agent-access/changes/{change_id}")
def get_project_change_detail(
    project_id: int,
    change_id: int,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()
    try:
        with Session(engine) as session:
            owner = _revalidated_owner(session, principal)
            project = _owned_active_project(session, project_id, owner)
            operation = get_change(session, project, change_id)
            command = json.loads(operation.normalized_command_json or "{}")
            impact = json.loads(operation.impact_json or "[]")
            preview = json.loads(operation.result_json or "{}")
            detail = {
                "change_id": operation.id,
                "definition_id": operation.definition_id,
                "tool_name": operation.tool_name,
                "status": operation.status,
                "approval_state": operation.approval_state,
                # 执行指示来自持久化应用证据，不把内部命令状态当作 CRF 已应用
                "applied": operation.after_fingerprint is not None,
                "patch": command.get("patch", {}),
                "impact": impact,
                "semantic_diff": preview.get("semantic_diff", []),
                "base_fingerprint": operation.base_fingerprint,
                "proposal_digest": operation.proposal_digest,
                "expires_at": _iso(operation.expires_at),
                "created_at": _iso(operation.created_at),
            }
        refreshed = create_access_token(owner.id, owner.username, owner.auth_version)
        return JSONResponse(content=detail, headers=_no_store_headers(refreshed))
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)


@router.post("/projects/{project_id}/agent-access/changes/{change_id}/approve")
def approve_project_change(
    project_id: int,
    change_id: int,
    data: AgentChangeDecisionRequest,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    return _decide_endpoint(engine, request, project_id, change_id, True, data.proposal_digest)


@router.post("/projects/{project_id}/agent-access/changes/{change_id}/reject")
def reject_project_change(
    project_id: int,
    change_id: int,
    data: AgentChangeDecisionRequest,
    request: Request,
    engine: Engine = Depends(get_agent_engine),
):
    return _decide_endpoint(engine, request, project_id, change_id, False, data.proposal_digest)


def _decide_endpoint(
    engine: Engine,
    request: Request,
    project_id: int,
    change_id: int,
    approve: bool,
    proposal_digest: Optional[str],
):
    principal = _principal(request)
    if principal is None:
        return _unauthorized_response()

    def _decide(session: Session, owner: User, project: Project):
        decide_change(session, project, owner, change_id, approve, proposal_digest)
        return None

    try:
        _result, refreshed = _owner_write_transaction(engine, principal, project_id, _decide)
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    return Response(status_code=204, headers=_no_store_headers(refreshed))
