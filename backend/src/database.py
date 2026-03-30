"""数据库 Session 管理"""
from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.orm import Session

from src.config import get_config
from src.models import Base

_engine = None


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


def _migrate_user_hashed_password_nullable(engine):
    """将 user.hashed_password 列改为 nullable。SQLite 不支持 ALTER COLUMN，需重建表。"""
    import logging

    logger = logging.getLogger("src.database")
    insp = inspect(engine)
    if not insp.has_table("user"):
        return

    cols = {c["name"]: c for c in insp.get_columns("user")}
    hashed_pw_col = cols.get("hashed_password")
    if hashed_pw_col and hashed_pw_col.get("nullable", False):
        logger.debug("user.hashed_password 已是 nullable，跳过迁移")
        return

    logger.info("迁移 user.hashed_password 为 nullable...")
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE "user_new" (id INTEGER PRIMARY KEY, username VARCHAR(100) NOT NULL, hashed_password VARCHAR(255), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'))
        conn.execute(text('INSERT INTO "user_new" (id, username, hashed_password, created_at) SELECT id, username, hashed_password, created_at FROM "user"'))
        conn.execute(text('DROP TABLE "user"'))
        conn.execute(text('ALTER TABLE "user_new" RENAME TO "user"'))
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username)'))
    logger.info("user.hashed_password 迁移完成")


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


def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    _migrate_add_code_columns(engine)
    _migrate_add_trailing_underscore(engine)
    _migrate_add_order_index(engine)
    _migrate_add_design_notes(engine)
    _migrate_add_color_mark(engine)
    _migrate_add_project_owner_id(engine)
    _migrate_user_hashed_password_nullable(engine)
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
