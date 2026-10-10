"""字典选项子资源的项目所有权授权回归测试。"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.codelist import CodeList, CodeListOption
from src.models.project import Project
from src.models.user import User

OPTION_MUTATION_OPERATIONS = ("add", "update", "delete", "batch-delete", "reorder")


@pytest.fixture
def option_auth_graph(client: TestClient, engine) -> SimpleNamespace:
    """Alice/Bob 各自拥有项目；Bob 字典有两个选项，可用于检测修改与排序副作用。"""
    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert alice is not None and bob is not None

        alice_project = Project(name="Alice 选项项目", version="1.0", owner_id=alice.id, order_index=1)
        bob_project = Project(name="Bob 选项项目", version="1.0", owner_id=bob.id, order_index=1)
        session.add_all([alice_project, bob_project])
        session.flush()

        codelist = CodeList(project_id=bob_project.id, name="Bob 保密字典", code="BOB_OPTION_CL", order_index=1)
        session.add(codelist)
        session.flush()

        first = CodeListOption(codelist_id=codelist.id, code="1", decode="Bob 选项一", order_index=1)
        second = CodeListOption(codelist_id=codelist.id, code="2", decode="Bob 选项二", order_index=2)
        session.add_all([first, second])
        session.commit()

        return SimpleNamespace(
            alice_token=alice_token,
            bob_token=bob_token,
            alice_project_id=alice_project.id,
            bob_project_id=bob_project.id,
            codelist_id=codelist.id,
            first_option_id=first.id,
            second_option_id=second.id,
        )


def _option_state(engine, codelist_id: int) -> list[tuple[int, str | None, str, int | None]]:
    with Session(engine) as session:
        options = session.scalars(
            select(CodeListOption)
            .where(CodeListOption.codelist_id == codelist_id)
            .order_by(CodeListOption.order_index, CodeListOption.id)
        ).all()
        return [(option.id, option.code, option.decode, option.order_index) for option in options]


def _request_mutation(
    client: TestClient,
    operation: str,
    project_id: int,
    codelist_id: int,
    option_ids: tuple[int, int],
    headers: dict[str, str],
):
    base = f"/api/projects/{project_id}/codelists/{codelist_id}/options"
    first_id, second_id = option_ids
    if operation == "add":
        return client.post(base, json={"code": "3", "decode": "新增选项"}, headers=headers)
    if operation == "update":
        return client.put(f"{base}/{first_id}", json={"decode": "修改后的选项"}, headers=headers)
    if operation == "delete":
        return client.delete(f"{base}/{first_id}", headers=headers)
    if operation == "batch-delete":
        return client.post(f"{base}/batch-delete", json={"ids": [first_id]}, headers=headers)
    if operation == "reorder":
        return client.post(f"{base}/reorder", json=[second_id, first_id], headers=headers)
    raise AssertionError(f"未知选项操作：{operation}")


@pytest.mark.parametrize("operation", OPTION_MUTATION_OPERATIONS)
def test_option_mutation_rejects_other_project_owner_without_changes(
    client: TestClient, engine, option_auth_graph: SimpleNamespace, operation: str
) -> None:
    graph = option_auth_graph
    before = _option_state(engine, graph.codelist_id)

    response = _request_mutation(
        client,
        operation,
        graph.bob_project_id,
        graph.codelist_id,
        (graph.first_option_id, graph.second_option_id),
        auth_headers(graph.alice_token),
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"] == "无权访问此项目"
    for secret in ("Bob 选项一", "Bob 选项二", "Bob 保密字典"):
        assert secret not in response.text, secret
    assert _option_state(engine, graph.codelist_id) == before


@pytest.mark.parametrize("operation", OPTION_MUTATION_OPERATIONS)
def test_option_mutation_remains_available_to_project_owner(
    client: TestClient, engine, option_auth_graph: SimpleNamespace, operation: str
) -> None:
    graph = option_auth_graph
    response = _request_mutation(
        client,
        operation,
        graph.bob_project_id,
        graph.codelist_id,
        (graph.first_option_id, graph.second_option_id),
        auth_headers(graph.bob_token),
    )

    expected_status = {"add": 201, "update": 200, "delete": 204, "batch-delete": 200, "reorder": 200}
    assert response.status_code == expected_status[operation], response.text
    state = _option_state(engine, graph.codelist_id)
    if operation == "add":
        assert len(state) == 3
        assert any(row[2] == "新增选项" for row in state)
    elif operation == "update":
        assert any(row[2] == "修改后的选项" for row in state)
    elif operation in {"delete", "batch-delete"}:
        assert all(row[0] != graph.first_option_id for row in state)
        if operation == "batch-delete":
            assert response.json() == {"deleted": 1}
    else:
        assert [row[0] for row in state] == [graph.second_option_id, graph.first_option_id]
        assert [row[3] for row in state] == [1, 2]


@pytest.mark.parametrize("operation", OPTION_MUTATION_OPERATIONS)
def test_option_mutation_missing_owned_codelist_stays_404(
    client: TestClient, option_auth_graph: SimpleNamespace, operation: str
) -> None:
    graph = option_auth_graph
    response = _request_mutation(
        client,
        operation,
        graph.alice_project_id,
        999999,
        (999998, 999997),
        auth_headers(graph.alice_token),
    )
    assert response.status_code == 404, response.text


@pytest.mark.parametrize("operation", OPTION_MUTATION_OPERATIONS)
def test_option_mutation_foreign_codelist_stays_403_before_option_lookup(
    client: TestClient, engine, option_auth_graph: SimpleNamespace, operation: str
) -> None:
    """项目归属正确但字典归属错误时仍 403，且选项不存在与否不可被探测。"""
    graph = option_auth_graph
    before = _option_state(engine, graph.codelist_id)
    response = _request_mutation(
        client,
        operation,
        graph.alice_project_id,
        graph.codelist_id,
        (999998, 999997),
        auth_headers(graph.alice_token),
    )
    assert response.status_code == 403, response.text
    assert response.json()["detail"] == "无权操作该字典"
    assert _option_state(engine, graph.codelist_id) == before


@pytest.mark.parametrize("operation", ["update", "delete"])
def test_option_mutation_missing_option_stays_404_for_owner(
    client: TestClient, option_auth_graph: SimpleNamespace, operation: str
) -> None:
    graph = option_auth_graph
    response = _request_mutation(
        client,
        operation,
        graph.bob_project_id,
        graph.codelist_id,
        (999998, graph.second_option_id),
        auth_headers(graph.bob_token),
    )
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "选项不存在"
