"""机构预设 API：管理员 CRUD、普通用户只读候选、权限、Logo、补偿事务。"""

from types import SimpleNamespace

import pytest
from sqlalchemy import select

from helpers import auth_headers, login_as, seed_user
from src.models.organization_preset import OrganizationPreset
from src.services import logo_storage_service as storage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _metadata(name: str, unit: str | None = None, **extra):
    data = {"name": name}
    if unit is not None:
        data["data_management_unit"] = unit
    data.update(extra)
    return data


def _multipart(metadata: dict, logo_action="keep", file=None, preset_id=None):
    payload = {"metadata": __import__("json").dumps(metadata), "logo_action": logo_action}
    if preset_id is not None:
        payload["preset_id"] = str(preset_id)
    files = None
    if file is not None:
        files = {"file": ("logo.png", file, "image/png")}
    return payload, files


@pytest.fixture(autouse=True)
def _patch_upload_path(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "get_config", lambda: SimpleNamespace(upload_path=str(tmp_path)))


# ---- 管理员 CRUD ----


def test_admin_creates_preset_with_unit(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("武汉知止", "武汉知止医药科技有限公司"))
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "武汉知止"
    assert body["data_management_unit"] == "武汉知止医药科技有限公司"


def test_admin_creates_preset_trims_and_normalizes_blank_unit(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("  机构A  ", "   "))
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "机构A"
    assert body["data_management_unit"] is None


def test_admin_create_duplicate_name_returns_409(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("武汉知止", "单位A"))
    assert (
        client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token)
        ).status_code
        == 201
    )
    payload, files = _multipart(_metadata("武汉知止", "单位B"))
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token))
    assert resp.status_code == 409, resp.text
    assert "机构名称已存在" in resp.json()["detail"]


def test_admin_create_duplicate_unit_returns_409_nocase(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("机构一", "数据管理部"))
    assert (
        client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token)
        ).status_code
        == 201
    )
    payload, files = _multipart(_metadata("机构二", "数据管理部"))
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token))
    assert resp.status_code == 409, resp.text
    assert "单位已存在" in resp.json()["detail"]


def test_admin_list_sorted_by_name_nocase(client):
    token = login_as(client, "admin")
    for name, unit in [("Beta", "B"), ("alpha", "A"), ("Gamma", "G")]:
        payload, files = _multipart(_metadata(name, unit))
        assert (
            client.post(
                "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token)
            ).status_code
            == 201
        )
    resp = client.get("/api/admin/organization-presets", headers=auth_headers(token))
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()] == ["alpha", "Beta", "Gamma"]


def test_admin_update_preset(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("旧名", "旧单位"))
    preset_id = client.post(
        "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token)
    ).json()["id"]
    payload, files = _multipart(_metadata("新名", "新单位"))
    resp = client.put(
        f"/api/admin/organization-presets/{preset_id}", data=payload, files=files, headers=auth_headers(token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "新名"
    assert resp.json()["data_management_unit"] == "新单位"


def test_admin_delete_preset_removes_row(client):
    token = login_as(client, "admin")
    payload, files = _multipart(_metadata("待删", "单位"))
    preset_id = client.post(
        "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(token)
    ).json()["id"]
    resp = client.delete(f"/api/admin/organization-presets/{preset_id}", headers=auth_headers(token))
    assert resp.status_code == 204, resp.text
    assert client.get("/api/admin/organization-presets", headers=auth_headers(token)).json() == []


# ---- 权限 ----


def test_presets_require_login(client):
    resp = client.get("/api/organization-presets")
    assert resp.status_code == 401


def test_admin_presets_reject_regular_user(client):
    token = login_as(client, "alice")
    resp = client.get("/api/admin/organization-presets", headers=auth_headers(token))
    assert resp.status_code == 403


def test_regular_user_candidates_hide_org_name_and_path(client):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("内部机构名", "展示单位"))
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token))
    assert resp.status_code == 201, resp.text
    user_token = login_as(client, "alice")
    resp = client.get("/api/organization-presets", headers=auth_headers(user_token))
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert set(items[0].keys()) == {"id", "data_management_unit", "has_logo"}
    assert items[0]["data_management_unit"] == "展示单位"
    assert "内部机构名" not in resp.text


def test_regular_user_candidates_exclude_empty_units(client):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("有单位", "展示单位"))
    assert (
        client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
        ).status_code
        == 201
    )
    payload, files = _multipart(_metadata("无单位", None))
    assert (
        client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
        ).status_code
        == 201
    )
    user_token = login_as(client, "alice")
    items = client.get("/api/organization-presets", headers=auth_headers(user_token)).json()
    assert len(items) == 1
    assert items[0]["data_management_unit"] == "展示单位"


def test_preset_logo_get_requires_login_and_owner_read(client, tmp_path):
    token = login_as(client, "alice")
    resp = client.get("/api/organization-presets/1/logo")
    assert resp.status_code == 401
    resp = client.get("/api/organization-presets/999/logo", headers=auth_headers(token))
    assert resp.status_code == 404


