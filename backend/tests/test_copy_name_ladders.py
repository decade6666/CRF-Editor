"""复制改名梯子（copy-name ladder）特征测试。

覆盖设计 R2 三组调用点的“0 / 1 / 2 次冲突 → 精确名称”行为：
- A 组（路由层、每候选一次 DB 探测）：字典 / 字段定义 / 表单 / 访视复制端点；
- B 组（预取集合、中文后缀）：项目副本 `_resolve_copy_name`、回收站恢复 `_resolve_restore_name`；
- C 组（内存集合）：`_make_unique_name` / `_make_unique_import_codelist_name` / `_make_unique_var` / `_make_unique_code`。

全部用例在改造前即为绿色（characterization），改换 `first_free_name` 之后必须逐字保持。
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.project import Project
from src.models.user import User
from src.routers.admin import _resolve_restore_name
from src.services.import_service import ImportService
from src.services.project_clone_service import ProjectCloneService

# ----------------------------------------------------------------------
# A 组：路由层复制端点（每候选一次 DB 探测）
# ----------------------------------------------------------------------


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


def _create_project(client: TestClient, token: str, name: str = "复制项目") -> int:
    resp = client.post("/api/projects", json={"name": name, "version": "1.0"}, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _copy_codelist(client: TestClient, project_id: int, codelist_id: int, token: str) -> str:
    resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/copy",
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["name"]


def test_codelist_copy_name_ladder(client: TestClient, auth_token: str) -> None:
    project_id = _create_project(client, auth_token)
    created = client.post(
        f"/api/projects/{project_id}/codelists",
        json={"name": "血压", "code": "CL_BP"},
        headers=auth_headers(auth_token),
    )
    assert created.status_code == 201, created.text
    codelist_id = created.json()["id"]

    assert _copy_codelist(client, project_id, codelist_id, auth_token) == "血压_copy"
    assert _copy_codelist(client, project_id, codelist_id, auth_token) == "血压_copy1"
    assert _copy_codelist(client, project_id, codelist_id, auth_token) == "血压_copy2"


def _create_field_definition(client: TestClient, project_id: int, token: str, variable_name: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={"variable_name": variable_name, "label": "字段", "field_type": "文本"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _copy_field_definition(client: TestClient, fd_id: int, token: str) -> str:
    resp = client.post(f"/api/field-definitions/{fd_id}/copy", headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["variable_name"]


def test_field_definition_copy_name_ladder(client: TestClient, auth_token: str) -> None:
    project_id = _create_project(client, auth_token)
    fd_id = _create_field_definition(client, project_id, auth_token, "AGE")

    # 字段定义复制的是 OID：新写归一为大写源 + _COPY 梯子（名称/码表/访视复制仍为 _copy 名称）
    assert _copy_field_definition(client, fd_id, auth_token) == "AGE_COPY"
    assert _copy_field_definition(client, fd_id, auth_token) == "AGE_COPY1"
    assert _copy_field_definition(client, fd_id, auth_token) == "AGE_COPY2"


def _create_form(client: TestClient, project_id: int, token: str, name: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/forms",
        json={"name": name, "code": None},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _copy_form(client: TestClient, form_id: int, token: str) -> str:
    resp = client.post(f"/api/forms/{form_id}/copy", headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["name"]


def test_form_copy_name_ladder(client: TestClient, auth_token: str) -> None:
    project_id = _create_project(client, auth_token)
    form_id = _create_form(client, project_id, auth_token, "访视表")

    assert _copy_form(client, form_id, auth_token) == "访视表_copy"
    assert _copy_form(client, form_id, auth_token) == "访视表_copy1"
    assert _copy_form(client, form_id, auth_token) == "访视表_copy2"


def _create_visit(client: TestClient, project_id: int, token: str, name: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/visits",
        json={"name": name, "code": None},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _copy_visit(client: TestClient, visit_id: int, token: str) -> str:
    resp = client.post(f"/api/visits/{visit_id}/copy", headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["name"]


def test_visit_copy_name_ladder(client: TestClient, auth_token: str) -> None:
    project_id = _create_project(client, auth_token)
    visit_id = _create_visit(client, project_id, auth_token, "筛选期")

    assert _copy_visit(client, visit_id, auth_token) == "筛选期_copy"
    assert _copy_visit(client, visit_id, auth_token) == "筛选期_copy1"
    assert _copy_visit(client, visit_id, auth_token) == "筛选期_copy2"


# ----------------------------------------------------------------------
# B 组：预取集合 + 中文后缀（项目副本 / 回收站恢复），start=2
# ----------------------------------------------------------------------


def _seed_project(session: Session, owner_id: int, name: str, *, deleted: bool = False) -> int:
    project = Project(name=name, version="1.0", owner_id=owner_id)
    session.add(project)
    session.flush()
    if deleted:
        # 与 project.deleted_at 的 naive 本地时间语义保持一致
        project.deleted_at = datetime.now()
    return project.id


def test_project_clone_copy_name_ladder(engine) -> None:
    with Session(engine) as session:
        with session.begin():
            owner = User(username="clone-owner", hashed_password="x", is_admin=False)
            session.add(owner)
            session.flush()
            owner_id = owner.id
            _seed_project(session, owner_id, "项目A")

        with session.begin():
            assert ProjectCloneService._resolve_copy_name("项目A", session, owner_id) == "项目A (副本)"
            _seed_project(session, owner_id, "项目A (副本)")
            assert ProjectCloneService._resolve_copy_name("项目A", session, owner_id) == "项目A (副本2)"
            _seed_project(session, owner_id, "项目A (副本2)")
            assert ProjectCloneService._resolve_copy_name("项目A", session, owner_id) == "项目A (副本3)"


def test_restore_name_ladder(engine) -> None:
    with Session(engine) as session:
        with session.begin():
            owner = User(username="restore-owner", hashed_password="x", is_admin=False)
            session.add(owner)
            session.flush()
            owner_id = owner.id

            # 回收站中的项目不占用「恢复」候选名（集合只取未删除项目）
            _seed_project(session, owner_id, "项目A (恢复)", deleted=True)

            assert _resolve_restore_name(session, owner_id, "项目A") == "项目A (恢复)"
            _seed_project(session, owner_id, "项目A (恢复)")
            assert _resolve_restore_name(session, owner_id, "项目A") == "项目A (恢复2)"
            _seed_project(session, owner_id, "项目A (恢复2)")
            assert _resolve_restore_name(session, owner_id, "项目A") == "项目A (恢复3)"


def test_restore_name_ladder_scope_ignores_other_owners(engine) -> None:
    with Session(engine) as session:
        with session.begin():
            owner = User(username="restore-scope-owner", hashed_password="x", is_admin=False)
            other = User(username="restore-scope-other", hashed_password="x", is_admin=False)
            session.add_all([owner, other])
            session.flush()
            _seed_project(session, other.id, "项目A (恢复)")
            _seed_project(session, other.id, "项目A (恢复2)")

            assert _resolve_restore_name(session, owner.id, "项目A") == "项目A (恢复)"


# ----------------------------------------------------------------------
# C 组：内存集合（import_service），start=2
# ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("existing", "expected"),
    [
        (set(), "表单A_导入"),
        ({"表单A_导入"}, "表单A_导入2"),
        ({"表单A_导入", "表单A_导入2"}, "表单A_导入3"),
    ],
)
def test_make_unique_name_ladder(existing: set, expected: str) -> None:
    assert ImportService._make_unique_name(set(existing), "表单A") == expected


@pytest.mark.parametrize(
    ("existing", "expected"),
    [
        (set(), "性别（导入）"),
        ({"性别（导入）"}, "性别（导入2）"),
        ({"性别（导入）", "性别（导入2）"}, "性别（导入3）"),
    ],
)
def test_make_unique_import_codelist_name_ladder(existing: set, expected: str) -> None:
    assert ImportService._make_unique_import_codelist_name(set(existing), "性别") == expected


@pytest.mark.parametrize(
    ("existing", "expected"),
    [
        (set(), "AGE_IMP"),
        ({"AGE_IMP"}, "AGE_IMP2"),
        ({"AGE_IMP", "AGE_IMP2"}, "AGE_IMP3"),
    ],
)
def test_make_unique_var_ladder(existing: set, expected: str) -> None:
    assert ImportService._make_unique_var(set(existing), "AGE") == expected


@pytest.mark.parametrize(
    ("existing", "expected"),
    [
        (set(), "DM_IMP"),
        ({"DM_IMP"}, "DM_IMP2"),
        ({"DM_IMP", "DM_IMP2"}, "DM_IMP3"),
    ],
)
def test_make_unique_code_ladder(existing: set, expected: str) -> None:
    assert ImportService._make_unique_code(set(existing), "DM") == expected


def test_resolve_import_code_uses_unique_ladder_only_on_collision() -> None:
    """`_make_unique_code` 的调用方语义：仅冲突时走梯子，未冲突原样透传。"""
    assert ImportService._resolve_import_code({"DM"}, "DM", "FORM") == "DM_IMP"
    assert ImportService._resolve_import_code({"DM", "DM_IMP"}, "DM", "FORM") == "DM_IMP2"
    assert ImportService._resolve_import_code(set(), "DM", "FORM") == "DM"


# 未合并站点（结构性不同，本轮不改动；此处仅锁定其独有行为以免被误并入梯子）
def test_project_import_name_keeps_try_original_first(engine) -> None:
    from src.services.project_import_service import _resolve_import_name

    with Session(engine) as session:
        with session.begin():
            owner = User(username="import-name-owner", hashed_password="x", is_admin=False)
            session.add(owner)
            session.flush()
            owner_id = owner.id

            # 与 A/B/C 组不同：先试原名本身
            assert _resolve_import_name("原项目名", session, owner_id) == "原项目名"
            _seed_project(session, owner_id, "原项目名")
            assert _resolve_import_name("原项目名", session, owner_id) == "原项目名_导入"
            _seed_project(session, owner_id, "原项目名_导入")
            assert _resolve_import_name("原项目名", session, owner_id) == "原项目名_导入2"
