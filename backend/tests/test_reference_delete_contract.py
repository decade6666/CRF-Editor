"""字典 / 单位引用删除拦截契约测试。

锁定两组契约（见 design §2）：
1. `include_unplaced` 查询标志：默认口径与历史内连接结果完全一致（只含已放入表单的引用）；
   开启后未放入表单的字段库字段也计入引用（与删除守卫口径一致），未放置定义生成一行
   form_name / form_code 为 None 的引用行。
2. 引用 / 守卫分区契约：四类对象（字典 / 单位 / 字段定义 / 表单）的批量引用结果 key 集合
   必须等于删除守卫会拒绝的 id 集合；未被引用 id 的批量删除成功，混入被引用 id 则整批 409。
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

CL_UNPLACED_ROW = {
    "form_name": None,
    "form_code": None,
    "field_label": "未放置字典字段",
    "field_var": "CL_UNPLACED_VAR",
}
U_UNPLACED_ROW = {
    "form_name": None,
    "form_code": None,
    "field_label": "未放置单位字段",
    "field_var": "U_UNPLACED_VAR",
}
CL_PLACED_ROWS = [
    {"form_name": "表单A", "form_code": "FORM_A", "field_label": "已放置字典字段", "field_var": "CL_PLACED_VAR"},
    {"form_name": "表单B", "form_code": "FORM_B", "field_label": "已放置字典字段", "field_var": "CL_PLACED_VAR"},
]
U_PLACED_ROWS = [
    {"form_name": "表单A", "form_code": "FORM_A", "field_label": "已放置单位字段", "field_var": "U_PLACED_VAR"},
    {"form_name": "表单B", "form_code": "FORM_B", "field_label": "已放置单位字段", "field_var": "U_PLACED_VAR"},
]
CL_MIXED_PLACED_ROW = {
    "form_name": "表单A",
    "form_code": "FORM_A",
    "field_label": "混合字典已放置字段",
    "field_var": "CL_MIXED_VAR",
}
CL_MIXED_UNPLACED_ROW = {
    "form_name": None,
    "form_code": None,
    "field_label": "混合字典未放置字段",
    "field_var": "CL_MIXED_VAR2",
}
U_MIXED_PLACED_ROW = {
    "form_name": "表单A",
    "form_code": "FORM_A",
    "field_label": "混合单位已放置字段",
    "field_var": "U_MIXED_VAR",
}
U_MIXED_UNPLACED_ROW = {
    "form_name": None,
    "form_code": None,
    "field_label": "混合单位未放置字段",
    "field_var": "U_MIXED_VAR2",
}

REF_ROW_KEYS = {"form_name", "form_code", "field_label", "field_var"}


def _sort_rows(rows):
    """行集与查询顺序无关：按 (form_name, form_code, field_label) 排序后比较。"""
    return sorted(rows, key=lambda r: (r["form_name"] or "", r["form_code"] or "", r["field_label"]))


@pytest.fixture
def ref_graph(client, engine):
    """同一项目内构造被引用 / 未被引用的字典、单位、字段定义，以及被访视引用 / 未引用的表单。

    - cl_placed / u_placed：仅被一个已放入两个表单的字段定义引用；
    - cl_unplaced / u_unplaced：仅被一个未放入任何表单的字段库字段引用；
    - cl_mixed / u_mixed：同时被一个已放置定义和一个未放置定义引用；
    - cl_free / u_free：无任何字段引用；
    - form_a：被访视 V1 引用；form_b / form_free：未被引用。
    """
    alice_token = login_as(client, "alice")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        assert alice is not None

        project = Project(name="引用拦截项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.flush()

        form_a = Form(project_id=project.id, name="表单A", code="FORM_A", order_index=1)
        form_b = Form(project_id=project.id, name="表单B", code="FORM_B", order_index=2)
        form_free = Form(project_id=project.id, name="空闲表单", code="FORM_FREE", order_index=3)
        session.add_all([form_a, form_b, form_free])
        session.flush()

        cl_placed = CodeList(project_id=project.id, name="已放置字典", code="CL_PLACED", order_index=1)
        cl_unplaced = CodeList(project_id=project.id, name="未放置字典", code="CL_UNPLACED", order_index=2)
        cl_mixed = CodeList(project_id=project.id, name="混合字典", code="CL_MIXED", order_index=3)
        cl_free = CodeList(project_id=project.id, name="空闲字典", code="CL_FREE", order_index=4)
        session.add_all([cl_placed, cl_unplaced, cl_mixed, cl_free])
        session.flush()

        u_placed = Unit(project_id=project.id, symbol="cm", code="UNIT_PLACED", order_index=1)
        u_unplaced = Unit(project_id=project.id, symbol="mm", code="UNIT_UNPLACED", order_index=2)
        u_mixed = Unit(project_id=project.id, symbol="kg", code="UNIT_MIXED", order_index=3)
        u_free = Unit(project_id=project.id, symbol="g", code="UNIT_FREE", order_index=4)
        session.add_all([u_placed, u_unplaced, u_mixed, u_free])
        session.flush()

        def _field(variable_name, label, *, codelist_id=None, unit_id=None):
            fd = FieldDefinition(
                project_id=project.id,
                variable_name=variable_name,
                label=label,
                field_type="文本",
                order_index=1,
                codelist_id=codelist_id,
                unit_id=unit_id,
            )
            session.add(fd)
            return fd

        fd_cl_placed = _field("CL_PLACED_VAR", "已放置字典字段", codelist_id=cl_placed.id)
        fd_u_placed = _field("U_PLACED_VAR", "已放置单位字段", unit_id=u_placed.id)
        _field("CL_UNPLACED_VAR", "未放置字典字段", codelist_id=cl_unplaced.id)
        _field("U_UNPLACED_VAR", "未放置单位字段", unit_id=u_unplaced.id)
        fd_cl_mixed_placed = _field("CL_MIXED_VAR", "混合字典已放置字段", codelist_id=cl_mixed.id)
        _field("CL_MIXED_VAR2", "混合字典未放置字段", codelist_id=cl_mixed.id)
        fd_u_mixed_placed = _field("U_MIXED_VAR", "混合单位已放置字段", unit_id=u_mixed.id)
        _field("U_MIXED_VAR2", "混合单位未放置字段", unit_id=u_mixed.id)
        fd_free = _field("FD_FREE_VAR", "空闲字段")
        session.flush()

        session.add_all(
            [
                FormField(form_id=form_a.id, field_definition_id=fd_cl_placed.id, order_index=1),
                FormField(form_id=form_b.id, field_definition_id=fd_cl_placed.id, order_index=1),
                FormField(form_id=form_a.id, field_definition_id=fd_u_placed.id, order_index=2),
                FormField(form_id=form_b.id, field_definition_id=fd_u_placed.id, order_index=2),
                FormField(form_id=form_a.id, field_definition_id=fd_cl_mixed_placed.id, order_index=3),
                FormField(form_id=form_a.id, field_definition_id=fd_u_mixed_placed.id, order_index=4),
            ]
        )
        session.flush()

        visit = Visit(project_id=project.id, name="V1", code="VISIT_REF", sequence=1)
        session.add(visit)
        session.flush()
        session.add(VisitForm(visit_id=visit.id, form_id=form_a.id, sequence=1))
        session.commit()

        return SimpleNamespace(
            alice_token=alice_token,
            project_id=project.id,
            form_a_id=form_a.id,
            form_free_id=form_free.id,
            cl_placed_id=cl_placed.id,
            cl_unplaced_id=cl_unplaced.id,
            cl_mixed_id=cl_mixed.id,
            cl_free_id=cl_free.id,
            u_placed_id=u_placed.id,
            u_unplaced_id=u_unplaced.id,
            u_mixed_id=u_mixed.id,
            u_free_id=u_free.id,
            fd_cl_placed_id=fd_cl_placed.id,
            fd_free_id=fd_free.id,
        )


# ── 字典：include_unplaced 标志语义 ────────────────────────────────────────────


def test_codelist_unplaced_reference_hidden_by_default_shown_with_flag(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/projects/{g.project_id}/codelists/{g.cl_unplaced_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert default.json() == []

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert flagged.json() == [CL_UNPLACED_ROW]


def test_codelist_batch_references_unplaced_flag_semantics(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/projects/{g.project_id}/codelists/batch-references"

    default = client.post(url, json={"ids": [g.cl_unplaced_id]}, headers=headers)
    assert default.status_code == 200, default.text
    assert default.json() == {}

    flagged = client.post(f"{url}?include_unplaced=true", json={"ids": [g.cl_unplaced_id]}, headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert flagged.json() == {str(g.cl_unplaced_id): [CL_UNPLACED_ROW]}


def test_codelist_referenced_only_by_unplaced_field_still_blocks_delete(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.delete(f"/api/projects/{g.project_id}/codelists/{g.cl_unplaced_id}", headers=headers)
    assert resp.status_code == 409, resp.text
    assert "无法删除" in resp.json()["detail"]

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-delete",
        json={"ids": [g.cl_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text


# ── 单位：include_unplaced 标志语义 ────────────────────────────────────────────


def test_unit_unplaced_reference_hidden_by_default_shown_with_flag(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/units/{g.u_unplaced_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert default.json() == []

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert flagged.json() == [U_UNPLACED_ROW]


def test_unit_batch_references_unplaced_flag_semantics(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/projects/{g.project_id}/units/batch-references"

    default = client.post(url, json={"ids": [g.u_unplaced_id]}, headers=headers)
    assert default.status_code == 200, default.text
    assert default.json() == {}

    flagged = client.post(f"{url}?include_unplaced=true", json={"ids": [g.u_unplaced_id]}, headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert flagged.json() == {str(g.u_unplaced_id): [U_UNPLACED_ROW]}


def test_unit_referenced_only_by_unplaced_field_still_blocks_delete(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.delete(f"/api/units/{g.u_unplaced_id}", headers=headers)
    assert resp.status_code == 409, resp.text
    assert "无法删除" in resp.json()["detail"]

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-delete",
        json={"ids": [g.u_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text


# ── 已放置字段引用：两种模式一致，且不产生多余 None 行 ────────────────────────


def test_codelist_placed_in_two_forms_returns_two_rows_in_both_modes(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/projects/{g.project_id}/codelists/{g.cl_placed_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert _sort_rows(default.json()) == CL_PLACED_ROWS

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert _sort_rows(flagged.json()) == CL_PLACED_ROWS


def test_unit_placed_in_two_forms_returns_two_rows_in_both_modes(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/units/{g.u_placed_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert _sort_rows(default.json()) == U_PLACED_ROWS

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert _sort_rows(flagged.json()) == U_PLACED_ROWS


# ── 混合（已放置 + 未放置指向同一对象）────────────────────────────────────────


def test_codelist_mixed_placed_and_unplaced_rows_with_flag(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/projects/{g.project_id}/codelists/{g.cl_mixed_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert _sort_rows(default.json()) == [CL_MIXED_PLACED_ROW]

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert _sort_rows(flagged.json()) == [CL_MIXED_UNPLACED_ROW, CL_MIXED_PLACED_ROW]


def test_unit_mixed_placed_and_unplaced_rows_with_flag(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)
    url = f"/api/units/{g.u_mixed_id}/references"

    default = client.get(url, headers=headers)
    assert default.status_code == 200, default.text
    assert _sort_rows(default.json()) == [U_MIXED_PLACED_ROW]

    flagged = client.get(f"{url}?include_unplaced=true", headers=headers)
    assert flagged.status_code == 200, flagged.text
    assert _sort_rows(flagged.json()) == [U_MIXED_UNPLACED_ROW, U_MIXED_PLACED_ROW]


# ── 默认模式回归：行键与值与历史形态完全一致 ──────────────────────────────────


def test_default_mode_rows_keep_exact_historical_shape(client: TestClient, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    cl_rows = client.get(f"/api/projects/{g.project_id}/codelists/{g.cl_placed_id}/references", headers=headers).json()
    for row in cl_rows:
        assert set(row.keys()) == REF_ROW_KEYS
    assert _sort_rows(cl_rows) == CL_PLACED_ROWS

    u_rows = client.get(f"/api/units/{g.u_placed_id}/references", headers=headers).json()
    for row in u_rows:
        assert set(row.keys()) == REF_ROW_KEYS
    assert _sort_rows(u_rows) == U_PLACED_ROWS

    cl_batch = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-references",
        json={"ids": [g.cl_placed_id, g.cl_mixed_id]},
        headers=headers,
    ).json()
    assert set(cl_batch.keys()) == {str(g.cl_placed_id), str(g.cl_mixed_id)}
    for rows in cl_batch.values():
        for row in rows:
            assert set(row.keys()) == REF_ROW_KEYS
    assert _sort_rows(cl_batch[str(g.cl_mixed_id)]) == [CL_MIXED_PLACED_ROW]

    u_batch = client.post(
        f"/api/projects/{g.project_id}/units/batch-references",
        json={"ids": [g.u_placed_id, g.u_mixed_id]},
        headers=headers,
    ).json()
    assert set(u_batch.keys()) == {str(g.u_placed_id), str(g.u_mixed_id)}
    for rows in u_batch.values():
        for row in rows:
            assert set(row.keys()) == REF_ROW_KEYS
    assert _sort_rows(u_batch[str(g.u_mixed_id)]) == [U_MIXED_PLACED_ROW]


# ── 分区契约：批量引用 key 集合 == 删除守卫拒绝的 id 集合 ─────────────────────


def test_codelist_partition_contract_with_flag(client: TestClient, engine, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-references?include_unplaced=true",
        json={"ids": [g.cl_placed_id, g.cl_unplaced_id, g.cl_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json().keys()) == {str(g.cl_placed_id), str(g.cl_unplaced_id)}

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-delete",
        json={"ids": [g.cl_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-delete",
        json={"ids": [g.cl_placed_id, g.cl_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    with Session(engine) as session:
        assert session.get(CodeList, g.cl_placed_id) is not None
        assert session.get(CodeList, g.cl_unplaced_id) is not None


def test_unit_partition_contract_with_flag(client: TestClient, engine, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-references?include_unplaced=true",
        json={"ids": [g.u_placed_id, g.u_unplaced_id, g.u_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json().keys()) == {str(g.u_placed_id), str(g.u_unplaced_id)}

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-delete",
        json={"ids": [g.u_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-delete",
        json={"ids": [g.u_placed_id, g.u_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    with Session(engine) as session:
        assert session.get(Unit, g.u_placed_id) is not None
        assert session.get(Unit, g.u_unplaced_id) is not None


# ── AC6 逐 id：409 拒绝对「已放置 / 未放置库」两种引用分别成立 ─────────────────


def test_codelist_batch_delete_rejects_each_reference_kind_alone(client: TestClient, engine, ref_graph) -> None:
    """批删只含已放置引用的 id → 409；只含未放置库引用的 id → 409；数据均不被删除。"""
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-delete",
        json={"ids": [g.cl_placed_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-delete",
        json={"ids": [g.cl_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text

    with Session(engine) as session:
        assert session.get(CodeList, g.cl_placed_id) is not None
        assert session.get(CodeList, g.cl_unplaced_id) is not None


def test_unit_batch_delete_rejects_each_reference_kind_alone(client: TestClient, engine, ref_graph) -> None:
    """批删只含已放置引用的 id → 409；只含未放置库引用的 id → 409；数据均不被删除。"""
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-delete",
        json={"ids": [g.u_placed_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-delete",
        json={"ids": [g.u_unplaced_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text

    with Session(engine) as session:
        assert session.get(Unit, g.u_placed_id) is not None
        assert session.get(Unit, g.u_unplaced_id) is not None


def test_field_definition_partition_contract(client: TestClient, engine, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/field-definitions/batch-references",
        json={"ids": [g.fd_cl_placed_id, g.fd_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json().keys()) == {str(g.fd_cl_placed_id)}

    resp = client.post(
        f"/api/projects/{g.project_id}/field-definitions/batch-delete",
        json={"ids": [g.fd_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}

    resp = client.post(
        f"/api/projects/{g.project_id}/field-definitions/batch-delete",
        json={"ids": [g.fd_cl_placed_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    with Session(engine) as session:
        assert session.get(FieldDefinition, g.fd_cl_placed_id) is not None


def test_form_partition_contract(client: TestClient, engine, ref_graph) -> None:
    g = ref_graph
    headers = auth_headers(g.alice_token)

    resp = client.post(
        f"/api/projects/{g.project_id}/forms/batch-references",
        json={"ids": [g.form_a_id, g.form_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json().keys()) == {str(g.form_a_id)}

    resp = client.post(
        f"/api/projects/{g.project_id}/forms/batch-delete",
        json={"ids": [g.form_free_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 1}

    resp = client.post(
        f"/api/projects/{g.project_id}/forms/batch-delete",
        json={"ids": [g.form_a_id]},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    with Session(engine) as session:
        assert session.get(Form, g.form_a_id) is not None


# ── 跨项目隔离：标志不泄露其他项目的引用 ──────────────────────────────────────


def test_include_unplaced_batch_references_do_not_leak_cross_project(client: TestClient, engine, ref_graph) -> None:
    g = ref_graph
    login_as(client, "bob")
    headers = auth_headers(g.alice_token)

    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert bob is not None

        project = Project(name="Bob 引用项目", version="1.0", owner_id=bob.id, order_index=9)
        session.add(project)
        session.flush()

        foreign_cl = CodeList(project_id=project.id, name="Bob 字典", code="BOB_CL", order_index=1)
        foreign_unit = Unit(project_id=project.id, symbol="kg", code="BOB_UNIT", order_index=1)
        session.add_all([foreign_cl, foreign_unit])
        session.flush()

        session.add_all(
            [
                FieldDefinition(
                    project_id=project.id,
                    variable_name="BOB_VAR_CL",
                    label="Bob 字典字段",
                    field_type="文本",
                    order_index=1,
                    codelist_id=foreign_cl.id,
                ),
                FieldDefinition(
                    project_id=project.id,
                    variable_name="BOB_VAR_U",
                    label="Bob 单位字段",
                    field_type="文本",
                    order_index=2,
                    unit_id=foreign_unit.id,
                ),
            ]
        )
        session.commit()
        foreign_cl_id = foreign_cl.id
        foreign_unit_id = foreign_unit.id

    resp = client.post(
        f"/api/projects/{g.project_id}/codelists/batch-references?include_unplaced=true",
        json={"ids": [foreign_cl_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {}

    resp = client.post(
        f"/api/projects/{g.project_id}/units/batch-references?include_unplaced=true",
        json={"ids": [foreign_unit_id]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {}


# ── 字典单查引用接口的跨用户授权：必须先校验路径项目归属 ──────────────────────


@pytest.fixture
def cross_user_graph(client, engine):
    """bob 拥有含「已放置 + 未放置」字典引用的项目；alice 另有自己的空项目。

    用于锁定 GET …/codelists/{cl_id}/references 的项目归属校验：非项目所有者
    （哪怕字典真实存在于该项目）必须 403，且响应不泄露受害者字段数据。
    """
    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert alice is not None and bob is not None

        alice_project = Project(name="Alice 空项目", version="1.0", owner_id=alice.id, order_index=7)
        session.add(alice_project)

        victim_project = Project(name="Bob 受害项目", version="1.0", owner_id=bob.id, order_index=8)
        session.add(victim_project)
        session.flush()

        form = Form(project_id=victim_project.id, name="Bob 表单", code="BOB_SEC_FORM", order_index=1)
        codelist = CodeList(project_id=victim_project.id, name="Bob 保密字典", code="BOB_SEC_CL", order_index=1)
        session.add_all([form, codelist])
        session.flush()

        session.add_all(
            [
                FieldDefinition(
                    project_id=victim_project.id,
                    variable_name="BOB_SEC_PLACED",
                    label="Bob 已放置字段",
                    field_type="文本",
                    order_index=1,
                    codelist_id=codelist.id,
                ),
                FieldDefinition(
                    project_id=victim_project.id,
                    variable_name="BOB_SEC_UNPLACED",
                    label="Bob 未放置字段",
                    field_type="文本",
                    order_index=2,
                    codelist_id=codelist.id,
                ),
            ]
        )
        session.flush()

        placed_fd = session.scalar(select(FieldDefinition).where(FieldDefinition.variable_name == "BOB_SEC_PLACED"))
        assert placed_fd is not None
        session.add(FormField(form_id=form.id, field_definition_id=placed_fd.id, order_index=1))
        session.commit()

        return SimpleNamespace(
            alice_token=alice_token,
            bob_token=bob_token,
            alice_project_id=alice_project.id,
            project_id=victim_project.id,
            codelist_id=codelist.id,
            placed_row={
                "form_name": "Bob 表单",
                "form_code": "BOB_SEC_FORM",
                "field_label": "Bob 已放置字段",
                "field_var": "BOB_SEC_PLACED",
            },
            unplaced_row={
                "form_name": None,
                "form_code": None,
                "field_label": "Bob 未放置字段",
                "field_var": "BOB_SEC_UNPLACED",
            },
        )


@pytest.mark.parametrize("include_unplaced", [False, True])
def test_codelist_references_reject_other_user_for_both_modes(
    client: TestClient, cross_user_graph, include_unplaced: bool
) -> None:
    g = cross_user_graph
    flag = "true" if include_unplaced else "false"

    resp = client.get(
        f"/api/projects/{g.project_id}/codelists/{g.codelist_id}/references?include_unplaced={flag}",
        headers=auth_headers(g.alice_token),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "无权访问此项目"
    # 响应不得泄露受害者字段数据（标签 / 变量名 / 表单名）
    for secret in ("Bob 已放置字段", "BOB_SEC_PLACED", "Bob 未放置字段", "BOB_SEC_UNPLACED", "Bob 表单"):
        assert secret not in resp.text, secret


@pytest.mark.parametrize("include_unplaced", [False, True])
def test_codelist_references_owner_check_precedes_existence(
    client: TestClient, cross_user_graph, include_unplaced: bool
) -> None:
    """归属校验必须先于字典存在性校验：外人 + 他人项目 + 不存在的字典 id 仍是 403，不是 404。"""
    g = cross_user_graph
    flag = "true" if include_unplaced else "false"

    resp = client.get(
        f"/api/projects/{g.project_id}/codelists/999999/references?include_unplaced={flag}",
        headers=auth_headers(g.alice_token),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "无权访问此项目"


@pytest.mark.parametrize("include_unplaced", [False, True])
def test_codelist_references_owner_still_gets_correct_rows(
    client: TestClient, cross_user_graph, include_unplaced: bool
) -> None:
    g = cross_user_graph
    flag = "true" if include_unplaced else "false"

    resp = client.get(
        f"/api/projects/{g.project_id}/codelists/{g.codelist_id}/references?include_unplaced={flag}",
        headers=auth_headers(g.bob_token),
    )
    assert resp.status_code == 200, resp.text
    expected = [g.placed_row] + ([g.unplaced_row] if include_unplaced else [])
    assert _sort_rows(resp.json()) == _sort_rows(expected)


def test_codelist_references_missing_dictionary_in_owned_project_returns_404(
    client: TestClient, cross_user_graph
) -> None:
    g = cross_user_graph
    resp = client.get(
        f"/api/projects/{g.project_id}/codelists/999999/references",
        headers=auth_headers(g.bob_token),
    )
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "编码字典不存在"


def test_codelist_references_dictionary_from_other_project_stays_403(client: TestClient, cross_user_graph) -> None:
    """字典与路径项目不匹配保持既有 403（字典校验语义），不与项目归属 403 混淆。"""
    g = cross_user_graph
    resp = client.get(
        f"/api/projects/{g.alice_project_id}/codelists/{g.codelist_id}/references",
        headers=auth_headers(g.alice_token),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "无权操作该字典"
