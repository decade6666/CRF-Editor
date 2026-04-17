import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from helpers import auth_headers, login_as
from src.database import _migrate_add_project_screening_number_format
from src.schemas.project import normalize_screening_number_format


def _project_payload(name: str, version: str, **overrides):
    payload = {
        'name': name,
        'version': version,
    }
    payload.update(overrides)
    return payload


def test_project_create_persists_screening_number_format(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post(
        '/api/projects',
        json=_project_payload('元数据项目', '1.0', screening_number_format='SCR-XYZ'),
        headers=auth_headers(token),
    )
    assert create_resp.status_code == 201, create_resp.text
    assert create_resp.json()['screening_number_format'] == 'SCR-XYZ'


def test_project_update_persists_screening_number_format(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post('/api/projects', json=_project_payload('元数据项目', '1.0'), headers=auth_headers(token))
    assert create_resp.status_code == 201, create_resp.text
    project_id = create_resp.json()['id']

    update_resp = client.put(
        f'/api/projects/{project_id}',
        json=_project_payload('元数据项目', '1.0', screening_number_format='SCR-XYZ'),
        headers=auth_headers(token),
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()['screening_number_format'] == 'SCR-XYZ'

    get_resp = client.get(f'/api/projects/{project_id}', headers=auth_headers(token))
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()['screening_number_format'] == 'SCR-XYZ'


def test_project_update_normalizes_blank_screening_number_format_to_null(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post('/api/projects', json=_project_payload('空白项目', '1.0'), headers=auth_headers(token))
    assert create_resp.status_code == 201, create_resp.text
    project_id = create_resp.json()['id']

    update_resp = client.put(
        f'/api/projects/{project_id}',
        json=_project_payload('空白项目', '1.0', screening_number_format='   '),
        headers=auth_headers(token),
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()['screening_number_format'] is None


def test_project_update_rejects_invalid_screening_number_format(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post('/api/projects', json=_project_payload('非法项目', '1.0'), headers=auth_headers(token))
    assert create_resp.status_code == 201, create_resp.text
    project_id = create_resp.json()['id']

    long_resp = client.put(
        f'/api/projects/{project_id}',
        json=_project_payload('非法项目', '1.0', screening_number_format='A' * 101),
        headers=auth_headers(token),
    )
    assert long_resp.status_code == 422, long_resp.text
    assert '筛选号格式长度不能超过100个字符' in long_resp.json()['detail']

    newline_resp = client.put(
        f'/api/projects/{project_id}',
        json=_project_payload('非法项目', '1.0', screening_number_format='A\nB'),
        headers=auth_headers(token),
    )
    assert newline_resp.status_code == 422, newline_resp.text
    assert '筛选号格式不能包含换行或控制字符' in newline_resp.json()['detail']


def test_project_update_still_requires_name_and_version(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post('/api/projects', json=_project_payload('必填项目', '1.0'), headers=auth_headers(token))
    assert create_resp.status_code == 201, create_resp.text
    project_id = create_resp.json()['id']

    update_resp = client.put(
        f'/api/projects/{project_id}',
        json={'screening_number_format': 'SCR-ONLY'},
        headers=auth_headers(token),
    )
    assert update_resp.status_code == 422, update_resp.text
    detail = update_resp.json()['detail']
    assert 'name' in detail and 'version' in detail


def test_project_screening_number_format_migration_adds_column(tmp_path: Path):
    db_path = tmp_path / 'project_migration.db'
    conn = sqlite3.connect(db_path)
    conn.execute('CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL)')
    conn.commit()
    conn.close()

    engine = create_engine(f'sqlite:///{db_path}')
    inspector = inspect(engine)
    cols_before = {col['name'] for col in inspector.get_columns('project')}
    assert 'screening_number_format' not in cols_before

    _migrate_add_project_screening_number_format(engine)
    _migrate_add_project_screening_number_format(engine)

    inspector_after = inspect(engine)
    cols_after = {col['name'] for col in inspector_after.get_columns('project')}
    assert 'screening_number_format' in cols_after
    engine.dispose()


def test_project_response_exposes_null_screening_number_format_by_default(client, engine):
    token = login_as(client, 'alice')
    create_resp = client.post('/api/projects', json=_project_payload('默认项目', '1.0'), headers=auth_headers(token))
    assert create_resp.status_code == 201, create_resp.text
    assert create_resp.json()['screening_number_format'] is None


def test_normalize_screening_number_format_rejects_invalid_utf8_bytes():
    try:
        normalize_screening_number_format(b'\xff')
    except ValueError as exc:
        assert 'UTF-8' in str(exc)
    else:
        raise AssertionError('expected ValueError for invalid utf-8 bytes')


def test_legacy_project_db_without_screening_number_format_column_is_patched(tmp_path: Path):
    db_path = tmp_path / 'legacy_project.db'
    conn = sqlite3.connect(db_path)
    conn.execute('CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL)')
    conn.execute("INSERT INTO project (id, name, version) VALUES (1, '旧项目', '1.0')")
    conn.commit()
    conn.close()

    from src.services.project_import_service import _patch_legacy_project_schema

    _patch_legacy_project_schema(str(db_path))

    engine = create_engine(f'sqlite:///{db_path}')
    with engine.connect() as connection:
        cols = {row[1] for row in connection.execute(text('PRAGMA table_info(project)')).fetchall()}
    assert 'screening_number_format' in cols
    engine.dispose()


def test_legacy_imported_screening_number_format_is_normalized_via_endpoint(client, tmp_path: Path):
    token = login_as(client, 'admin')
    db_path = tmp_path / 'legacy_import.db'
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE user (id INTEGER PRIMARY KEY, username TEXT NOT NULL, hashed_password TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE project (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            order_index INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            trial_name TEXT,
            crf_version TEXT,
            crf_version_date DATE,
            protocol_number TEXT,
            sponsor TEXT,
            company_logo_path TEXT,
            data_management_unit TEXT,
            owner_id INTEGER,
            screening_number_format TEXT
        );
        CREATE TABLE visit (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT, sequence INTEGER NOT NULL);
        CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT, domain TEXT, order_index INTEGER, design_notes TEXT);
        CREATE TABLE visit_form (id INTEGER PRIMARY KEY, visit_id INTEGER NOT NULL, form_id INTEGER NOT NULL, sequence INTEGER NOT NULL);
        CREATE TABLE field_definition (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, variable_name TEXT NOT NULL, label TEXT NOT NULL, field_type TEXT NOT NULL, integer_digits INTEGER, decimal_digits INTEGER, date_format TEXT, codelist_id INTEGER, unit_id INTEGER, is_multi_record INTEGER NOT NULL DEFAULT 0, table_type TEXT NOT NULL DEFAULT '固定行', order_index INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE form_field (id INTEGER PRIMARY KEY, form_id INTEGER NOT NULL, field_definition_id INTEGER, is_log_row INTEGER NOT NULL DEFAULT 0, order_index INTEGER NOT NULL DEFAULT 1, required INTEGER NOT NULL DEFAULT 0, label_override TEXT, help_text TEXT, default_value TEXT, inline_mark INTEGER NOT NULL DEFAULT 0, bg_color TEXT, text_color TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE codelist (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT, description TEXT, order_index INTEGER);
        CREATE TABLE codelist_option (id INTEGER PRIMARY KEY, codelist_id INTEGER NOT NULL, code TEXT, decode TEXT NOT NULL, order_index INTEGER, trailing_underscore INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE unit (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, symbol TEXT NOT NULL, code TEXT, order_index INTEGER);
        INSERT INTO user (id, username) VALUES (1, 'legacy_user');
        INSERT INTO project (id, name, version, order_index, screening_number_format) VALUES (1, '旧库项目', '1.0', 1, '   ');
        INSERT INTO visit (id, project_id, name, code, sequence) VALUES (1, 1, 'V1', 'V1', 1);
        INSERT INTO form (id, project_id, name, code, order_index, design_notes) VALUES (1, 1, '表单1', 'F1', 1, NULL);
        INSERT INTO visit_form (id, visit_id, form_id, sequence) VALUES (1, 1, 1, 1);
        INSERT INTO field_definition (id, project_id, variable_name, label, field_type, order_index) VALUES (1, 1, 'VAR1', '字段1', '文本', 1);
        INSERT INTO form_field (id, form_id, field_definition_id, order_index, required) VALUES (1, 1, 1, 1, 1);
        """
    )
    conn.commit()
    conn.close()

    from tests.test_project_import import _upload_db

    resp = _upload_db(client, '/api/projects/import/project-db', db_path, token)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    project_resp = client.get(f"/api/projects/{body['project_id']}", headers=auth_headers(token))
    assert project_resp.status_code == 200, project_resp.text
    assert project_resp.json()['screening_number_format'] is None
