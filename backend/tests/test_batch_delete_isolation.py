"""项目批量软删除的属主隔离回归。

验证单条带 owner 过滤的批量软删除：仅删自己项目，混入他人 id 时他人项目不受影响。
另锁定 R7 契约：四类对象 batch-delete 的 409 引用预检只针对路径项目自己的 id，
他人（或不存在）的 id 与删除行为一致地静默忽略，不构成「是否被引用」的跨租户预言机。
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm


@pytest.fixture
def setup(client: TestClient):
    """alice 与 bob 各建一个项目，返回 (token_a, token_b, pid_a, pid_b)。"""
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    r_a = client.post(
        "/api/projects",
        json={"name": "A项目", "version": "1.0"},
        headers=auth_headers(token_a),
    )
    assert r_a.status_code in (200, 201), r_a.text
    pid_a = r_a.json()["id"]

    r_b = client.post(
        "/api/projects",
        json={"name": "B项目", "version": "1.0"},
        headers=auth_headers(token_b),
    )
    assert r_b.status_code in (200, 201), r_b.text
    pid_b = r_b.json()["id"]
    return token_a, token_b, pid_a, pid_b


def _project_ids(client: TestClient, token: str) -> set[int]:
    r = client.get("/api/projects", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return {p["id"] for p in r.json()}


def test_batch_delete_only_removes_own_projects(client: TestClient, setup):
    """alice 批量删除 [自己, bob]：自己被软删、bob 不受影响、返回 204。"""
    token_a, token_b, pid_a, pid_b = setup

    r = client.post(
        "/api/projects/batch-delete",
        json={"project_ids": [pid_a, pid_b]},
        headers=auth_headers(token_a),
    )
    assert r.status_code == 204, r.text

    assert pid_a not in _project_ids(client, token_a)
    # bob 的项目仍存在且可见
    assert pid_b in _project_ids(client, token_b)


def test_batch_delete_empty_list_is_noop(client: TestClient, setup):
    token_a, _, pid_a, _ = setup
    r = client.post(
        "/api/projects/batch-delete",
        json={"project_ids": []},
        headers=auth_headers(token_a),
    )
    assert r.status_code == 204, r.text
    assert pid_a in _project_ids(client, token_a)


# ── R7：batch-delete 的 409 引用预检必须限定路径项目 ──────────────────────────

BATCH_DELETE_KINDS = ("codelists", "units", "field-definitions", "forms")

_KIND_MODEL = {
    "codelists": CodeList,
    "units": Unit,
    "field-definitions": FieldDefinition,
    "forms": Form,
}

_KIND_GUARD_CONFIG = {
    "codelists": {
        "ref": "cl_ref_id",
        "free": "cl_free_id",
        "own": "own_cl_id",
        "detail": "部分字典被字段引用，无法删除",
    },
    "units": {"ref": "u_ref_id", "free": "u_free_id", "own": "own_u_id", "detail": "部分单位被字段引用，无法删除"},
    "field-definitions": {
        "ref": "fd_ref_id",
        "free": "fd_free_id",
        "own": "own_fd_id",
        "detail": "部分字段被表单引用，无法删除",
    },
    "forms": {
        "ref": "form_ref_id",
        "free": "form_free_id",
        "own": "own_form_id",
        "detail": "部分表单被访视引用，无法删除",
    },
}


def _batch_delete_url(kind: str, project_id: int) -> str:
    return f"/api/projects/{project_id}/{kind}/batch-delete"


def _assert_rows_intact(engine, kind: str, row_ids: list[int]) -> None:
    with Session(engine) as session:
        for row_id in row_ids:
            assert session.get(_KIND_MODEL[kind], row_id) is not None, (kind, row_id)


@pytest.fixture
def kind_guard_graph(client: TestClient, engine):
    """alice（攻击者）与 bob（受害者）各建一个项目。

    bob 项目内四类对象各有一个被引用、一个未被引用：字段库定义 fd_ref 引用 bob 的字典与
    单位（守卫口径：任意 FieldDefinition 指向即算），fd_ref 自身被放置进 bob 的表单，
    该表单又被访视关联——一个定义同时使四类对象各出现一个「被引用」。alice 项目内
    四类对象各有一个未被引用，作为混合批删里「自己的 id」。
    """
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert alice is not None and bob is not None

        attacker_project = Project(name="A 批删探测项目", version="1.0", owner_id=alice.id, order_index=1)
        victim_project = Project(name="B 批删受害项目", version="1.0", owner_id=bob.id, order_index=2)
        session.add_all([attacker_project, victim_project])
        session.flush()

        form_ref = Form(project_id=victim_project.id, name="受害被引表单", code="R7_FORM_REF", order_index=1)
        form_free = Form(project_id=victim_project.id, name="受害空闲表单", code="R7_FORM_FREE", order_index=2)
        own_form = Form(project_id=attacker_project.id, name="A 表单", code="R7_A_FORM", order_index=1)
        cl_ref = CodeList(project_id=victim_project.id, name="受害被引字典", code="R7_CL_REF", order_index=1)
        cl_free = CodeList(project_id=victim_project.id, name="受害空闲字典", code="R7_CL_FREE", order_index=2)
        own_cl = CodeList(project_id=attacker_project.id, name="A 字典", code="R7_A_CL", order_index=1)
        u_ref = Unit(project_id=victim_project.id, symbol="cm", code="R7_U_REF", order_index=1)
        u_free = Unit(project_id=victim_project.id, symbol="mm", code="R7_U_FREE", order_index=2)
        own_u = Unit(project_id=attacker_project.id, symbol="kg", code="R7_A_U", order_index=1)
        fd_ref = FieldDefinition(
            project_id=victim_project.id,
            variable_name="R7_FD_REF",
            label="受害被引字段",
            field_type="文本",
            order_index=1,
        )
        fd_free = FieldDefinition(
            project_id=victim_project.id,
            variable_name="R7_FD_FREE",
            label="受害空闲字段",
            field_type="文本",
            order_index=2,
        )
        own_fd = FieldDefinition(
            project_id=attacker_project.id,
            variable_name="R7_A_FD",
            label="A 字段",
            field_type="文本",
            order_index=1,
        )
        session.add_all(
            [
                form_ref,
                form_free,
                own_form,
                cl_ref,
                cl_free,
                own_cl,
                u_ref,
                u_free,
                own_u,
                fd_ref,
                fd_free,
                own_fd,
            ]
        )
        session.flush()

        # 守卫口径：fd_ref 同时引用 cl_ref / u_ref，并放置进 form_ref → 四类对象各有一个被引用
        fd_ref.codelist_id = cl_ref.id
        fd_ref.unit_id = u_ref.id
        session.add(FormField(form_id=form_ref.id, field_definition_id=fd_ref.id, order_index=1))

        visit = Visit(project_id=victim_project.id, name="R7 访视", code="R7_VISIT", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=form_ref.id, sequence=1))
        session.commit()

        return SimpleNamespace(
            alice_token=token_a,
            bob_token=token_b,
            attacker_project_id=attacker_project.id,
            victim_project_id=victim_project.id,
            cl_ref_id=cl_ref.id,
            cl_free_id=cl_free.id,
            own_cl_id=own_cl.id,
            u_ref_id=u_ref.id,
            u_free_id=u_free.id,
            own_u_id=own_u.id,
            fd_ref_id=fd_ref.id,
            fd_free_id=fd_free.id,
            own_fd_id=own_fd.id,
            form_ref_id=form_ref.id,
            form_free_id=form_free.id,
            own_form_id=own_form.id,
        )


@pytest.mark.parametrize("kind", BATCH_DELETE_KINDS)
def test_foreign_referenced_id_returns_deleted_zero(client: TestClient, engine, kind_guard_graph, kind: str):
    """a) 外人把受害者「被引用」id 投到自己项目的批删路径：200 {"deleted": 0}，受害者数据不变。"""
    g = kind_guard_graph
    cfg = _KIND_GUARD_CONFIG[kind]
    foreign_ref_id = getattr(g, cfg["ref"])

    resp = client.post(
        _batch_delete_url(kind, g.attacker_project_id),
        json={"ids": [foreign_ref_id]},
        headers=auth_headers(g.alice_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 0}
    _assert_rows_intact(engine, kind, [foreign_ref_id])


@pytest.mark.parametrize("kind", BATCH_DELETE_KINDS)
def test_foreign_referenced_and_unreferenced_ids_indistinguishable(
    client: TestClient, engine, kind_guard_graph, kind: str
):
    """b) 受害者被引用 / 未被引用 id 对外人的响应完全一致，不构成引用状态预言机。"""
    g = kind_guard_graph
    cfg = _KIND_GUARD_CONFIG[kind]
    headers = auth_headers(g.alice_token)
    ref_id = getattr(g, cfg["ref"])
    free_id = getattr(g, cfg["free"])

    resp_ref = client.post(_batch_delete_url(kind, g.attacker_project_id), json={"ids": [ref_id]}, headers=headers)
    resp_free = client.post(_batch_delete_url(kind, g.attacker_project_id), json={"ids": [free_id]}, headers=headers)
    assert resp_ref.status_code == 200, resp_ref.text
    assert resp_free.status_code == 200, resp_free.text
    assert resp_ref.json() == resp_free.json() == {"deleted": 0}
    _assert_rows_intact(engine, kind, [ref_id, free_id])


@pytest.mark.parametrize("kind", BATCH_DELETE_KINDS)
def test_mixed_own_and_foreign_referenced_ids_delete_only_own(client: TestClient, engine, kind_guard_graph, kind: str):
    """c) 自己未引用 + 他人被引用的混合批删：200 {"deleted": 1}，只删自己的、他人数据不变。"""
    g = kind_guard_graph
    cfg = _KIND_GUARD_CONFIG[kind]
    own_id = getattr(g, cfg["own"])
    foreign_ref_id = getattr(g, cfg["ref"])

    resp = client.post(
        _batch_delete_url(kind, g.attacker_project_id),
        json={"ids": [own_id, foreign_ref_id]},
        headers=auth_headers(g.alice_token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}
    with Session(engine) as session:
        assert session.get(_KIND_MODEL[kind], own_id) is None
    _assert_rows_intact(engine, kind, [foreign_ref_id])


@pytest.mark.parametrize("kind", BATCH_DELETE_KINDS)
def test_own_referenced_id_still_rejected_with_409(client: TestClient, kind_guard_graph, kind: str):
    """d) 自己项目内被引用 id 批删仍 409，文案不变（并发兜底守卫不受 R7 影响）。"""
    g = kind_guard_graph
    cfg = _KIND_GUARD_CONFIG[kind]

    resp = client.post(
        _batch_delete_url(kind, g.victim_project_id),
        json={"ids": [getattr(g, cfg["ref"])]},
        headers=auth_headers(g.bob_token),
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == cfg["detail"]
