"""模板字段查询（GET /api/template-fields）服务与路由测试。"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from helpers import auth_headers, login_as
from src.models import Base
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.routers import template_fields as template_fields_router
from src.services import import_service as import_service_module
from src.services.template_field_index_service import build_template_field_index


@pytest.fixture(autouse=True)
def template_whitelist(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """把模板路径白名单固定到 tmp_path（db 父目录 + uploads 目录）。"""
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    fake_config = SimpleNamespace(
        db_path=str(tmp_path / "crf_editor.db"),
        upload_path=str(upload_dir),
    )
    monkeypatch.setattr(import_service_module, "get_config", lambda: fake_config)
    return fake_config


def _build_search_template(tmp_path: Path) -> Path:
    """构造覆盖各分支的模板库：双活项目 + 软删项目 + 各字段类型与合并场景。"""
    db_path = tmp_path / "template_search.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        project_a = Project(name="模板项目A", version="v1.0")
        project_b = Project(name="模板项目B", version="v2.0")
        project_c = Project(name="已删项目", version="v0.1", deleted_at=datetime.now())
        session.add_all([project_a, project_b, project_c])
        session.flush()

        form_a1 = Form(project_id=project_a.id, name="随访表", code="FA1", order_index=1)
        form_a2 = Form(project_id=project_a.id, name="第二表单", code="FA2", order_index=2)
        form_b1 = Form(project_id=project_b.id, name="入组表", code="FB1", order_index=1)
        form_c1 = Form(project_id=project_c.id, name="删除项目表单", code="FC1", order_index=1)
        session.add_all([form_a1, form_a2, form_b1, form_c1])
        session.flush()

        unit_a = Unit(project_id=project_a.id, symbol="cm", code="UNIT_CM", order_index=1)
        unit_b = Unit(project_id=project_b.id, symbol="kg", code="UNIT_KG", order_index=1)
        session.add_all([unit_a, unit_b])
        session.flush()

        codelist = CodeList(project_id=project_a.id, name="性别", code="CL_SEX", order_index=1)
        session.add(codelist)
        session.flush()
        session.add_all(
            [
                CodeListOption(codelist_id=codelist.id, code="1", decode="男", order_index=1),
                CodeListOption(codelist_id=codelist.id, code="2", decode="女", order_index=2),
            ]
        )
        session.flush()

        num_a = FieldDefinition(
            project_id=project_a.id, variable_name="NUMBER_A", label="身高",
            field_type="数值", integer_digits=3, decimal_digits=1,
            unit_id=unit_a.id, order_index=10,
        )
        date_a = FieldDefinition(
            project_id=project_a.id, variable_name="DATE_A", label="访视日期",
            field_type="日期", order_index=20,
        )
        choice_a = FieldDefinition(
            project_id=project_a.id, variable_name="CHOICE_A", label="性别",
            field_type="单选", codelist_id=codelist.id, order_index=30,
        )
        check_a = FieldDefinition(
            project_id=project_a.id, variable_name="CHECK_A", label="知情同意",
            field_type="复选", checkbox_label="", order_index=40,
        )
        label_a = FieldDefinition(
            project_id=project_a.id, variable_name="FIELD_20260930120000_ABCDEF",
            label="标签字段", field_type="标签", order_index=50,
        )
        dup_a = FieldDefinition(
            project_id=project_a.id, variable_name="DUP_FIELD", label="共享字段",
            field_type="文本", order_index=60,
        )
        same_a = FieldDefinition(
            project_id=project_a.id, variable_name="SAME_1", label="同名字段",
            field_type="数值", integer_digits=2, decimal_digits=0, order_index=70,
        )
        lib_only = FieldDefinition(
            project_id=project_a.id, variable_name="LIB_ONLY", label="库内字段",
            field_type="文本", order_index=80,
        )
        del_c = FieldDefinition(
            project_id=project_c.id, variable_name="DEL_FIELD", label="已删字段",
            field_type="文本", order_index=10,
        )
        dup_b = FieldDefinition(
            project_id=project_b.id, variable_name="DUP_FIELD", label="共享字段",
            field_type="文本", order_index=10,
        )
        same_b = FieldDefinition(
            project_id=project_b.id, variable_name="SAME_2", label="同名字段",
            field_type="数值", integer_digits=3, decimal_digits=1, order_index=20,
        )
        session.add_all(
            [num_a, date_a, choice_a, check_a, label_a, dup_a, same_a, lib_only,
             del_c, dup_b, same_b]
        )
        session.flush()

        session.add_all(
            [
                FormField(form_id=form_a1.id, field_definition_id=num_a.id, order_index=10, label_override="身高"),
                FormField(form_id=form_a1.id, field_definition_id=date_a.id, order_index=20),
                FormField(form_id=form_a1.id, field_definition_id=choice_a.id, order_index=30, label_override="受试者性别"),
                FormField(form_id=form_a1.id, field_definition_id=check_a.id, order_index=40, label_override="   "),
                FormField(form_id=form_a2.id, field_definition_id=None, is_log_row=1, order_index=10),
                FormField(form_id=form_a2.id, field_definition_id=label_a.id, order_index=20),
                FormField(form_id=form_a2.id, field_definition_id=dup_a.id, order_index=30),
                FormField(form_id=form_a2.id, field_definition_id=same_a.id, order_index=40),
                FormField(form_id=form_b1.id, field_definition_id=dup_b.id, order_index=10),
                FormField(form_id=form_b1.id, field_definition_id=same_b.id, order_index=20),
                FormField(form_id=form_c1.id, field_definition_id=del_c.id, order_index=10),
            ]
        )
        session.commit()

    engine.dispose()
    return db_path


def _find_entry(entries: list[dict], variable_name: str) -> dict:
    matches = [entry for entry in entries if entry["variable_name"] == variable_name]
    assert len(matches) == 1, f"expected exactly one entry for {variable_name}: {matches}"
    return matches[0]


# ---------------------------------------------------------------- 服务层


def test_service_returns_attributes_and_ordered_options(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    number = _find_entry(entries, "NUMBER_A")
    assert number["label"] == "身高"
    assert number["field_type"] == "数值"
    assert number["integer_digits"] == 3
    assert number["decimal_digits"] == 1
    assert number["unit_symbol"] == "cm"

    choice = _find_entry(entries, "CHOICE_A")
    assert choice["codelist_name"] == "性别"
    assert choice["options"] == [
        {"code": "1", "decode": "男"},
        {"code": "2", "decode": "女"},
    ]

    date = _find_entry(entries, "DATE_A")
    assert date["date_format"] is None

    check = _find_entry(entries, "CHECK_A")
    assert check["checkbox_label"] is None


def test_service_excludes_label_definitions_and_log_rows(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    variable_names = {entry["variable_name"] for entry in entries}
    assert "FIELD_20260930120000_ABCDEF" not in variable_names
    assert all(entry["field_type"] != "标签" for entry in entries)


def test_service_excludes_soft_deleted_project_definitions(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    assert _find_entry(entries, "NUMBER_A") is not None
    variable_names = {entry["variable_name"] for entry in entries}
    assert "DEL_FIELD" not in variable_names
    for entry in entries:
        for source in entry["sources"]:
            assert source["project_name"] != "已删项目"


def test_service_merges_identical_definitions_in_template_order(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    merged = [entry for entry in entries if entry["variable_name"] == "DUP_FIELD"]
    assert len(merged) == 1
    sources = merged[0]["sources"]
    assert [
        (source["project_name"], source["project_version"], source["form_name"])
        for source in sources
    ] == [
        ("模板项目A", "v1.0", "第二表单"),
        ("模板项目B", "v2.0", "入组表"),
    ]


def test_service_keeps_same_label_rows_separate_when_oid_or_format_differs(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    same_label = [entry for entry in entries if entry["label"] == "同名字段"]
    assert len(same_label) == 2
    assert {entry["variable_name"] for entry in same_label} == {"SAME_1", "SAME_2"}
    by_name = {entry["variable_name"]: entry for entry in same_label}
    assert (by_name["SAME_1"]["integer_digits"], by_name["SAME_1"]["decimal_digits"]) == (2, 0)
    assert (by_name["SAME_2"]["integer_digits"], by_name["SAME_2"]["decimal_digits"]) == (3, 1)


def test_service_library_only_definition_has_no_form_name(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    entry = _find_entry(entries, "LIB_ONLY")
    assert entry["sources"] == [
        {
            "project_name": "模板项目A",
            "project_version": "v1.0",
            "form_name": None,
            "display_label": None,
        }
    ]


def test_service_label_override_becomes_display_label_and_aliases(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    choice = _find_entry(entries, "CHOICE_A")
    assert choice["sources"][0]["display_label"] == "受试者性别"
    assert choice["label_aliases"] == ["受试者性别"]

    number = _find_entry(entries, "NUMBER_A")
    assert number["sources"][0]["display_label"] is None
    assert number["label_aliases"] == []

    check = _find_entry(entries, "CHECK_A")
    assert check["sources"][0]["display_label"] is None
    assert check["label_aliases"] == []


def test_service_entry_order_is_project_form_field_then_library_only(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)

    entries = build_template_field_index(str(db_path))

    assert [entry["variable_name"] for entry in entries] == [
        "NUMBER_A",
        "DATE_A",
        "CHOICE_A",
        "CHECK_A",
        "DUP_FIELD",
        "SAME_1",
        "SAME_2",
        "LIB_ONLY",
    ]
    keys = [entry["key"] for entry in entries]
    assert all(re.fullmatch(r"\d+:\d+", key) for key in keys)
    assert len(set(keys)) == len(keys)


def test_service_legacy_template_without_optional_columns(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("ALTER TABLE project DROP COLUMN deleted_at")
        conn.execute("ALTER TABLE form_field DROP COLUMN label_override")
        conn.execute("ALTER TABLE field_definition DROP COLUMN checkbox_label")
        conn.commit()
    finally:
        conn.close()

    entries = build_template_field_index(str(db_path))

    # 缺少 deleted_at 列时所有项目都视为有效，已删项目字段随之出现。
    assert [entry["variable_name"] for entry in entries] == [
        "NUMBER_A",
        "DATE_A",
        "CHOICE_A",
        "CHECK_A",
        "DUP_FIELD",
        "SAME_1",
        "SAME_2",
        "DEL_FIELD",
        "LIB_ONLY",
    ]
    choice = _find_entry(entries, "CHOICE_A")
    assert choice["label_aliases"] == []
    assert choice["checkbox_label"] is None
    deleted = _find_entry(entries, "DEL_FIELD")
    assert deleted["sources"][0]["form_name"] == "删除项目表单"


def test_service_does_not_modify_template_bytes(tmp_path: Path) -> None:
    db_path = _build_search_template(tmp_path)
    before = db_path.read_bytes()

    build_template_field_index(str(db_path))

    assert db_path.read_bytes() == before


# ---------------------------------------------------------------- 路由层


def _patch_template_path(monkeypatch: pytest.MonkeyPatch, template_path: str) -> None:
    monkeypatch.setattr(
        template_fields_router,
        "get_config",
        lambda: SimpleNamespace(template_path=template_path),
    )


def test_router_returns_200_for_regular_user_without_project(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = _build_search_template(tmp_path)
    _patch_template_path(monkeypatch, str(db_path))
    token = login_as(client, "template-search-user")

    resp = client.get("/api/template-fields", headers=auth_headers(token))

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert set(payload.keys()) == {"entries"}
    entry_keys = {
        "key", "variable_name", "label", "field_type", "integer_digits",
        "decimal_digits", "date_format", "checkbox_label", "codelist_name",
        "options", "unit_symbol", "label_aliases", "sources",
    }
    first = payload["entries"][0]
    assert set(first.keys()) == entry_keys
    assert set(first["sources"][0].keys()) == {
        "project_name", "project_version", "form_name", "display_label",
    }
    assert [entry["variable_name"] for entry in payload["entries"]][0] == "NUMBER_A"


def test_router_returns_401_without_token(client: TestClient) -> None:
    resp = client.get("/api/template-fields")

    assert resp.status_code == 401


def test_router_returns_400_when_template_not_configured(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_template_path(monkeypatch, "")
    token = login_as(client, "template-search-user")

    resp = client.get("/api/template-fields", headers=auth_headers(token))

    assert resp.status_code == 400
    assert "未配置模板库" in resp.json()["detail"]


def test_router_returns_404_when_template_file_missing(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    missing_path = tmp_path / "missing_template.db"
    _patch_template_path(monkeypatch, str(missing_path))
    token = login_as(client, "template-search-user")

    resp = client.get("/api/template-fields", headers=auth_headers(token))

    assert resp.status_code == 404
    assert str(missing_path) not in resp.text
    assert "模板文件不存在" in resp.json()["detail"]


def test_router_returns_400_for_invalid_template_path(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    text_path = tmp_path / "not_a_template.txt"
    text_path.write_text("placeholder", encoding="utf-8")
    # 白名单 = tmp_path（db 父目录）+ tmp_path/uploads；同级路径在白名单之外。
    outside_db = tmp_path.parent / f"{tmp_path.name}-outside.db"
    outside_db.write_bytes(b"")
    token = login_as(client, "template-search-user")

    try:
        _assert_invalid_path_rejected(client, monkeypatch, str(text_path))
        _assert_invalid_path_rejected(client, monkeypatch, str(outside_db))
    finally:
        outside_db.unlink(missing_ok=True)


def _assert_invalid_path_rejected(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    invalid_path: str,
) -> None:
    token = login_as(client, "template-search-user")
    _patch_template_path(monkeypatch, invalid_path)
    resp = client.get("/api/template-fields", headers=auth_headers(token))
    assert resp.status_code == 400, resp.text
    assert "模板路径无效" in resp.json()["detail"]
    assert invalid_path not in resp.text


def test_router_returns_400_with_code_for_incompatible_template(
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = _build_search_template(tmp_path)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("ALTER TABLE form_field DROP COLUMN is_log_row")
        conn.commit()
    finally:
        conn.close()
    _patch_template_path(monkeypatch, str(db_path))
    token = login_as(client, "template-search-user")

    resp = client.get("/api/template-fields", headers=auth_headers(token))

    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "TEMPLATE_INCOMPATIBLE"
    assert "模板库不兼容" in body["detail"]
