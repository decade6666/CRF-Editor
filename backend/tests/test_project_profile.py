"""项目 profile 原子端点：metadata + logo_action 四态、快照复制、失败补偿。"""
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from helpers import auth_headers, login_as
from src.models.organization_preset import OrganizationPreset
from src.models.project import Project
from src.services import logo_storage_service as storage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _metadata(**overrides):
    data = {
        "name": "通用表单",
        "version": "2.0",
        "db_type": "其他",
        "trial_name": "测试项目",
    }
    data.update(overrides)
    return data


def _put_profile(client, token, project_id, metadata, logo_action="keep", file=None, preset_id=None):
    payload = {"metadata": json.dumps(metadata), "logo_action": logo_action}
    if preset_id is not None:
        payload["preset_id"] = str(preset_id)
    files = {"file": ("logo.png", file, "image/png")} if file is not None else None
    return client.put(f"/api/projects/{project_id}/profile", data=payload, files=files, headers=auth_headers(token))


@pytest.fixture(autouse=True)
def _patch_upload_path(tmp_path, monkeypatch):
    monkeypatch.setattr(
        storage, "get_config", lambda: SimpleNamespace(upload_path=str(tmp_path))
    )


def _create_preset_with_logo(client, token, tmp_path, name="预设机构", unit="展示单位"):
    payload = {"metadata": json.dumps({"name": name, "data_management_unit": unit}), "logo_action": "upload"}
    resp = client.post(
        "/api/admin/organization-presets",
        data=payload,
        files={"file": ("logo.png", PNG, "image/png")},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_profile_keep_updates_metadata_only(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(trial_name="改名后"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["trial_name"] == "改名后"
    assert body["company_logo_path"] is None


def test_profile_upload_sets_logo(client, engine, tmp_path):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="upload", file=PNG)
    assert resp.status_code == 200, resp.text
    logo_path = resp.json()["company_logo_path"]
    assert logo_path and logo_path.endswith(".png")
    assert (tmp_path / "logos" / logo_path).read_bytes() == PNG
    # GET logo 可读
    logo_resp = client.get(f"/api/projects/{project_id}/logo", headers=auth_headers(token))
    assert logo_resp.status_code == 200
    assert logo_resp.content == PNG


def test_profile_clear_removes_logo_and_file(client, engine, tmp_path):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    assert _put_profile(client, token, project_id, _metadata(), logo_action="upload", file=PNG).status_code == 200
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="clear")
    assert resp.status_code == 200, resp.text
    assert resp.json()["company_logo_path"] is None
    assert client.get(f"/api/projects/{project_id}/logo", headers=auth_headers(token)).status_code == 404
    assert not list((tmp_path / "logos").glob("*.png"))


def test_profile_preset_copies_logo_snapshot(client, engine, tmp_path):
    admin_token = login_as(client, "admin")
    preset = _create_preset_with_logo(client, admin_token, tmp_path)
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="preset", preset_id=preset["id"])
    assert resp.status_code == 200, resp.text
    logo_path = resp.json()["company_logo_path"]
    assert logo_path and (tmp_path / "logos" / logo_path).read_bytes() == PNG
    # 不保存 preset_id 语义：删除预设后项目 Logo 仍可读
    assert client.delete(f"/api/admin/organization-presets/{preset['id']}", headers=auth_headers(admin_token)).status_code == 204
    assert client.get(f"/api/projects/{project_id}/logo", headers=auth_headers(token)).status_code == 200


