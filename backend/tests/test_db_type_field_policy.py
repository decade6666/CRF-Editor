"""数据库类型（db_type）与多选字段类型管控。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.database import _migrate_add_project_db_type, get_session
from src.models.field_definition import FieldDefinition
from src.services.field_type_policy import (
    MULTISELECT_REJECT_MSG,
    allows_multiselect,
    is_multiselect_field_type,
)
from src.services.docx_import_service import (
    _split_multiselect_field,
    _split_multiselect_fields,
)


def test_field_type_policy_helpers():
    assert allows_multiselect("赛美斯") is True
    assert allows_multiselect("其他") is False
    assert allows_multiselect(None) is False
    assert is_multiselect_field_type("多选") is True
    assert is_multiselect_field_type("多选（纵向）") is True
    assert is_multiselect_field_type("单选") is False


def test_migrate_add_project_db_type_backfills_and_is_idempotent(tmp_path: Path):
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL)"
    )
    conn.execute("INSERT INTO project (id, name, version) VALUES (1, 'P', '1.0')")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db_path}")
    _migrate_add_project_db_type(engine)
    _migrate_add_project_db_type(engine)

    cols = {c["name"] for c in inspect(engine).get_columns("project")}
    assert "db_type" in cols
    with engine.connect() as c:
        row = c.execute(text("SELECT db_type FROM project WHERE id=1")).fetchone()
        assert row[0] == "其他"
    engine.dispose()


def test_create_project_defaults_db_type_other(client):
    token = login_as(client, "alice")
    r = client.post(
        "/api/projects",
        json={"name": "DBT", "version": "1.0"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201, r.text
    assert r.json()["db_type"] == "其他"


def test_create_project_with_saimeisi_and_update_roundtrip(client):
    token = login_as(client, "alice")
    r = client.post(
        "/api/projects",
        json={"name": "S", "version": "1.0", "db_type": "赛美斯"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["db_type"] == "赛美斯"

    r2 = client.put(
        f"/api/projects/{pid}",
        json={"name": "S", "version": "1.0", "db_type": "其他"},
        headers=auth_headers(token),
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["db_type"] == "其他"

    r3 = client.get(f"/api/projects/{pid}", headers=auth_headers(token))
    assert r3.status_code == 200
    assert r3.json()["db_type"] == "其他"


def test_reject_invalid_db_type(client):
    token = login_as(client, "alice")
    r = client.post(
        "/api/projects",
        json={"name": "X", "version": "1.0", "db_type": "未知库"},
        headers=auth_headers(token),
    )
    assert r.status_code == 422


def test_other_project_rejects_create_multiselect(client):
    token = login_as(client, "alice")
    proj = client.post(
        "/api/projects",
        json={"name": "O", "version": "1.0", "db_type": "其他"},
        headers=auth_headers(token),
    ).json()
    r = client.post(
        f"/api/projects/{proj['id']}/field-definitions",
        json={"variable_name": "MS1", "label": "多选字段", "field_type": "多选"},
        headers=auth_headers(token),
    )
    assert r.status_code == 400, r.text
    assert "多选" in r.json()["detail"]


def test_saimeisi_project_allows_create_multiselect(client):
    token = login_as(client, "alice")
    proj = client.post(
        "/api/projects",
        json={"name": "S2", "version": "1.0", "db_type": "赛美斯"},
        headers=auth_headers(token),
    ).json()
    r = client.post(
        f"/api/projects/{proj['id']}/field-definitions",
        json={"variable_name": "MS2", "label": "多选字段", "field_type": "多选"},
        headers=auth_headers(token),
    )
    assert r.status_code == 201, r.text


def test_idempotent_put_on_legacy_multiselect_in_other_project(client):
    """存量多选字段仅改标签时 PUT 必须成功（field_type 未变）。"""
    token = login_as(client, "alice")
    headers = auth_headers(token)
    proj = client.post(
        "/api/projects",
        json={"name": "Legacy", "version": "1.0", "db_type": "其他"},
        headers=headers,
    ).json()

    override = client.app.dependency_overrides.get(get_session)
    assert override is not None
    session_iter = override()
    session: Session = next(session_iter)
    try:
        fd = FieldDefinition(
            project_id=proj["id"],
            variable_name="LEGACY_MS",
            label="旧多选",
            field_type="多选",
            order_index=1,
        )
        session.add(fd)
        session.flush()
        fd_id = fd.id
    finally:
        try:
            next(session_iter)
        except StopIteration:
            pass

    r = client.put(
        f"/api/projects/{proj['id']}/field-definitions/{fd_id}",
        json={
            "variable_name": "LEGACY_MS",
            "label": "新名",
            "field_type": "多选",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "新名"
    assert r.json()["field_type"] == "多选"

    r2 = client.put(
        f"/api/projects/{proj['id']}/field-definitions/{fd_id}",
        json={"field_type": "单选"},
        headers=headers,
    )
    assert r2.status_code == 200, r2.text

    r3 = client.put(
        f"/api/projects/{proj['id']}/field-definitions/{fd_id}",
        json={"field_type": "多选"},
        headers=headers,
    )
    assert r3.status_code == 400, r3.text
    assert MULTISELECT_REJECT_MSG in r3.json()["detail"] or "多选" in r3.json()["detail"]


def test_split_multiselect_vertical_three_options():
    field = {
        "label": "症状",
        "field_type": "多选",
        "options": [
            {"decode": "头痛"},
            {"decode": "发热"},
            {"decode": "咳嗽"},
        ],
    }
    out = _split_multiselect_field(field)
    assert [f["field_type"] for f in out] == ["标签", "复选", "复选", "复选"]
    assert [f["label"] for f in out] == ["症状", "头痛", "发热", "咳嗽"]
    for f in out:
        assert "options" not in f
        assert "checkbox_label" not in f
        assert "inline_mark" not in f


def test_split_multiselect_inline_two_options():
    field = {
        "label": "异常解释",
        "field_type": "多选（纵向）",
        "inline_mark": True,
        "options": [
            {"decode": "病史"},
            {"decode": "用药"},
        ],
    }
    out = _split_multiselect_field(field)
    assert len(out) == 2
    assert all(f["field_type"] == "复选" for f in out)
    assert all(f.get("inline_mark") is True for f in out)
    assert [f["label"] for f in out] == ["异常解释-病史", "异常解释-用药"]
    assert not any(f["field_type"] == "标签" for f in out)


def test_split_passthrough_non_multi_and_log_row():
    fields = [
        {"type": "log_row"},
        {"label": "姓名", "field_type": "文本"},
        {"label": "性别", "field_type": "单选", "options": [{"decode": "男"}]},
    ]
    out = _split_multiselect_fields(fields)
    assert out == fields


def test_split_empty_options_fallback():
    vertical = _split_multiselect_field({"label": "空多选", "field_type": "多选", "options": []})
    assert vertical == [{"label": "空多选", "field_type": "标签"}]
    inline = _split_multiselect_field(
        {"label": "空内联", "field_type": "多选", "inline_mark": True, "options": []}
    )
    assert inline == [{"label": "空内联", "field_type": "文本", "inline_mark": True}]


def test_split_inline_label_truncated():
    long_stem = "A" * 200
    long_opt = "B" * 100
    out = _split_multiselect_field(
        {
            "label": long_stem,
            "field_type": "多选",
            "inline_mark": True,
            "options": [{"decode": long_opt}],
        }
    )
    assert len(out[0]["label"]) <= 255


def test_split_deterministic():
    field = {
        "label": "症状",
        "field_type": "多选",
        "options": [{"decode": "A"}, {"decode": "B"}],
    }
    a = _split_multiselect_fields([field])
    b = _split_multiselect_fields([field])
    assert a == b
