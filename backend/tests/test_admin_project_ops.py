from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.config import get_config
from src.models.project import Project
from src.models.user import User
from src.models.form import Form
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.services.project_clone_service import ProjectCloneService


def _create_owned_project(session: Session, owner_id: int, name: str, *, order_index: int, deleted_at=None, screening_number_format=None) -> Project:
    project = Project(name=name, version='1.0', owner_id=owner_id, order_index=order_index, deleted_at=deleted_at, screening_number_format=screening_number_format)
    session.add(project)
    session.flush()
    return project


def _create_project_graph(session: Session, owner_id: int, name: str, *, order_index: int, deleted_at=None) -> Project:
    project = _create_owned_project(session, owner_id, name, order_index=order_index, deleted_at=deleted_at)
    form = Form(project_id=project.id, name=f'{name}-表单', code=f'{name}_FORM', order_index=1)
    visit = Visit(project_id=project.id, name=f'{name}-访视', code=f'{name}_VISIT', sequence=1)
    session.add_all([form, visit])
    session.flush()
    session.add(VisitForm(visit_id=visit.id, form_id=form.id, sequence=1))
    field_definition = FieldDefinition(project_id=project.id, variable_name=f'{name}_FIELD', label=f'{name}-字段', field_type='文本', order_index=1)
    session.add(field_definition)
    session.flush()
    session.add(FormField(form_id=form.id, field_definition_id=field_definition.id, order_index=1, inline_mark=0))
    session.flush()
    return project


def test_batch_delete_rejects_missing_or_deleted_project_with_zero_changes(client, engine):
    admin_token = login_as(client, 'admin')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        active = _create_owned_project(session, admin_user.id, '活跃项目', order_index=1)
        deleted = _create_owned_project(session, admin_user.id, '已删除项目', order_index=2, deleted_at=datetime.now(timezone.utc))
        session.commit()
        before = {
            project.id: project.deleted_at
            for project in session.scalars(select(Project).order_by(Project.id)).all()
        }

    resp_missing = client.post(
        '/api/admin/projects/batch-delete',
        json={'project_ids': [active.id, 999999]},
        headers=auth_headers(admin_token),
    )
    assert resp_missing.status_code == 400, resp_missing.text

    with Session(engine) as session:
        after_missing = {
            project.id: project.deleted_at
            for project in session.scalars(select(Project).order_by(Project.id)).all()
        }
    assert after_missing == before

    resp_deleted = client.post(
        '/api/admin/projects/batch-delete',
        json={'project_ids': [active.id, deleted.id]},
        headers=auth_headers(admin_token),
    )
    assert resp_deleted.status_code == 400, resp_deleted.text

    with Session(engine) as session:
        after_deleted = {
            project.id: project.deleted_at
            for project in session.scalars(select(Project).order_by(Project.id)).all()
        }
    assert after_deleted == before


