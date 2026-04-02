"""项目克隆服务 — 深拷贝项目及全部子资源"""
from __future__ import annotations

import logging
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from src.config import get_config
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm

logger = logging.getLogger(__name__)


@dataclass
class ProjectGraph:
    """项目完整图结构（内存快照）。"""

    project: Project
    units: List[Unit] = field(default_factory=list)
    codelists: List[CodeList] = field(default_factory=list)
    # codelist_id -> options
    options_map: Dict[int, List[CodeListOption]] = field(default_factory=dict)
    field_definitions: List[FieldDefinition] = field(default_factory=list)
    forms: List[Form] = field(default_factory=list)
    # form_id -> form_fields
    form_fields_map: Dict[int, List[FormField]] = field(default_factory=dict)
    visits: List[Visit] = field(default_factory=list)
    visit_forms: List[VisitForm] = field(default_factory=list)


class ProjectGraphLoader:
    """从数据库加载项目完整图。"""

    @staticmethod
    def load(project_id: int, session: Session) -> ProjectGraph:
        project = session.get(Project, project_id)
        if not project:
            raise ValueError(f"项目不存在: {project_id}")

        units = list(
            session.scalars(
                select(Unit)
                .where(Unit.project_id == project_id)
                .order_by(Unit.order_index, Unit.id)
            ).all()
        )

        codelists = list(
            session.scalars(
                select(CodeList)
                .where(CodeList.project_id == project_id)
                .order_by(CodeList.order_index, CodeList.id)
            ).all()
        )

        codelist_ids = [codelist.id for codelist in codelists]
        options_map: Dict[int, List[CodeListOption]] = {
            codelist_id: [] for codelist_id in codelist_ids
        }
        if codelist_ids:
            options = session.scalars(
                select(CodeListOption)
                .where(CodeListOption.codelist_id.in_(codelist_ids))
                .order_by(CodeListOption.codelist_id, CodeListOption.order_index, CodeListOption.id)
            ).all()
            for option in options:
                options_map.setdefault(option.codelist_id, []).append(option)

        field_definitions = list(
            session.scalars(
                select(FieldDefinition)
                .where(FieldDefinition.project_id == project_id)
                .order_by(FieldDefinition.order_index, FieldDefinition.id)
            ).all()
        )

        forms = list(
            session.scalars(
                select(Form)
                .where(Form.project_id == project_id)
                .order_by(Form.order_index, Form.id)
            ).all()
        )

        form_ids = [form.id for form in forms]
        form_fields_map: Dict[int, List[FormField]] = {
            form_id: [] for form_id in form_ids
        }
        if form_ids:
            form_fields = session.scalars(
                select(FormField)
                .where(FormField.form_id.in_(form_ids))
                .order_by(FormField.form_id, FormField.sort_order, FormField.id)
            ).all()
            for form_field in form_fields:
                form_fields_map.setdefault(form_field.form_id, []).append(form_field)

        visits = list(
            session.scalars(
                select(Visit)
                .where(Visit.project_id == project_id)
                .order_by(Visit.sequence, Visit.id)
            ).all()
        )

        visit_ids = [visit.id for visit in visits]
        visit_forms = list(
            session.scalars(
                select(VisitForm)
                .where(VisitForm.visit_id.in_(visit_ids))
                .order_by(VisitForm.visit_id, VisitForm.sequence, VisitForm.id)
            ).all()
        ) if visit_ids else []

        return ProjectGraph(
            project=project,
            units=units,
            codelists=codelists,
            options_map=options_map,
            field_definitions=field_definitions,
            forms=forms,
            form_fields_map=form_fields_map,
            visits=visits,
            visit_forms=visit_forms,
        )


