"""数据库 Session 管理"""

import logging
import time
from typing import Optional

from sqlalchemy import create_engine, event, text, inspect

from sqlalchemy.orm import Session

from src.perf import (
    increment_sqlite_busy_count,
    is_perf_baseline_enabled,
    record_sql_statement,
    record_sqlite_busy_wait,
)


_FORM_FIELD_CANONICAL_COLUMNS = (
    ("id", None),
    ("form_id", None),
    ("field_definition_id", None),
    ("is_log_row", "0"),
    ("order_index", None),
    ("required", "0"),
    ("label_override", "NULL"),
    ("help_text", "NULL"),
    ("default_value", "NULL"),
    ("inline_mark", "0"),
    ("bg_color", "NULL"),
    ("text_color", "NULL"),
    ("created_at", "CURRENT_TIMESTAMP"),
    ("updated_at", "CURRENT_TIMESTAMP"),
)

_FORM_FIELD_REQUIRED_SOURCE_COLUMNS = frozenset({
    "id",
    "form_id",
    "field_definition_id",
    "order_index",
})



from src.config import get_config, is_production_env

from src.models import Base
from src.services.auth_service import has_usable_password_hash, hash_password


logger = logging.getLogger("src.database")



_engine = None


def attach_perf_sql_listeners(engine) -> None:

    if getattr(engine, "_crf_perf_listeners_attached", False):
        return

    @event.listens_for(engine, "before_cursor_execute")
    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if not is_perf_baseline_enabled():
            return
        conn.info.setdefault("crf_perf_started_at", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if not is_perf_baseline_enabled():
            return
        started_stack = conn.info.get("crf_perf_started_at") or []
        if not started_stack:
            return
        started_at = started_stack.pop()
        elapsed_ms = max((time.perf_counter() - started_at) * 1000.0, 0.0)
        try:
            record_sql_statement(statement, elapsed_ms)
        except Exception:
            logger.debug("perf sql listener skipped statement aggregation", exc_info=True)
        lowered_statement = statement.lower()
        if "busy" in lowered_statement:
            increment_sqlite_busy_count()
            record_sqlite_busy_wait(elapsed_ms)

    engine._crf_perf_listeners_attached = True



def get_engine():

    global _engine

    if _engine is None:

        config = get_config()

        _engine = create_engine(f"sqlite:///{config.db_path}", connect_args={"check_same_thread": False})



        # SQLite 默认不启用外键约束，必须每次连接时手动开启；同时启用 WAL 模式提升并发性能

        @event.listens_for(_engine, "connect")

        def _configure_sqlite(dbapi_conn, connection_record):

            dbapi_conn.execute("PRAGMA foreign_keys = ON")

            dbapi_conn.execute("PRAGMA journal_mode=WAL")

            dbapi_conn.execute("PRAGMA busy_timeout=5000")

            dbapi_conn.execute("PRAGMA synchronous=NORMAL")

        attach_perf_sql_listeners(_engine)

    return _engine





def _migrate_add_code_columns(engine):

    """给已有表补上 code 列（SQLite 不支持 IF NOT EXISTS，用 inspect 判断）"""

    insp = inspect(engine)

    tables = ["codelist", "unit", "form", "visit"]

    with engine.begin() as conn:

        for table in tables:

            if not insp.has_table(table):

                continue

            cols = [c["name"] for c in insp.get_columns(table)]

            if "code" not in cols:

                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN code VARCHAR(100)'))





def _migrate_add_trailing_underscore(engine):

    """给 codelist_option 表补上 trailing_underscore 列"""

    insp = inspect(engine)

    if not insp.has_table("codelist_option"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("codelist_option")]

        if "trailing_underscore" not in cols:

            conn.execute(text('ALTER TABLE "codelist_option" ADD COLUMN trailing_underscore INTEGER DEFAULT 0 NOT NULL'))





def _migrate_add_order_index(engine):

    """给相关表补上 order_index 列并回填数据"""

    insp = inspect(engine)

    tables = ["unit", "field_definition", "form", "codelist", "codelist_option"]



    with engine.begin() as conn:

        # 1. 添加 order_index 列

        for table in tables:

            if not insp.has_table(table):

                continue

            cols = [c["name"] for c in insp.get_columns(table)]

            if "order_index" not in cols:

                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN order_index INTEGER'))



        # 2. 回填数据（仅回填 NULL 值，避免重置用户排序）

        # Unit: 按 project_id 分组

        if insp.has_table("unit"):

            result = conn.execute(text("SELECT DISTINCT project_id FROM unit WHERE project_id IS NOT NULL AND order_index IS NULL"))

            for (project_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM unit WHERE project_id = :pid AND order_index IS NULL ORDER BY id"

                ), {"pid": project_id}).fetchall()

                if not rows:

                    continue

                max_order = conn.execute(text(

                    "SELECT COALESCE(MAX(order_index), 0) FROM unit WHERE project_id = :pid"

                ), {"pid": project_id}).scalar()

                for idx, (unit_id,) in enumerate(rows, start=max_order + 1):

                    conn.execute(text(

                        "UPDATE unit SET order_index = :idx WHERE id = :id"

                    ), {"idx": idx, "id": unit_id})



        # FieldDefinition: 按 project_id 分组

        if insp.has_table("field_definition"):

            result = conn.execute(text("SELECT DISTINCT project_id FROM field_definition WHERE project_id IS NOT NULL AND order_index IS NULL"))

            for (project_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM field_definition WHERE project_id = :pid AND order_index IS NULL ORDER BY id"

                ), {"pid": project_id}).fetchall()

                if not rows:

                    continue

                max_order = conn.execute(text(

                    "SELECT COALESCE(MAX(order_index), 0) FROM field_definition WHERE project_id = :pid"

                ), {"pid": project_id}).scalar()

                for idx, (fd_id,) in enumerate(rows, start=max_order + 1):

                    conn.execute(text(

                        "UPDATE field_definition SET order_index = :idx WHERE id = :id"

                    ), {"idx": idx, "id": fd_id})



        # Form: 按 project_id 分组

        if insp.has_table("form"):

            result = conn.execute(text("SELECT DISTINCT project_id FROM form WHERE project_id IS NOT NULL AND order_index IS NULL"))

            for (project_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM form WHERE project_id = :pid AND order_index IS NULL ORDER BY id"

                ), {"pid": project_id}).fetchall()

                if not rows:

                    continue

                max_order = conn.execute(text(

                    "SELECT COALESCE(MAX(order_index), 0) FROM form WHERE project_id = :pid"

                ), {"pid": project_id}).scalar()

                for idx, (form_id,) in enumerate(rows, start=max_order + 1):

                    conn.execute(text(

                        "UPDATE form SET order_index = :idx WHERE id = :id"

                    ), {"idx": idx, "id": form_id})



        # CodeList: 按 project_id 分组

        if insp.has_table("codelist"):

            result = conn.execute(text("SELECT DISTINCT project_id FROM codelist WHERE project_id IS NOT NULL AND order_index IS NULL"))

            for (project_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM codelist WHERE project_id = :pid AND order_index IS NULL ORDER BY id"

                ), {"pid": project_id}).fetchall()

                if not rows:

                    continue

                max_order = conn.execute(text(

                    "SELECT COALESCE(MAX(order_index), 0) FROM codelist WHERE project_id = :pid"

                ), {"pid": project_id}).scalar()

                for idx, (cl_id,) in enumerate(rows, start=max_order + 1):

                    conn.execute(text(

                        "UPDATE codelist SET order_index = :idx WHERE id = :id"

                    ), {"idx": idx, "id": cl_id})



        # CodeListOption: 按 codelist_id 分组

        if insp.has_table("codelist_option"):

            result = conn.execute(text("SELECT DISTINCT codelist_id FROM codelist_option WHERE codelist_id IS NOT NULL AND order_index IS NULL"))

            for (codelist_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM codelist_option WHERE codelist_id = :cid AND order_index IS NULL ORDER BY id"

                ), {"cid": codelist_id}).fetchall()

                if not rows:

                    continue

                max_order = conn.execute(text(

                    "SELECT COALESCE(MAX(order_index), 0) FROM codelist_option WHERE codelist_id = :cid"

                ), {"cid": codelist_id}).scalar()

                for idx, (opt_id,) in enumerate(rows, start=max_order + 1):

                    conn.execute(text(

                        "UPDATE codelist_option SET order_index = :idx WHERE id = :id"

                    ), {"idx": idx, "id": opt_id})



        # Visit: 仅回填 sequence IS NULL 的记录

        if insp.has_table("visit"):

            result = conn.execute(text("SELECT DISTINCT project_id FROM visit WHERE project_id IS NOT NULL AND sequence IS NULL"))

            for (project_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM visit WHERE project_id = :pid AND sequence IS NULL ORDER BY id"

                ), {"pid": project_id}).fetchall()

                if not rows:

                    continue

                max_seq = conn.execute(text(

                    "SELECT COALESCE(MAX(sequence), 0) FROM visit WHERE project_id = :pid"

                ), {"pid": project_id}).scalar()

                for idx, (visit_id,) in enumerate(rows, start=max_seq + 1):

                    conn.execute(text(

                        "UPDATE visit SET sequence = :idx WHERE id = :id"

                    ), {"idx": idx, "id": visit_id})



        # 3. 创建唯一索引（IF NOT EXISTS 已处理重复创建）

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_project_order ON unit(project_id, order_index)"))

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_field_def_project_order ON field_definition(project_id, order_index)"))

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_form_project_order ON form(project_id, order_index)"))

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_codelist_project_order ON codelist(project_id, order_index)"))

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_codelist_option_order ON codelist_option(codelist_id, order_index)"))





