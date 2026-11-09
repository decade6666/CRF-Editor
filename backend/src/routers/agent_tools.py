"""Agent 工具路由：清单、固定类型化分发、有界结果查询。

写操作在显式 BEGIN IMMEDIATE 的事务中执行：IP 预鉴权限流 → 鉴权 → 幂等
绑定 → 指纹校验 → 业务操作 → 输出 schema/大小校验（提交前）→ 结果/审计
同提交。engine 经 `get_agent_engine` 依赖注入，测试可 override 到隔离引擎。
同步 DB 事务/锁等待经 Starlette 线程池（run_in_threadpool）下放执行，
不阻塞事件循环；结果查询（POST，体 {tool_name, arguments}）按与派发相同
的幂等身份规则绑定后，还原与原派发相同的封闭信封（指纹在信封顶层）。
所有成功与错误响应一律 `Cache-Control: no-store`，错误体含稳定领域错误码。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from src.agent_dependencies import (
    AgentToolError,
    agent_error_response,
    get_agent_engine,
    limit_agent_ip,
    parse_bounded_json_body,
)
from src.models.agent_access import AgentCredential
from src.schemas.agent_tools import (
    CODE_INTERNAL,
    CODE_LIMIT_EXCEEDED,
    MAX_OUTPUT_BYTES,
    get_tool_output_adapter,
    get_tool_registry,
)
from src.services.agent_access_service import authenticate_credential, credential_scope
from src.services.agent_edit_service import (
    add_form_field,
    check_and_bind,
    reorder_form_fields,
    update_form_field_instance,
)
from src.services.agent_operation_service import bind_or_reject, canonical_input_payload, canonical_json, load_result
from src.services.agent_read_service import (
    get_form_detail,
    get_project_outline,
    get_reference_impact,
    list_granted_project,
    search_field_definitions,
)
from src.services.agent_shared_change_service import (
    apply_shared_definition_change,
    preview_shared_definition_change,
)

router = APIRouter(tags=["agent-tools"])


def _authenticate(session: Session, request: Request) -> AgentCredential:
    """请求级凭据解析（Header Bearer）。"""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "凭据无效或已失效", headers={"WWW-Authenticate": "Bearer"})
    raw = auth[7:].strip()
    return authenticate_credential(session, raw)


def _limit_read(credential: AgentCredential) -> None:
    from src.agent_dependencies import agent_limiter
    from src.services.agent_access_service import AGENT_READ_RULE

    agent_limiter.check(f"agent-read:{credential.id}", AGENT_READ_RULE)


def _limit_write(credential: AgentCredential) -> None:
    from src.agent_dependencies import agent_limiter
    from src.services.agent_access_service import AGENT_WRITE_RULE

    agent_limiter.check(f"agent-write:{credential.id}", AGENT_WRITE_RULE)


_READ_TOOLS = {
    "crf_list_projects": lambda session, project, data: list_granted_project(session, project),
    "crf_get_project_outline": lambda session, project, data: get_project_outline(session, project),
    "crf_get_form_detail": lambda session, project, data: get_form_detail(session, project, data.form_id),
    "crf_search_field_definitions": lambda session, project, data: search_field_definitions(
        session, project, data.query, data.limit, data.offset
    ),
    "crf_get_reference_impact": lambda session, project, data: get_reference_impact(
        session, project, data.resource_type, data.resource_id
    ),
}


@router.get("/agent/tools")
def list_agent_tools(request: Request, engine: Engine = Depends(get_agent_engine)):
    try:
        limit_agent_ip(request)
        from src.schemas.agent_tools import build_manifest

        with Session(engine) as session:
            credential = _authenticate(session, request)
            _limit_read(credential)
        response = JSONResponse(content=build_manifest(), headers={"Cache-Control": "no-store"})
        return response
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)


@router.post("/agent/tools/{tool_name}")
async def call_agent_tool(tool_name: str, request: Request, engine: Engine = Depends(get_agent_engine)):
    try:
        # 预鉴权 IP 限流先于任何请求体读取
        limit_agent_ip(request)
        registry = get_tool_registry()
        spec = registry.get(tool_name)
        if spec is None:
            raise HTTPException(404, "未知工具")
        # 有界请求体解析保持异步（逐块强制上限）；其后的同步 DB 事务（含
        # BEGIN IMMEDIATE 锁等待与指纹计算）经 Starlette 线程池执行，
        # 不阻塞事件循环——并发浏览器请求与 loop 调度的锁释放依赖 loop 时间
        body = await parse_bounded_json_body(request)
        result = await run_in_threadpool(_execute_tool, tool_name, spec, request, body, engine)
        return JSONResponse(content=result, headers={"Cache-Control": "no-store"})
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except Exception:
        import logging

        logging.getLogger("src.routers.agent_tools").exception("agent 工具执行失败 %s", tool_name)
        return agent_error_response(HTTPException(500, "内部服务器错误"), CODE_INTERNAL)


def _execute_tool(tool_name: str, spec: dict, request: Request, body: dict, engine: Engine) -> dict:
    if tool_name in _READ_TOOLS:
        # 读：显式 BEGIN 建立一致快照
        with engine.connect() as conn:
            if not conn.in_transaction():
                conn.exec_driver_sql("BEGIN")
            session = Session(bind=conn, join_transaction_mode="control_fully")
            try:
                credential = _authenticate(session, request)
                _limit_read(credential)
                project, _owner = credential_scope(session, credential)
                dto = _validate_input(spec, body)
                # 输入 project_id 必须与凭据授权项目一致（凭据只授权一个项目）
                _require_granted_project(dto, project)
                result = _READ_TOOLS[tool_name](session, project, dto)
                result = _validated_envelope(tool_name, result)
                session.commit()
            except HTTPException:
                session.rollback()
                raise
            except Exception:
                session.rollback()
                raise
        return result

    # 写：BEGIN IMMEDIATE 短事务（不做 HTTP/文件工作于锁内）
    with engine.connect() as conn:
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        session = Session(bind=conn, join_transaction_mode="control_fully")
        try:
            credential = _authenticate(session, request)
            _limit_write(credential)
            if credential.permission != "read_write":
                raise AgentToolError(403, "凭据为只读权限，不能执行写操作", "GRANT_DENIED")
            project, _owner = credential_scope(session, credential)
            dto = _validate_input(spec, body)
            _require_granted_project(dto, project)

            if tool_name == "crf_add_form_field":
                payload = canonical_input_payload(dto)
                replay, _fp = check_and_bind(
                    session, credential, project, tool_name, dto.request_id, payload, dto.expected_project_fingerprint
                )
                result = _wrap(replay if replay is not None else add_form_field(session, credential, project, dto))
            elif tool_name == "crf_update_form_field_instance":
                payload = canonical_input_payload(dto)
                replay, _fp = check_and_bind(
                    session, credential, project, tool_name, dto.request_id, payload, dto.expected_project_fingerprint
                )
                result = _wrap(
                    replay if replay is not None else update_form_field_instance(session, credential, project, dto)
                )
            elif tool_name == "crf_reorder_form_fields":
                payload = canonical_input_payload(dto)
                replay, _fp = check_and_bind(
                    session, credential, project, tool_name, dto.request_id, payload, dto.expected_project_fingerprint
                )
                result = _wrap(replay if replay is not None else reorder_form_fields(session, credential, project, dto))
            elif tool_name == "crf_preview_shared_definition_change":
                result = _wrap(preview_shared_definition_change(session, credential, project, dto))
            elif tool_name == "crf_apply_shared_definition_change":
                result = _wrap(apply_shared_definition_change(session, credential, project, dto))
            else:
                raise HTTPException(404, "未知工具")

            # 输出 schema/大小校验都在提交前：不合格则整体回滚（审计/结果不落库）
            result = _validated_envelope(tool_name, result)
            session.commit()
        except HTTPException:
            session.rollback()
            raise
        except Exception:
            session.rollback()
            raise
    return result


def _validated_envelope(tool_name: str, result: dict) -> dict:
    """提交前校验：typed 输出 schema + 1 MiB 大小上限（拒绝而非截断）。"""
    from pydantic import ValidationError

    adapter = get_tool_output_adapter(tool_name)
    if adapter is None:
        return result
    try:
        adapter.validate_python(result)
    except ValidationError:
        raise AgentToolError(500, "工具输出与声明的结构不一致，已回滚", CODE_INTERNAL)
    if len(canonical_json(result).encode("utf-8")) > MAX_OUTPUT_BYTES:
        raise AgentToolError(413, "工具输出超出大小上限，已回滚", CODE_LIMIT_EXCEEDED)
    return result


def _require_granted_project(dto, project) -> None:
    """输入中的 project_id 必须等于凭据授权的唯一项目。"""
    requested = getattr(dto, "project_id", None)
    if requested is not None and requested != project.id:
        raise AgentToolError(403, "凭据无权访问该项目", "GRANT_DENIED")


def _validate_model(model_cls, data: dict):
    """封闭 schema 校验；Pydantic 校验错误统一转 422 VALIDATION（位置前缀消息）。"""
    from pydantic import ValidationError

    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        messages = []
        for error in exc.errors():
            loc = " → ".join(str(item) for item in error.get("loc", ()))
            messages.append(f"{loc}: {error.get('msg', '参数错误')}" if loc else str(error.get("msg", "参数错误")))
        raise AgentToolError(422, "；".join(messages) or "请求参数无效", "VALIDATION")


def _validate_input(spec: dict, body: dict):
    """封闭 schema 校验；Pydantic 校验错误统一转 422 VALIDATION（位置前缀 Pydantic 消息，agent 面向）。"""
    return _validate_model(spec["input_schema"], body)


def _wrap(outcome: dict) -> dict:
    """统一信封。"""
    fingerprint = outcome.pop("project_fingerprint", None)
    return {
        "data": outcome,
        "project_fingerprint": fingerprint,
        "warnings": [],
    }


@router.post("/agent/operations/{request_id}")
async def get_agent_operation_result(request_id: str, request: Request, engine: Engine = Depends(get_agent_engine)):
    """不确定写结果的幂等查询：绑定原工具与规范化输入（凭据范围）。

    请求体 {tool_name, arguments} 先按对应工具 DTO 校验，再经 bind_or_reject
    与存储的请求身份比对（工具或规范化输入不一致 → 409 IDENTITY_REUSED）。
    查询只读：不写任何记录、不产生审计行。
    """
    try:
        # 预鉴权 IP 限流先于任何请求体读取（与派发一致）
        limit_agent_ip(request)
        body = await parse_bounded_json_body(request)
        envelope = await run_in_threadpool(_load_operation_result, request_id, body, request, engine)
        if envelope is None:
            # 结果未知 ≠ 失败证明
            return JSONResponse(
                status_code=404,
                content={
                    "detail": "该请求 ID 暂无已提交结果，结果未知；请用同一 request_id 重试",
                    "code": "UNKNOWN_OUTCOME",
                },
                headers={"Cache-Control": "no-store"},
            )
        return JSONResponse(content=envelope, headers={"Cache-Control": "no-store"})
    except AgentToolError as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except HTTPException as exc:
        return agent_error_response(exc, CODE_INTERNAL)
    except Exception:
        import logging

        logging.getLogger("src.routers.agent_tools").exception("agent 结果查询失败 %s", request_id)
        return agent_error_response(HTTPException(500, "内部服务器错误"), CODE_INTERNAL)


def _load_operation_result(request_id: str, body: dict, request: Request, engine: Engine):
    """同步 DB 查询（线程池执行）：身份校验顺序与派发一致。"""
    from src.schemas.agent_tools import AgentOperationLookupRequest

    with Session(engine) as session:
        credential = _authenticate(session, request)
        _limit_read(credential)
        project, _owner = credential_scope(session, credential)
        lookup = _validate_model(AgentOperationLookupRequest, body)
        spec = get_tool_registry()[lookup.tool_name]
        dto = _validate_input(spec, lookup.arguments)
        # 输入 project_id 必须与凭据授权项目一致（凭据只授权一个项目）
        _require_granted_project(dto, project)
        if dto.request_id != request_id:
            raise AgentToolError(422, "请求体 request_id 与路径不一致", "VALIDATION")
        # 同一身份规则：同 ID 同工具同输入放行；不同工具/输入 → 409 IDENTITY_REUSED
        operation = bind_or_reject(
            session, credential, project.id, lookup.tool_name, request_id, canonical_input_payload(dto)
        )
        if operation is None or operation.status != "done":
            return None
        # 存储的是原始业务结果（含顶层指纹键）；查询必须还原与原派发相同的封闭信封：
        # data 不含指纹键、指纹回到信封顶层，否则显式 MCP 输出校验会拒绝已提交的成功
        stored = load_result(operation)
        envelope = _wrap(stored)
        if envelope["project_fingerprint"] is None:
            envelope["project_fingerprint"] = operation.after_fingerprint
        return envelope
