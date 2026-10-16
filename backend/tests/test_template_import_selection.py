"""模板导入后立即展示首个新表单 —— imported_form_ids 契约测试。

任务 10-16-template-import-refresh（R1/AC1）：
- 服务层 summary 追加 ``imported_form_ids``：目标项目实际新建 Form 行的 id，
  按既有创建顺序排列，长度等于 ``imported_form_count``；零导入为 ``[]``。
- id 只能指向目标项目本次导入持久化的新行，绝不是源模板 id、
  目标项目既有行 id，也不能靠名称/列表差集推断。
- 重命名冲突（同名表单）返回重命名后新行的 id。
- ``ImportExecuteResponse.imported_form_ids`` 为加字段兼容：旧构造路径缺省
  ``[]``，HTTP 序列化必须保留真实 id（防响应模型过滤静默丢字段）。
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from helpers import auth_headers, login_as
from src.models import Base
from src.models.form import Form
from src.models.project import Project
from src.routers import import_template as import_template_router
from src.schemas.template_import import ImportExecuteResponse
from src.services.import_service import ImportService


# ------------------------------------------------------------------
# 复用 test_import_service.py 的隔离约定：内存目标库 + tmp 模板库文件
# ------------------------------------------------------------------


@pytest.fixture(autouse=True)
def import_service_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    fake_config = SimpleNamespace(
        db_path=str(tmp_path / "crf_editor.db"),
        upload_path=str(upload_dir),
    )
    monkeypatch.setattr("src.services.import_service.get_config", lambda: fake_config)
    return fake_config


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


def create_project(session: Session, name: str = "项目") -> Project:
    project = Project(name=name, version="v1.0")
    session.add(project)
    session.flush()
    return project


def create_form(
    session: Session, project_id: int, name: str, *, code: str | None = None, order_index: int | None = None
) -> Form:
    form = Form(project_id=project_id, name=name, code=code or f"{name}_CODE")
    if order_index is not None:
        form.order_index = order_index
    session.add(form)
    session.flush()
    return form


def build_template_db(
    tmp_path: Path,
    *,
    forms: list[tuple[str, int]],
) -> tuple[Path, int, list[int]]:
    """构造模板库：按 (表单名, order_index) 建源表单，返回 (路径, 源项目id, 源表单id列表)。"""
    db_path = tmp_path / "template_lib.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as template_session:
        project = create_project(template_session, name="模板项目")
        form_ids: list[int] = []
        for name, order_index in forms:
            form = Form(project_id=project.id, name=name, code=f"SRC_{name}")
            form.order_index = order_index
            template_session.add(form)
            template_session.flush()
            form_ids.append(form.id)
        template_session.commit()
        result = (db_path, project.id, list(form_ids))

    engine.dispose()
    return result


# ------------------------------------------------------------------
# 服务层契约
# ------------------------------------------------------------------


def test_import_forms_returns_created_target_ids_in_creation_order(tmp_path: Path, session: Session) -> None:
    """多表单导入按创建顺序返回目标项目新行 id，数量与 count 一致。"""
    template_path, src_project_id, src_form_ids = build_template_db(
        tmp_path,
        forms=[("知情同意", 1), ("生命体征", 2)],
    )
    target_project = create_project(session, name="目标项目")

    summary = ImportService(session).import_forms(
        target_project_id=target_project.id,
        template_path=str(template_path),
        source_project_id=src_project_id,
        form_ids=src_form_ids,
    )
    session.flush()

    imported_ids = summary["imported_form_ids"]
    assert summary["imported_form_count"] == 2
    assert len(imported_ids) == 2
    target_forms = session.query(Form).filter(Form.project_id == target_project.id).order_by(Form.order_index).all()
    assert imported_ids == [form.id for form in target_forms]
    assert {form.name for form in target_forms} == {"知情同意", "生命体征"}


def test_import_form_ids_reference_new_target_rows_not_source_ids(tmp_path: Path, session: Session) -> None:
    """返回 id 是目标项目本次持久化的新行，而非源模板 id 或既有行 id。"""
    template_path, src_project_id, src_form_ids = build_template_db(tmp_path, forms=[("导入源表单", 1)])
    target_project = create_project(session, name="目标项目")
    pre_existing = create_form(session, target_project.id, name="既有表单")
    pre_existing_ids = {pre_existing.id}

    summary = ImportService(session).import_forms(
        target_project_id=target_project.id,
        template_path=str(template_path),
        source_project_id=src_project_id,
        form_ids=src_form_ids,
    )
    session.flush()

    imported_ids = summary["imported_form_ids"]
    assert len(imported_ids) == 1
    new_id = imported_ids[0]
    assert new_id not in pre_existing_ids, "不得指向目标项目既有行"
    row = session.get(Form, new_id)
    assert row is not None
    assert row.project_id == target_project.id
    assert row.name == "导入源表单", "id 必须解析为本次导入的新行；若回显源模板 id 只会命中既有行"
    assert session.get(Form, pre_existing.id).name == "既有表单"
    assert session.query(Form).filter(Form.project_id == target_project.id).count() == 2


def test_import_forms_renamed_collision_returns_new_row_id(tmp_path: Path, session: Session) -> None:
    """同名冲突重命名导入时，返回重命名后新行的 id，而非既有同名行。"""
    template_path, src_project_id, src_form_ids = build_template_db(tmp_path, forms=[("筛选表", 1)])
    target_project = create_project(session, name="目标项目")
    existing_same_name = create_form(session, target_project.id, name="筛选表")

    summary = ImportService(session).import_forms(
        target_project_id=target_project.id,
        template_path=str(template_path),
        source_project_id=src_project_id,
        form_ids=src_form_ids,
    )
    session.flush()

    imported_ids = summary["imported_form_ids"]
    assert summary["imported_form_count"] == 1
    assert summary["renamed_forms"], "同名导入应产生重命名记录"
    assert len(imported_ids) == 1
    assert imported_ids[0] != existing_same_name.id
    new_row = session.get(Form, imported_ids[0])
    assert new_row is not None
    assert new_row.project_id == target_project.id
    assert new_row.name != "筛选表"


def test_import_forms_zero_imports_returns_empty_id_list(tmp_path: Path, session: Session) -> None:
    """零导入（源 id 均不存在）时 count 为 0 且 id 列表为空。"""
    template_path, src_project_id, _src_form_ids = build_template_db(tmp_path, forms=[("知情同意", 1)])
    target_project = create_project(session, name="目标项目")

    summary = ImportService(session).import_forms(
        target_project_id=target_project.id,
        template_path=str(template_path),
        source_project_id=src_project_id,
        form_ids=[99999],
    )

    assert summary["imported_form_count"] == 0
    assert summary["imported_form_ids"] == []


def test_import_execute_response_defaults_ids_for_legacy_construction() -> None:
    """旧构造路径（不带新字段）保持兼容，且默认列表为每次实例独立的空列表。"""
    legacy_kwargs = {
        "imported_form_count": 1,
        "renamed_forms": [],
        "merged_codelists": 0,
        "merged_units": 0,
        "created_field_definitions": 0,
        "created_form_fields": 0,
    }
    response = ImportExecuteResponse(**legacy_kwargs)
    assert response.imported_form_ids == []

    other = ImportExecuteResponse(**legacy_kwargs)
    other.imported_form_ids.append(42)
    assert response.imported_form_ids == [], "默认列表不得跨实例共享"


# ------------------------------------------------------------------
# HTTP 序列化契约（防响应模型静默丢弃服务层新字段）
# ------------------------------------------------------------------


def test_execute_import_response_contains_imported_form_ids(
    tmp_path: Path,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST execute 的响应体必须包含与库中实际新行一致的 imported_form_ids。"""
    template_path, src_project_id, src_form_ids = build_template_db(
        tmp_path,
        forms=[("知情同意", 1), ("生命体征", 2)],
    )
    fake_config = SimpleNamespace(
        template_path=str(template_path),
        db_path=str(tmp_path / "crf_editor.db"),
        upload_path=str(tmp_path / "uploads"),
    )
    monkeypatch.setattr(import_template_router, "get_config", lambda: fake_config)
    monkeypatch.setattr("src.services.import_service.get_config", lambda: fake_config)

    token = login_as(client, "alice")
    resp = client.post(
        "/api/projects",
        json={"name": "HTTP目标项目", "version": "1.0"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    target_project_id = resp.json()["id"]

    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={"source_project_id": src_project_id, "form_ids": src_form_ids},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["imported_form_count"] == 2
    assert len(body["imported_form_ids"]) == 2

    with _override_session_fixture(client) as db_session:
        rows = (
            db_session.query(Form)
            .filter(Form.project_id == target_project_id, Form.id.in_(body["imported_form_ids"]))
            .all()
        )
        assert len(rows) == 2
        assert {row.project_id for row in rows} == {target_project_id}
        assert {row.name for row in rows} == {"知情同意", "生命体征"}


def _override_session_fixture(client: TestClient):
    from tests.helpers import _override_session

    return _override_session(client)
