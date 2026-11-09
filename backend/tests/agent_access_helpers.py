"""Agent 访问测试辅助：种子数据、凭据发放与 agent 端点调用。"""

from __future__ import annotations

import re

import pytest
from typing import Optional

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from helpers import login_as

_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def seed_owner_and_project(
    client: TestClient,
    engine: Engine,
    username: str,
    project_name: str = "Agent测试项目",
    db_type: str = "其他",
) -> dict:
    """创建属主用户与单个项目，返回 {token, user_id, project_id}。"""
    from src.models.project import Project
    from src.models.user import User

    token = login_as(client, username)
    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == username))
        assert user is not None
        project = Project(name=project_name, version="1.0", owner_id=user.id, order_index=1, db_type=db_type)
        session.add(project)
        session.flush()
        project_id = project.id
        user_id = user.id
        session.commit()
    return {"token": token, "user_id": user_id, "project_id": project_id}


def seed_full_project(
    client: TestClient,
    engine: Engine,
    username: str,
    project_name: str = "Agent测试项目",
    db_type: str = "其他",
) -> dict:
    """属主 + 项目 + 表单 + 字段定义 + 实例，返回完整上下文。"""
    from src.models.field_definition import FieldDefinition
    from src.models.form import Form
    from src.models.form_field import FormField

    ctx = seed_owner_and_project(client, engine, username, project_name, db_type)
    with Session(engine) as session:
        form = Form(project_id=ctx["project_id"], name="表单A", code="F_A", order_index=1)
        session.add(form)
        session.flush()
        fd = FieldDefinition(
            project_id=ctx["project_id"],
            variable_name="BASE_DEF",
            label="基础字段",
            field_type="文本",
            order_index=1,
        )
        session.add(fd)
        session.flush()
        ff = FormField(form_id=form.id, field_definition_id=fd.id, order_index=1)
        session.add(ff)
        session.commit()
        ctx.update({"form_id": form.id, "field_definition_id": fd.id, "form_field_id": ff.id})
    return ctx


def issue_credential(
    client: TestClient,
    token: str,
    project_id: int,
    name: str = "测试凭据",
    permission: str = "read",
    hours: float = 24,
) -> dict:
    """通过属主端点发放 agent 凭据，返回完整响应（含一次性令牌）。"""
    resp = client.post(
        f"/api/projects/{project_id}/agent-access/credentials",
        json={"name": name, "permission": permission, "expires_hours": hours},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def agent_headers(raw_token: str) -> dict:
    return {"Authorization": f"Bearer {raw_token}"}


def agent_tool(client: TestClient, raw_token: str, tool: str, payload: Optional[dict] = None):
    """调用 agent 工具端点，返回 response。"""
    return client.post(f"/api/agent/tools/{tool}", json=payload or {}, headers=agent_headers(raw_token))


def agent_manifest(client: TestClient, raw_token: str):
    return client.get("/api/agent/tools", headers=agent_headers(raw_token))


@pytest.fixture(autouse=True)
def reset_agent_limiter():
    """每用例前后重置 agent 隔离限流桶（函数级引擎让属主 ID 跨用例复用）。"""
    from src.agent_dependencies import agent_limiter

    agent_limiter.reset()
    yield
    agent_limiter.reset()
