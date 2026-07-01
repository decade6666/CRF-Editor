"""表单 annotation_positions 的后端契约测试。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from src.database import _migrate_add_form_annotation_positions
from src.models import Base
from src.models.form import Form
from src.models.project import Project
from src.models.user import User
from src.routers.forms import copy_form, create_form, list_forms, patch_form, update_form
from src.schemas.form import (
    ANNOTATION_FORM_KEY,
    FormCreate,
    FormResponse,
    FormUpdate,
    serialize_annotation_positions,
)
from src.services.project_clone_service import ProjectCloneService
from src.services.project_import_service import ProjectDbImportService


def _seed_owner(session: Session, username: str = "alice") -> tuple[User, Project]:
    user = User(username=username, hashed_password="hash")
    session.add(user)
    session.flush()

    project = Project(name=f"{username}-project", version="1.0", owner_id=user.id)
    session.add(project)
    session.flush()
    return user, project


def _create_owned_form(session: Session) -> tuple[User, Project, Form]:
    user, project = _seed_owner(session)
    form = Form(
        project_id=project.id,
        name="Annotation Form",
        code="ANNOTATION_FORM",
        order_index=1,
    )
    session.add(form)
    session.flush()
    return user, project, form


def _response_payload(form: Form) -> dict:
    return FormResponse.model_validate(form).model_dump(mode="json")


def _build_import_db(tmp_path: Path, annotation_positions: str | None) -> Path:
    db_path = tmp_path / "annotation-import.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="source-user", hashed_password="hash")
        session.add(user)
        session.flush()

        project = Project(name="source-project", version="1.0", owner_id=user.id)
        session.add(project)
        session.flush()

        session.add(
            Form(
                project_id=project.id,
                name="Source Form",
                code="SRC_FORM",
                order_index=1,
                annotation_positions=annotation_positions,
            )
        )
        session.commit()

    engine.dispose()
    return db_path


def test_create_form_annotation_positions_defaults_to_null(engine) -> None:
    with Session(engine) as session:
        user, project, form = _create_owned_form(session)
        payload = _response_payload(form)

    assert payload["annotation_positions"] is None
    assert payload["project_id"] == project.id
    assert payload["name"] == "Annotation Form"


def test_patch_form_annotation_positions_clamps_and_persists(engine) -> None:
    with Session(engine) as session:
        user, project, form = _create_owned_form(session)
        updated = patch_form(
            form.id,
            FormUpdate(
                annotation_positions={
                    ANNOTATION_FORM_KEY: {"y": 999},
                    "VISITDY": {"y": -999},
                }
            ),
            session,
            user,
        )
        session.flush()
        listed = list_forms(project.id, session, user)
        payload = _response_payload(updated)
        listed_payload = [_response_payload(item) for item in listed]

    assert payload["annotation_positions"] == {
        ANNOTATION_FORM_KEY: {"y": 200},
        "VISITDY": {"y": -200},
    }
    assert listed_payload[0]["annotation_positions"] == payload["annotation_positions"]


def test_copy_form_inherits_annotation_positions(engine) -> None:
    with Session(engine) as session:
        user, _, form = _create_owned_form(session)
        patch_form(
            form.id,
            FormUpdate(
                annotation_positions={
                    ANNOTATION_FORM_KEY: {"y": 25},
                    "VSVAR": {"y": -30},
                }
            ),
            session,
            user,
        )
        copied = copy_form(form.id, session, user)
        payload = _response_payload(copied)

    assert payload["annotation_positions"] == {
        ANNOTATION_FORM_KEY: {"y": 25},
        "VSVAR": {"y": -30},
    }


def test_update_other_fields_does_not_clear_annotation_positions(engine) -> None:
    with Session(engine) as session:
        user, _, form = _create_owned_form(session)
        patch_form(
            form.id,
            FormUpdate(annotation_positions={"AEVAR": {"y": 10}}),
            session,
            user,
        )
        updated = update_form(
            form.id,
            FormUpdate(name="Renamed Annotation Form"),
            session,
            user,
        )
        payload = _response_payload(updated)

    assert payload["annotation_positions"] == {"AEVAR": {"y": 10}}


def test_project_clone_preserves_form_annotation_positions(engine) -> None:
    with Session(engine) as session:
        user, project, form = _create_owned_form(session)
        form.annotation_positions = '{"_form":{"y":18},"AEVAR":{"y":-12}}'
        session.flush()

        cloned_project = ProjectCloneService.clone(project.id, user.id, session)
        cloned_form = session.scalar(
            select(Form)
            .where(Form.project_id == cloned_project.id)
            .order_by(Form.order_index, Form.id)
        )

    assert cloned_form is not None
    assert cloned_form.annotation_positions == serialize_annotation_positions(
        '{"_form":{"y":18},"AEVAR":{"y":-12}}'
    )


def test_copy_form_rejects_invalid_annotation_positions(engine) -> None:
    with Session(engine) as session:
        user, _, form = _create_owned_form(session)
        form.annotation_positions = '{"_bad":{"y":1}}'
        session.flush()

        with pytest.raises(HTTPException, match="annotation_positions") as exc_info:
            copy_form(form.id, session, user)

    assert exc_info.value.status_code == 409


def test_project_clone_rejects_invalid_form_annotation_positions(engine) -> None:
    with Session(engine) as session:
        user, project, form = _create_owned_form(session)
        form.annotation_positions = '{"_bad":{"y":1}}'
        session.flush()

        with pytest.raises(ValueError, match="annotation_positions"):
            ProjectCloneService.clone(project.id, user.id, session)


def test_project_import_preserves_form_annotation_positions(engine, tmp_path: Path) -> None:
    source_positions = '{"_form":{"y":18},"VAR0":{"y":-24}}'
    db_path = _build_import_db(tmp_path, source_positions)

    with Session(engine) as session:
        owner, _ = _seed_owner(session, username="import-owner")
        session.commit()
        result = ProjectDbImportService.import_single_project(
            str(db_path),
            owner.id,
            session,
        )
        imported_form = session.scalar(
            select(Form).where(Form.project_id == result.project_id)
        )

    assert imported_form is not None
    assert imported_form.annotation_positions == serialize_annotation_positions(
        source_positions
    )


def test_project_import_rejects_invalid_form_annotation_positions(engine, tmp_path: Path) -> None:
    db_path = _build_import_db(tmp_path, '{"_bad":{"y":1}}')

    with Session(engine) as session:
        owner, _ = _seed_owner(session, username="invalid-import-owner")
        session.commit()
        with pytest.raises(ValueError, match="annotation_positions"):
            ProjectDbImportService.import_single_project(
                str(db_path),
                owner.id,
                session,
            )


@pytest.mark.parametrize(
    "payload",
    [
        {"annotation_positions": {"TESTVAR": {"y": 1.5}}},
        {"annotation_positions": {"TESTVAR": {"y": "1"}}},
        {"annotation_positions": {"TESTVAR": {"y": float("inf")}}},
        {"annotation_positions": {"TESTVAR": {"x": 1}}},
        {"annotation_positions": {"_bad": {"y": 1}}},
        {"annotation_positions": ["bad"]},
    ],
    ids=[
        "float",
        "string",
        "non_finite",
        "missing_y",
        "reserved_key",
        "wrong_shape",
    ],
)
def test_form_update_schema_rejects_invalid_annotation_positions(payload: dict) -> None:
    with pytest.raises(ValidationError):
        FormUpdate.model_validate(payload)


def test_form_update_schema_clamps_annotation_positions() -> None:
    validated = FormUpdate.model_validate(
        {
            "annotation_positions": {
                ANNOTATION_FORM_KEY: {"y": 250},
                "TESTVAR": {"y": -350},
            }
        }
    )

    assert validated.annotation_positions is not None
    assert validated.annotation_positions[ANNOTATION_FORM_KEY].y == 200
    assert validated.annotation_positions["TESTVAR"].y == -200


def test_migration_adds_annotation_positions_to_legacy_form_table(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy_annotation_positions.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL)"
    )
    conn.execute("INSERT INTO form (id, project_id, name) VALUES (1, 1, 'Legacy Form')")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _migrate_add_form_annotation_positions(engine)
    _migrate_add_form_annotation_positions(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("form")}
    assert "annotation_positions" in columns
    with engine.connect() as connection:
        value = connection.execute(
            text("SELECT annotation_positions FROM form WHERE id = 1")
        ).scalar()
    assert value is None
    engine.dispose()


def test_copy_form_canonicalizes_out_of_range_string_storage(engine) -> None:
    """字符串越界 y 经 copy 落库后必须被 clamp + canonical 重序列化。"""
    with Session(engine) as session:
        user, _, form = _create_owned_form(session)
        form.annotation_positions = '{"_form":{"y":999},"AEVAR":{"y":-999}}'
        session.flush()
        copied = copy_form(form.id, session, user)
        session.flush()
        stored = session.scalar(select(Form).where(Form.id == copied.id))
    assert stored.annotation_positions == serialize_annotation_positions(
        '{"_form":{"y":999},"AEVAR":{"y":-999}}'
    )
    assert stored.annotation_positions == '{"AEVAR":{"y":-200},"_form":{"y":200}}'


def test_project_clone_canonicalizes_out_of_range_string_storage(engine) -> None:
    """字符串越界 y 经项目克隆落库后必须被 clamp + canonical 重序列化。"""
    with Session(engine) as session:
        user, project, form = _create_owned_form(session)
        form.annotation_positions = '{"_form":{"y":999},"AEVAR":{"y":-999}}'
        session.flush()
        cloned_project = ProjectCloneService.clone(project.id, user.id, session)
        cloned_form = session.scalar(
            select(Form).where(Form.project_id == cloned_project.id).order_by(Form.order_index, Form.id)
        )
    assert cloned_form is not None
    assert cloned_form.annotation_positions == '{"AEVAR":{"y":-200},"_form":{"y":200}}'


def test_project_import_canonicalizes_out_of_range_string_storage(engine, tmp_path: Path) -> None:
    """字符串越界 y 经项目 .db 导入落库后必须被 clamp + canonical 重序列化。"""
    db_path = _build_import_db(tmp_path, '{"_form":{"y":999},"VAR0":{"y":-999}}')
    with Session(engine) as session:
        owner, _ = _seed_owner(session, username="import-canonical-owner")
        session.commit()
        result = ProjectDbImportService.import_single_project(str(db_path), owner.id, session)
        imported_form = session.scalar(select(Form).where(Form.project_id == result.project_id))
    assert imported_form is not None
    assert imported_form.annotation_positions == '{"VAR0":{"y":-200},"_form":{"y":200}}'
