"""FieldDefinition Repository"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.field_definition import FieldDefinition
from src.models.codelist import CodeList

from .base_repository import BaseRepository


class FieldDefinitionRepository(BaseRepository[FieldDefinition]):
    """字段定义 Repository"""

    def __init__(self, session: Session):
        super().__init__(session, FieldDefinition)

    def get_by_project_id(self, project_id: int) -> List[FieldDefinition]:
        """根据项目 ID 获取字段定义列表"""
        stmt = (
            select(FieldDefinition)
            .where(FieldDefinition.project_id == project_id)
            .options(selectinload(FieldDefinition.codelist).selectinload(CodeList.options))
            .options(selectinload(FieldDefinition.unit))
            .order_by(FieldDefinition.order_index, FieldDefinition.id)
        )
        return list(self.session.scalars(stmt).all())

    def get_by_variable_name(self, project_id: int, variable_name: str) -> Optional[FieldDefinition]:
        """根据项目 ID 和变量名获取字段定义"""
        stmt = select(FieldDefinition).where(
            FieldDefinition.project_id == project_id,
            FieldDefinition.variable_name == variable_name
        )
        return self.session.scalar(stmt)

    def list_with_filters(
        self,
        project_id: int,
        field_type: Optional[str] = None,
        codelist_id: Optional[int] = None,
        unit_id: Optional[int] = None
    ) -> List[FieldDefinition]:
        """根据过滤条件获取字段定义列表"""
        stmt = select(FieldDefinition).where(FieldDefinition.project_id == project_id)

        if field_type:
            stmt = stmt.where(FieldDefinition.field_type == field_type)
        if codelist_id:
            stmt = stmt.where(FieldDefinition.codelist_id == codelist_id)
        if unit_id:
            stmt = stmt.where(FieldDefinition.unit_id == unit_id)

        stmt = stmt.order_by(FieldDefinition.label)
        return list(self.session.scalars(stmt).all())