class ProjectCloneService:
    """项目深拷贝服务。"""

    _ROLLBACK_CLEANUP_KEY = "project_clone_logo_cleanup"

    @staticmethod
    def _resolve_copy_name(base_name: str, session: Session, owner_id: int) -> str:
        """生成副本名称：「原名 (副本)」→「原名 (副本2)」→ …"""
        existing_names = set(
            session.scalars(
                select(Project.name).where(Project.owner_id == owner_id)
            ).all()
        )
        candidate = f"{base_name} (副本)"
        if candidate not in existing_names:
            return candidate

        index = 2
        while True:
            candidate = f"{base_name} (副本{index})"
            if candidate not in existing_names:
                return candidate
            index += 1

    @staticmethod
    def clone(project_id: int, new_owner_id: int, session: Session) -> Project:
        """克隆项目及全部子资源。"""
        graph = ProjectGraphLoader.load(project_id, session)
        return ProjectCloneService.clone_from_graph(graph, new_owner_id, session)

    @staticmethod
    def clone_from_graph(
        graph: ProjectGraph,
        new_owner_id: int,
        session: Session,
        name_override: Optional[str] = None,
    ) -> Project:
        """从 ProjectGraph 克隆，支持外部图（导入场景）。"""
        id_map: Dict[str, Dict[int, int]] = {
            "unit": {},
            "codelist": {},
            "field_definition": {},
            "form": {},
            "visit": {},
        }

        src = graph.project
        new_name = name_override or ProjectCloneService._resolve_copy_name(
            src.name,
            session,
            new_owner_id,
        )

        new_project = Project(
            name=new_name,
            version=src.version,
            trial_name=src.trial_name,
            crf_version=src.crf_version,
            crf_version_date=src.crf_version_date,
            protocol_number=src.protocol_number,
            sponsor=src.sponsor,
            company_logo_path=None,
            data_management_unit=src.data_management_unit,
            owner_id=new_owner_id,
        )
        session.add(new_project)
        session.flush()

        for unit in graph.units:
            new_unit = Unit(
                project_id=new_project.id,
                symbol=unit.symbol,
                code=unit.code,
                order_index=unit.order_index,
            )
            session.add(new_unit)
            session.flush()
            id_map["unit"][unit.id] = new_unit.id

        for codelist in graph.codelists:
            new_codelist = CodeList(
                project_id=new_project.id,
                name=codelist.name,
                code=codelist.code,
                description=codelist.description,
                order_index=codelist.order_index,
            )
            session.add(new_codelist)
            session.flush()
            id_map["codelist"][codelist.id] = new_codelist.id

            for option in graph.options_map.get(codelist.id, []):
                session.add(CodeListOption(
                    codelist_id=new_codelist.id,
                    code=option.code,
                    decode=option.decode,
                    trailing_underscore=option.trailing_underscore,
                    order_index=option.order_index,
                ))

        session.flush()

        for field_definition in graph.field_definitions:
            new_field_definition = FieldDefinition(
                project_id=new_project.id,
                variable_name=field_definition.variable_name,
                label=field_definition.label,
                field_type=field_definition.field_type,
                integer_digits=field_definition.integer_digits,
                decimal_digits=field_definition.decimal_digits,
                date_format=field_definition.date_format,
                codelist_id=(
                    id_map["codelist"].get(field_definition.codelist_id)
                    if field_definition.codelist_id
                    else None
                ),
                unit_id=(
                    id_map["unit"].get(field_definition.unit_id)
                    if field_definition.unit_id
                    else None
                ),
                is_multi_record=field_definition.is_multi_record,
                table_type=field_definition.table_type,
                order_index=field_definition.order_index,
            )
            session.add(new_field_definition)
            session.flush()
            id_map["field_definition"][field_definition.id] = new_field_definition.id

        for form in graph.forms:
            new_form = Form(
                project_id=new_project.id,
                name=form.name,
                code=form.code,
                domain=form.domain,
                order_index=form.order_index,
                design_notes=form.design_notes,
            )
            session.add(new_form)
            session.flush()
            id_map["form"][form.id] = new_form.id

            for form_field in graph.form_fields_map.get(form.id, []):
                session.add(FormField(
                    form_id=new_form.id,
                    field_definition_id=(
                        id_map["field_definition"].get(form_field.field_definition_id)
                        if form_field.field_definition_id
                        else None
                    ),
                    is_log_row=form_field.is_log_row,
                    sort_order=form_field.sort_order,
                    required=form_field.required,
                    label_override=form_field.label_override,
                    help_text=form_field.help_text,
                    default_value=form_field.default_value,
                    inline_mark=form_field.inline_mark,
                    bg_color=form_field.bg_color,
                    text_color=form_field.text_color,
                ))

        session.flush()

        for visit in graph.visits:
            new_visit = Visit(
                project_id=new_project.id,
                name=visit.name,
                code=visit.code,
                sequence=visit.sequence,
            )
            session.add(new_visit)
            session.flush()
            id_map["visit"][visit.id] = new_visit.id

        for visit_form in graph.visit_forms:
            new_visit_id = id_map["visit"].get(visit_form.visit_id)
            new_form_id = id_map["form"].get(visit_form.form_id)
            if new_visit_id is None or new_form_id is None:
                continue
            session.add(VisitForm(
                visit_id=new_visit_id,
                form_id=new_form_id,
                sequence=visit_form.sequence,
            ))

        session.flush()

        if src.company_logo_path:
            copied_logo_name = ProjectCloneService._copy_logo_file(
                src.company_logo_path,
                session,
            )
            if copied_logo_name:
                new_project.company_logo_path = copied_logo_name
                session.flush()

        return new_project

    @staticmethod
    def _copy_logo_file(source_logo_name: str, session: Session) -> str | None:
        """复制 logo 文件，并在事务回滚时自动清理。"""
        raw_path = Path(source_logo_name)
        if raw_path.is_absolute() or raw_path.name != source_logo_name or ".." in raw_path.parts:
            raise ValueError("非法 logo 路径")

        logo_dir = Path(get_config().upload_path) / "logos"
        logo_dir.mkdir(parents=True, exist_ok=True)

        source_path = logo_dir / source_logo_name
        if not source_path.exists():
            logger.warning("源 logo 文件不存在: %s", source_path)
            return None

        new_logo_name = f"{uuid.uuid4().hex}{source_path.suffix}"
        target_path = logo_dir / new_logo_name
        shutil.copy2(source_path, target_path)
        ProjectCloneService._register_rollback_cleanup(session, new_logo_name)
        return new_logo_name

    @staticmethod
    def _register_rollback_cleanup(session: Session, logo_name: str) -> None:
        cleanup_list = session.info.setdefault(ProjectCloneService._ROLLBACK_CLEANUP_KEY, [])
        cleanup_list.append(logo_name)


@event.listens_for(Session, "after_commit")
def _clear_project_clone_cleanup(session: Session) -> None:
    """提交成功后清空回滚清理列表。"""
    session.info.pop(ProjectCloneService._ROLLBACK_CLEANUP_KEY, None)


@event.listens_for(Session, "after_rollback")
def _cleanup_project_clone_files(session: Session) -> None:
    """事务回滚后删除本次复制产生的 logo 文件。"""
    cleanup_list = session.info.pop(ProjectCloneService._ROLLBACK_CLEANUP_KEY, [])
    if not cleanup_list:
        return

    logo_dir = Path(get_config().upload_path) / "logos"
    for logo_name in cleanup_list:
        path = logo_dir / logo_name
        try:
            if path.exists():
                path.unlink()
        except OSError as exc:
            logger.warning("回滚清理 logo 失败 %s: %s", path, exc)
