"""Agent 凭据与访问边界测试（RED 先行）。

覆盖：十工具 allowlist、封闭 schema 校验、无凭据回退、属主专属管理、
过期/吊销/密码版本/属主变更/回收站拒绝、限流隔离与凭据元数据脱敏。
"""

import pytest
from fastapi import Response
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from types import SimpleNamespace

from src.agent_dependencies import parse_bounded_json_body

from agent_access_helpers import (
    reset_agent_limiter,
    agent_headers,
    agent_manifest,
    agent_tool,
    issue_credential,
    seed_full_project,
    seed_owner_and_project,
)
from helpers import auth_headers, login_as

pytestmark = pytest.mark.integration

EXPECTED_TOOLS = {
    "crf_list_projects",
    "crf_get_project_outline",
    "crf_get_form_detail",
    "crf_search_field_definitions",
    "crf_get_reference_impact",
    "crf_add_form_field",
    "crf_update_form_field_instance",
    "crf_reorder_form_fields",
    "crf_preview_shared_definition_change",
    "crf_apply_shared_definition_change",
}


def _browser_call_agent_endpoint(client: TestClient, token: str):
    """浏览器 JWT 不得作为 agent 凭据使用。"""
    return client.get("/api/agent/tools", headers=auth_headers(token))


# ── 基础凭据生命周期 ──────────────────────────────────────────────────────


