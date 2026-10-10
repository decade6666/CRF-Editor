"""保留管理员账号修复逻辑。

从 database.py 的迁移代码中移出：启动时同步保留管理员账号语义，
并在 production 环境中确保始终存在可用管理员。
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from src.config import get_config, is_production_env
from src.services.auth_service import has_usable_password_hash, hash_password


def heal_reserved_admin_account(engine: Engine) -> None:
    """同步保留管理员账号语义，并在 production 中确保始终存在可用管理员。"""

    insp = inspect(engine)

    if not insp.has_table("user"):
        return

    config = get_config()
    admin_username = config.admin.username.strip()

    if not admin_username:
        return

    bootstrap_password = config.admin.bootstrap_password.strip()

    with engine.begin() as conn:
        conn.execute(
            text('UPDATE "user" SET is_admin = 1 WHERE TRIM(username) = :username AND COALESCE(is_admin, 0) != 1'),
            {"username": admin_username},
        )

        reserved_admin = conn.execute(
            text(
                "SELECT id, username, hashed_password, COALESCE(auth_version, 0) "
                'FROM "user" '
                "WHERE TRIM(username) = :username "
                "ORDER BY id "
                "LIMIT 1"
            ),
            {"username": admin_username},
        ).fetchone()

        if reserved_admin is None:
            if not is_production_env():
                return
            if not bootstrap_password:
                raise RuntimeError("production 环境缺少 admin.bootstrap_password，无法初始化保留管理员账号")
            conn.execute(
                text(
                    'INSERT INTO "user" (username, hashed_password, is_admin, auth_version) '
                    "VALUES (:username, :hashed_password, 1, 1)"
                ),
                {
                    "username": admin_username,
                    "hashed_password": hash_password(bootstrap_password),
                },
            )
            return

        user_id, current_username, hashed_password, auth_version = reserved_admin
        exact_reserved_admin_id = conn.execute(
            text('SELECT id FROM "user" WHERE username = :username ORDER BY id LIMIT 1'),
            {"username": admin_username},
        ).scalar()

        updates = {}
        if current_username != admin_username and exact_reserved_admin_id in (None, user_id):
            updates["username"] = admin_username
        if is_production_env() and not has_usable_password_hash(hashed_password):
            if not bootstrap_password:
                raise RuntimeError("production 环境缺少 admin.bootstrap_password，无法修复保留管理员账号")
            updates["hashed_password"] = hash_password(bootstrap_password)
            updates["auth_version"] = int(auth_version) + 1

        if updates:
            assignments = ", ".join(f"{key} = :{key}" for key in updates)
            conn.execute(
                text(f'UPDATE "user" SET {assignments}, is_admin = 1 WHERE id = :id'),
                {**updates, "id": user_id},
            )

        if is_production_env():
            usable_reserved_admin = conn.execute(
                text(
                    'SELECT hashed_password FROM "user" '
                    "WHERE TRIM(username) = :username AND COALESCE(is_admin, 0) = 1 "
                    "ORDER BY id "
                    "LIMIT 1"
                ),
                {"username": admin_username},
            ).scalar()
            if not has_usable_password_hash(usable_reserved_admin):
                raise RuntimeError("production 环境未找到可用的保留管理员账号")
