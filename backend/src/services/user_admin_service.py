"""用户管理服务（管理员专用）"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import get_config
from src.models.project import Project
from src.models.user import User


@dataclass
class UserInfo:
    id: int
    username: str
    project_count: int


def get_reserved_admin_username() -> str:
    """返回保留管理员用户名。"""
    return get_config().admin.username.strip()


def is_reserved_admin_username(username: str) -> bool:
    """按精确、大小写敏感规则判断是否为保留管理员用户名。"""
    return username.strip() == get_reserved_admin_username()


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
        if is_reserved_admin_username(username):
            raise ValueError("保留管理员账号不允许手动创建")
        existing = session.scalar(select(User).where(User.username == username))
        if existing:
            raise ValueError("用户名已存在")
        user = User(username=username, hashed_password=None, is_admin=False)
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
        if is_reserved_admin_username(user.username) and new_username != user.username:
            raise ValueError("保留管理员账号不允许改名")
        if user.username == new_username:
            return user
        if is_reserved_admin_username(new_username):
            raise ValueError("用户名不能设置为保留管理员账号")
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
        if is_reserved_admin_username(user.username):
            raise ValueError("保留管理员账号不允许删除")
        project_count = session.scalar(
            select(func.count(Project.id))
            .where(Project.owner_id == user_id)
            .where(Project.deleted_at.is_(None))
        ) or 0
        if project_count > 0:
            raise ValueError(f"该用户仍拥有 {project_count} 个项目，无法删除")
        session.delete(user)
        session.flush()