def test_issue_credential_returns_token_once(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    data = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")
    assert data["permission"] == "read_write"
    assert data["project_id"] == ctx["project_id"]
    raw = data.pop("token", None)
    assert raw and len(raw) >= 32

    # 列表端点只返回元数据，绝不回传令牌
    resp = client.get(
        f"/api/projects/{ctx['project_id']}/agent-access/credentials",
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 1
    assert "token" not in items[0]
    assert items[0]["name"].startswith("测试凭据")
    assert items[0]["permission"] == "read_write"


def test_credential_defaults_to_read_only(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    data = issue_credential(client, ctx["token"], ctx["project_id"])
    assert data["permission"] == "read"


# ── 无凭据 / 坏凭据拒绝 ──────────────────────────────────────────────────


def test_agent_endpoints_reject_missing_token(client: TestClient, engine):
    resp = client.get("/api/agent/tools")
    assert resp.status_code == 401


def test_agent_endpoints_reject_garbage_token(client: TestClient, engine):
    resp = client.get("/api/agent/tools", headers=agent_headers("not-a-real-token"))
    assert resp.status_code == 401


def test_browser_jwt_is_not_an_agent_credential(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    resp = _browser_call_agent_endpoint(client, ctx["token"])
    assert resp.status_code == 401


def test_agent_credential_is_not_a_browser_jwt(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = client.get("/api/projects", headers=agent_headers(raw))
    assert resp.status_code == 401


# ── 十工具 allowlist 与 schema ────────────────────────────────────────────


def test_manifest_lists_exactly_ten_tools(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_manifest(client, raw)
    assert resp.status_code == 200, resp.text
    manifest = resp.json()
    names = {tool["name"] for tool in manifest["tools"]}
    assert names == EXPECTED_TOOLS
    # 静态描述不得包含项目文本
    for tool in manifest["tools"]:
        assert ctx and "Agent测试项目" not in tool.get("description", "")


def test_unknown_tool_name_rejected(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "manage_entity", {"table": "user"})
    assert resp.status_code in (404, 422)


def test_extra_keys_rejected_by_closed_schemas(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = agent_tool(client, raw, "crf_get_form_detail", {"project_id": ctx["project_id"], "form_id": 1, "sql": "1"})
    assert resp.status_code == 422


def test_read_only_credential_cannot_write(client: TestClient, engine):
    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read")["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"required": 1},
            "expected_project_fingerprint": "0" * 64,
            "request_id": "req-1",
        },
    )
    assert resp.status_code == 403


# ── 项目范围与凭据边界 ────────────────────────────────────────────────────


def test_credential_cannot_list_other_project(client: TestClient, engine):
    ctx_a = seed_owner_and_project(client, engine, "alice", "A项目")
    # 同一用户第二个项目
    from src.models.project import Project
    from src.models.user import User

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        other = Project(name="B项目", version="1.0", owner_id=alice.id, order_index=2)
        session.add(other)
        session.commit()
        other_id = other.id
    raw = issue_credential(client, ctx_a["token"], ctx_a["project_id"])["token"]

    resp = agent_tool(client, raw, "crf_list_projects", {})
    assert resp.status_code == 200
    projects = resp.json()["data"]["projects"]
    assert [p["id"] for p in projects] == [ctx_a["project_id"]]

    # 凭据不属于第二个项目，即使同属主
    resp = agent_tool(client, raw, "crf_get_project_outline", {"project_id": other_id})
    assert resp.status_code == 403


def test_cross_user_project_denied(client: TestClient, engine):
    ctx_a = seed_owner_and_project(client, engine, "alice", "A项目")
    token_b = login_as(client, "bob")
    raw = issue_credential(client, ctx_a["token"], ctx_a["project_id"])["token"]

    # bob 的浏览器端点也不能管理 alice 的凭据
    resp = client.get(
        f"/api/projects/{ctx_a['project_id']}/agent-access/credentials",
        headers=auth_headers(token_b),
    )
    assert resp.status_code == 403

    # agent 端点本身已绑定凭据项目；跨用户即跨项目
    resp = agent_tool(client, raw, "crf_get_project_outline", {"project_id": ctx_a["project_id"]})
    assert resp.status_code == 200


def test_agent_credentials_rejected_on_browser_management(client: TestClient, engine):
    """agent 凭据不能调用属主管理端点。"""
    ctx = seed_owner_and_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = client.get(
        f"/api/projects/{ctx['project_id']}/agent-access/credentials",
        headers=agent_headers(raw),
    )
    assert resp.status_code == 401


def test_owner_revoke_invalidates_credential(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    data = issue_credential(client, ctx["token"], ctx["project_id"])
    raw = data["token"]
    credential_id = data["id"]

    resp = client.post(
        f"/api/projects/{ctx['project_id']}/agent-access/credentials/{credential_id}/revoke",
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code in (200, 204), resp.text

    resp = agent_manifest(client, raw)
    assert resp.status_code == 401


def test_expired_credential_denied(client: TestClient, engine):
    ctx = seed_owner_and_project(client, engine, "alice")
    data = issue_credential(client, ctx["token"], ctx["project_id"], hours=0.0001)
    import time

    time.sleep(0.5)
    resp = agent_manifest(client, data["token"])
    assert resp.status_code == 401


def test_password_reset_invalidates_credential(client: TestClient, engine):
    """auth_version 变化（改密/重置）后凭据立即失效。"""
    from src.models.user import User

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    assert agent_manifest(client, raw).status_code == 200

    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == "alice"))
        user.auth_version += 1
        session.commit()

    resp = agent_manifest(client, raw)
    assert resp.status_code == 401


def test_ownership_transfer_invalidates_credential(client: TestClient, engine):
    """项目易主后旧属主凭据失效。"""
    from src.models.user import User

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    assert agent_manifest(client, raw).status_code == 200

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))
        if bob is None:
            bob = User(username="bob", auth_version=0)
            session.add(bob)
            session.flush()
        from src.models.project import Project

        project = session.get(Project, ctx["project_id"])
        project.owner_id = bob.id
        session.commit()

    resp = agent_manifest(client, raw)
    assert resp.status_code == 401


def test_recycled_project_denied(client: TestClient, engine):
    from datetime import datetime

    from src.models.project import Project

    ctx = seed_full_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    assert agent_manifest(client, raw).status_code == 200

    with Session(engine) as session:
        project = session.get(Project, ctx["project_id"])
        project.deleted_at = datetime.now()
        session.commit()

    resp = agent_tool(client, raw, "crf_list_projects", {})
    assert resp.status_code == 403
    resp = agent_tool(client, raw, "crf_get_project_outline", {"project_id": ctx["project_id"]})
    assert resp.status_code == 403


def test_agent_cannot_inherit_admin(client: TestClient, engine):
    """管理员属主的凭据也不得继承管理员能力（无 admin 端点暴露）。"""
    ctx = seed_full_project(client, engine, "admin_user")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]
    resp = client.get("/api/admin/users", headers=agent_headers(raw))
    assert resp.status_code == 401


# ── 凭据数量与发放限流 ────────────────────────────────────────────────────


def test_active_credential_cap_per_project(client: TestClient, engine, monkeypatch):
    from src.rate_limit import RateLimitRule
    from src.services.agent_access_service import MAX_ACTIVE_CREDENTIALS_PER_PROJECT

    # 本用例验证 20 个上限而不是发放限流；放开隔离桶避免混入限流语义
    from src.services import agent_access_service as access_service

    monkeypatch.setattr(access_service, "ISSUE_CREDENTIAL_RULE", RateLimitRule(limit=1000, window_seconds=60))

    ctx = seed_owner_and_project(client, engine, "alice")
    for i in range(MAX_ACTIVE_CREDENTIALS_PER_PROJECT):
        issue_credential(client, ctx["token"], ctx["project_id"], name=f"凭据{i}")
    resp = client.post(
        f"/api/projects/{ctx['project_id']}/agent-access/credentials",
        json={"name": "超限凭据", "permission": "read", "expires_hours": 24},
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code == 400


def test_issue_rate_limit_per_user(client: TestClient, engine, monkeypatch):
    monkeypatch.setenv("CRF_ENV", "production")
    from src.rate_limit import RateLimitRule
    from src.services import agent_access_service as svc

    ctx = seed_owner_and_project(client, engine, "alice")
    original = svc.ISSUE_CREDENTIAL_RULE
    svc.ISSUE_CREDENTIAL_RULE = RateLimitRule(limit=2, window_seconds=60)
    try:
        limit = svc.ISSUE_CREDENTIAL_RULE.limit
        for i in range(limit):
            issue_credential(client, ctx["token"], ctx["project_id"], name=f"限流{i}")
        resp = client.post(
            f"/api/projects/{ctx['project_id']}/agent-access/credentials",
            json={"name": "又一个", "permission": "read", "expires_hours": 24},
            headers=auth_headers(ctx["token"]),
        )
        assert resp.status_code == 429
    finally:
        svc.ISSUE_CREDENTIAL_RULE = original


def test_agent_limiter_isolated_from_login_limiter(client: TestClient, engine):
    """agent 限流实例独立于全局登录限流，不互相污染。"""
    from src.rate_limit import limiter
    from src.agent_dependencies import agent_limiter

    assert agent_limiter is not limiter
    agent_limiter.reset()
    limiter.reset()


# ── agent_dependencies 直测（engine 注入点 / 限流 / 有界解析 / no-store） ────


def _stream_request(chunks, headers=None):
    """构造逐块 deliver 的 starlette Request（模拟 chunked 到达）。"""
    from starlette.requests import Request

    consumed = []

    async def receive():
        index = len(consumed)
        consumed.append(index)
        body = chunks[index] if index < len(chunks) else b""
        return {"type": "http.request", "body": body, "more_body": index + 1 < len(chunks)}

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)
    return request, consumed


def test_get_agent_engine_yields_the_real_engine():
    from src.agent_dependencies import get_agent_engine
    from src.database import get_engine as real_get_engine

    engines = list(get_agent_engine())
    assert len(engines) == 1
    assert engines[0] is real_get_engine()


def test_limit_agent_ip_passes_under_limit():
    from starlette.requests import Request

    from src.agent_dependencies import limit_agent_ip

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.scope["client"] = ("10.7.0.2", 50000)
    limit_agent_ip(request)


def test_parse_bounded_json_body_rejects_oversize_content_length():
    import asyncio

    from fastapi import HTTPException

    from src.agent_dependencies import MAX_BODY_BYTES

    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [(b"content-length", str(MAX_BODY_BYTES + 1).encode())],
    }
    request = Request(scope)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(parse_bounded_json_body(request))
    assert exc.value.status_code == 413


