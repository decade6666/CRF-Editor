"""性能 FK 索引轻量迁移的幂等性回归。

验证 _migrate_add_performance_fk_indexes 可重复执行不报错，且目标外键列索引已创建。
纯性能结构，不改变任何查询结果。
"""
from sqlalchemy import create_engine, inspect

from src.database import _migrate_add_performance_fk_indexes
from src.models import Base


def _index_names(engine, table: str) -> set[str]:
    inspector = inspect(engine)
    return {ix["name"] for ix in inspector.get_indexes(table)}


def test_fk_index_migration_is_idempotent():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    # 重复执行两次：第二次不得因索引已存在而报错。
    _migrate_add_performance_fk_indexes(engine)
    _migrate_add_performance_fk_indexes(engine)

    fd_indexes = _index_names(engine, "field_definition")
    ff_indexes = _index_names(engine, "form_field")
    assert "ix_field_definition_codelist_id" in fd_indexes
    assert "ix_field_definition_unit_id" in fd_indexes
    assert "ix_form_field_field_definition_id" in ff_indexes

    engine.dispose()