def _migrate_add_design_notes(engine):

    """给 form 表补上 design_notes 列"""

    insp = inspect(engine)

    if not insp.has_table("form"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("form")]

        if "design_notes" not in cols:

            conn.execute(text('ALTER TABLE "form" ADD COLUMN design_notes TEXT'))





def _migrate_add_color_mark(engine):

    """给 form_field 表补上 bg_color 和 text_color 列"""

    insp = inspect(engine)

    if not insp.has_table("form_field"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("form_field")]

        # 旧的 color_mark 列（如果存在）迁移到 bg_color

        if "color_mark" in cols and "bg_color" not in cols:

            conn.execute(text('ALTER TABLE form_field ADD COLUMN bg_color VARCHAR(10) DEFAULT NULL'))

            conn.execute(text('UPDATE form_field SET bg_color = color_mark WHERE color_mark IS NOT NULL'))

        elif "bg_color" not in cols:

            conn.execute(text('ALTER TABLE form_field ADD COLUMN bg_color VARCHAR(10) DEFAULT NULL'))

        if "text_color" not in cols:

            conn.execute(text('ALTER TABLE form_field ADD COLUMN text_color VARCHAR(10) DEFAULT NULL'))

        # 清理旧列

        if "color_mark" in cols:

            conn.execute(text('ALTER TABLE form_field DROP COLUMN color_mark'))





