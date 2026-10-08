"""回收站定时清理 + 项目体积估算回归测试。"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.config import (
    DAYS_PER_MONTH,
    DAYS_PER_YEAR,
    RecycleBinAgeRule,
    RecycleBinConfig,
    RecycleBinSizeRule,
)
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services.project_size_service import (
    estimate_project_sizes,
    estimate_recycled_project_sizes,
    format_bytes,
    ROW_OVERHEAD_BYTES,
)
from src.services.recycle_bin_cleanup_service import (
    build_cleanup_plan,
    resolve_age_cutoff,
    resolve_size_limit_bytes,
    run_recycle_bin_cleanup,
)


def _make_policy(
    *,
    age_enabled=False, age_value=30, age_unit="day",
    size_enabled=False, size_value=500, size_unit="MB",
    interval_minutes=60, min_retain_hours=24,
) -> RecycleBinConfig:
    return RecycleBinConfig(
        interval_minutes=interval_minutes,
        min_retain_hours=min_retain_hours,
        age=RecycleBinAgeRule(enabled=age_enabled, value=age_value, unit=age_unit),
        size=RecycleBinSizeRule(enabled=size_enabled, value=size_value, unit=size_unit),
    )


def _create_owned_project(session, owner_id, name, *, order_index, deleted_at=None) -> Project:
    project = Project(name=name, version="1.0", owner_id=owner_id,
                      order_index=order_index, deleted_at=deleted_at)
    session.add(project)
    session.flush()
    return project


def _create_project_graph(session, owner_id, name, *, order_index, deleted_at=None) -> Project:
    project = _create_owned_project(session, owner_id, name, order_index=order_index, deleted_at=deleted_at)
    form = Form(project_id=project.id, name=f"{name}-表单", code=f"{name}_FORM", order_index=1)
    visit = Visit(project_id=project.id, name=f"{name}-访视", code=f"{name}_VISIT", sequence=1)
    session.add_all([form, visit])
    session.flush()
    session.add(VisitForm(visit_id=visit.id, form_id=form.id, sequence=1))
    field_definition = FieldDefinition(project_id=project.id, variable_name=f"{name}_FIELD",
                                        label=f"{name}-字段", field_type="文本", order_index=1)
    session.add(field_definition)
    session.flush()
    session.add(FormField(form_id=form.id, field_definition_id=field_definition.id,
                          order_index=1, inline_mark=0))
    session.flush()
    return project


# ── 体积估算 ─────────────────────────────────────────────


def test_estimate_sizes_grows_with_text_content(engine):
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        a = _create_project_graph(session, admin.id, "A", order_index=1, deleted_at=datetime.now(timezone.utc))
        # 给 A 塞一个大 design_notes
        session.scalar(select(Form).where(Form.project_id == a.id)).design_notes = "x" * 5000
        b = _create_project_graph(session, admin.id, "B", order_index=2, deleted_at=datetime.now(timezone.utc))
        session.commit()

        sizes = estimate_project_sizes(session, [a.id, b.id])
        assert sizes[a.id] > sizes[b.id] > 0


def test_estimate_sizes_counts_child_tables(engine):
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        p = _create_project_graph(session, admin.id, "P", order_index=1, deleted_at=datetime.now(timezone.utc))
        session.commit()
        before = estimate_project_sizes(session, [p.id])[p.id]

        cl = CodeList(project_id=p.id, name="字典", code="C1", order_index=1)
        session.add(cl)
        session.flush()
        session.add_all([
            CodeListOption(codelist_id=cl.id, code="1", decode="选项一", order_index=1),
            CodeListOption(codelist_id=cl.id, code="2", decode="选项二", order_index=2),
        ])
        session.add(Unit(project_id=p.id, symbol="mg", code="mg", order_index=1))
        session.commit()

        after = estimate_project_sizes(session, [p.id])[p.id]
        assert after > before


def test_estimate_sizes_includes_logo_file_bytes(engine, tmp_path):
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        p = _create_project_graph(session, admin.id, "P", order_index=1, deleted_at=datetime.now(timezone.utc))
        p.company_logo_path = "logo_test_bytes.png"
        session.commit()

        logos_dir = tmp_path / "logos"
        logos_dir.mkdir(parents=True)
        logo = logos_dir / "logo_test_bytes.png"
        logo.write_bytes(b"\x89PNG" + b"\x00" * 200)

        fake_upload_path = str(tmp_path)
        with patch("src.services.project_size_service.get_config") as m:
            m.return_value.upload_path = fake_upload_path
            sizes = estimate_project_sizes(session, [p.id])
        assert sizes[p.id] >= 200  # logo byte 至少计入


def test_estimate_sizes_ignores_missing_logo_file(engine, tmp_path):
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        p = _create_project_graph(session, admin.id, "P", order_index=1, deleted_at=datetime.now(timezone.utc))
        p.company_logo_path = "logo_missing.png"
        session.commit()

        with patch("src.services.project_size_service.get_config") as m:
            m.return_value.upload_path = str(tmp_path)
            sizes = estimate_project_sizes(session, [p.id])
        assert sizes[p.id] > 0  # 数据图自身仍计


def test_estimate_sizes_query_count_independent_of_project_count(engine):
    """体积估算查询条数与项目数无关（O(表数)，非 O(项目数×表数)）。"""
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        small = [_create_project_graph(session, admin.id, f"S{i}", order_index=i + 1, deleted_at=datetime.now(timezone.utc)) for i in range(2)]
        session.commit()
        small_ids = [p.id for p in small]

        more = [_create_project_graph(session, admin.id, f"M{i}", order_index=20 + i + 1, deleted_at=datetime.now(timezone.utc)) for i in range(18)]
        session.commit()
        all_ids = small_ids + [p.id for p in more]

    def _count_selects(ids):
        counter = {"n": 0}

        @event.listens_for(engine, "before_cursor_execute")
        def _count(conn, cursor, statement, *a, **k):
            if statement.lstrip().lower().startswith("select"):
                counter["n"] += 1

        try:
            with Session(engine) as s:
                estimate_project_sizes(s, ids)
            return counter["n"]
        finally:
            event.remove(engine, "before_cursor_execute", _count)

    count_small = _count_selects(small_ids)
    count_big = _count_selects(all_ids)
    assert count_small == count_big  # 查询条数恒定


def test_format_bytes_basic():
    assert format_bytes(0) == "0 B"
    assert format_bytes(512) == "512 B"
    assert format_bytes(1024) == "1.0 KB"
    assert format_bytes(1024 * 1024) == "1.0 MB"
    assert format_bytes(int(1024 * 1024 * 1.5)) == "1.5 MB"
    assert format_bytes(-1) == "-"
    assert format_bytes(None) == "-"


# ── 规则解析 ──────────────────────────────────────────────


def test_resolve_age_cutoff_units():
    now = datetime(2026, 1, 1, 0, 0, 0)
    assert resolve_age_cutoff(RecycleBinAgeRule(enabled=True, value=10, unit="day"), now) == now - timedelta(days=10)
    assert resolve_age_cutoff(RecycleBinAgeRule(enabled=True, value=2, unit="month"), now) == now - timedelta(days=2 * DAYS_PER_MONTH)
    assert resolve_age_cutoff(RecycleBinAgeRule(enabled=True, value=3, unit="year"), now) == now - timedelta(days=3 * DAYS_PER_YEAR)
    assert resolve_age_cutoff(RecycleBinAgeRule(enabled=False, value=10, unit="day"), now) is None


def test_resolve_size_limit_bytes_units():
    assert resolve_size_limit_bytes(RecycleBinSizeRule(enabled=True, value=5, unit="MB")) == 5 * 1024 ** 2
    assert resolve_size_limit_bytes(RecycleBinSizeRule(enabled=True, value=2, unit="GB")) == 2 * 1024 ** 3
    assert resolve_size_limit_bytes(RecycleBinSizeRule(enabled=False, value=5, unit="MB")) is None


# ── 清理计划 ──────────────────────────────────────────────


def test_age_rule_selects_only_projects_older_than_cutoff(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        old = _create_owned_project(session, admin.id, "old", order_index=1, deleted_at=now - timedelta(days=10))
        fresh = _create_owned_project(session, admin.id, "fresh", order_index=2, deleted_at=now - timedelta(days=1))
        active = _create_owned_project(session, admin.id, "active", order_index=3)  # deleted_at=None
        session.commit()

        plan = build_cleanup_plan(
            session,
            _make_policy(age_enabled=True, age_value=5, age_unit="day"),
            now=now,
        )
        assert plan.age_ids == [old.id]
        assert plan.size_ids == []
        # 未删除项目不可被误选
        assert active.id not in plan.all_target_ids
        assert fresh.id not in plan.all_target_ids


def test_size_rule_deletes_oldest_first_until_under_threshold(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        # 4 个项目，各自数据量递增；删除时间从早到晚（p0 最早）
        from src.models.form import Form as _Form
        projs = []
        for i in range(4):
            p = _create_owned_project(session, admin.id, f"p{i}", order_index=i + 1,
                                       deleted_at=now - timedelta(days=100 - i))
            f = _Form(project_id=p.id, name=f"f{i}", code=f"F{i}", order_index=1)
            f.design_notes = "y" * (3_000_000 + i * 100_000)  # 约 3MB+，递增
            session.add(f)
            projs.append(p)
        session.commit()

        sizes = estimate_project_sizes(session, [p.id for p in projs])
        total = sum(sizes.values())
        # 阈值 = 总量减去最小一个项目的体积 +1，使删掉最小（删除时间最早）那一项后即达标
        target_survivor_total = total - sizes[projs[0].id] + 1
        mb_value = max(1, (target_survivor_total + 1024 ** 2 - 1) // (1024 ** 2))

        plan = build_cleanup_plan(
            session,
            _make_policy(size_enabled=True, size_value=mb_value, size_unit="MB", min_retain_hours=0),
            now=now,
        )
        # size_ids 应包含删除时间最早的项目（projs[0]）
        assert projs[0].id in plan.size_ids
        # 存活项目总量低于阈值
        survivors = [p for p in projs if p.id not in plan.size_ids]
        survivor_total = sum(sizes[p.id] for p in survivors)
        assert survivor_total <= mb_value * 1024 ** 2


def test_size_rule_noop_when_under_threshold(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        _create_owned_project(session, admin.id, "p0", order_index=1, deleted_at=now - timedelta(days=10))
        session.commit()
        plan = build_cleanup_plan(
            session,
            _make_policy(size_enabled=True, size_value=999, size_unit="GB", min_retain_hours=0),
            now=now,
        )
        assert plan.size_ids == []


def test_size_rule_excludes_age_selected_projects(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        from src.models.form import Form as _Form
        old = _create_owned_project(session, admin.id, "old", order_index=1, deleted_at=now - timedelta(days=30))
        fo = _Form(project_id=old.id, name="fo", code="FO", order_index=1)
        fo.design_notes = "x" * 100000
        session.add(fo)
        recent = _create_owned_project(session, admin.id, "recent", order_index=2, deleted_at=now - timedelta(days=5))
        fr = _Form(project_id=recent.id, name="fr", code="FR", order_index=1)
        fr.design_notes = "x" * 100000
        session.add(fr)
        session.commit()

        plan = build_cleanup_plan(
            session,
            _make_policy(age_enabled=True, age_value=10, age_unit="day",
                         size_enabled=True, size_value=1, size_unit="MB"),
            now=now,
        )
        assert old.id in plan.age_ids
        assert old.id not in plan.size_ids  # 不重复计入


def test_plan_total_bytes_after_deducts_each_selected_project_once(engine):
    """计划剩余总量 = 清理前总量 − 年龄规则命中量 − 容量规则命中量，命中项目只扣一次。"""
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        # old 由年龄规则命中；其余三个删除时间较新，由容量规则按删除时间最早优先命中
        old = _create_owned_project(session, admin.id, "old", order_index=1,
                                    deleted_at=now - timedelta(days=100))
        fo = Form(project_id=old.id, name="fo", code="FO", order_index=1)
        fo.design_notes = "x" * 200_000
        session.add(fo)
        recent = []
        for i in range(3):
            p = _create_owned_project(session, admin.id, f"p{i}", order_index=i + 2,
                                      deleted_at=now - timedelta(days=10 - i))
            f = Form(project_id=p.id, name=f"f{i}", code=f"F{i}", order_index=1)
            f.design_notes = "y" * (3_000_000 + i * 100_000)
            session.add(f)
            recent.append(p)
        session.commit()

        projects = [old, *recent]
        sizes = estimate_project_sizes(session, [p.id for p in projects])
        total_before = sum(sizes.values())
        # 阈值取「剩余总量减去最早可清项目后向上取整到 MB」，使容量规则只命中 recent[0]
        survivor_target = sum(sizes[p.id] for p in recent) - sizes[recent[0].id]
        mb_value = max(1, (survivor_target + 1024 ** 2 - 1) // (1024 ** 2))

        plan = build_cleanup_plan(
            session,
            _make_policy(age_enabled=True, age_value=30, age_unit="day",
                         size_enabled=True, size_value=mb_value, size_unit="MB",
                         min_retain_hours=0),
            now=now,
        )

        assert plan.age_ids == [old.id]
        assert plan.size_ids == [recent[0].id]
        selected = set(plan.all_target_ids)
        assert plan.total_bytes_before == total_before
        assert plan.total_bytes_after == total_before - sum(sizes[pid] for pid in selected)


def test_min_retain_hours_protects_recent_projects(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        # 4 个项目都很大（各约 3MB，总量约 12MB > 1MB 阈值），且都很新（5 小时前删除）
        from src.models.form import Form as _Form
        for i in range(4):
            p = _create_owned_project(session, admin.id, f"p{i}", order_index=i + 1,
                                       deleted_at=now - timedelta(hours=5))
            f = _Form(project_id=p.id, name=f"f{i}", code=f"F{i}", order_index=1)
            f.design_notes = "x" * 3_000_000
            session.add(f)
        session.commit()

        plan = build_cleanup_plan(
            session,
            _make_policy(size_enabled=True, size_value=1, size_unit="MB", min_retain_hours=24),
            now=now,
        )
        # 受 24h 保留下限保护，5 小时前的不应被容量规则触及
        assert plan.size_ids == []
        assert plan.would_converge is False


# ── 执行 ──────────────────────────────────────────────────


def test_run_cleanup_purges_graph_and_logo(engine, tmp_path):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        p = _create_project_graph(session, admin.id, "p", order_index=1, deleted_at=now - timedelta(days=100))
        p.company_logo_path = "logo_run.png"
        session.commit()
        project_ids = [p.id]
        form_ids = [f.id for f in session.scalars(select(Form).where(Form.project_id == p.id)).all()]
        visit_ids = [v.id for v in session.scalars(select(Visit).where(Visit.project_id == p.id)).all()]
        field_def_ids = [fd.id for fd in session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == p.id)).all()]

        logos_dir = tmp_path / "logos"
        logos_dir.mkdir(parents=True)
        (logos_dir / "logo_run.png").write_bytes(b"png" * 30)

        with patch("src.services.project_purge_service.get_config") as m, \
             patch("src.services.project_size_service.get_config") as m2:
            m.return_value.upload_path = str(tmp_path)
            m2.return_value.upload_path = str(tmp_path)
            report = run_recycle_bin_cleanup(
                session,
                _make_policy(age_enabled=True, age_value=1, age_unit="day"),
                now=now,
            )
        assert report["purged_count"] == 1

        # 数据图已清
        assert session.get(Project, project_ids[0]) is None
        assert session.scalars(select(Form).where(Form.id.in_(form_ids))).all() == []
        assert session.scalars(select(Visit).where(Visit.id.in_(visit_ids))).all() == []
        assert session.scalars(select(FieldDefinition).where(FieldDefinition.id.in_(field_def_ids))).all() == []
        # logo 已删
        assert not (logos_dir / "logo_run.png").exists()


def test_run_cleanup_skips_project_restored_between_plan_and_purge(engine):
    now = datetime(2026, 1, 10, 0, 0, 0)
    with Session(engine) as session:
        admin = User(username="u1", hashed_password="x", is_admin=False, auth_version=0)
        session.add(admin)
        session.flush()
        p = _create_owned_project(session, admin.id, "p", order_index=1, deleted_at=now - timedelta(days=100))
        session.commit()
        pid = p.id

        # 计划后、执行前恢复项目
        with patch("src.services.recycle_bin_cleanup_service.build_cleanup_plan") as m:
            from src.services.recycle_bin_cleanup_service import CleanupPlan
            m.return_value = CleanupPlan(age_ids=[pid], size_ids=[], total_bytes_before=0, total_bytes_after=0, would_converge=True)
            p.deleted_at = None  # 管理员刚恢复
            session.commit()
            report = run_recycle_bin_cleanup(session, _make_policy(), now=now)

        assert report["purged_count"] == 0
        assert session.get(Project, pid) is not None