def test_preset_logo_upload_and_get(client, tmp_path):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("带Logo机构", "单位X"), logo_action="upload", file=PNG)
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token))
    assert resp.status_code == 201, resp.text
    preset = resp.json()
    assert preset["logo_path"] is not None
    assert preset["logo_path"].startswith("uploads/organization-logos/") or "/" not in preset["logo_path"]

    user_token = login_as(client, "alice")
    logo_resp = client.get(f"/api/organization-presets/{preset['id']}/logo", headers=auth_headers(user_token))
    assert logo_resp.status_code == 200
    assert logo_resp.content == PNG

    candidates = client.get("/api/organization-presets", headers=auth_headers(user_token)).json()
    assert candidates[0]["has_logo"] is True


def test_preset_logo_clear_on_update(client, tmp_path):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("清Logo机构", "单位Y"), logo_action="upload", file=PNG)
    preset_id = client.post(
        "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
    ).json()["id"]
    payload, files = _multipart(_metadata("清Logo机构", "单位Y"), logo_action="clear")
    resp = client.put(
        f"/api/admin/organization-presets/{preset_id}", data=payload, files=files, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["logo_path"] is None
    user_token = login_as(client, "alice")
    assert (
        client.get(f"/api/organization-presets/{preset_id}/logo", headers=auth_headers(user_token)).status_code == 404
    )
    # 旧文件被清理
    assert not list((tmp_path / "organization-logos").glob("*.png"))


def test_preset_upload_rejects_svg(client):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("坏图机构", "单位Z"), logo_action="upload", file=b"<svg></svg>")
    resp = client.post("/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token))
    assert resp.status_code == 400, resp.text
    assert "SVG/XML" in resp.json()["detail"]


def test_delete_preset_removes_logo_file(client, tmp_path):
    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("删Logo", "单位D"), logo_action="upload", file=PNG)
    preset_id = client.post(
        "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
    ).json()["id"]
    assert (
        client.delete(f"/api/admin/organization-presets/{preset_id}", headers=auth_headers(admin_token)).status_code
        == 204
    )
    assert not list((tmp_path / "organization-logos").glob("*"))


# ---- 真实路由路径的提交失败补偿（get_session 已开事务，_tx 必须显式 commit）----


def test_preset_update_commit_failure_keeps_old_file_and_cleans_new(client, tmp_path, monkeypatch):
    from sqlalchemy.orm import SessionTransaction

    admin_token = login_as(client, "admin")
    payload, files = _multipart(_metadata("带Logo机构", "单位U"), logo_action="upload", file=PNG)
    preset_id = client.post(
        "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
    ).json()["id"]
    old_files = list((tmp_path / "organization-logos").glob("*.png"))
    assert len(old_files) == 1

    real_commit = SessionTransaction.commit
    calls = {"n": 0}

    def _boom_once(self, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("注入的提交故障")
        return real_commit(self, *args, **kwargs)

    monkeypatch.setattr(SessionTransaction, "commit", _boom_once)
    try:
        payload, files = _multipart(_metadata("带Logo机构", "单位V"), logo_action="upload", file=PNG)
        resp = client.put(
            f"/api/admin/organization-presets/{preset_id}", data=payload, files=files, headers=auth_headers(admin_token)
        )
    finally:
        monkeypatch.setattr(SessionTransaction, "commit", real_commit)
    assert resp.status_code == 500, resp.text
    # DB 回滚：单位未变；旧文件保留、新文件已清理
    rows = client.get("/api/admin/organization-presets", headers=auth_headers(admin_token)).json()
    assert rows[0]["data_management_unit"] == "单位U"
    assert list((tmp_path / "organization-logos").glob("*.png")) == old_files


def test_preset_create_commit_failure_cleans_new_file(client, tmp_path, monkeypatch):
    from sqlalchemy.orm import SessionTransaction

    admin_token = login_as(client, "admin")
    real_commit = SessionTransaction.commit
    calls = {"n": 0}

    def _boom_once(self, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("注入的提交故障")
        return real_commit(self, *args, **kwargs)

    monkeypatch.setattr(SessionTransaction, "commit", _boom_once)
    try:
        payload, files = _multipart(_metadata("失败机构", "单位F"), logo_action="upload", file=PNG)
        resp = client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
        )
    finally:
        monkeypatch.setattr(SessionTransaction, "commit", real_commit)
    assert resp.status_code == 500, resp.text
    # 行未写入、新文件被清理
    assert client.get("/api/admin/organization-presets", headers=auth_headers(admin_token)).json() == []
    assert not list((tmp_path / "organization-logos").glob("*"))


def test_preset_create_commit_conflict_maps_to_409(client, tmp_path, monkeypatch):
    """commit 阶段的唯一约束冲突（并发窗口）映射为稳定 409 而非裸 500。"""
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import SessionTransaction

    admin_token = login_as(client, "admin")
    real_commit = SessionTransaction.commit
    calls = {"n": 0}

    def _conflict_once(self, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed"))
        return real_commit(self, *args, **kwargs)

    monkeypatch.setattr(SessionTransaction, "commit", _conflict_once)
    try:
        payload, files = _multipart(_metadata("冲突机构", "单位C"), logo_action="upload", file=PNG)
        resp = client.post(
            "/api/admin/organization-presets", data=payload, files=files, headers=auth_headers(admin_token)
        )
    finally:
        monkeypatch.setattr(SessionTransaction, "commit", real_commit)
    assert resp.status_code == 409, resp.text
    assert "已存在" in resp.json()["detail"]
    assert not list((tmp_path / "organization-logos").glob("*"))