def _migrate_add_project_owner_id(engine):

    """给 project 表添加 owner_id 列（若不存在）"""

    insp = inspect(engine)

    if not insp.has_table("project"):

        return

    cols = [c["name"] for c in insp.get_columns("project")]

    if "owner_id" not in cols:

        with engine.begin() as conn:

            conn.execute(text('ALTER TABLE project ADD COLUMN owner_id INTEGER REFERENCES "user"(id)'))



def _migrate_add_project_screening_number_format(engine):

    """给 project 表补上 screening_number_format 列。"""

    insp = inspect(engine)

    if not insp.has_table("project"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("project")]

        if "screening_number_format" not in cols:

            conn.execute(text('ALTER TABLE project ADD COLUMN screening_number_format VARCHAR(100)'))





def _migrate_add_user_is_admin(engine):

    """给 user 表补上 is_admin 列。"""

    insp = inspect(engine)

    if not insp.has_table("user"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("user")]

        if "is_admin" not in cols:

            conn.execute(text('ALTER TABLE "user" ADD COLUMN is_admin INTEGER DEFAULT 0 NOT NULL'))




def _migrate_user_hashed_password_nullable(engine):

    """将 user.hashed_password 列改为 nullable。SQLite 不支持 ALTER COLUMN，需重建表。"""

    insp = inspect(engine)

    if not insp.has_table("user"):

        return



    cols = {c["name"]: c for c in insp.get_columns("user")}

    hashed_pw_col = cols.get("hashed_password")

    if hashed_pw_col and hashed_pw_col.get("nullable", False):

        logger.debug("user.hashed_password 已是 nullable，跳过迁移")

        return



    logger.info("迁移 user.hashed_password 为 nullable...")

    has_is_admin = "is_admin" in cols

    with engine.begin() as conn:

        has_auth_version = "auth_version" in cols

        conn.execute(text(
            'CREATE TABLE "user_new" ('
            'id INTEGER PRIMARY KEY, '
            'username VARCHAR(100) NOT NULL, '
            'hashed_password VARCHAR(255), '
            'is_admin INTEGER DEFAULT 0 NOT NULL, '
            'auth_version INTEGER DEFAULT 0 NOT NULL, '
            'created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
        ))

        if has_is_admin and has_auth_version:

            conn.execute(text(
                'INSERT INTO "user_new" (id, username, hashed_password, is_admin, auth_version, created_at) '
                'SELECT id, username, hashed_password, COALESCE(is_admin, 0), COALESCE(auth_version, 0), created_at FROM "user"'
            ))

        elif has_is_admin:

            conn.execute(text(
                'INSERT INTO "user_new" (id, username, hashed_password, is_admin, auth_version, created_at) '
                'SELECT id, username, hashed_password, COALESCE(is_admin, 0), 0, created_at FROM "user"'
            ))

        else:

            conn.execute(text(
                'INSERT INTO "user_new" (id, username, hashed_password, is_admin, auth_version, created_at) '
                'SELECT id, username, hashed_password, 0, 0, created_at FROM "user"'
            ))

        conn.execute(text('DROP TABLE "user"'))

        conn.execute(text('ALTER TABLE "user_new" RENAME TO "user"'))

        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)'))

    logger.info("user.hashed_password 迁移完成")




