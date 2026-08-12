"""项目体积估算服务。

按需估算单个或多个项目的数据占用（字节）。不物化为 DB 列：

- 物化需要在 9 张子表的每次写入上做失效，form_field 在设计器里改得极频繁，
  陈旧值驱动不可逆的回收站自动清理风险太高，故采用按需计算。
- 每张子表一条按 project_id 分组的聚合查询，共 9 条，与项目数无关（O(表数)）。

这是**估算值**：忽略 B-tree 页空隙、索引键字节、freelist 页与 WAL，
通常比真实磁盘增量低报 1.5-3 倍。字段名统一 estimated_size_bytes，
UI/文档必须标注「估算」。它只需满足「单调、项目间可比」即可驱动容量规则。
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Sequence

from sqlalchemy import cast, func, literal, select
from sqlalchemy.types import LargeBinary
from sqlalchemy.orm import Session

from src.config import get_config
from src.models.codelist import CodeList, CodeListOption
from src.models.field import Field
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm

logger = logging.getLogger(__name__)

# 每行固定开销（rowid + 整型列 + 索引项的粗略摊销），唯一调参旋钮。
ROW_OVERHEAD_BYTES = 64


def _text_bytes(*cols) -> object:
    """构造 sum(0 + length(CAST(coalesce(col,'') AS BLOB)) + ...) 表达式。"""
    expr = literal(0)
    for col in cols:
        expr = expr + func.length(cast(func.coalesce(col, ""), LargeBinary))
    return func.sum(expr)


def _collect_project_text_bytes(session: Session, project_ids: Sequence[int]) -> Dict[int, int]:
    """对每张相关表跑一条按 project_id 分组的聚合，合并为 {id: bytes}。

    SQLite 3.37 无 octet_length，用 length(CAST(col AS BLOB))。
    子表通过 Visit/Form/CodeList join 回 project_id；visit_form 无文本列只计行开销。
    """
    if not project_ids:
        return {}

    id_to_bytes: Dict[int, int] = {pid: 0 for pid in project_ids}

    def _merge(rows) -> None:
        for pid, size in rows:
            if pid in id_to_bytes and size is not None:
                id_to_bytes[pid] += int(size)

    # project 自身文本列
    rows = session.execute(
        select(
            Project.id,
            _text_bytes(
                Project.name, Project.version, Project.db_type, Project.trial_name,
                Project.crf_version, Project.protocol_number,
                Project.screening_number_format, Project.sponsor,
                Project.company_logo_path, Project.data_management_unit,
            ),
        ).where(Project.id.in_(list(project_ids))).group_by(Project.id)
    ).all()
    _merge(rows)

    # visit: name, code
    rows = session.execute(
        select(
            Visit.project_id,
            _text_bytes(Visit.name, Visit.code),
        ).where(Visit.project_id.in_(list(project_ids))).group_by(Visit.project_id)
    ).all()
    _merge(rows)

    # visit_form: 仅行开销（无文本列），通过 Visit join
    rows = session.execute(
        select(
            Visit.project_id,
            func.sum(literal(ROW_OVERHEAD_BYTES)),
        )
        .join(VisitForm, VisitForm.visit_id == Visit.id)
        .where(Visit.project_id.in_(list(project_ids)))
        .group_by(Visit.project_id)
    ).all()
    _merge(rows)

    # form: name, code, domain, design_notes, annotation_positions
    rows = session.execute(
        select(
            Form.project_id,
            _text_bytes(
                Form.name, Form.code, Form.domain, Form.design_notes, Form.annotation_positions,
            ),
        ).where(Form.project_id.in_(list(project_ids))).group_by(Form.project_id)
    ).all()
    _merge(rows)

    # field: variable_name, label, field_type, date_format, table_type（通过 Form join）
    rows = session.execute(
        select(
            Form.project_id,
            _text_bytes(Field.variable_name, Field.label, Field.field_type,
                        Field.date_format, Field.table_type),
        )
        .join(Field, Field.form_id == Form.id)
        .where(Form.project_id.in_(list(project_ids)))
        .group_by(Form.project_id)
    ).all()
    _merge(rows)

    # form_field: label_override, help_text, default_value, bg_color, text_color, label_font_size
    rows = session.execute(
        select(
            Form.project_id,
            _text_bytes(
                FormField.label_override, FormField.help_text, FormField.default_value,
                FormField.bg_color, FormField.text_color, FormField.label_font_size,
            ),
        )
        .join(FormField, FormField.form_id == Form.id)
        .where(Form.project_id.in_(list(project_ids)))
        .group_by(Form.project_id)
    ).all()
    _merge(rows)

    # field_definition: variable_name, label, field_type, checkbox_label, date_format, table_type
    rows = session.execute(
        select(
            FieldDefinition.project_id,
            _text_bytes(
                FieldDefinition.variable_name, FieldDefinition.label, FieldDefinition.field_type,
                FieldDefinition.checkbox_label, FieldDefinition.date_format, FieldDefinition.table_type,
            ),
        ).where(FieldDefinition.project_id.in_(list(project_ids))).group_by(FieldDefinition.project_id)
    ).all()
    _merge(rows)

    # codelist: name, code, description
    rows = session.execute(
        select(
            CodeList.project_id,
            _text_bytes(CodeList.name, CodeList.code, CodeList.description),
        ).where(CodeList.project_id.in_(list(project_ids))).group_by(CodeList.project_id)
    ).all()
    _merge(rows)

    # codelist_option: code, decode（通过 CodeList join）
    rows = session.execute(
        select(
            CodeList.project_id,
            _text_bytes(CodeListOption.code, CodeListOption.decode),
        )
        .join(CodeListOption, CodeListOption.codelist_id == CodeList.id)
        .where(CodeList.project_id.in_(list(project_ids)))
        .group_by(CodeList.project_id)
    ).all()
    _merge(rows)

    # unit: symbol, code
    rows = session.execute(
        select(
            Unit.project_id,
            _text_bytes(Unit.symbol, Unit.code),
        ).where(Unit.project_id.in_(list(project_ids))).group_by(Unit.project_id)
    ).all()
    _merge(rows)

    return id_to_bytes


def _add_logo_bytes(session: Session, id_to_bytes: Dict[int, int]) -> None:
    """为每个有 logo 的项目按 stat() 累加磁盘文件字节。"""
    rows = session.execute(
        select(Project.id, Project.company_logo_path).where(
            Project.id.in_(list(id_to_bytes.keys())),
            Project.company_logo_path.is_not(None),
            Project.company_logo_path != "",
        )
    ).all()
    logo_dir = Path(get_config().upload_path)
    for pid, logo_name in rows:
        try:
            size = (logo_dir / "logos" / logo_name).stat().st_size
            id_to_bytes[pid] += int(size)
        except OSError:
            # 文件缺失或不可访问，不计入
            continue


def estimate_project_sizes(session: Session, project_ids: Sequence[int]) -> Dict[int, int]:
    """估算指定项目集合的数据占用（字节）。"""
    id_to_bytes = _collect_project_text_bytes(session, project_ids)
    _add_logo_bytes(session, id_to_bytes)
    return id_to_bytes


def estimate_recycled_project_sizes(session: Session) -> Dict[int, int]:
    """估算所有回收站项目（deleted_at 非空）的数据占用。"""
    ids = list(
        session.scalars(
            select(Project.id).where(Project.deleted_at.is_not(None)).order_by(Project.id)
        ).all()
    )
    return estimate_project_sizes(session, ids)


def format_bytes(n: int) -> str:
    """格式化字节数为人类可读串（1024 进制，一位小数）。"""
    if n is None or not isinstance(n, (int, float)) or n < 0:
        return "-"
    n = int(n)
    if n < 1024:
        return f"{n} B"
    units = ["KB", "MB", "GB", "TB"]
    size = float(n)
    for unit in units:
        size /= 1024.0
        if size < 1024:
            if size < 1:
                return "< 1 KB"
            return f"{size:.1f} {unit}"
    return f"{size:.1f} TB"