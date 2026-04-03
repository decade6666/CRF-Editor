"""Project Repository"""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from src.models.project import Project
from src.services.order_service import OrderService

from .base_repository import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    """项目 Repository"""

    def __init__(self, session: Session):
        super().__init__(session, Project)

    def get_all_by_owner(self, owner_id: int) -> List[Project]:
        """获取指定用户的所有项目（排除已删除）"""
        stmt = (
            select(Project)
            .where(Project.owner_id == owner_id)
            .where(Project.deleted_at.is_(None))
            .order_by(Project.order_index)
        )
        return list(self.session.scalars(stmt))

    def get_recycle_bin(self, owner_id: int) -> List[Project]:
        """获取指定用户的回收站项目"""
        stmt = (
            select(Project)
            .where(Project.owner_id == owner_id)
            .where(Project.deleted_at.is_not(None))
            .order_by(Project.deleted_at.desc())
        )
        return list(self.session.scalars(stmt))

    def reorder(self, owner_id: int, ordered_ids: List[int]) -> None:
        """重新排序项目"""
        OrderService.reorder_batch(
            self.session,
            Project,
            Project.owner_id == owner_id,
            ordered_ids
        )

    def create_with_owner(self, project: Project, owner_id: int) -> Project:
        """创建项目并關聯 owner"""
        project.owner_id = owner_id
        # 获取下一个可用序号
        project.order_index = OrderService.get_next_order(
            self.session, Project, Project.owner_id == owner_id
        )
        self.session.add(project)
        self.session.flush()
        self.session.refresh(project)
        return project

    def get_by_name(self, name: str) -> Optional[Project]:
        """根据名称获取项目"""
        stmt = select(Project).where(Project.name == name)
        return self.session.scalar(stmt)

    def get_with_visits(self, project_id: int) -> Optional[Project]:
        """获取项目及其访视（仅一级）"""
        stmt = (
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.visits))
        )
        return self.session.scalar(stmt)

    def get_with_full_tree(self, project_id: int) -> Optional[Project]:
        """获取项目的完整关系树（一次性 eager load，消除导出时的 N+1 查询）

        加载路径：
          - visits → visit_forms → form
          - forms → form_fields → field_definition → codelist → options
          - forms → form_fields → field_definition → unit
        """
        from src.models.visit import Visit
        from src.models.visit_form import VisitForm
        from src.models.form import Form
        from src.models.form_field import FormField
        from src.models.field_definition import FieldDefinition
        from src.models.codelist import CodeList, CodeListOption

        stmt = (
            select(Project)
            .where(Project.id == project_id)
            .options(
                # 访视 → 访视表单关联 → 表单对象
                selectinload(Project.visits).selectinload(Visit.visit_forms).selectinload(VisitForm.form),
                # 表单 → 表单字段 → 字段定义 → 字典及选项
                selectinload(Project.forms)
                    .selectinload(Form.form_fields)
                    .selectinload(FormField.field_definition)
                    .selectinload(FieldDefinition.codelist)
                    .selectinload(CodeList.options),
                # 表单 → 表单字段 → 字段定义 → 单位
                selectinload(Project.forms)
                    .selectinload(Form.form_fields)
                    .selectinload(FormField.field_definition)
                    .selectinload(FieldDefinition.unit),
            )
        )
        return self.session.scalar(stmt)