def test_batch_move_rejects_unknown_target_user_with_zero_changes(client, engine):
    admin_token = login_as(client, 'admin')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        project = _create_owned_project(session, admin_user.id, '待迁移项目', order_index=1)
        session.commit()
        before_owner_id = project.owner_id

    resp = client.post(
        '/api/admin/projects/batch-move',
        json={'project_ids': [project.id], 'target_user_id': 999999},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 404, resp.text

    with Session(engine) as session:
        persisted = session.get(Project, project.id)
        assert persisted.owner_id == before_owner_id


def test_batch_move_rejects_missing_or_deleted_project_with_zero_changes(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'target_user')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        target_user = session.scalar(select(User).where(User.username == 'target_user'))
        active = _create_owned_project(session, admin_user.id, '活跃项目', order_index=1)
        deleted = _create_owned_project(session, admin_user.id, '已删除项目', order_index=2, deleted_at=datetime.now(timezone.utc))
        session.commit()
        target_user_id = target_user.id
        before = {
            project.id: project.owner_id
            for project in session.scalars(select(Project).order_by(Project.id)).all()
        }

    resp = client.post(
        '/api/admin/projects/batch-move',
        json={'project_ids': [active.id, deleted.id], 'target_user_id': target_user_id},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 400, resp.text

    with Session(engine) as session:
        after = {
            project.id: project.owner_id
            for project in session.scalars(select(Project).order_by(Project.id)).all()
        }
    assert after == before


def test_batch_copy_uses_savepoint_isolation_and_returns_consistent_results(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'target_user')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        target_user = session.scalar(select(User).where(User.username == 'target_user'))
        _create_owned_project(session, target_user.id, '目标用户已有项目', order_index=1)
        first = _create_project_graph(session, admin_user.id, '项目A', order_index=1)
        second = _create_project_graph(session, admin_user.id, '项目B', order_index=2)
        first_id = first.id
        second_id = second.id
        session.commit()
        target_user_id = target_user.id

    original_clone = ProjectCloneService.clone

    def fail_on_second(project_id, new_owner_id, session):
        cloned = original_clone(project_id, new_owner_id, session)
        if project_id == second_id:
            raise RuntimeError('模拟复制失败')
        return cloned

    with patch('src.routers.admin.ProjectCloneService.clone', side_effect=fail_on_second):
        resp = client.post(
            '/api/admin/projects/batch-copy',
            json={'project_ids': [first_id, second_id], 'target_user_id': target_user_id},
            headers=auth_headers(admin_token),
        )

    assert resp.status_code == 200, resp.text
    results = resp.json()
    assert [item['original_id'] for item in results] == [first_id, second_id]
    assert results[0]['status'] == 'success'
    assert 'new_id' in results[0]
    assert results[1]['status'] == 'failed'
    assert 'error' in results[1]

    with Session(engine) as session:
        copied_projects = session.scalars(select(Project).where(Project.owner_id == target_user_id).order_by(Project.order_index, Project.id)).all()
        assert len(copied_projects) == 2
        assert copied_projects[0].name == '目标用户已有项目'
        copied_project = copied_projects[1]
        assert copied_project.name.startswith('项目A')
        assert copied_project.order_index == 2
        copied_forms = session.scalars(select(Form).where(Form.project_id == copied_project.id)).all()
        copied_field_defs = session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == copied_project.id)).all()
        assert len(copied_forms) == 1
        assert len(copied_field_defs) == 1