def test_parse_bounded_json_body_rejects_oversize_body_and_stops_reading():
    import asyncio

    from fastapi import HTTPException

    from src.agent_dependencies import MAX_BODY_BYTES

    request, consumed = _stream_request([b"x" * (MAX_BODY_BYTES + 1), b"y" * 10])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(parse_bounded_json_body(request))
    assert exc.value.status_code == 413
    assert len(consumed) == 1, "超限后不得继续读取后续块"


def test_parse_bounded_json_body_chunked_within_bound_accumulates():
    import asyncio

    from src.agent_dependencies import parse_bounded_json_body

    request, _consumed = _stream_request([b'{"a": ', b"1}"])
    assert asyncio.run(parse_bounded_json_body(request)) == {"a": 1}


def test_parse_bounded_json_body_empty_body_returns_empty_dict():
    import asyncio

    from src.agent_dependencies import parse_bounded_json_body

    request, _consumed = _stream_request([])
    assert asyncio.run(parse_bounded_json_body(request)) == {}


def test_parse_bounded_json_body_rejects_invalid_json():
    import asyncio

    from fastapi import HTTPException

    from src.agent_dependencies import parse_bounded_json_body

    request, _consumed = _stream_request([b"{not-json"])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(parse_bounded_json_body(request))
    assert exc.value.status_code == 422


