"""Field Repository"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.field import Field
from src.models.codelist import CodeList

from .base_repository import BaseRepository


class FieldRepository(BaseRepository[Field]):
    """字段 Repository"""

    def __init__(self, session: Session):
        super().__init__(session, Field)

    def get_by_form_id(self, form_id: int) -> List[Field]:
        """根据表单 ID 获取字段列表"""
        stmt = (
            select(Field)
            .where(Field.form_id == form_id)
            .options(selectinload(Field.codelist).selectinload(CodeList.options))
            .order_by(Field.id)
        )
        return list(self.session.scalars(stmt).all())

    def get_by_variable_name(self, form_id: int, variable_name: str) -> Optional[Field]:
        """根据表单 ID 和变量名获取字段"""
        stmt = select(Field).where(
            Field.form_id == form_id,
            Field.variable_name == variable_name
        )
        return self.session.scalar(stmt)
