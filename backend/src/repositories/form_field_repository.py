"""FormField Repository"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models.form_field import FormField
from src.models.field_definition import FieldDefinition
from src.models.codelist import CodeList
from src.services.order_service import OrderService

from .base_repository import BaseRepository


class FormFieldRepository(BaseRepository[FormField]):
    """表单字段实例 Repository"""

    def __init__(self, session: Session):
        super().__init__(session, FormField)

    def get_by_form_id(self, form_id: int) -> List[FormField]:
        """根据表单 ID 获取字段实例列表"""
        stmt = (
            select(FormField)
            .where(FormField.form_id == form_id)
            .options(
                selectinload(FormField.field_definition)
                .selectinload(FieldDefinition.codelist)
                .selectinload(CodeList.options)
            )
            .options(
                selectinload(FormField.field_definition)
                .selectinload(FieldDefinition.unit)
            )
            .order_by(FormField.order_index, FormField.id)
        )
        return list(self.session.scalars(stmt).all())

    def get_by_form_and_definition(
        self, form_id: int, field_definition_id: int
    ) -> Optional[FormField]:
        """根据表单 ID 和字段定义 ID 获取字段实例"""
        stmt = select(FormField).where(
            FormField.form_id == form_id,
            FormField.field_definition_id == field_definition_id
        )
        return self.session.scalar(stmt)

    def reorder(self, form_id: int, ordered_ids: List[int]) -> None:
        """重新排序表单字段"""
        OrderService.reorder_batch(
            self.session,
            FormField,
            FormField.form_id == form_id,
            ordered_ids
        )

    def get_max_order_index(self, form_id: int) -> int:
        """获取表单中最大的排序号"""
        stmt = (
            select(FormField.order_index)
            .where(FormField.form_id == form_id)
            .order_by(FormField.order_index.desc())
            .limit(1)
        )
        result = self.session.scalar(stmt)
        return result if result is not None else 0


    def update_inline_mark(self, form_field_id: int, inline_mark: int) -> bool:
        """更新字段的表单内标记状态"""
        form_field = self.get_by_id(form_field_id)
        if form_field:
            form_field.inline_mark = inline_mark
            self.update(form_field)
            return True
        return False

    def batch_delete(self, form_field_ids: List[int]) -> int:
        """批量删除表单字段"""
        deleted_count = 0
        for field_id in form_field_ids:
            form_field = self.get_by_id(field_id)
            if form_field:
                self.delete(form_field)
                deleted_count += 1
        return deleted_count