def test_parse_bounded_json_body_rejects_non_object_json():
    import asyncio

    from fastapi import HTTPException

    from src.agent_dependencies import parse_bounded_json_body

    request, _consumed = _stream_request([b"[1,2]"])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(parse_bounded_json_body(request))
    assert exc.value.status_code == 422


def test_parse_bounded_json_body_accepts_object_within_bound():
    import asyncio

    from src.agent_dependencies import parse_bounded_json_body

    request, _consumed = _stream_request([b'{"a": 1}'])
    assert asyncio.run(parse_bounded_json_body(request)) == {"a": 1}


def test_no_store_sets_cache_control_header():
    from src.agent_dependencies import no_store

    response = Response()
    no_store(response)
    assert response.headers["cache-control"] == "no-store"


def test_agent_error_response_conflict_default_and_explicit_stale_state():
    """409 默认码 CONFLICT；显式 STALE_STATE 保持不变；两者均 no-store。"""
    import json as json_module

    from fastapi import HTTPException

    from src.agent_dependencies import AgentToolError, agent_error_response
    from src.schemas.agent_tools import CODE_INTERNAL, CODE_STALE_STATE

    response = agent_error_response(HTTPException(409, "冲突"), CODE_INTERNAL)
    assert json_module.loads(response.body)["code"] == "CONFLICT"
    assert response.headers["cache-control"] == "no-store"

    response = agent_error_response(AgentToolError(409, "指纹已变", CODE_STALE_STATE), CODE_INTERNAL)
    assert json_module.loads(response.body)["code"] == "STALE_STATE"
    assert response.headers["cache-control"] == "no-store"


# ── 修复轮回归（审批基线 / no-store / 领域错误码 / 有界读取） ──


