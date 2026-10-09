"""回收站清理策略管理端接口测试。"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.models.project import Project
from src.models.user import User


def _soft_delete_some(engine):
    with Session(engine) as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        p = Project(name="已删项目", version="1.0", owner_id=admin.id, order_index=1,
                    deleted_at=datetime.now(timezone.utc))
        session.add(p)
        session.commit()
        return p.id


def _fake_config_with_recycle(recycle):
    """构造一个带指定 recycle_bin 策略的假配置对象。"""
    from src.config import AppConfig, AdminConfig, AuthConfig

    cfg = AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username="admin", bootstrap_password="bootstrap-pass-123"),
    )
    cfg.recycle_bin = recycle
    return cfg


def test_get_policy_returns_defaults_and_stats(client, engine):
    admin_token = login_as(client, "admin")
    _soft_delete_some(engine)

    resp = client.get("/api/admin/recycle-bin/cleanup-policy", headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["age"]["enabled"] is False
    assert body["size"]["enabled"] is False
    assert body["interval_minutes"] == 60
    assert body["min_retain_hours"] == 24
    assert body["recycled_project_count"] >= 1
    assert body["total_estimated_size_bytes"] >= 0


def test_put_policy_persists_and_round_trips(client, engine, tmp_path):
    admin_token = login_as(client, "admin")
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text("auth:\n  secret_key: test-secret-key-for-config\n", encoding="utf-8")

    payload = {
        "interval_minutes": 15,
        "min_retain_hours": 72,
        "age": {"enabled": True, "value": 2, "unit": "year"},
        "size": {"enabled": True, "value": 3, "unit": "GB"},
    }
    with patch("src.config.CONFIG_FILE", cfg_file):
        resp = client.put("/api/admin/recycle-bin/cleanup-policy",
                          json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["age"]["enabled"] is True
        assert body["age"]["value"] == 2
        assert body["age"]["unit"] == "year"
        assert body["size"]["unit"] == "GB"
        assert body["interval_minutes"] == 15
        assert body["min_retain_hours"] == 72

    # 文件落盘且可回读
    assert "recycle_bin" in cfg_file.read_text(encoding="utf-8")
    from src.config import load_config
    reloaded = load_config(cfg_file)
    assert reloaded.recycle_bin.age.enabled is True
    assert reloaded.recycle_bin.size.value == 3


def test_put_policy_rejects_non_positive_value(client):
    admin_token = login_as(client, "admin")
    payload = {
        "interval_minutes": 60,
        "min_retain_hours": 24,
        "age": {"enabled": False, "value": 0, "unit": "day"},
        "size": {"enabled": False, "value": 500, "unit": "MB"},
    }
    resp = client.put("/api/admin/recycle-bin/cleanup-policy",
                      json=payload, headers=auth_headers(admin_token))
    assert resp.status_code == 422, resp.text


def test_put_policy_rejects_unknown_unit(client):
    admin_token = login_as(client, "admin")
    payload = {
        "interval_minutes": 60,
        "min_retain_hours": 24,
        "age": {"enabled": False, "value": 10, "unit": "week"},
        "size": {"enabled": False, "value": 500, "unit": "MB"},
    }
    resp = client.put("/api/admin/recycle-bin/cleanup-policy",
                      json=payload, headers=auth_headers(admin_token))
    assert resp.status_code == 422, resp.text


def test_put_policy_rejects_tb_size_unit(client):
    admin_token = login_as(client, "admin")
    payload = {
        "interval_minutes": 60,
        "min_retain_hours": 24,
        "age": {"enabled": False, "value": 10, "unit": "day"},
        "size": {"enabled": False, "value": 500, "unit": "TB"},
    }
    resp = client.put("/api/admin/recycle-bin/cleanup-policy",
                      json=payload, headers=auth_headers(admin_token))
    assert resp.status_code == 422, resp.text


def test_policy_endpoints_require_admin(client):
    seed_user(client, "nonadmin", is_admin=False)
    token = login_as(client, "nonadmin")
    assert client.get("/api/admin/recycle-bin/cleanup-policy",
                       headers=auth_headers(token)).status_code == 403
    assert client.put("/api/admin/recycle-bin/cleanup-policy",
                       json={"interval_minutes": 60, "min_retain_hours": 24,
                              "age": {"enabled": False, "value": 10, "unit": "day"},
                              "size": {"enabled": False, "value": 500, "unit": "MB"}},
                       headers=auth_headers(token)).status_code == 403
    assert client.post("/api/admin/recycle-bin/cleanup/preview",
                       headers=auth_headers(token)).status_code == 403


def test_preview_does_not_delete(client, engine):
    admin_token = login_as(client, "admin")
    pid = _soft_delete_some(engine)

    resp = client.post("/api/admin/recycle-bin/cleanup/preview",
                       headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    items = resp.json()
    # 默认两条规则关闭 -> 预览为空
    assert items == []

    # 项目仍在
    with Session(engine) as session:
        assert session.get(Project, pid) is not None


def test_preview_lists_targets_when_age_enabled(client, engine):
    admin_token = login_as(client, "admin")
    # 删除时间设为很久以前，确保超过 age cutoff
    with Session(engine) as session:
        admin = session.scalar(select(User).where(User.username == "admin"))
        old = datetime.now(timezone.utc) - timedelta(days=400)
        p = Project(name="很久前删的项目", version="1.0", owner_id=admin.id, order_index=1,
                    deleted_at=old)
        session.add(p)
        session.commit()
        pid = p.id

    # age 规则启用，保留 1 年；cutoff = now - 365d，400 天前的项目应被命中
    from src.config import RecycleBinAgeRule, RecycleBinConfig, RecycleBinSizeRule
    test_recycle = RecycleBinConfig(
        interval_minutes=60, min_retain_hours=0,
        age=RecycleBinAgeRule(enabled=True, value=1, unit="year"),
        size=RecycleBinSizeRule(enabled=False, value=500, unit="MB"),
    )
    fake_cfg = _fake_config_with_recycle(test_recycle)

    with patch("src.routers.admin.get_config", return_value=fake_cfg), \
         patch("src.services.recycle_bin_cleanup_service.get_config", return_value=fake_cfg):
        resp = client.post("/api/admin/recycle-bin/cleanup/preview",
                           headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert any(item["id"] == pid for item in items)
    assert all("age" in item["matched_rules"] for item in items)
    # 不删除
    with Session(engine) as session:
        assert session.get(Project, pid) is not None