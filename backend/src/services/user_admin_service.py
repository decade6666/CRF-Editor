"""用户管理服务（管理员专用）"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.models.project import Project
from src.models.user import User


@dataclass
class UserInfo:
    id: int
    username: str
    project_count: int


class UserAdminService:
    """管理员用户管理服务。"""

    @staticmethod
    def list_users(session: Session) -> List[UserInfo]:
        """返回所有用户及其项目数。"""
        stmt = (
            select(
                User.id,
                User.username,
                func.count(Project.id).label("project_count"),
            )
            .outerjoin(
                Project,
                (Project.owner_id == User.id) & Project.deleted_at.is_(None),
            )
            .group_by(User.id)
            .order_by(User.id)
        )
        rows = session.execute(stmt).all()
        return [
            UserInfo(id=row[0], username=row[1], project_count=row[2])
            for row in rows
        ]

    @staticmethod
    def create_user(session: Session, username: str) -> User:
        """创建用户（无密码）。"""
        username = username.strip()
        if not username:
            raise ValueError("用户名不能为空")
        existing = session.scalar(select(User).where(User.username == username))
        if existing:
            raise ValueError("用户名已存在")
        user = User(username=username, hashed_password=None)
        session.add(user)
        session.flush()
        return user

    @staticmethod
    def rename_user(session: Session, user_id: int, new_username: str) -> User:
        """修改用户名。"""
        new_username = new_username.strip()
        if not new_username:
            raise ValueError("用户名不能为空")
        user = session.get(User, user_id)
        if not user:
            raise ValueError("用户不存在")
        if user.username == new_username:
            return user
        conflict = session.scalar(
            select(User).where(User.username == new_username)
        )
        if conflict:
            raise ValueError("用户名已存在")
        user.username = new_username
        session.flush()
        return user

    @staticmethod
    def delete_user(session: Session, user_id: int) -> None:
        """删除用户（有项目时拒绝）。"""
        user = session.get(User, user_id)
        if not user:
            raise ValueError("用户不存在")
        project_count = session.scalar(
            select(func.count(Project.id))
            .where(Project.owner_id == user_id)
            .where(Project.deleted_at.is_(None))
        ) or 0
        if project_count > 0:
            raise ValueError(f"该用户仍拥有 {project_count} 个项目，无法删除")
        session.delete(user)
        session.flush()