def test_approval_rejects_proposal_with_changed_base_state(client: TestClient, engine):
    """预览后项目内容变化 → 审批 409（属主不能批准描述不了现状的提案）。"""
    from src.models.unit import Unit

    ctx = seed_full_project(client, engine, "alice")
    raw = _rw_token(client, ctx)
    proposal = agent_tool(
        client,
        raw,
        "crf_preview_shared_definition_change",
        {
            "project_id": ctx["project_id"],
            "definition_id": ctx["field_definition_id"],
            "patch": {"label": "Stale review"},
            "expected_project_fingerprint": _current_fp(client, raw, ctx),
            "request_id": "stale-approval",
        },
    ).json()["data"]

    with Session(engine) as session:
        session.add(Unit(project_id=ctx["project_id"], symbol="intervening-change"))
        session.commit()

    resp = client.post(
        f"/api/projects/{ctx['project_id']}/agent-access/changes/{proposal['change_id']}/approve",
        json={"proposal_digest": proposal["proposal_digest"]},
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code == 409
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.json()["code"] == "STALE_STATE"


def _rw_token(client, ctx):
    return issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write")["token"]


def _current_fp(client, raw, ctx):
    return agent_tool(client, raw, "crf_list_projects", {}).json()["project_fingerprint"]


def test_owner_success_and_error_responses_are_no_store(client: TestClient, engine):
    """204/404/401 全部携带 no-store（属主端点 + agent 结果查询）。"""
    ctx = seed_owner_and_project(client, engine, "alice")
    raw = issue_credential(client, ctx["token"], ctx["project_id"])["token"]

    resp = client.post(
        f"/api/projects/{ctx['project_id']}/agent-access/credentials/{raw and 999999}/revoke",
        headers=auth_headers(ctx["token"]),
    )
    assert resp.status_code == 404
    assert resp.headers.get("cache-control") == "no-store"

    import jwt as pyjwt

    resp = client.get(f"/api/projects/{ctx['project_id']}/agent-access/credentials")
    assert resp.status_code in (401, 403)
    assert resp.headers.get("cache-control") == "no-store"

    import os

    from helpers import auth_headers as _ah

    # schema 合法的 crf_add_form_field 参数（ctx 无表单，id 取任意正整数即可）
    lookup_args = {
        "project_id": ctx["project_id"],
        "form_id": 1,
        "source": {"definition_id": 1},
        "instance": {},
        "expected_project_fingerprint": "0" * 64,
        "request_id": "no-such-request",
    }
    lookup = client.post(
        "/api/agent/operations/no-such-request",
        json={"tool_name": "crf_add_form_field", "arguments": lookup_args},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert lookup.status_code == 404
    assert lookup.headers.get("cache-control") == "no-store"
    assert lookup.json()["code"] == "UNKNOWN_OUTCOME"


def test_agent_error_responses_carry_domain_codes(client: TestClient, engine):
    """只读凭据写 → GRANT_DENIED；指纹过期 → STALE_STATE；跨项目 → INCOMPATIBLE_DATA。"""
    ctx = seed_full_project(client, engine, "alice")
    readonly = issue_credential(client, ctx["token"], ctx["project_id"], permission="read")["token"]
    resp = agent_tool(
        client,
        readonly,
        "crf_add_form_field",
        {
            "project_id": ctx["project_id"],
            "form_id": ctx["form_id"],
            "source": {"definition_id": ctx["field_definition_id"]},
            "instance": {},
            "expected_project_fingerprint": _current_fp(client, readonly, ctx),
            "request_id": "ro-write",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "GRANT_DENIED"

    raw = issue_credential(client, ctx["token"], ctx["project_id"], permission="read_write", name="第二个凭据")["token"]
    resp = agent_tool(
        client,
        raw,
        "crf_update_form_field_instance",
        {
            "project_id": ctx["project_id"],
            "form_field_id": ctx["form_field_id"],
            "patch": {"help_text": "x"},
            "expected_project_fingerprint": "0" * 64,
            "request_id": "stale-write",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "STALE_STATE"


def test_small_body_cap_stops_chunked_read(monkeypatch):
    """32 字节测试上限：首个 33 字节块即拒绝且不读下一块。"""
    import asyncio

    from fastapi import HTTPException
    from starlette.requests import Request

    from src import agent_dependencies

    monkeypatch.setattr(agent_dependencies, "MAX_BODY_BYTES", 32)
    chunks = [b"x" * 33, b"y" * 10]
    consumed = []

    async def receive():
        index = len(consumed)
        consumed.append(index)
        return {"type": "http.request", "body": chunks[index], "more_body": index == 0}

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)
    with pytest.raises(HTTPException) as error:
        asyncio.run(agent_dependencies.parse_bounded_json_body(request))
    assert error.value.status_code == 413
    assert len(consumed) == 1


# ── Round2 回归：框架校验 no-store / 429 稳定码 / 真实执行指示 ───────────────


def test_owner_validation_errors_are_not_cacheable(client: TestClient, engine):
    """typed body/query 框架校验失败同样 no-store + 稳定码，且不回显输入值。"""
    ctx = seed_owner_and_project(client, engine, "alice")
    credentials_url = f"/api/projects/{ctx['project_id']}/agent-access/credentials"
    headers = auth_headers(ctx["token"])

    # 未知键（封闭 schema extra=forbid）
    resp = client.post(credentials_url, json={"name": "SECRET-INPUT-XYZ", "not_allowed": True}, headers=headers)
    assert resp.status_code == 422
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.json()["code"] == "VALIDATION"
    assert "SECRET-INPUT-XYZ" not in resp.text

    # 畸形 JSON
    resp = client.post(credentials_url, content=b"{not-json", headers={**headers, "content-type": "application/json"})
    assert resp.status_code == 422
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.json()["code"] == "VALIDATION"

    # 非 JSON 对象体
    resp = client.post(credentials_url, json=[1, 2], headers=headers)
    assert resp.status_code == 422
    assert resp.headers.get("cache-control") == "no-store"

    # query 参数校验失败
    resp = client.get(f"/api/projects/{ctx['project_id']}/agent-access/changes?limit=abc", headers=headers)
    assert resp.status_code == 422
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.json()["code"] == "VALIDATION"


def test_rate_limit_rejection_maps_to_rate_limited_code(client: TestClient, engine, monkeypatch):
    """429 限流拒绝映射 RATE_LIMITED 稳定码，保留 Retry-After 与 no-store。"""
    from src.rate_limit import RateLimitRule
    from src.services import agent_access_service as svc

    ctx = seed_owner_and_project(client, engine, "alice")
    original = svc.ISSUE_CREDENTIAL_RULE
    svc.ISSUE_CREDENTIAL_RULE = RateLimitRule(limit=1, window_seconds=60)
    try:
        issue_credential(client, ctx["token"], ctx["project_id"], name="首个")
        resp = client.post(
            f"/api/projects/{ctx['project_id']}/agent-access/credentials",
            json={"name": "第二个", "permission": "read", "expires_hours": 24},
            headers=auth_headers(ctx["token"]),
        )
        assert resp.status_code == 429
        assert resp.json()["code"] == "RATE_LIMITED"
        assert resp.headers.get("cache-control") == "no-store"
        assert resp.headers.get("retry-after") is not None
    finally:
        svc.ISSUE_CREDENTIAL_RULE = original


def test_owner_changes_expose_truthful_applied_evidence(client: TestClient, engine):
    """applied 来自持久化应用证据：预览/已批未用为 False，应用（含重放）后为 True。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw_token(client, ctx)
    owner_headers = auth_headers(ctx["token"])
    changes_url = f"/api/projects/{ctx['project_id']}/agent-access/changes"
    detail_url = changes_url + f"/{{change_id}}"

    preview = agent_tool(
        client,
        raw,
        "crf_preview_shared_definition_change",
        {
            "project_id": ctx["project_id"],
            "definition_id": ctx["field_definition_id"],
            "patch": {"label": "执行指示标签"},
            "expected_project_fingerprint": _current_fp(client, raw, ctx),
            "request_id": "applied-evidence",
        },
    ).json()["data"]
    change_id = preview["change_id"]

    rows = client.get(changes_url, headers=owner_headers).json()["changes"]
    assert rows[0]["applied"] is False
    detail = client.get(detail_url.format(change_id=change_id), headers=owner_headers).json()
    assert detail["applied"] is False

    assert (
        client.post(
            changes_url + f"/{change_id}/approve",
            json={"proposal_digest": preview["proposal_digest"]},
            headers=owner_headers,
        ).status_code
        == 204
    )
    detail = client.get(detail_url.format(change_id=change_id), headers=owner_headers).json()
    assert detail["approval_state"] == "approved"
    assert detail["applied"] is False

    apply_resp = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert apply_resp.status_code == 200, apply_resp.text
    rows = client.get(changes_url, headers=owner_headers).json()["changes"]
    assert rows[0]["applied"] is True
    detail = client.get(detail_url.format(change_id=change_id), headers=owner_headers).json()
    assert detail["applied"] is True

    # 幂等重放不改变持久化证据
    replay = agent_tool(
        client, raw, "crf_apply_shared_definition_change", {"project_id": ctx["project_id"], "change_id": change_id}
    )
    assert replay.status_code == 200 and replay.json()["data"].get("replay") is True
    assert client.get(detail_url.format(change_id=change_id), headers=owner_headers).json()["applied"] is True


def test_rejected_change_reports_not_applied(client: TestClient, engine):
    """被驳回的提案：applied 保持 False（驳回不是执行）。"""
    ctx = seed_full_project(client, engine, "alice")
    raw = _rw_token(client, ctx)
    owner_headers = auth_headers(ctx["token"])
    changes_url = f"/api/projects/{ctx['project_id']}/agent-access/changes"

    preview = agent_tool(
        client,
        raw,
        "crf_preview_shared_definition_change",
        {
            "project_id": ctx["project_id"],
            "definition_id": ctx["field_definition_id"],
            "patch": {"label": "驳回标签"},
            "expected_project_fingerprint": _current_fp(client, raw, ctx),
            "request_id": "rejected-evidence",
        },
    ).json()["data"]
    assert (
        client.post(
            changes_url + f"/{preview['change_id']}/reject",
            json={"proposal_digest": preview["proposal_digest"]},
            headers=owner_headers,
        ).status_code
        == 204
    )
    rows = client.get(changes_url, headers=owner_headers).json()["changes"]
    assert rows[0]["approval_state"] == "rejected"
    assert rows[0]["applied"] is False
    detail = client.get(changes_url + f"/{preview['change_id']}", headers=owner_headers).json()
    assert detail["applied"] is False