def test_recycle_bin_returns_deleted_projects_with_owner_fields(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'owner_user')

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == 'owner_user'))
        _create_owned_project(session, owner.id, '活跃项目', order_index=1)
        deleted = _create_owned_project(session, owner.id, '回收站项目', order_index=2, deleted_at=datetime.now(timezone.utc), screening_number_format='SCR-RECYCLE')
        session.commit()
        deleted_id = deleted.id
        owner_id = owner.id

    resp = client.get('/api/admin/projects/recycle-bin', headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert [item['id'] for item in payload] == [deleted_id]
    assert payload[0]['owner_id'] == owner_id
    assert payload[0]['owner_username'] == 'owner_user'
    assert payload[0]['screening_number_format'] == 'SCR-RECYCLE'
    assert payload[0]['deleted_at'] is not None


def test_restore_renames_on_conflict_and_appends_to_owner_tail(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'owner_user')

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == 'owner_user'))
        _create_owned_project(session, owner.id, '项目A', order_index=1)
        _create_owned_project(session, owner.id, '项目B', order_index=2)
        restored = _create_project_graph(session, owner.id, '项目A', order_index=3, deleted_at=datetime.now(timezone.utc))
        session.commit()
        owner_id = owner.id
        restored_id = restored.id
        before_tail = session.scalar(select(func.max(Project.order_index)).where(Project.owner_id == owner_id, Project.deleted_at.is_(None)))

    resp = client.post(f'/api/admin/projects/{restored_id}/restore', headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload['name'] == '项目A (恢复)'
    assert payload['deleted_at'] is None

    with Session(engine) as session:
        restored_project = session.get(Project, restored_id)
        assert restored_project.owner_id == owner_id
        assert restored_project.order_index == before_tail + 1

    list_resp = client.get(f'/api/projects?user_id={owner_id}', headers=auth_headers(admin_token))
    assert list_resp.status_code == 200, list_resp.text
    active_names = [item['name'] for item in list_resp.json()]
    assert active_names[-1] == '项目A (恢复)'


def test_restore_keeps_full_project_graph_intact(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'owner_user')

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == 'owner_user'))
        project = _create_project_graph(session, owner.id, '待恢复项目', order_index=1, deleted_at=datetime.now(timezone.utc))
        session.commit()
        project_id = project.id

    resp = client.post(f'/api/admin/projects/{project_id}/restore', headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        assert session.scalar(select(func.count(Project.id)).where(Project.id == project_id)) == 1
        form_count = session.scalar(select(func.count(Form.id)).where(Form.project_id == project_id))
        visit_count = session.scalar(select(func.count(Visit.id)).where(Visit.project_id == project_id))
        field_def_count = session.scalar(select(func.count(FieldDefinition.id)).where(FieldDefinition.project_id == project_id))
        form_id = session.scalar(select(Form.id).where(Form.project_id == project_id))
        visit_id = session.scalar(select(Visit.id).where(Visit.project_id == project_id))
        form_field_count = session.scalar(select(func.count(FormField.id)).where(FormField.form_id == form_id))
        visit_form_count = session.scalar(select(func.count(VisitForm.id)).where(VisitForm.visit_id == visit_id))
        assert form_count == 1
        assert visit_count == 1
        assert field_def_count == 1
        assert form_field_count == 1
        assert visit_form_count == 1


def test_batch_move_appends_projects_to_target_owner_tail_order(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'source_user')
    seed_user(client, 'target_user')

    with Session(engine) as session:
        source_user = session.scalar(select(User).where(User.username == 'source_user'))
        target_user = session.scalar(select(User).where(User.username == 'target_user'))
        _create_owned_project(session, target_user.id, '目标项目1', order_index=1)
        first = _create_owned_project(session, source_user.id, '源项目1', order_index=1)
        second = _create_owned_project(session, source_user.id, '源项目2', order_index=2)
        session.commit()
        target_user_id = target_user.id
        first_id = first.id
        second_id = second.id

    resp = client.post(
        '/api/admin/projects/batch-move',
        json={'project_ids': [first_id, second_id], 'target_user_id': target_user_id},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        moved_projects = session.scalars(
            select(Project).where(Project.owner_id == target_user_id).order_by(Project.order_index, Project.id)
        ).all()
        assert [project.name for project in moved_projects] == ['目标项目1', '源项目1', '源项目2']
        assert [project.order_index for project in moved_projects] == [1, 2, 3]


def test_hard_delete_removes_project_logo_file(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'owner_user')

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == 'owner_user'))
        deleted = _create_project_graph(session, owner.id, '带Logo项目', order_index=1, deleted_at=datetime.now(timezone.utc))
        deleted.company_logo_path = 'deleted-logo.png'
        session.commit()
        deleted_id = deleted.id

    logo_dir = Path(get_config().upload_path) / 'logos'
    logo_dir.mkdir(parents=True, exist_ok=True)
    logo_path = logo_dir / 'deleted-logo.png'
    logo_path.write_bytes(b'fake-logo')

    try:
        resp = client.delete(f'/api/admin/projects/{deleted_id}/hard-delete', headers=auth_headers(admin_token))
        assert resp.status_code == 204, resp.text
        assert not logo_path.exists()
    finally:
        if logo_path.exists():
            logo_path.unlink()


def test_hard_delete_only_accepts_recycled_projects_and_physically_removes_that_graph(client, engine):
    admin_token = login_as(client, 'admin')
    seed_user(client, 'owner_user')

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == 'owner_user'))
        active = _create_project_graph(session, owner.id, '活跃项目', order_index=1)
        deleted = _create_project_graph(session, owner.id, '已删除项目', order_index=2, deleted_at=datetime.now(timezone.utc))
        session.commit()
        active_id = active.id
        deleted_id = deleted.id

    active_resp = client.delete(f'/api/admin/projects/{active_id}/hard-delete', headers=auth_headers(admin_token))
    assert active_resp.status_code == 400, active_resp.text

    deleted_resp = client.delete(f'/api/admin/projects/{deleted_id}/hard-delete', headers=auth_headers(admin_token))
    assert deleted_resp.status_code == 204, deleted_resp.text

    with Session(engine) as session:
        assert session.get(Project, active_id) is not None
        assert session.get(Project, deleted_id) is None
        deleted_forms = session.scalar(select(func.count(Form.id)).where(Form.project_id == deleted_id))
        deleted_visits = session.scalar(select(func.count(Visit.id)).where(Visit.project_id == deleted_id))
        deleted_field_defs = session.scalar(select(func.count(FieldDefinition.id)).where(FieldDefinition.project_id == deleted_id))
        assert deleted_forms == 0
        assert deleted_visits == 0
        assert deleted_field_defs == 0


