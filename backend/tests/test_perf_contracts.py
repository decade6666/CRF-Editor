from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy.orm import Session

from src.models.user import User
from src.routers.export import export_word as export_word_route
from src.routers.projects import reorder_projects as reorder_projects_route



def test_perf_flag_does_not_change_export_contract(engine, monkeypatch) -> None:
    with Session(engine) as session:
        user = User(username="alice")
        session.add(user)
        session.commit()
        user_id = user.id

    with patch("src.routers.export.verify_project_owner", lambda *_args, **_kwargs: None), \
         patch("src.routers.export.ProjectRepository.get_by_id", lambda *_args, **_kwargs: SimpleNamespace(name="perf-project")), \
        patch("src.services.export_service.ExportService.export_project_to_word", lambda self, pid, output_path, column_width_overrides=None, bake_toc_page_numbers=False, annotated=False: open(output_path, "wb").write(b"PK") or True), \
         patch("src.services.export_service.ExportService._validate_output", staticmethod(lambda _path: (True, ""))):
        monkeypatch.delenv("CRF_PERF_BASELINE", raising=False)
        with Session(engine) as session:
            current_user = session.get(User, user_id)
            normal = export_word_route(
                1,
                session=session,
                current_user=current_user,
                column_width_overrides=None,
                annotated=False,
            )
        monkeypatch.setenv("CRF_PERF_BASELINE", "1")
        with Session(engine) as session:
            current_user = session.get(User, user_id)
            perf = export_word_route(
                1,
                session=session,
                current_user=current_user,
                column_width_overrides=None,
                annotated=False,
            )

    assert normal.status_code == perf.status_code == 200
    assert normal.headers["content-type"] == perf.headers["content-type"]



def test_perf_flag_does_not_change_reorder_status(engine, monkeypatch) -> None:
    with Session(engine) as session:
        user = User(username="alice")
        session.add(user)
        session.commit()
        user_id = user.id

    with patch("src.routers.projects.ProjectRepository.reorder", lambda *_args, **_kwargs: None):
        monkeypatch.delenv("CRF_PERF_BASELINE", raising=False)
        with Session(engine) as session:
            current_user = session.get(User, user_id)
            normal = reorder_projects_route([], session=session, current_user=current_user)
        monkeypatch.setenv("CRF_PERF_BASELINE", "1")
        with Session(engine) as session:
            current_user = session.get(User, user_id)
            perf = reorder_projects_route([], session=session, current_user=current_user)
    assert normal is None
    assert perf is None
