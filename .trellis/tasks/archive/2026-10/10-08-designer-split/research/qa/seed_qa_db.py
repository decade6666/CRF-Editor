#!/usr/bin/env python3
"""Create the task-local pristine database and private QA credentials."""

from __future__ import annotations

import importlib.util
import json
import os
import secrets
import stat
import sys
from pathlib import Path
from typing import Any

QA_ROOT = Path("/tmp/designer-split-qa")
SEED_DB = QA_ROOT / "seed.db"
SECRET_FILE = QA_ROOT / "secrets.env"
WORKTREE_ROOT = Path("/home/decade/CRF-Editor-designer-split")
GOLDEN_HARNESS = (
    WORKTREE_ROOT
    / ".trellis/tasks/archive/2026-10/10-08-export-layer-cleanup/research/export_golden_harness.py"
)
_PROXY_VARIABLES = (
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
)


def _read_or_create_secrets() -> dict[str, str]:
    if SECRET_FILE.exists():
        mode = stat.S_IMODE(SECRET_FILE.stat().st_mode)
        if mode != 0o600:
            raise PermissionError("QA credential file must have mode 0600")
        values: dict[str, str] = {}
        for line in SECRET_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("export ") and "=" in line:
                key, value = line[7:].split("=", 1)
                values[key] = value.strip("'")
        required = {"CRF_AUTH_SECRET_KEY", "CRF_ADMIN_BOOTSTRAP_PASSWORD", "QA_USERNAME", "QA_PASSWORD"}
        if not required.issubset(values):
            raise ValueError("QA credential file is incomplete")
        return values

    values = {
        "CRF_AUTH_SECRET_KEY": secrets.token_urlsafe(48),
        "CRF_ADMIN_BOOTSTRAP_PASSWORD": secrets.token_urlsafe(24),
        "QA_USERNAME": "designer_qa",
        "QA_PASSWORD": secrets.token_urlsafe(24),
    }
    lines = [f"export {key}='{value}'" for key, value in values.items()]
    descriptor = os.open(SECRET_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write("\n".join(lines) + "\n")
    return values


def _load_golden_harness() -> Any:
    spec = importlib.util.spec_from_file_location("export_golden_harness", GOLDEN_HARNESS)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load golden seed harness: {GOLDEN_HARNESS}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _configure_environment(values: dict[str, str]) -> None:
    for name in _PROXY_VARIABLES:
        os.environ.pop(name, None)
    os.environ.update(
        {
            "CRF_ENV": "production",
            "CRF_DATABASE_PATH": str(SEED_DB),
            "CRF_STORAGE_UPLOAD_PATH": str(QA_ROOT / "seed-uploads"),
            "CRF_SERVER_HOST": "127.0.0.1",
            "CRF_SERVER_PORT": "8911",
            "CRF_DISABLE_BACKGROUND_JOBS": "1",
            "CRF_AUTH_SECRET_KEY": values["CRF_AUTH_SECRET_KEY"],
            "CRF_ADMIN_BOOTSTRAP_PASSWORD": values["CRF_ADMIN_BOOTSTRAP_PASSWORD"],
        }
    )


def _seed_database(values: dict[str, str]) -> dict[str, Any]:
    sys.path.insert(0, str(WORKTREE_ROOT / "backend"))
    _configure_environment(values)

    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from src.database import get_engine, init_db
    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField
    from src.models.project import Project
    from src.models.user import User
    from src.services.auth_service import hash_password

    init_db()
    engine = get_engine()
    golden = _load_golden_harness()
    with Session(engine, expire_on_commit=False) as session:
        project, forms, _overrides = golden.seed_project(session)
        label_row = session.scalar(
            select(FormField)
            .join(FieldDefinition)
            .where(FieldDefinition.variable_name == "GOLD_LABEL_CUSTOM")
        )
        if label_row is not None:
            label_row.label_override = "章节标题覆盖\n第二行"

        user = User(
            username=values["QA_USERNAME"],
            hashed_password=hash_password(values["QA_PASSWORD"]),
            is_admin=False,
        )
        session.add(user)
        session.flush()
        project.owner_id = user.id
        session.commit()

        return {
            "project": {"id": project.id, "name": project.name, "owner_id": user.id},
            "forms": [
                {"id": form.id, "name": form.name, "code": form.code, "order_index": form.order_index}
                for form in sorted(forms.values(), key=lambda form: (form.order_index, form.id))
            ],
            "regular_username": values["QA_USERNAME"],
        }


def main() -> int:
    QA_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    QA_ROOT.chmod(0o700)
    if SEED_DB.exists():
        if not SECRET_FILE.exists():
            raise FileNotFoundError("Seed database exists without its private credentials")
        _read_or_create_secrets()
        print("Pristine QA database already exists; reusing it.")
        return 0

    values = _read_or_create_secrets()
    manifest = _seed_database(values)
    (QA_ROOT / "seed_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Created pristine QA database with {len(manifest['forms'])} forms.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