def test_move_orphan_projects_to_recycle_bin_sets_deleted_at_idempotently(client, engine):
    """启动迁移：将孤立项目（owner_id=NULL 且未删除）软删除；二次执行不重复修改。"""
    from src.database import _move_orphan_projects_to_recycle_bin

    login_as(client, 'admin')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        orphan_a = Project(name='孤立项目A', version='1.0', owner_id=None, order_index=1)
        orphan_b = Project(name='孤立项目B', version='1.0', owner_id=None, order_index=2)
        owned = _create_owned_project(session, admin_user.id, '正常项目', order_index=1)
        session.add_all([orphan_a, orphan_b])
        session.commit()
        orphan_ids = [orphan_a.id, orphan_b.id]
        owned_id = owned.id

    _move_orphan_projects_to_recycle_bin(engine)

    with Session(engine) as session:
        for pid in orphan_ids:
            project = session.get(Project, pid)
            assert project is not None
            assert project.owner_id is None
            assert project.deleted_at is not None
        assert session.get(Project, owned_id).deleted_at is None
        before = {pid: session.get(Project, pid).deleted_at for pid in orphan_ids}

    _move_orphan_projects_to_recycle_bin(engine)

    with Session(engine) as session:
        after = {pid: session.get(Project, pid).deleted_at for pid in orphan_ids}
    assert after == before


def test_restore_orphan_project_keeps_owner_id_null(client, engine):
    """孤立项目（owner_id=NULL）恢复后保持 owner_id 为 NULL，且不重命名/不重排序。"""
    admin_token = login_as(client, 'admin')

    with Session(engine) as session:
        orphan = Project(
            name='孤立回收站项目',
            version='1.0',
            owner_id=None,
            order_index=0,
            deleted_at=datetime.now(timezone.utc),
        )
        session.add(orphan)
        session.commit()
        orphan_id = orphan.id
        original_order = orphan.order_index

    resp = client.post(f'/api/admin/projects/{orphan_id}/restore', headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload['name'] == '孤立回收站项目'
    assert payload['deleted_at'] is None

    with Session(engine) as session:
        restored = session.get(Project, orphan_id)
        assert restored.owner_id is None
        assert restored.deleted_at is None
        assert restored.order_index == original_order


def test_recycle_bin_orders_orphan_and_orm_deletes_chronologically(client, engine):
    """启动迁移与 ORM 软删共存时，回收站按 deleted_at 倒序稳定排序（防御时间戳格式回归）。

    历史 bug：用 ``datetime.now().isoformat()`` 写入时产生 ``'2026-05-07T...'``（T 分隔），
    与 SQLAlchemy ORM 写入的 ``'2026-05-07 ...'``（空格分隔）字典序错乱，影响倒序排序。
    """
    from sqlalchemy import text as sa_text
    from src.database import _move_orphan_projects_to_recycle_bin

    admin_token = login_as(client, 'admin')

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == 'admin'))
        owned = _create_owned_project(
            session, admin_user.id, 'ORM 软删项目', order_index=1,
            deleted_at=datetime(2024, 1, 1, 0, 0, 0),
        )
        orphan = Project(name='孤立项目', version='1.0', owner_id=None, order_index=99)
        session.add(orphan)
        session.commit()
        owned_id = owned.id
        orphan_id = orphan.id

    _move_orphan_projects_to_recycle_bin(engine)

    # 直接读 raw 列值：迁移写入的 deleted_at 应与 ORM 写入格式一致（不能包含 'T' 分隔符）。
    with engine.connect() as conn:
        orphan_raw = conn.execute(
            sa_text("SELECT deleted_at FROM project WHERE id = :id"),
            {"id": orphan_id},
        ).scalar()
        owned_raw = conn.execute(
            sa_text("SELECT deleted_at FROM project WHERE id = :id"),
            {"id": owned_id},
        ).scalar()
    assert orphan_raw is not None
    assert 'T' not in str(orphan_raw), f"启动迁移 deleted_at 不应使用 ISO T 分隔符，实际: {orphan_raw!r}"
    assert 'T' not in str(owned_raw), f"ORM deleted_at 不应使用 ISO T 分隔符，实际: {owned_raw!r}"

    # API 端到端：孤立项目（迁移时间 > 2024-01-01）应排在 ORM 软删项目之前。
    resp = client.get('/api/admin/projects/recycle-bin', headers=auth_headers(admin_token))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    ids = [item['id'] for item in payload]
    assert ids == [orphan_id, owned_id], f"回收站应按 deleted_at 倒序，期望 {[orphan_id, owned_id]}, 实际 {ids}"
    orphan_row = next(item for item in payload if item['id'] == orphan_id)
    assert orphan_row['owner_id'] is None
    assert orphan_row['owner_username'] is None
