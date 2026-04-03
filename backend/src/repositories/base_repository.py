"""基础 Repository"""
from typing import Generic, List, Optional, Type, TypeVar

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.models import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """基础 Repository 类"""

    def __init__(self, session: Session, model: Type[T]):
        self.session = session
        self.model = model

    def get_by_id(self, id: int) -> Optional[T]:
        """根据 ID 获取实体"""
        return self.session.get(self.model, id)

    def get_all(self) -> List[T]:
        """获取所有实体"""
        stmt = select(self.model)
        return list(self.session.scalars(stmt).all())

    def create(self, entity: T) -> T:
        """创建实体"""
        self.session.add(entity)
        self.session.flush()
        return entity

    def update(self, entity: T) -> T:
        """更新实体"""
        self.session.flush()
        return entity

    def delete(self, entity: T) -> None:
        """删除实体"""
        self.session.delete(entity)
        self.session.flush()

    def batch_delete(self, ids: List[int], *, project_id: Optional[int] = None) -> int:
        """批量删除，可选 project_id 作用域过滤，返回实际删除数量"""
        if not ids:
            return 0
        stmt = delete(self.model).where(self.model.id.in_(ids))
        if project_id is not None:
            stmt = stmt.where(self.model.project_id == project_id)
        result = self.session.execute(stmt)
        self.session.flush()
        return result.rowcount
