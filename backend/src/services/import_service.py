"""模板导入服务 - 从外部 .db 文件导入表单到当前项目"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.project import Project
from src.models.form import Form
from src.models.form_field import FormField
from src.models.field_definition import FieldDefinition
from src.models.codelist import CodeList, CodeListOption
from src.models.unit import Unit
from src.utils import generate_code
from src.services.order_service import OrderService


class ImportService:
    """模板导入服务（双 Engine 读写分离）"""

    def __init__(self, session: Session):
        self.session = session

    # ------------------------------------------------------------------
    # 模板库只读访问
    # ------------------------------------------------------------------

    @staticmethod
    def _open_template_session(template_path: str) -> Session:
        """打开模板库只读 Session

        不使用 SQLite URI 模式，因为 SQLAlchemy URL 解析器会破坏中文路径。
        改用 creator 回调直接传原始路径给 sqlite3，再通过事件钩子设置只读。
        """
        path = Path(template_path)
        if not path.exists():
            raise FileNotFoundError(f"模板文件不存在: {template_path}")
        if path.suffix.lower() != ".db":
            raise ValueError(f"模板文件必须是 .db 格式: {template_path}")

        db_path = str(path.resolve())

        # 创建只读 Engine（移除迁移逻辑，防止修改外部数据库）
        engine = create_engine(
            "sqlite+pysqlite://",
            creator=lambda: sqlite3.connect(db_path, check_same_thread=False),
        )

        @event.listens_for(engine, "connect")
        def _set_readonly(dbapi_conn, connection_record):
            dbapi_conn.execute("PRAGMA query_only = ON")

        return sessionmaker(bind=engine)()

    def get_template_projects(self, template_path: str) -> List[dict]:
        """读取模板库中的项目列表（含表单）"""
        tmpl = self._open_template_session(template_path)
        try:
            projects = list(tmpl.scalars(
                select(Project).order_by(Project.id)
            ).all())
            result = []
            for p in projects:
                forms = list(tmpl.scalars(
                    select(Form)
                    .where(Form.project_id == p.id)
                    .order_by(Form.id)
                ).all())
                result.append({
                    "id": p.id,
                    "name": p.name,
                    "version": p.version,
                    "forms": [
                        {"id": f.id, "name": f.name, "domain": f.domain}
                        for f in forms
                    ],
                })
            return result
        finally:
            tmpl.close()

    def get_template_form_fields(self, template_path: str, form_id: int) -> List[dict]:
        """读取模板表单的字段详情，返回与 SimulatedCRFForm 兼容的字段列表"""
        tmpl = self._open_template_session(template_path)
        try:
            # 获取排序后的表单字段列表
            form_fields = list(tmpl.scalars(
                select(FormField)
                .where(FormField.form_id == form_id)
                .order_by(FormField.sort_order)
            ).all())

            # 收集所有需要查询的 codelist_id
            fd_ids = [
                ff.field_definition_id for ff in form_fields
                if ff.field_definition_id is not None
            ]
            field_def_map: Dict[int, FieldDefinition] = {}
            codelist_options_map: Dict[int, List[str]] = {}
            unit_map: Dict[int, str] = {}

            if fd_ids:
                for fd in tmpl.scalars(
                    select(FieldDefinition).where(FieldDefinition.id.in_(fd_ids))
                ).all():
                    field_def_map[fd.id] = fd

                # 收集所有 codelist_id 并一次性查询选项
                codelist_ids = {
                    fd.codelist_id for fd in field_def_map.values()
                    if fd.codelist_id is not None
                }
                if codelist_ids:
                    for opt in tmpl.scalars(
                        select(CodeListOption)
                        .where(CodeListOption.codelist_id.in_(codelist_ids))
                        .order_by(CodeListOption.codelist_id, CodeListOption.order_index, CodeListOption.id)
                    ).all():
                        codelist_options_map.setdefault(opt.codelist_id, []).append(opt.decode)

                # 收集所有 unit_id 并一次性查询单位符号
                unit_ids = {
                    fd.unit_id for fd in field_def_map.values()
                    if fd.unit_id is not None
                }
                if unit_ids:
                    for u in tmpl.scalars(
                        select(Unit).where(Unit.id.in_(unit_ids))
                    ).all():
                        unit_map[u.id] = u.symbol

            result = []
            for idx, ff in enumerate(form_fields):
                # 跳过日志行
                if ff.is_log_row:
                    continue

                fd = field_def_map.get(ff.field_definition_id) if ff.field_definition_id else None
                if fd is None:
                    continue

                # label_override 优先于字段定义的 label
                label = ff.label_override or fd.label
                options = codelist_options_map.get(fd.codelist_id) if fd.codelist_id else None

                result.append({
                    "index": idx,
                    "label": label,
                    "field_type": fd.field_type,
                    "options": options,
                    "integer_digits": fd.integer_digits,
                    "decimal_digits": fd.decimal_digits,
                    "date_format": fd.date_format,
                    "default_value": ff.default_value,
                    "inline_mark": bool(ff.inline_mark),
                    "unit_symbol": unit_map.get(fd.unit_id) if fd.unit_id else None,
                })
            return result
        finally:
            tmpl.close()

    # ------------------------------------------------------------------
    # 冲突处理辅助方法
    # ------------------------------------------------------------------

    @staticmethod
    def _make_unique_name(existing: set, base: str, suffix: str = "_导入") -> str:
        """生成不冲突的名称：base_导入 → base_导入2 → ..."""
        candidate = f"{base}{suffix}"
        if candidate not in existing:
            return candidate
        idx = 2
        while f"{base}{suffix}{idx}" in existing:
            idx += 1
        return f"{base}{suffix}{idx}"

    @staticmethod
    def _make_unique_var(existing: set, base: str) -> str:
        """生成不冲突的变量名：base_IMP → base_IMP2 → ..."""
        candidate = f"{base}_IMP"
        if candidate not in existing:
            return candidate
        idx = 2
        while f"{base}_IMP{idx}" in existing:
            idx += 1
        return f"{base}_IMP{idx}"

    # ------------------------------------------------------------------
    # 核心导入方法
    # ------------------------------------------------------------------

    def import_forms(
        self,
        target_project_id: int,
        template_path: str,
        source_project_id: int,
        form_ids: List[int],
    ) -> dict:
        """从模板库导入表单到目标项目（单事务，由调用方控制提交）

        Returns:
            导入摘要 dict
        """
        tmpl = self._open_template_session(template_path)
        try:
            return self._do_import(tmpl, target_project_id, source_project_id, form_ids)
        finally:
            tmpl.close()

    def _do_import(
        self,
        tmpl: Session,
        target_project_id: int,
        source_project_id: int,
        form_ids: List[int],
    ) -> dict:
        """实际导入逻辑"""
        s = self.session  # 主库 session
        summary = {
            "imported_form_count": 0,
            "renamed_forms": [],
            "merged_codelists": 0,
            "merged_units": 0,
            "created_field_definitions": 0,
            "created_form_fields": 0,
        }

        # ---- 1. 构建目标库已有数据缓存 ----
        existing_forms = {
            f.name for f in s.scalars(
                select(Form).where(Form.project_id == target_project_id)
            ).all()
        }
        existing_units = {
            u.symbol: u.id for u in s.scalars(
                select(Unit).where(Unit.project_id == target_project_id)
            ).all()
        }
        existing_codelists = {
            c.name: c.id for c in s.scalars(
                select(CodeList).where(CodeList.project_id == target_project_id)
            ).all()
        }
        existing_field_vars = {
            fd.variable_name for fd in s.scalars(
                select(FieldDefinition).where(
                    FieldDefinition.project_id == target_project_id
                )
            ).all()
        }

        # ---- ID 映射表 ----
        unit_id_map: Dict[int, int] = {}      # 源ID → 目标ID
        codelist_id_map: Dict[int, int] = {}
        field_def_id_map: Dict[int, int] = {}

        # ---- 2. 收集源表单依赖的字段定义 ----
        src_forms = list(tmpl.scalars(
            select(Form)
            .where(Form.project_id == source_project_id, Form.id.in_(form_ids))
            .order_by(Form.order_index, Form.id)
        ).all())
        if not src_forms:
            return summary

        # 收集所有源 FormField
        src_form_fields_map: Dict[int, list] = {}
        needed_field_def_ids: set = set()
        for sf in src_forms:
            ffs = list(tmpl.scalars(
                select(FormField)
                .where(FormField.form_id == sf.id)
                .order_by(FormField.sort_order)
            ).all())
            src_form_fields_map[sf.id] = ffs
            for ff in ffs:
                if ff.field_definition_id is not None:
                    needed_field_def_ids.add(ff.field_definition_id)

        # 读取源字段定义
        src_field_defs: Dict[int, FieldDefinition] = {}
        needed_codelist_ids: set = set()
        needed_unit_ids: set = set()
        if needed_field_def_ids:
            for fd in tmpl.scalars(
                select(FieldDefinition).where(
                    FieldDefinition.id.in_(needed_field_def_ids)
                )
            ).all():
                src_field_defs[fd.id] = fd
                if fd.codelist_id is not None:
                    needed_codelist_ids.add(fd.codelist_id)
                if fd.unit_id is not None:
                    needed_unit_ids.add(fd.unit_id)

        # ---- 3. 合并 Unit ----
        summary["merged_units"] = self._merge_units(
            tmpl, s, target_project_id,
            needed_unit_ids, existing_units, unit_id_map,
        )

        # ---- 4. 合并 Codelist ----
        summary["merged_codelists"] = self._merge_codelists(
            tmpl, s, target_project_id,
            needed_codelist_ids, existing_codelists, codelist_id_map,
        )

        # ---- 5. 创建 FieldDefinition ----
        summary["created_field_definitions"] = self._create_field_defs(
            s, target_project_id,
            src_field_defs, existing_field_vars,
            unit_id_map, codelist_id_map, field_def_id_map,
        )

        # ---- 6. 创建 Form + FormField ----
        # 预查询 max order 以优化性能
        from sqlalchemy import func
        max_form_order = s.scalar(
            select(func.max(Form.order_index)).where(Form.project_id == target_project_id)
        ) or 0

        for form_idx, sf in enumerate(src_forms, start=1):
            new_name = sf.name
            if sf.name in existing_forms:
                new_name = self._make_unique_name(existing_forms, sf.name)
                summary["renamed_forms"].append(f"{sf.name} → {new_name}")
            existing_forms.add(new_name)

            new_form = Form(
                project_id=target_project_id,
                name=new_name,
                code=generate_code("FORM"),
                domain=sf.domain,
                order_index=max_form_order + form_idx,
            )
            s.add(new_form)
            s.flush()  # 拿到 new_form.id

            # 创建 FormField
            for ff in src_form_fields_map.get(sf.id, []):
                new_fd_id = None
                if ff.field_definition_id is not None:
                    new_fd_id = field_def_id_map.get(ff.field_definition_id)

                new_ff = FormField(
                    form_id=new_form.id,
                    field_definition_id=new_fd_id,
                    is_log_row=ff.is_log_row,
                    sort_order=ff.sort_order,
                    required=ff.required,
                    label_override=ff.label_override,
                    help_text=ff.help_text,
                    default_value=ff.default_value,
                    inline_mark=ff.inline_mark,
                )
                s.add(new_ff)
                summary["created_form_fields"] += 1

            summary["imported_form_count"] += 1

        return summary

    # ------------------------------------------------------------------
    # 合并辅助方法
    # ------------------------------------------------------------------

    @staticmethod
    def _merge_units(
        tmpl: Session,
        s: Session,
        target_project_id: int,
        needed_ids: set,
        existing: Dict[str, int],
        id_map: Dict[int, int],
    ) -> int:
        """合并 Unit：同 symbol 复用，不同则新建"""
        count = 0
        if not needed_ids:
            return count

        from sqlalchemy import func
        max_unit_order = s.scalar(
            select(func.max(Unit.order_index)).where(Unit.project_id == target_project_id)
        ) or 0
        counter = 0

        for src_unit in tmpl.scalars(
            select(Unit).where(Unit.id.in_(needed_ids)).order_by(Unit.order_index, Unit.id)
        ).all():
            if src_unit.symbol in existing:
                id_map[src_unit.id] = existing[src_unit.symbol]
            else:
                counter += 1
                new_unit = Unit(
                    project_id=target_project_id,
                    symbol=src_unit.symbol,
                    code=generate_code("UNIT"),
                    order_index=max_unit_order + counter,
                )
                s.add(new_unit)
                s.flush()
                id_map[src_unit.id] = new_unit.id
                existing[src_unit.symbol] = new_unit.id
            count += 1
        return count

    @staticmethod
    def _merge_codelists(
        tmpl: Session,
        s: Session,
        target_project_id: int,
        needed_ids: set,
        existing: Dict[str, int],
        id_map: Dict[int, int],
    ) -> int:
        """合并 Codelist：同名复用，不同则新建（含 Options）"""
        merged = 0
        if not needed_ids:
            return merged
        for src_cl in tmpl.scalars(
            select(CodeList).where(CodeList.id.in_(needed_ids))
        ).all():
            if src_cl.name in existing:
                id_map[src_cl.id] = existing[src_cl.name]
                merged += 1
            else:
                new_cl = CodeList(
                    project_id=target_project_id,
                    name=src_cl.name,
                    code=generate_code("CL"),
                    description=src_cl.description,
                )
                s.add(new_cl)
                s.flush()
                id_map[src_cl.id] = new_cl.id
                existing[src_cl.name] = new_cl.id
                # 复制 Options
                src_opts = list(tmpl.scalars(
                    select(CodeListOption)
                    .where(CodeListOption.codelist_id == src_cl.id)
                    .order_by(CodeListOption.order_index, CodeListOption.id)
                ).all())
                for idx, opt in enumerate(src_opts, start=1):
                    s.add(CodeListOption(
                        codelist_id=new_cl.id,
                        code=opt.code,
                        decode=opt.decode,
                        order_index=idx,
                    ))
        return merged

    @staticmethod
    def _create_field_defs(
        s: Session,
        target_project_id: int,
        src_field_defs: Dict[int, FieldDefinition],
        existing_vars: set,
        unit_id_map: Dict[int, int],
        codelist_id_map: Dict[int, int],
        field_def_id_map: Dict[int, int],
    ) -> int:
        """创建 FieldDefinition，variable_name 冲突时自动加后缀"""
        created = 0

        from sqlalchemy import func
        max_fd_order = s.scalar(
            select(func.max(FieldDefinition.order_index)).where(FieldDefinition.project_id == target_project_id)
        ) or 0

        sorted_src_fds = sorted(src_field_defs.items(), key=lambda x: (x[1].order_index or 999999, x[0]))

        for idx, (src_id, src_fd) in enumerate(sorted_src_fds, start=1):
            var_name = src_fd.variable_name
            if var_name in existing_vars:
                var_name = ImportService._make_unique_var(existing_vars, var_name)
            existing_vars.add(var_name)

            # 映射 codelist_id / unit_id
            new_cl_id = None
            if src_fd.codelist_id is not None:
                new_cl_id = codelist_id_map.get(src_fd.codelist_id)
            new_unit_id = None
            if src_fd.unit_id is not None:
                new_unit_id = unit_id_map.get(src_fd.unit_id)

            new_fd = FieldDefinition(
                project_id=target_project_id,
                variable_name=var_name,
                label=src_fd.label,
                field_type=src_fd.field_type,
                integer_digits=src_fd.integer_digits,
                decimal_digits=src_fd.decimal_digits,
                date_format=src_fd.date_format,
                codelist_id=new_cl_id,
                unit_id=new_unit_id,
                is_multi_record=src_fd.is_multi_record,
                table_type=src_fd.table_type,
                order_index=max_fd_order + idx,
            )
            s.add(new_fd)
            s.flush()
            field_def_id_map[src_id] = new_fd.id
            created += 1
        return created
