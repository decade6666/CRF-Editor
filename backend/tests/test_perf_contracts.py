from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from helpers import auth_headers, login_as



def test_perf_flag_does_not_change_export_contract(client: TestClient, engine, monkeypatch) -> None:
    token = login_as(client, "alice")

    with patch("src.routers.export.verify_project_owner", lambda *_args, **_kwargs: None), \
         patch("src.routers.export.ProjectRepository.get_by_id", lambda *_args, **_kwargs: object()), \
         patch("src.services.export_service.ExportService.export_project_to_word", lambda self, pid, output_path, column_width_overrides=None: open(output_path, "wb").write(b"PK") or True), \
         patch("src.services.export_service.ExportService._validate_output", staticmethod(lambda _path: (True, ""))):
        monkeypatch.delenv("CRF_PERF_BASELINE", raising=False)
        normal = client.post("/api/projects/1/export/word", headers=auth_headers(token))
        monkeypatch.setenv("CRF_PERF_BASELINE", "1")
        perf = client.post("/api/projects/1/export/word", headers=auth_headers(token))

    assert normal.status_code == perf.status_code == 200
    assert normal.headers["content-type"] == perf.headers["content-type"]



def test_perf_flag_does_not_change_reorder_status(client: TestClient, engine, monkeypatch) -> None:
    token = login_as(client, "alice")
    monkeypatch.delenv("CRF_PERF_BASELINE", raising=False)
    normal = client.post("/api/projects/reorder", json=[], headers=auth_headers(token))
    monkeypatch.setenv("CRF_PERF_BASELINE", "1")
    perf = client.post("/api/projects/reorder", json=[], headers=auth_headers(token))
    assert normal.status_code == perf.status_code