def test_profile_preset_without_logo_clears_project_logo(client, engine, tmp_path):
    admin_token = login_as(client, "admin")
    payload = {"metadata": json.dumps({"name": "无Logo预设", "data_management_unit": "无Logo单位"}), "logo_action": "keep"}
    preset = client.post("/api/admin/organization-presets", data=payload, headers=auth_headers(admin_token)).json()
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    assert _put_profile(client, token, project_id, _metadata(), logo_action="upload", file=PNG).status_code == 200
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="preset", preset_id=preset["id"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["company_logo_path"] is None


def test_profile_preset_requires_existing_preset(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="preset", preset_id=9999)
    assert resp.status_code == 404, resp.text


def test_profile_rejects_company_logo_path_in_metadata(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(company_logo_path="hack.png"))
    assert resp.status_code == 422, resp.text


def test_profile_rejects_upload_without_file(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="upload")
    assert resp.status_code == 422, resp.text


def test_profile_rejects_svg_upload(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(), logo_action="upload", file=b"<svg></svg>")
    assert resp.status_code == 400, resp.text
    assert "SVG/XML" in resp.json()["detail"]


def test_profile_validates_metadata_and_rejects_unknown_field(client, engine):
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    resp = _put_profile(client, token, project_id, _metadata(db_type="不存在的类型"))
    assert resp.status_code == 422, resp.text
    resp = _put_profile(client, token, project_id, {"name": "缺版本"})
    assert resp.status_code == 422, resp.text


def test_profile_isolates_other_users_projects(client, engine):
    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(alice_token)).json()["id"]
    resp = _put_profile(client, bob_token, project_id, _metadata())
    assert resp.status_code == 403, resp.text
    resp = _put_profile(client, bob_token, 9999, _metadata())
    assert resp.status_code == 404, resp.text


def test_legacy_project_write_routes_removed(client, engine):
    """旧 PUT /projects/{id} 与 POST /projects/{id}/logo 已删除；GET logo 保留。"""
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]

    old_put = client.put(
        f"/api/projects/{project_id}",
        json=_metadata(name="改名"),
        headers=auth_headers(token),
    )
    assert old_put.status_code == 405, old_put.text

    old_logo_post = client.post(
        f"/api/projects/{project_id}/logo",
        files={"file": ("logo.png", PNG, "image/png")},
        headers=auth_headers(token),
    )
    assert old_logo_post.status_code == 405, old_logo_post.text

    assert client.get(f"/api/projects/{project_id}/logo", headers=auth_headers(token)).status_code == 404


def test_route_inventory_confirms_profile_methods(client):
    """profile 只有 PUT；其他方法 405，避免误留部分写端点。"""
    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    for method in ("get", "delete", "patch"):
        resp = getattr(client, method)(f"/api/projects/{project_id}/profile", headers=auth_headers(token))
        assert resp.status_code == 405, (method, resp.text)


def test_profile_upload_failure_keeps_old_logo_and_cleans_new_file(client, engine, tmp_path, monkeypatch):
    from io import BytesIO
    from types import SimpleNamespace as NS

    from sqlalchemy.orm import Session

    from src.models.project import Project
    from src.schemas.project import ProjectUpdate
    from src.services import project_profile_service as profile_svc

    token = login_as(client, "alice")
    project_id = client.post("/api/projects", json=_metadata(), headers=auth_headers(token)).json()["id"]
    assert _put_profile(client, token, project_id, _metadata(), logo_action="upload", file=PNG).status_code == 200

    # 直接调用服务并注入 DB 写失败：flush 抛错 → 新文件被清理、旧 Logo 保留
    with Session(engine) as session:
        project = session.get(Project, project_id)
        old_logo = project.company_logo_path
        real_flush = Session.flush

        def _boom(self, *args, **kwargs):
            raise RuntimeError("注入的数据库故障")

        monkeypatch.setattr(Session, "flush", _boom)
        try:
            with pytest.raises(RuntimeError, match="注入的数据库故障"):
                profile_svc.update_project_profile(
                    project,
                    ProjectUpdate.model_validate(_metadata(trial_name="失败注入")),
                    "upload",
                    None,
                    NS(file=BytesIO(PNG), filename="logo.png"),
                    session,
                )
        finally:
            monkeypatch.setattr(Session, "flush", real_flush)

        session.rollback()
        session.refresh(project)
        assert project.company_logo_path == old_logo
        assert project.trial_name == "测试项目"
    assert len(list((tmp_path / "logos").glob("*.png"))) == 1