def _migrate_add_user_auth_version(engine):

    """给 user 表补上 auth_version 列。"""

    insp = inspect(engine)

    if not insp.has_table("user"):

        return

    with engine.begin() as conn:

        cols = [c["name"] for c in insp.get_columns("user")]

        if "auth_version" not in cols:

            conn.execute(text('ALTER TABLE "user" ADD COLUMN auth_version INTEGER DEFAULT 0 NOT NULL'))


def _heal_reserved_admin_account(engine):

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
            text(
                'UPDATE "user" '
                'SET is_admin = 1 '
                'WHERE TRIM(username) = :username AND COALESCE(is_admin, 0) != 1'
            ),
            {"username": admin_username},
        )

        reserved_admin = conn.execute(
            text(
                'SELECT id, username, hashed_password, COALESCE(auth_version, 0) '
                'FROM "user" '
                'WHERE TRIM(username) = :username '
                'ORDER BY id '
                'LIMIT 1'
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
                    'VALUES (:username, :hashed_password, 1, 1)'
                ),
                {
                    "username": admin_username,
                    "hashed_password": hash_password(bootstrap_password),
                },
            )
            return

        user_id, current_username, hashed_password, auth_version = reserved_admin
        exact_reserved_admin_id = conn.execute(
            text(
                'SELECT id FROM "user" '
                'WHERE username = :username '
                'ORDER BY id '
                'LIMIT 1'
            ),
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
            assignments = ", ".join(f'{key} = :{key}' for key in updates)
            conn.execute(
                text(f'UPDATE "user" SET {assignments}, is_admin = 1 WHERE id = :id'),
                {**updates, "id": user_id},
            )

        if is_production_env():
            usable_reserved_admin = conn.execute(
                text(
                    'SELECT hashed_password FROM "user" '
                    'WHERE TRIM(username) = :username AND COALESCE(is_admin, 0) = 1 '
                    'ORDER BY id '
                    'LIMIT 1'
                ),
                {"username": admin_username},
            ).scalar()
            if not has_usable_password_hash(usable_reserved_admin):
                raise RuntimeError("production 环境未找到可用的保留管理员账号")



def _warn_orphan_projects(engine):

    """检查并警告孤立项目（owner_id 为 NULL）。"""

    import logging



    logger = logging.getLogger("src.database")

    insp = inspect(engine)

    if not insp.has_table("project"):

        return



    with engine.begin() as conn:

        count = conn.execute(text("SELECT COUNT(*) FROM project WHERE owner_id IS NULL")).scalar()

        if count > 0:

            logger.warning("发现 %d 个孤立项目（owner_id 为 NULL），这些项目将无法被任何用户访问", count)





def _is_form_field_rowid_pk_compatible(engine) -> bool:
    """检查 form_field.id 是否仍是 SQLite 可自动生成的 rowid 主键语义。

    SQLite rowid alias 条件（全部必须满足）：
    1. 列声明类型精确为 INTEGER（不是 INT、BIGINT 等缩写）
    2. 是单列 PRIMARY KEY
    3. 非 DESC 排序
    4. 表不是 WITHOUT ROWID
    """
    import re

    insp = inspect(engine)
    if not insp.has_table("form_field"):
        return True

    with engine.connect() as conn:
        create_sql = conn.execute(text(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='form_field'"
        )).scalar()

    if not create_sql:
        return False

    normalized = create_sql.upper()

    if "WITHOUT ROWID" in normalized:
        return False

    # 检查内联主键：id INTEGER PRIMARY KEY（非 DESC）
    # SQLite rowid alias 要求声明类型精确为 "INTEGER"，不能是 INT/BIGINT 等
    inline_pk = re.search(
        r'\bID\s+INTEGER\s+(?:NOT\s+NULL\s+)?PRIMARY\s+KEY\b(?!\s+DESC)',
        normalized,
    )
    if inline_pk:
        return True

    # 检查表级主键：PRIMARY KEY (id)（非 DESC）
    table_pk = re.search(
        r'PRIMARY\s+KEY\s*\(\s*ID\s*\)',
        normalized,
    )
    if table_pk:
        # 表级 PRIMARY KEY(id) 也要求 id 列声明类型精确为 INTEGER
        id_col_match = re.search(r'\bID\s+(INTEGER)\b', normalized)
        if id_col_match:
            return True

    return False



def _rebuild_form_field_table(conn, *, log_message: str) -> None:
    """按规范 DDL 重建 form_field 表，保留现有数据与约束。"""
    import logging
    logger = logging.getLogger("src.database")

    logger.info(log_message)

    conn.execute(text("""
        CREATE TABLE form_field_new (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL REFERENCES form(id) ON DELETE CASCADE,
            field_definition_id INTEGER REFERENCES field_definition(id) ON DELETE CASCADE,
            is_log_row INTEGER NOT NULL DEFAULT 0,
            order_index INTEGER NOT NULL DEFAULT 1,
            required INTEGER NOT NULL DEFAULT 0,
            label_override VARCHAR(255),
            help_text VARCHAR(255),
            default_value TEXT,
            inline_mark INTEGER NOT NULL DEFAULT 0,
            bg_color VARCHAR(10),
            text_color VARCHAR(10),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))

    insert_columns = []
    select_columns = []
    existing_columns = {
        row[1] for row in conn.execute(text("PRAGMA table_info(form_field)")).fetchall()
    }
    missing_required_columns = sorted(_FORM_FIELD_REQUIRED_SOURCE_COLUMNS - existing_columns)
    if missing_required_columns:
        raise RuntimeError(
            "form_field 表缺少重建所需列: " + ", ".join(missing_required_columns)
        )

    for column_name, default_expr in _FORM_FIELD_CANONICAL_COLUMNS:
        insert_columns.append(column_name)
        if column_name in existing_columns:
            select_columns.append(column_name)
        else:
            select_columns.append(default_expr)

    conn.execute(text(
        f"INSERT INTO form_field_new ({', '.join(insert_columns)}) "
        f"SELECT {', '.join(select_columns)} FROM form_field"
    ))

    conn.execute(text("DROP TABLE form_field"))
    conn.execute(text("ALTER TABLE form_field_new RENAME TO form_field"))
    conn.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_form_field "
        "ON form_field(form_id, field_definition_id)"
    ))

    logger.info("form_field 表重建完成，约束已保留")



def _rebuild_form_field_without_sort_order(conn, insp):
    """重建 form_field 表以移除 legacy sort_order 列。"""
    cols_info = insp.get_columns("form_field")
    has_sort_order = any(c["name"] == "sort_order" for c in cols_info)
    if not has_sort_order:
        return  # 无需迁移

    _rebuild_form_field_table(conn, log_message="重建 form_field 表以移除 sort_order 列...")


def _migrate_project_soft_delete_and_ordering(engine):

    """给 project 表添加 order_index 和 deleted_at 列，并给 form_field 添加 order_index 列（迁移 sort_order）"""

    insp = inspect(engine)

    with engine.begin() as conn:

        # 1. Project 迁移

        project_order_index_added = False
        if insp.has_table("project"):

            cols = [c["name"] for c in insp.get_columns("project")]

            if "order_index" not in cols:

                conn.execute(text('ALTER TABLE project ADD COLUMN order_index INTEGER DEFAULT 1 NOT NULL'))
                project_order_index_added = True

            if "deleted_at" not in cols:

                conn.execute(text('ALTER TABLE project ADD COLUMN deleted_at DATETIME'))



        # 2. FormField 迁移 (sort_order -> order_index)
        if insp.has_table("form_field"):
            cols = [c["name"] for c in insp.get_columns("form_field")]
            if "order_index" not in cols:
                conn.execute(text('ALTER TABLE form_field ADD COLUMN order_index INTEGER DEFAULT 1 NOT NULL'))
                # 用 legacy sort_order 回填（若存在）
                if "sort_order" in cols:
                    conn.execute(text(
                        'UPDATE form_field SET order_index = sort_order '
                        'WHERE sort_order IS NOT NULL AND sort_order > 0'
                    ))
            # 移除 legacy sort_order 的 NOT NULL 约束（通过重建表）
            if "sort_order" in cols:
                _rebuild_form_field_without_sort_order(conn, insp)

        # 3. Project order_index 数据回填（仅首次添加列时执行）

        if project_order_index_added and insp.has_table("project"):

            result = conn.execute(text("SELECT DISTINCT owner_id FROM project WHERE owner_id IS NOT NULL"))

            for (owner_id,) in result:

                rows = conn.execute(text(

                    "SELECT id FROM project WHERE owner_id = :oid ORDER BY id"

                ), {"oid": owner_id}).fetchall()

                for idx, (pid,) in enumerate(rows, start=1):

                    conn.execute(text("UPDATE project SET order_index = :idx WHERE id = :pid"), {"idx": idx, "pid": pid})





def _ensure_form_field_rowid_compatibility(engine):
    """确保 form_field.id 保持 SQLite rowid 主键语义。"""
    insp = inspect(engine)
    if not insp.has_table("form_field"):
        return

    if _is_form_field_rowid_pk_compatible(engine):
        return

    with engine.begin() as conn:
        _rebuild_form_field_table(
            conn,
            log_message="检测到 form_field 主键语义异常，正在重建表以恢复 SQLite rowid 兼容性...",
        )


def init_db():

    engine = get_engine()

    Base.metadata.create_all(engine)

    _migrate_add_code_columns(engine)

    _migrate_add_trailing_underscore(engine)

    _migrate_add_order_index(engine)

    _migrate_add_design_notes(engine)

    _migrate_add_color_mark(engine)

    _migrate_add_project_owner_id(engine)

    _migrate_add_project_screening_number_format(engine)

    _migrate_add_user_is_admin(engine)

    _migrate_project_soft_delete_and_ordering(engine)

    _migrate_user_hashed_password_nullable(engine)

    _migrate_add_user_auth_version(engine)

    _ensure_form_field_rowid_compatibility(engine)

    _heal_reserved_admin_account(engine)

    _warn_orphan_projects(engine)





def get_session():

    """写操作 Session：开启事务，确保原子性（POST/PUT/DELETE 使用）"""

    with Session(get_engine()) as session:

        with session.begin():

            yield session





def get_read_session():

    """只读 Session：不开启事务，减少长时间只读操作（如导出）对写操作的阻塞"""

    with Session(get_engine()) as session:

        yield session
