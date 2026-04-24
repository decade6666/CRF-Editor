"""导出服务"""
from __future__ import annotations

from dataclasses import dataclass

import logging

import os

import sqlite3

import tempfile

from pathlib import Path

from typing import Dict, List, Optional, Tuple

import html



logger = logging.getLogger(__name__)


# Task 4.5: 导出错误异常类（确保返回稳定 JSON：detail + code）
class ExportError(Exception):
    """项目导出错误，携带 detail + code + status_code"""

    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


_EXPORT_ERROR_CODES = {
    "SCHEMA_INCOMPATIBLE": "EXPORT_SCHEMA_INCOMPATIBLE",
    "DATA_INCOMPATIBLE": "EXPORT_DATA_INCOMPATIBLE",
}


def _validate_form_field_schema(db_path: str) -> None:
    """验证 form_field 表结构兼容性。

    检查：
    1. form_field 表是否存在
    2. 是否有 legacy sort_order 列（说明迁移未完成）
    3. order_index 列是否存在
    4. field_definition_id 是否有 NULL 值（历史坏数据）

    若不兼容则抛出 ExportError。
    """
    conn = sqlite3.connect(db_path)
    try:
        # 检查 form_field 表是否存在
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='form_field'"
        )
        if not cursor.fetchone():
            # 表不存在，无需验证（可能是空项目）
            return

        # 获取列信息
        cursor = conn.execute("PRAGMA table_info(form_field)")
        columns = {row[1]: row for row in cursor.fetchall()}

        # 检查 legacy sort_order 列存在（说明迁移未完成）
        if "sort_order" in columns:
            raise ExportError(
                "数据库 form_field 表存在 legacy 'sort_order' 列，未完成迁移。请运行最新版本完成迁移后再导出。",
                _EXPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"],
            )

        # 检查 order_index 列不存在（不兼容）
        if "order_index" not in columns:
            raise ExportError(
                "数据库 form_field 表缺少 'order_index' 列，结构不兼容。",
                _EXPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"],
            )

        # 检查 field_definition_id 有 NULL 值（历史坏数据）
        # 排除 is_log_row=1 的记录（日志行允许 field_definition_id 为 NULL）
        cursor = conn.execute(
            "SELECT COUNT(*) FROM form_field WHERE field_definition_id IS NULL AND (is_log_row IS NULL OR is_log_row = 0)"
        )
        null_count = cursor.fetchone()[0]
        if null_count > 0:
            raise ExportError(
                f"数据库 form_field 表有 {null_count} 条记录的 field_definition_id 为 NULL，数据不兼容。",
                _EXPORT_ERROR_CODES["DATA_INCOMPATIBLE"],
            )

    finally:
        conn.close()



from docx import Document

from docx.shared import Pt, RGBColor, Inches, Cm

from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER

from docx.enum.section import WD_SECTION, WD_ORIENT

from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT

from docx.oxml.ns import qn

from docx.oxml import OxmlElement

from docx.enum.style import WD_STYLE_TYPE

from sqlalchemy.orm import Session



from src.models import Project

from src.repositories.project_repository import ProjectRepository

from src.schemas.project import normalize_screening_number_format

from src.services.field_rendering import build_inline_table_model, build_inline_column_demands, extract_default_lines

from src.services.width_planning import (

    compute_text_weight,

    compute_choice_atom_weight,

    plan_inline_table_width,

    plan_unified_table_width,

    plan_normal_table_width,

)





@dataclass(frozen=True)

class LayoutDecision:

    """表单布局决策（内部数据结构，不持久化）。"""



    mode: str  # "legacy" | "unified_landscape"

    column_count: int  # N 列数（仅 unified 有意义）

    label_span: int  # label 区合并列数

    value_span: int  # value 区合并列数





@dataclass(frozen=True)

class Segment:

    """统一横向布局的字段片段（内部数据结构，不持久化）。"""



    type: str  # "regular_field" | "full_row" | "inline_block"

    fields: list





class ExportService:

    """导出服务类"""



    # 字体常量

    FONT_EAST_ASIA = "SimSun"  # 宋体

    FONT_ASCII = "Times New Roman"



    def __init__(self, session: Session):

        self.session = session

        self.project_repo = ProjectRepository(session)



    def export_project_to_word(
        self,
        project_id: int,
        output_path: str,
        column_width_overrides: Optional[Dict] = None,
    ) -> bool:

        """导出项目到 Word 文档

        Args:
            project_id: 项目 ID
            output_path: 输出文件路径
            column_width_overrides: 列宽覆盖参数，格式：
                { "form_id": { "normal": [0.3, 0.7], "inline": [...], "unified": [...] } }
                fraction 值为 0.0~1.0，表示该列占总宽度的比例
        """

        try:

            # 一次性 eager load 完整关系树，消除导出链路上的 N+1 查询

            project = self.project_repo.get_with_full_tree(project_id)

            if not project:

                return False

            # 存储列宽覆盖供后续使用
            self._column_width_overrides = column_width_overrides or {}

            # 创建 Word 文档
            doc = Document()



            # 统一文档字体和样式

            self._apply_document_style(doc)



            # 设置页面边距和页眉页脚距离

            section = doc.sections[0]

            section.top_margin = Cm(2.54)

            section.bottom_margin = Cm(2.54)

            section.left_margin = Cm(3.17)

            section.right_margin = Cm(3.17)

            section.header_distance = Cm(1.5)

            section.footer_distance = Cm(1.3)



            # 设置纸张大小为A4

            section.page_width = Cm(21)

            section.page_height = Cm(29.7)



            # 设置文档网格（每行37字符，每页44行）

            sectPr = section._sectPr

            docGrid = sectPr.find(qn('w:docGrid'))

            if docGrid is None:

                docGrid = OxmlElement('w:docGrid')

                sectPr.append(docGrid)

            docGrid.set(qn('w:type'), 'lines')  # 只指定行网格

            docGrid.set(qn('w:linePitch'), '312')  # 15.6磅 = 312 twips (1磅=20 twips)

            docGrid.set(qn('w:charSpace'), '220')  # 11磅 = 220 twips



            # 1. 添加封面页

            self._add_cover_page(doc, project)



            # 2. 设置页眉页脚

            self._setup_header_footer(doc, project)



            # 3. 添加目录（占位）

            self._add_toc_placeholder(doc)

            self._switch_section(doc, WD_ORIENT.LANDSCAPE, project)



            # 4. 添加访视流程图

            self._add_visit_flow_diagram(doc, project)

            self._switch_section(doc, WD_ORIENT.PORTRAIT, project)



            # 5. 添加表单内容

            self._add_forms_content(doc, project)



            # 保存文档

            doc.save(output_path)

            return True



        except Exception:

            logger.exception("导出失败 project_id=%s", project_id)

            return False



    @staticmethod

    def _validate_output(output_path: str) -> tuple[bool, str]:

        """验证导出文件是否为有效且结构完整的 docx。"""

        try:

            if os.path.getsize(output_path) <= 0:

                return False, "导出文件为 0 字节"

        except OSError as exc:

            return False, f"无法读取导出文件大小: {exc}"



        try:

            doc = Document(output_path)

        except Exception as exc:

            return False, f"导出文件不是有效的 docx: {exc}"



        if len(doc.tables) < 3:

            return False, "导出文档結構不完整：至少需要封面表、訪視圖表和至少一個表單內容表格"



        return True, ""



    def _add_cover_para(self, doc: Document, text: str, size: Optional[float] = None, *, bold: bool = True, line_spacing: Optional[float] = None):

        """封面专用段落：居中，指定字号（None 表示继承样式）。返回段落对象供调用方设置额外格式。"""

        para = doc.add_paragraph()

        run = para.add_run(text)

        self._set_run_font(run, size=Pt(size) if size is not None else None, bold=bold)

        para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        if line_spacing is not None:

            para.paragraph_format.line_spacing = line_spacing

        return para



    def _add_cover_page(self, doc: Document, project: Project):

        """添加封面页。"""

        trial_name = project.trial_name or "[请设置试验名称]"

        ver = project.crf_version or "[版本号]"

        date_str = (

            project.crf_version_date.strftime("%Y-%m-%d")

            if project.crf_version_date and hasattr(project.crf_version_date, "strftime")

            else "[日期]"

        )

        sponsor = (project.sponsor or "").strip()

        dmu = (project.data_management_unit or "").strip()



        self._add_cover_para(doc, trial_name, 18)

        self._add_cover_para(doc, "", 15, bold=False, line_spacing=1.5)

        self._add_cover_para(doc, "", 15, bold=False, line_spacing=1.5)

        self._add_cover_para(doc, "Draft CRF（建库用）", 15)

        self._add_cover_para(doc, f"版本号及日期：{ver}/{date_str}")

        self._add_cover_para(doc, "", 15, bold=False, line_spacing=1.5)



        table = doc.add_table(rows=3, cols=2)

        table.autofit = False

        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        # 显式固定表格总宽度，防止自动撑满页面

        tbl_pr = table._tbl.tblPr

        tbl_w = tbl_pr.find(qn('w:tblW'))

        if tbl_w is None:

            tbl_w = OxmlElement('w:tblW')

            tbl_pr.append(tbl_w)

        tbl_w.set(qn('w:w'), '3855')   # 3.2cm + 3.6cm ≈ 3855 DXA

        tbl_w.set(qn('w:type'), 'dxa')

        table.columns[0].width = Cm(3.2)

        table.columns[1].width = Cm(3.6)

        cover_rows = [

            ("方案编号", project.protocol_number or ""),

            ("中心编号", "|__|__|"),

            ("筛选号", normalize_screening_number_format(project.screening_number_format) or "S|__|__||__|__|__|"),

        ]



        for row_idx, (label, value) in enumerate(cover_rows):

            row = table.rows[row_idx]

            row.height = Cm(1)

            left_cell = table.cell(row_idx, 0)

            right_cell = table.cell(row_idx, 1)

            left_para = left_cell.paragraphs[0]

            right_para = right_cell.paragraphs[0]

            left_run = left_para.add_run(label)

            right_run = right_para.add_run(value)

            self._set_run_font(left_run, size=Pt(10), bold=True)

            self._set_run_font(right_run, size=Pt(10), bold=True)

            for cell in (left_cell, right_cell):

                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

                self._remove_cell_borders(cell)

                for cp in cell.paragraphs:

                    cp.paragraph_format.space_after = Pt(0)

                    cp.paragraph_format.line_spacing = 1.0



        self._add_cover_para(doc, "", 15, bold=False, line_spacing=1.5)

        self._add_cover_para(doc, "", 15, bold=False, line_spacing=1.5)

        if sponsor:

            p = self._add_cover_para(doc, f"申办方：{sponsor}", 15, bold=True)

            p.paragraph_format.space_before = Pt(7.8)

            p.paragraph_format.space_after = Pt(7.8)

        if dmu:

            p = self._add_cover_para(doc, f"数据管理单位：{dmu}", 15, bold=True)

            p.paragraph_format.space_before = Pt(7.8)

            p.paragraph_format.space_after = Pt(7.8)

        doc.add_page_break()



    def _setup_header_footer(self, doc: Document, project: Project):

        """设置页眉页脚。"""

        for section in doc.sections:

            self._apply_header_to_section(section, project)

            self._apply_footer_to_section(section)



    def _apply_header_to_section(self, section, project: Project):

        """为指定 section 设置页眉。"""

        header = section.header

        header.is_linked_to_previous = False

        first_paragraph = header.paragraphs[0] if header.paragraphs else header.add_paragraph()

        first_paragraph.clear()

        p = first_paragraph

        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        p.paragraph_format.space_after = Pt(8)

        p.paragraph_format.line_spacing = 1.0



        if project.company_logo_path:

            from src.config import get_config

            logo_path = Path(get_config().upload_path) / "logos" / project.company_logo_path

            if logo_path.exists():

                try:

                    run_img = p.add_run()

                    picture = run_img.add_picture(str(logo_path), height=Inches(0.4))

                    self._make_picture_float(picture)

                except Exception:

                    pass



        version_parts = []

        if project.crf_version:

            version_parts.append(project.crf_version)

        if project.crf_version_date:

            date_str = (

                project.crf_version_date.strftime("%Y%m%d")

                if hasattr(project.crf_version_date, "strftime")

                else str(project.crf_version_date)

            )

            version_parts.append(date_str)

        if version_parts:

            run = p.add_run(f"版本号/日期：{'/'.join(version_parts)}")

            self._set_run_font(run, size=Pt(9))



    def _apply_footer_to_section(self, section):

        """为指定 section 设置页脚。"""

        footer = section.footer

        footer.is_linked_to_previous = False

        p_footer = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()

        p_footer.clear()

        p_footer.alignment = WD_ALIGN_PARAGRAPH.CENTER



        prefix = p_footer.add_run("第 ")

        self._set_run_font(prefix, size=Pt(9))



        run_page = p_footer.add_run()

        fld_char_begin = OxmlElement('w:fldChar')

        fld_char_begin.set(qn('w:fldCharType'), 'begin')

        run_page._r.append(fld_char_begin)

        instr_text = OxmlElement('w:instrText')

        instr_text.set(qn('xml:space'), 'preserve')

        instr_text.text = "PAGE"

        run_page._r.append(instr_text)

        fld_char_end = OxmlElement('w:fldChar')

        fld_char_end.set(qn('w:fldCharType'), 'end')

        run_page._r.append(fld_char_end)

        self._set_run_font(run_page, size=Pt(9))



        middle = p_footer.add_run(" 页 / 共 ")

        self._set_run_font(middle, size=Pt(9))



        run_total = p_footer.add_run()

        fld_char_begin_total = OxmlElement('w:fldChar')

        fld_char_begin_total.set(qn('w:fldCharType'), 'begin')

        run_total._r.append(fld_char_begin_total)

        instr_text_total = OxmlElement('w:instrText')

        instr_text_total.set(qn('xml:space'), 'preserve')

        instr_text_total.text = "NUMPAGES"

        run_total._r.append(instr_text_total)

        fld_char_end_total = OxmlElement('w:fldChar')

        fld_char_end_total.set(qn('w:fldCharType'), 'end')

        run_total._r.append(fld_char_end_total)

        self._set_run_font(run_total, size=Pt(9))



        suffix = p_footer.add_run(" 页")

        self._set_run_font(suffix, size=Pt(9))



    def _add_toc_placeholder(self, doc: Document):

        """添加目录占位符"""

        # 目录标题：宋体、小四(12pt)、加粗、居中

        p_title = doc.add_paragraph()

        run_title = p_title.add_run("目录")

        self._set_run_font(run_title, size=Pt(12), bold=True)

        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER



        # 添加一个空行

        doc.add_paragraph()



        p = doc.add_paragraph()

        run = p.add_run()

        fldChar1 = OxmlElement('w:fldChar')

        fldChar1.set(qn('w:fldCharType'), 'begin')

        run._r.append(fldChar1)

        instrText = OxmlElement('w:instrText')

        instrText.set(qn('xml:space'), 'preserve')

        instrText.text = 'TOC \\o "1-3" \\h \\z \\u'

        run._r.append(instrText)

        fldChar2 = OxmlElement('w:fldChar')

        fldChar2.set(qn('w:fldCharType'), 'end')

        run._r.append(fldChar2)



    def _add_visit_flow_diagram(self, doc: Document, project: Project):

        """添加访视流程图"""

        heading_para = doc.add_heading("表单访视分布图", level=1)

        for run in heading_para.runs:

            self._set_run_font(run)



        all_forms = {}

        visit_form_map = {}

        for visit in project.visits:

            for visit_form in visit.visit_forms:

                if visit_form.form:

                    if visit_form.form.id not in all_forms:

                        all_forms[visit_form.form.id] = visit_form.form

                    visit_form_map[(visit.id, visit_form.form.id)] = True



        sorted_forms = sorted(

            all_forms.values(),

            key=lambda f: (f.order_index if f.order_index is not None else 999999, f.id),

        )

        visits = sorted(project.visits, key=lambda v: (v.sequence, v.id))



        row_count = len(sorted_forms) + 1 if sorted_forms else 1

        col_count = len(visits) + 1 if visits else 1

        table = doc.add_table(rows=row_count, cols=col_count)

        self._apply_grid_table_style(table)

        header_tr = table.rows[0]._tr
        tr_pr = header_tr.trPr
        if tr_pr is None:
            tr_pr = OxmlElement('w:trPr')
            header_tr.insert(0, tr_pr)
        tbl_header = tr_pr.find(qn('w:tblHeader'))
        if tbl_header is None:
            tbl_header = OxmlElement('w:tblHeader')
            tr_pr.append(tbl_header)
        tbl_header.set(qn('w:val'), 'true')



        header_cell_00 = table.rows[0].cells[0]

        header_para_00 = header_cell_00.paragraphs[0]

        header_run_00 = header_para_00.add_run("访视名称")

        self._set_run_font(header_run_00, size=Pt(10.5), bold=True)

        header_para_00.alignment = WD_ALIGN_PARAGRAPH.CENTER

        header_cell_00.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        self._apply_cell_shading(header_cell_00, 'A5C9EB')



        for col_idx, visit in enumerate(visits, start=1):

            header_cell = table.rows[0].cells[col_idx]

            header_para = header_cell.paragraphs[0]

            header_run = header_para.add_run(visit.name)

            self._set_run_font(header_run, size=Pt(10.5), bold=True)

            header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

            header_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            self._apply_cell_shading(header_cell, 'A5C9EB')



        for row_idx, form in enumerate(sorted_forms, start=1):

            name_cell = table.rows[row_idx].cells[0]

            name_para = name_cell.paragraphs[0]

            name_run = name_para.add_run(form.name)

            self._set_run_font(name_run, size=Pt(10.5), bold=True)

            name_para.alignment = WD_ALIGN_PARAGRAPH.LEFT

            name_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



            for col_idx, visit in enumerate(visits, start=1):

                cross_cell = table.rows[row_idx].cells[col_idx]

                cross_para = cross_cell.paragraphs[0]

                if (visit.id, form.id) in visit_form_map:

                    cross_run = cross_para.add_run("×")

                    self._set_run_font(cross_run, size=Pt(10.5), bold=True)

                    cross_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

                    cross_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



        for row in table.rows:

            for cell in row.cells:

                for paragraph in cell.paragraphs:

                    paragraph.style = 'VisitFlow'



    def _add_forms_content(self, doc: Document, project: Project):

        """添加表单内容（支持横向表格渲染与统一横向布局）。"""

        if not project.forms:

            self._build_form_table(doc, [], form_id=None)

            return



        sorted_forms = sorted(

            project.forms,

            key=lambda f: (f.order_index if f.order_index is not None else 999999, f.id),

        )

        total_forms = len(sorted_forms)

        sorted_visits = sorted(project.visits, key=lambda v: (v.sequence, v.id))
        form_to_visits: Dict[int, List] = {}
        for visit in sorted_visits:
            for visit_form in visit.visit_forms:
                form_to_visits.setdefault(visit_form.form_id, []).append(visit)



        for idx, form in enumerate(sorted_forms, start=1):

            form_fields = sorted(form.form_fields, key=lambda ff: (ff.order_index, ff.id))

            layout = self._classify_form_layout(form_fields)

            is_last_form = idx == total_forms



            if layout.mode == "unified_landscape":

                # 统一横向布局路径

                self._switch_section(doc, WD_ORIENT.LANDSCAPE, project)

                heading_para = doc.add_heading(f"{idx}. {form.name}", level=1)

                for run in heading_para.runs:

                    self._set_run_font(run)

                segments = self._build_unified_segments(form_fields)

                self._build_unified_table(doc, segments, layout, form_id=form.id)

                self._add_applicable_visits_paragraph(doc, form_to_visits.get(form.id, []))

                # 仅当后续还有表单时才切回 portrait，避免末尾空白页

                if not is_last_form:

                    self._switch_section(doc, WD_ORIENT.PORTRAIT, project)

            else:

                # legacy 路径（保持现有行为）

                heading_para = doc.add_heading(f"{idx}. {form.name}", level=1)

                for run in heading_para.runs:

                    self._set_run_font(run)



                groups = self._group_form_fields(form_fields)

                if groups == [[]]:

                    groups = []



                for group in groups:

                    if not group:

                        continue



                    first_field = group[0]

                    if first_field.inline_mark == 1:

                        is_wide = len(group) > 4

                        if is_wide:

                            self._switch_section(doc, WD_ORIENT.LANDSCAPE, project)



                        self._add_inline_table(doc, group, is_wide, form_id=form.id)



                        if is_wide:

                            self._switch_section(doc, WD_ORIENT.PORTRAIT, project)

                        continue



                    self._build_form_table(doc, group, form_id=form.id)



                if not groups:
                    self._build_form_table(doc, [], form_id=form.id)

                self._add_applicable_visits_paragraph(doc, form_to_visits.get(form.id, []))

                # 仅当后续还有表单时才分页，避免末尾空白页

                if not is_last_form:

                    doc.add_page_break()



    def _add_applicable_visits_paragraph(self, doc: Document, visits):
        """在表单末尾追加"适用访视：<name>、..."段落。"""
        if not visits:
            return
        para = doc.add_paragraph(style='ApplicableVisits')
        prefix_run = para.add_run('适用访视：')
        self._set_run_font(prefix_run, size=Pt(10.5), bold=True)
        names_run = para.add_run('、'.join(visit.name for visit in visits))
        self._set_run_font(names_run, size=Pt(10.5))

    def _get_column_width_override(self, form_id, table_kind: str, col_count: int):
        """获取指定表单和表格类型的列宽覆盖配置（旧格式兼容）。

        Args:
            form_id: 表单 ID（None 时返回 None）
            table_kind: 表格类型 ("normal", "inline", "unified")
            col_count: 列数，用于验证覆盖配置长度

        Returns:
            List[float] 或 None：列宽 fraction 数组，长度应等于 col_count
        """
        if form_id is None:
            return None
        form_key = str(form_id)
        if form_key not in self._column_width_overrides:
            return None
        form_overrides = self._column_width_overrides[form_key]
        if table_kind not in form_overrides:
            return None
        overrides = form_overrides[table_kind]
        if not isinstance(overrides, list) or len(overrides) != col_count:
            return None
        # 校验每个元素是否为数值且在 0.0~1.0 范围内
        if not all(isinstance(v, (int, float)) and 0.0 <= v <= 1.0 for v in overrides):
            return None
        return overrides

    def _get_column_width_override_by_instance_id(
        self, table_instance_id: str, col_count: int, form_id=None, table_kind: str = None
    ):
        """根据 table_instance_id 获取列宽覆盖配置。

        Args:
            table_instance_id: 表实例标识符，格式 "kind:fieldIds=..." 或 legacy "groupIndex-kind-colCount"
            col_count: 列数，用于验证覆盖配置长度
            form_id: 表单 ID（用于 legacy 格式兼容）
            table_kind: 表格类型（用于 legacy 格式兼容）

        Returns:
            List[float] 或 None：列宽 fraction 数组，长度应等于 col_count
        """
        if not self._column_width_overrides:
            return None

        # 新格式：直接用 table_instance_id 查询
        if table_instance_id in self._column_width_overrides:
            overrides = self._column_width_overrides[table_instance_id]
            if isinstance(overrides, list) and len(overrides) == col_count:
                if all(isinstance(v, (int, float)) and 0.0 <= v <= 1.0 for v in overrides):
                    return overrides

        # Legacy 格式兼容：fallback 到旧方法
        if form_id is not None and table_kind is not None:
            return self._get_column_width_override(form_id, table_kind, col_count)

        return None

    def _build_table_instance_id(self, table_kind: str, fields) -> str:
        """根据表格类型和字段列表构建 table_instance_id。

        Args:
            table_kind: 表格类型 ("normal", "inline", "unified")
            fields: 字段列表，每个字段需要有 id 属性

        Returns:
            table_instance_id: 格式 "kind:fieldIds=<ordered-field-ids>"
        """
        field_ids = [str(f.id) for f in (fields or []) if f and hasattr(f, 'id') and f.id is not None]
        return f"{table_kind}:fieldIds={','.join(field_ids)}"

    def _classify_form_layout(self, form_fields) -> LayoutDecision:
        """判断表单是否需要走统一横向布局（unified landscape）。



        触发条件：同时存在普通字段和 inline 字段，且最大 inline block 宽度 > 4。

        """

        if not form_fields:

            return LayoutDecision("legacy", 0, 0, 0)



        sorted_fields = sorted(form_fields, key=lambda f: (f.order_index, f.id))

        has_regular = any(f.inline_mark == 0 for f in sorted_fields)



        # 计算连续 inline block 的最大宽度

        max_block_width = 0

        current_block_width = 0

        for f in sorted_fields:

            if f.inline_mark == 1:

                current_block_width += 1

            else:

                max_block_width = max(max_block_width, current_block_width)

                current_block_width = 0

        max_block_width = max(max_block_width, current_block_width)



        has_inline = max_block_width > 0

        if has_regular and has_inline and max_block_width > 4:

            N = max_block_width

            label_span = max(1, min(N - 1, round(N * 0.4)))

            return LayoutDecision("unified_landscape", N, label_span, N - label_span)



        return LayoutDecision("legacy", 0, 0, 0)



    @staticmethod

    def _compute_merge_spans(N: int, M: int) -> List[int]:

        """将 N 列均分为 M 个 span，前面的 span 优先分配余数列。



        前置条件：1 <= M <= N。若 M 超出范围，返回 [1] * N 作为安全回退。

        """

        if M <= 0 or M > N:

            return [1] * N

        base = N // M

        extra = N % M

        spans = []

        for i in range(M):

            spans.append(base + (1 if i < extra else 0))

        return spans



    def _build_unified_segments(self, form_fields) -> List[Segment]:

        """按字段顺序构建 unified landscape 所需的渲染片段。"""

        if not form_fields:

            return []



        sorted_fields = sorted(form_fields, key=lambda f: (f.order_index, f.id))

        segments: List[Segment] = []

        inline_buffer = []



        for form_field in sorted_fields:

            if form_field.inline_mark == 1:

                inline_buffer.append(form_field)

                continue



            if inline_buffer:

                segments.append(Segment("inline_block", list(inline_buffer)))

                inline_buffer = []



            field_def = form_field.field_definition

            if form_field.is_log_row or (field_def and field_def.field_type in ("日志行", "标签")):

                segments.append(Segment("full_row", [form_field]))

            else:

                segments.append(Segment("regular_field", [form_field]))



        if inline_buffer:

            segments.append(Segment("inline_block", list(inline_buffer)))



        return segments



    def _switch_section(self, doc: Document, orientation, project: Project):

        """新建分节并切换页面方向，同时重设页眉页脚。"""

        new_section = doc.add_section(WD_SECTION.NEW_PAGE)

        new_section.orientation = orientation



        if orientation == WD_ORIENT.LANDSCAPE:

            new_section.page_width = Cm(29.7)

            new_section.page_height = Cm(21)

        else:

            new_section.page_width = Cm(21)

            new_section.page_height = Cm(29.7)



        self._apply_header_to_section(new_section, project)

        self._apply_footer_to_section(new_section)

        return new_section



    def _build_unified_table(self, doc: Document, segments, layout: LayoutDecision, form_id=None):
        """创建 unified landscape 表格并按片段顺序渲染。

        Args:
            form_id: 表单 ID，用于获取列宽覆盖配置
        """
        N = layout.column_count
        table = doc.add_table(rows=1, cols=N)
        table.autofit = False

        # 收集 inline block 的内容用于宽度规划（使用语义需求）
        segment_data = []
        all_block_demands = []
        # 收集所有字段用于构建 table_instance_id
        all_fields = []
        for segment in segments:
            if segment.type == "inline_block" and segment.fields:
                headers, row_values, _ = build_inline_table_model(segment.fields)
                segment_data.append(("inline_block", headers, row_values))
                # 使用包含 choice/fill-line/unit 语义的需求
                all_block_demands.append(build_inline_column_demands(segment.fields))
                all_fields.extend(segment.fields)
            elif segment.type == "regular_field" and segment.fields:
                all_fields.extend(segment.fields)

        # 检查是否有列宽覆盖配置 - 使用 table_instance_id
        table_instance_id = self._build_table_instance_id("unified", all_fields)
        overrides = self._get_column_width_override_by_instance_id(
            table_instance_id, N, form_id=form_id, table_kind="unified"
        )
        if overrides:
            # 直接使用覆盖的 fraction 转换为 cm
            total_cm = 23.36
            col_widths = [overrides[i] * total_cm for i in range(N)]
        else:
            # 使用内容驱动的宽度规划（传入物理列数 N 确保 per-slot-max 聚合）
            col_widths = plan_unified_table_width(
                segment_data, 23.36, column_count=N, block_demands=all_block_demands
            ) if segment_data else None

        if col_widths and len(col_widths) == N:
            # 应用规划的列宽
            for col_idx, col in enumerate(table.columns):
                col.width = Cm(col_widths[col_idx])
        else:
            # 回退到等宽分配
            avail = Cm(23.36)
            col_w = int(avail / N)
            for col in table.columns:
                col.width = col_w

        table._tbl.remove(table.rows[0]._tr)



        for segment in segments:

            if segment.type == "regular_field" and segment.fields:

                self._add_unified_regular_row(table, segment.fields[0], layout)

            elif segment.type == "full_row" and segment.fields:

                self._add_unified_full_row(table, segment.fields[0], N)

            elif segment.type == "inline_block" and segment.fields:

                self._add_unified_inline_band(table, segment.fields, N)



        self._apply_grid_table_style(table)

        return table



    def _add_unified_regular_row(self, table, form_field, layout: LayoutDecision):

        """在 unified table 中添加普通字段行。"""

        field_def = form_field.field_definition

        if not field_def:

            return



        N = layout.column_count

        row = table.add_row()

        left_cell = row.cells[0]

        if layout.label_span > 1:

            left_cell = left_cell.merge(row.cells[layout.label_span - 1])



        right_start = layout.label_span

        right_cell = row.cells[right_start]

        if layout.value_span > 1:

            right_cell = right_cell.merge(row.cells[N - 1])



        label = form_field.label_override or field_def.label or ""

        left_para = left_cell.paragraphs[0]

        left_run = left_para.add_run(label)

        self._set_run_font(left_run, size=Pt(10.5), bold=True)

        left_para.paragraph_format.space_before = Pt(5.25)

        left_para.paragraph_format.space_after = Pt(5.25)

        left_para.paragraph_format.line_spacing = 1.0

        left_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        left_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



        right_para = right_cell.paragraphs[0]

        default_lines = extract_default_lines(form_field)

        is_vertical_choice = (

            not default_lines

            and field_def.field_type in ["单选（纵向）", "多选（纵向）"]

        )

        if default_lines:

            for line_idx, line in enumerate(default_lines):

                if line_idx > 0:

                    right_para.add_run().add_break()

                right_run = right_para.add_run(line)

                self._set_run_font(right_run, size=Pt(10.5))

        else:

            if field_def.field_type in ["单选（纵向）", "多选（纵向）"]:

                self._render_vertical_choices(right_cell, field_def)

            elif field_def.field_type in ["单选", "多选"]:

                self._render_choice_field(right_para, field_def)

            else:

                right_run = right_para.add_run(self._render_field_control(field_def))

                self._set_run_font(right_run, size=Pt(10.5))



        if not is_vertical_choice:

            right_para.paragraph_format.space_before = Pt(5.25)

        right_para.paragraph_format.line_spacing = 1.0

        right_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        if not is_vertical_choice:

            right_cell.paragraphs[-1].paragraph_format.space_after = Pt(5.25)

        right_cell.paragraphs[-1].paragraph_format.line_spacing = 1.0

        right_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



        if form_field.bg_color:

            self._apply_cell_shading(left_cell, form_field.bg_color)

            self._apply_cell_shading(right_cell, form_field.bg_color)

        if form_field.text_color:

            text_color = RGBColor.from_string(form_field.text_color)

            self._set_run_font(left_run, color=text_color)

            for paragraph in right_cell.paragraphs:

                for run in paragraph.runs:

                    self._set_run_font(run, color=text_color)



    def _add_unified_full_row(self, table, form_field, N: int):

        """在 unified table 中添加全宽行。"""

        row = table.add_row()

        merged_cell = row.cells[0]

        if N > 1:

            merged_cell = merged_cell.merge(row.cells[N - 1])



        para = merged_cell.paragraphs[0]

        field_def = form_field.field_definition

        is_log_row = form_field.is_log_row or (field_def and field_def.field_type == "日志行")



        if is_log_row:

            label = form_field.label_override or "以下为log行"

            run = para.add_run(label)

            self._set_run_font(run, size=Pt(10.5), bold=True)

            para.paragraph_format.space_before = Pt(5.25)

            para.paragraph_format.space_after = Pt(5.25)

            para.paragraph_format.line_spacing = 1.0

            para.alignment = WD_ALIGN_PARAGRAPH.LEFT

            merged_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            self._apply_cell_shading(merged_cell, form_field.bg_color or 'D9D9D9')

            if form_field.text_color:

                self._set_run_font(run, color=RGBColor.from_string(form_field.text_color))

            return



        para.style = 'FormLabel'

        label = form_field.label_override or (field_def.label if field_def else "")

        run = para.add_run(label)

        run.font.bold = True

        self._set_run_font(run, size=Pt(10.5))

        para.paragraph_format.space_before = Pt(5.25)

        para.paragraph_format.space_after = Pt(5.25)

        para.paragraph_format.line_spacing = 1.0

        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        merged_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        if form_field.bg_color:

            self._apply_cell_shading(merged_cell, form_field.bg_color)

        if form_field.text_color:

            self._set_run_font(run, color=RGBColor.from_string(form_field.text_color))



    def _add_unified_inline_band(self, table, block_fields, N: int):

        """在 unified table 中添加 inline block 的表头和数据行。"""

        if not block_fields:

            return



        headers, row_values, field_defs = build_inline_table_model(block_fields)

        M = len(block_fields)

        spans = self._compute_merge_spans(N, M) if M < N else [1] * M



        header_row = table.add_row()

        start_col = 0

        for col_idx, label in enumerate(headers):

            span = spans[col_idx]

            cell = header_row.cells[start_col]

            if span > 1:

                cell = cell.merge(header_row.cells[start_col + span - 1])



            para = cell.paragraphs[0]

            run = para.add_run(label)

            self._set_run_font(run, size=Pt(10.5), bold=True)

            para.paragraph_format.space_before = Pt(5.25)

            para.paragraph_format.space_after = Pt(5.25)

            para.paragraph_format.line_spacing = 1.0

            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            self._apply_cell_shading(cell, 'D9D9D9')

            start_col += span



        for row_values_item in row_values:

            data_row = table.add_row()

            start_col = 0

            for col_idx, cell_value in enumerate(row_values_item):

                span = spans[col_idx]

                cell = data_row.cells[start_col]

                if span > 1:

                    cell = cell.merge(data_row.cells[start_col + span - 1])



                para = cell.paragraphs[0]

                field_def = field_defs[col_idx]



                if cell_value is not None:

                    run = para.add_run(cell_value)

                    self._set_run_font(run, size=Pt(10.5))

                elif field_def:

                    if field_def.field_type in ["单选（纵向）", "多选（纵向）"]:

                        self._render_vertical_choices(cell, field_def)

                    elif field_def.field_type in ["单选", "多选"]:

                        self._render_choice_field(para, field_def)

                    else:

                        run = para.add_run(self._render_field_control(field_def))

                        self._set_run_font(run, size=Pt(10.5))



                para.paragraph_format.space_before = Pt(5.25)

                para.paragraph_format.space_after = Pt(5.25)

                para.paragraph_format.line_spacing = 1.0

                para.alignment = WD_ALIGN_PARAGRAPH.LEFT

                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



                marked_field = block_fields[col_idx]

                if marked_field.bg_color:

                    self._apply_cell_shading(cell, marked_field.bg_color)

                if marked_field.text_color:

                    text_color = RGBColor.from_string(marked_field.text_color)

                    for paragraph in cell.paragraphs:

                        for run in paragraph.runs:

                            self._set_run_font(run, color=text_color)



                start_col += span



    def _group_form_fields(self, form_fields):

        """按普通字段组与 inline 组拆分表单字段。非 inline 字段统一合入同一组，保持单表格输出。"""

        if not form_fields:

            return [[]]



        regular_group = []

        inline_groups = []

        current_inline = []



        for form_field in form_fields:

            if form_field.inline_mark == 1:

                current_inline.append(form_field)

            else:

                if current_inline:

                    inline_groups.append(current_inline)

                    current_inline = []

                regular_group.append(form_field)



        if current_inline:

            inline_groups.append(current_inline)



        result = []

        if regular_group:

            result.append(regular_group)

        result.extend(inline_groups)

        return result or [[]]



    def _build_form_table(self, doc: Document, fields, form_id=None):
        """将一组普通字段渲染为单张表格。

        Args:
            form_id: 表单 ID，用于获取列宽覆盖配置
        """
        row_count = len(fields) if fields else 1
        table = doc.add_table(rows=row_count, cols=2)
        table.autofit = False

        # 内容驱动列宽：与前端 planNormalColumnFractions / 横向/统一表格语义一致。
        # available_cm=14.66 对齐原硬编码 Cm(7.2)+Cm(7.4)=14.6cm 的页面预算。
        normal_widths = plan_normal_table_width(fields or [], available_cm=14.66)

        # 应用列宽覆盖（如果有）- 使用 table_instance_id
        table_instance_id = self._build_table_instance_id("normal", fields)
        overrides = self._get_column_width_override_by_instance_id(
            table_instance_id, 2, form_id=form_id, table_kind="normal"
        )
        if overrides:
            total_cm = 14.66
            normal_widths = [overrides[i] * total_cm for i in range(2)]

        table.columns[0].width = Cm(normal_widths[0])
        table.columns[1].width = Cm(normal_widths[1])
        self._apply_grid_table_style(table)



        if not fields:

            return table



        for row_idx, form_field in enumerate(fields):

            field_def = form_field.field_definition

            if form_field.is_log_row or (field_def and field_def.field_type == "日志行"):

                self._add_log_row(table, row_idx, form_field)

            elif field_def and field_def.field_type == "标签":

                self._add_label_row(table, row_idx, form_field)

            else:

                self._add_field_row(table, row_idx, form_field, normal_widths)



        return table



    def _add_log_row(self, table, row_idx: int, form_field):

        """添加日志行。"""

        row = table.rows[row_idx]

        merged_cell = row.cells[0].merge(row.cells[1])

        para = merged_cell.paragraphs[0]

        label = form_field.label_override or "以下为log行"

        run = para.add_run(label)

        self._set_run_font(run, size=Pt(10.5), bold=True)

        para.paragraph_format.space_before = Pt(5.25)

        para.paragraph_format.space_after = Pt(5.25)

        para.paragraph_format.line_spacing = 1.0

        para.alignment = WD_ALIGN_PARAGRAPH.LEFT

        merged_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        self._apply_cell_shading(merged_cell, form_field.bg_color or 'D9D9D9')

        if form_field.text_color:

            self._set_run_font(run, color=RGBColor.from_string(form_field.text_color))



    def _add_label_row(self, table, row_idx: int, form_field):

        """添加标签字段行。"""

        row = table.rows[row_idx]

        merged_cell = row.cells[0].merge(row.cells[1])

        para = merged_cell.paragraphs[0]

        para.style = 'FormLabel'

        field_def = form_field.field_definition

        label = form_field.label_override or (field_def.label if field_def else "")

        run = para.add_run(label)

        run.font.bold = True

        self._set_run_font(run, size=Pt(10.5))

        para.paragraph_format.space_before = Pt(5.25)

        para.paragraph_format.space_after = Pt(5.25)

        para.paragraph_format.line_spacing = 1.0

        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        merged_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



    def _add_field_row(self, table, row_idx: int, form_field, widths):

        """添加普通字段行。"""

        field_def = form_field.field_definition

        if not field_def:

            return



        row = table.rows[row_idx]

        left_cell = row.cells[0]

        right_cell = row.cells[1]

        left_cell.width = Cm(widths[0])

        right_cell.width = Cm(widths[1])



        label = form_field.label_override or field_def.label or ""

        left_para = left_cell.paragraphs[0]

        left_run = left_para.add_run(label)

        self._set_run_font(left_run, size=Pt(10.5), bold=True)

        left_para.paragraph_format.space_before = Pt(5.25)

        left_para.paragraph_format.space_after = Pt(5.25)

        left_para.paragraph_format.line_spacing = 1.0

        left_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        left_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



        right_para = right_cell.paragraphs[0]

        default_lines = extract_default_lines(form_field)

        is_vertical_choice = (

            not default_lines

            and field_def.field_type in ["单选（纵向）", "多选（纵向）"]

        )

        if default_lines:

            for line_idx, line in enumerate(default_lines):

                if line_idx > 0:

                    right_para.add_run().add_break()

                right_run = right_para.add_run(line)

                self._set_run_font(right_run, size=Pt(10.5))

        else:

            if field_def.field_type in ["单选（纵向）", "多选（纵向）"]:

                self._render_vertical_choices(right_cell, field_def)

            elif field_def.field_type in ["单选", "多选"]:

                self._render_choice_field(right_para, field_def)

            else:

                right_run = right_para.add_run(self._render_field_control(field_def))

                self._set_run_font(right_run, size=Pt(10.5))



        if not is_vertical_choice:

            right_para.paragraph_format.space_before = Pt(5.25)

        right_para.paragraph_format.line_spacing = 1.0

        right_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        if not is_vertical_choice:

            right_cell.paragraphs[-1].paragraph_format.space_after = Pt(5.25)

        right_cell.paragraphs[-1].paragraph_format.line_spacing = 1.0

        right_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



        if form_field.bg_color:

            self._apply_cell_shading(left_cell, form_field.bg_color)

            self._apply_cell_shading(right_cell, form_field.bg_color)

        if form_field.text_color:

            text_color = RGBColor.from_string(form_field.text_color)

            self._set_run_font(left_run, color=text_color)

            for paragraph in right_cell.paragraphs:

                for run in paragraph.runs:

                    self._set_run_font(run, color=text_color)



    def _add_inline_table(self, doc: Document, marked_fields, is_wide=False, form_id=None):
        """添加横向表格（1表头行+N内容行），使用内容驱动的宽度规划

        Args:
            form_id: 表单 ID，用于获取列宽覆盖配置
        """
        if not marked_fields:
            return

        # 使用共享模块构建表格数据模型
        headers, row_values, field_defs = build_inline_table_model(marked_fields)

        # 创建表格：1+max_rows行，N列
        table = doc.add_table(rows=1 + len(row_values), cols=len(marked_fields))
        self._apply_grid_table_style(table)

        # 使用内容驱动的宽度规划替代等宽分配
        avail_cm = 23.36 if is_wide else 14.66

        # 检查是否有列宽覆盖配置 - 使用 table_instance_id
        table_instance_id = self._build_table_instance_id("inline", marked_fields)
        overrides = self._get_column_width_override_by_instance_id(
            table_instance_id, len(marked_fields), form_id=form_id, table_kind="inline"
        )
        if overrides:
            # 直接使用覆盖的 fraction 转换为 cm
            col_widths = [overrides[i] * avail_cm for i in range(len(marked_fields))]
        else:
            # 构建包含 choice/fill-line/unit 等语义的列需求
            semantic_demands = build_inline_column_demands(marked_fields)
            col_widths = plan_inline_table_width(headers, row_values, avail_cm, semantic_demands=semantic_demands)

        # 应用列宽
        for col_idx, col in enumerate(table.columns):
            if col_idx < len(col_widths):
                col.width = Cm(col_widths[col_idx])
            else:
                # 回退到等宽分配
                col.width = int(Cm(avail_cm) / len(marked_fields))



        # 第一行：表头（字段名称）

        for col_idx, label in enumerate(headers):

            field_def = field_defs[col_idx]

            if not field_def:

                continue



            cell = table.rows[0].cells[col_idx]

            para = cell.paragraphs[0]

            run = para.add_run(label)

            self._set_run_font(run, size=Pt(10.5), bold=True)



            # 段落格式：5.25pt前后间距，单倍行距

            para.paragraph_format.space_before = Pt(5.25)

            para.paragraph_format.space_after = Pt(5.25)

            para.paragraph_format.line_spacing = 1.0

            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



            # 表头底纹：#D9D9D9

            shading_elm = OxmlElement('w:shd')

            shading_elm.set(qn('w:fill'), 'D9D9D9')

            cell._tc.get_or_add_tcPr().append(shading_elm)



        # 内容行：根据row_values生成

        for row_idx, row in enumerate(row_values):

            for col_idx, cell_value in enumerate(row):

                field_def = field_defs[col_idx]

                if not field_def:

                    continue



                cell = table.rows[row_idx + 1].cells[col_idx]

                para = cell.paragraphs[0]



                # 有默认值则显示默认值，否则显示控件占位符

                if cell_value is not None:

                    run = para.add_run(cell_value)

                    self._set_run_font(run, size=Pt(10.5))

                else:

                    # 无默认值，显示控件占位符

                    if field_def.field_type in ["单选（纵向）", "多选（纵向）"]:

                        self._render_vertical_choices(cell, field_def)

                    elif field_def.field_type in ["单选", "多选"]:

                        self._render_choice_field(para, field_def)

                    else:

                        run = para.add_run(self._render_field_control(field_def))

                        self._set_run_font(run, size=Pt(10.5))



                # 段落格式：5.25pt前后间距，单倍行距

                para.paragraph_format.space_before = Pt(5.25)

                para.paragraph_format.space_after = Pt(5.25)

                para.paragraph_format.line_spacing = 1.0

                para.alignment = WD_ALIGN_PARAGRAPH.LEFT

                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER



                # 应用底纹颜色和文字颜色

                marked_field = marked_fields[col_idx]

                if marked_field:

                    if marked_field.bg_color:

                        self._apply_cell_shading(cell, marked_field.bg_color)

                    if marked_field.text_color:

                        text_color = RGBColor.from_string(marked_field.text_color)

                        for para in cell.paragraphs:

                            for run in para.runs:

                                self._set_run_font(run, color=text_color)



    def _render_field_control(self, field_def) -> str:

        """渲染字段控件文本"""

        field_type = field_def.field_type or ""



        # 获取单位符号

        unit_text = ""

        if hasattr(field_def, "unit") and field_def.unit:

            unit_text = f" {field_def.unit.symbol}"



        if field_type == "单选":

            return self._render_single_choice(field_def)

        elif field_type == "多选":

            return self._render_multi_choice(field_def)

        elif field_type in ["单选（纵向）", "下拉框"]:

            return self._render_single_choice_vertical(field_def)

        elif field_type == "多选（纵向）":

            return self._render_multi_choice_vertical(field_def)

        elif field_type == "日期":

            return "|__|__|__|__|年|__|__|月|__|__|日"

        elif field_type == "日期时间":

            fmt = (getattr(field_def, "date_format", "") or "").lower()

            if "ss" in fmt:

                return "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分|__|__|秒"

            return "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分"

        elif field_type == "时间":

            fmt = (getattr(field_def, "date_format", "") or "").lower()

            if "ss" in fmt:

                return "|__|__|时|__|__|分|__|__|秒"

            return "|__|__|时|__|__|分"

        elif field_type == "数值":

            integers = field_def.integer_digits or 10

            decimals = field_def.decimal_digits if field_def.decimal_digits is not None else 2

            # 生成 |__|__| 格式

            parts = []

            for _ in range(integers):

                parts.append("|__|")

            line = "".join(parts)

            if decimals > 0:

                line += "."

                for _ in range(decimals):

                    line += "|__|"

            return line + unit_text

        elif field_type in ["文本", "标签"]:

            return "________________" + unit_text

        else:

            return "________________"



    def _render_single_choice(self, field_def) -> str:

        """渲染单选控件"""

        options = self._get_option_labels(field_def)

        if not options:

            return "________________"

        return "  ".join([f"○ {opt}" for opt in options])



    def _render_single_choice_vertical(self, field_def) -> str:

        """渲染纵向单选控件"""

        options = self._get_option_labels(field_def)

        if not options:

            return "________________"

        return "\n".join([f"○ {opt}" for opt in options])



    def _render_multi_choice(self, field_def) -> str:

        """渲染多选控件"""

        options = self._get_option_labels(field_def)

        if not options:

            return "________________"

        return "  ".join([f"□ {opt}" for opt in options])



    def _render_multi_choice_vertical(self, field_def) -> str:

        """渲染纵向多选控件"""

        options = self._get_option_labels(field_def)

        if not options:

            return "________________"

        return "\n".join([f"□ {opt}" for opt in options])



    def _render_vertical_choices(self, cell, field_def):

        """纵向排列选项：每个选项独占单元格内一个独立段落。



        choice atom：选项文本 + 尾部填写线作为原子 token，不可拆行。

        """

        field_type = field_def.field_type

        option_data = self._get_option_data(field_def)

        if not option_data:

            run = cell.paragraphs[0].add_run("________________")

            self._set_run_font(run, size=Pt(10.5))

            return



        symbol = "○" if "单选" in field_type else "□"

        for idx, (label, has_trailing) in enumerate(option_data):

            if idx == 0:

                para = cell.paragraphs[0]

                para.paragraph_format.space_before = Pt(0)

                para.paragraph_format.space_after = Pt(0)

                para.paragraph_format.line_spacing = 1.0

                para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

            else:

                para = cell.add_paragraph()

                para.paragraph_format.space_before = Pt(0)

                para.paragraph_format.space_after = Pt(0)

                para.paragraph_format.line_spacing = 1.0

                para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY



            symbol_run = para.add_run(symbol + " ")

            self._set_run_font(symbol_run, size=Pt(10.5))

            symbol_run.font.name = self.FONT_EAST_ASIA

            rPr = symbol_run._element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_EAST_ASIA)

            rFonts.set(qn("w:hAnsi"), self.FONT_EAST_ASIA)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)



            # choice atom：选项文本 + 尾部填写线作为原子 token

            if has_trailing:

                # 使用不换行空格连接文本和填写线，保证不可拆行

                atom_text = label + "\u00A0" + "_" * 6

                atom_run = para.add_run(atom_text)

                self._set_run_font(atom_run, size=Pt(10.5))

            else:

                # 普通选项文本

                opt_run = para.add_run(label)

                self._set_run_font(opt_run, size=Pt(10.5))



    def _render_choice_field(self, paragraph, field_def):

        """渲染单选或多选字段，确保○□符号使用宋体



        choice atom：选项文本 + 尾部填写线作为原子 token，不可拆行。

        """

        field_type = field_def.field_type

        option_data = self._get_option_data(field_def)

        # 没有选项时显示下划线占位符

        if not option_data:

            run = paragraph.add_run("________________")

            self._set_run_font(run, size=Pt(10.5))

            return



        symbol = "○" if "单选" in field_type else "□"



        for idx, (label, has_trailing) in enumerate(option_data):

            if idx > 0:

                # 横向排列，添加空格分隔

                space_run = paragraph.add_run("  ")

                self._set_run_font(space_run, size=Pt(10.5))



            # 添加符号run，使用宋体

            symbol_run = paragraph.add_run(symbol + " ")

            self._set_run_font(symbol_run, size=Pt(10.5))

            # 强制符号使用宋体

            symbol_run.font.name = self.FONT_EAST_ASIA

            rPr = symbol_run._element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_EAST_ASIA)

            rFonts.set(qn("w:hAnsi"), self.FONT_EAST_ASIA)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)



            # choice atom：选项文本 + 尾部填写线作为原子 token

            if has_trailing:

                # 使用不换行空格连接文本和填写线，保证不可拆行

                atom_text = label + "\u00A0" + "_" * 6

                atom_run = paragraph.add_run(atom_text)

                self._set_run_font(atom_run, size=Pt(10.5))

            else:

                # 普通选项文本

                opt_run = paragraph.add_run(label)

                self._set_run_font(opt_run, size=Pt(10.5))



    def _get_option_labels(self, field_def) -> list:

        """获取选项标签列表，trailing_underscore=1 时在标签末尾拼接下划线



        若标签文本本身已以下划线结尾，则不重复追加（兼容 docx 导入的字面下划线场景）

        """

        return [

            f"{label}______" if has_trailing and not label.endswith("_") else label

            for label, has_trailing in self._get_option_data(field_def)

        ]



    def _get_option_data(self, field_def) -> List[Tuple[str, bool]]:

        """获取选项数据列表：(原始标签文本, 是否有后加下划线)



        排序规则：order_index 为主，id 为稳定回退键。

        """

        if not hasattr(field_def, "codelist") or not field_def.codelist:

            return []

        if not hasattr(field_def.codelist, "options") or not field_def.codelist.options:

            return []

        # 按 order_index 排序，缺失时回退到 id

        options = sorted(

            field_def.codelist.options,

            key=lambda o: (o.order_index if o.order_index is not None else float('inf'), o.id or 0)

        )

        result: List[Tuple[str, bool]] = []

        for opt in options:

            if not opt.decode:

                continue

            result.append((opt.decode, bool(getattr(opt, "trailing_underscore", 0))))

        return result



    def _add_fill_line_run(self, paragraph, length: int = 6):

        """添加填写线 run（纯下划线字符，与文本字段填写线风格一致）"""

        fill_text = "_" * length

        run = paragraph.add_run(fill_text)

        self._set_run_font(run, size=Pt(10.5))

        return run



    def _apply_document_style(self, doc: Document):

        """统一文档字体：中文宋体，英文Times New Roman，并设置标题样式"""

        # 更新基础样式

        for style_name in ["Normal", "Heading 1", "Heading 2", "Heading 3"]:

            if style_name not in doc.styles:

                continue

            style = doc.styles[style_name]

            style.font.name = self.FONT_ASCII

            rPr = style.element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_ASCII)

            rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)



        # 设置 Heading 1 为 14pt 粗体

        if "Heading 1" in doc.styles:

            h1_style = doc.styles["Heading 1"]

            h1_style.font.size = Pt(14)

            h1_style.font.bold = True

            h1_style.font.color.rgb = RGBColor(0, 0, 0)

            h1_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT



        # 新增自定义样式：封面信息表格

        if "CoverInfo" not in doc.styles:

            cover_style = doc.styles.add_style("CoverInfo", WD_STYLE_TYPE.PARAGRAPH)

            cover_style.font.size = Pt(10)

            cover_style.font.name = self.FONT_ASCII

            rPr = cover_style.element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_ASCII)

            rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)

            cover_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

            cover_style.paragraph_format.space_before = Pt(0)

            cover_style.paragraph_format.space_after = Pt(0)

            cover_style.paragraph_format.line_spacing = 1.0



        # 新增自定义样式：访视分布图表格

        if "VisitFlow" not in doc.styles:

            visit_style = doc.styles.add_style("VisitFlow", WD_STYLE_TYPE.PARAGRAPH)

            visit_style.font.size = Pt(10.5)

            visit_style.font.name = self.FONT_ASCII

            rPr = visit_style.element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_ASCII)

            rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)

            visit_style.paragraph_format.space_before = Pt(0)

            visit_style.paragraph_format.space_after = Pt(0)

            visit_style.paragraph_format.line_spacing = 1.0



        # 新增自定义样式：表单标签字段

        if "FormLabel" not in doc.styles:

            label_style = doc.styles.add_style("FormLabel", WD_STYLE_TYPE.PARAGRAPH)

            label_style.font.size = Pt(10.5)

            label_style.font.name = self.FONT_ASCII

            rPr = label_style.element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_ASCII)

            rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)

            label_style.paragraph_format.space_before = Pt(5.25)

            label_style.paragraph_format.space_after = Pt(5.25)

            label_style.paragraph_format.line_spacing = 1.0



        # 新增自定义样式：适用访视 footer

        if "ApplicableVisits" not in doc.styles:

            applicable_style = doc.styles.add_style("ApplicableVisits", WD_STYLE_TYPE.PARAGRAPH)

            applicable_style.font.size = Pt(10.5)

            applicable_style.font.name = self.FONT_ASCII

            rPr = applicable_style.element.get_or_add_rPr()

            rFonts = rPr.get_or_add_rFonts()

            rFonts.set(qn("w:ascii"), self.FONT_ASCII)

            rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

            rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)

            applicable_style.paragraph_format.space_before = Pt(5.25)

            applicable_style.paragraph_format.space_after = Pt(5.25)

            applicable_style.paragraph_format.line_spacing = 1.0

            applicable_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT



    def _apply_grid_table_style(self, table):

        """为表格应用网格边框样式。



        添加表级 tblBorders（含 insideH/insideV）确保 Word 能稳定渲染网格边框，

        同时为每个单元格设置 tcBorders 作为冗余保障。

        """

        table.style = None



        # 添加表级边框（关键：insideH/insideV 确保内部网格线可见）

        tblPr = table._tbl.tblPr

        if tblPr is None:

            tblPr = OxmlElement('w:tblPr')

            table._tbl.insert(0, tblPr)



        tblBorders = tblPr.find(qn('w:tblBorders'))

        if tblBorders is None:

            tblBorders = OxmlElement('w:tblBorders')

            tblPr.append(tblBorders)



        for border_name in ["top", "left", "bottom", "right", "insideH", "insideV"]:

            existing = tblBorders.find(qn(f'w:{border_name}'))

            if existing is not None:

                tblBorders.remove(existing)

            border_elm = OxmlElement(f'w:{border_name}')

            border_elm.set(qn('w:val'), 'single')

            border_elm.set(qn('w:sz'), '4')

            border_elm.set(qn('w:space'), '0')

            border_elm.set(qn('w:color'), 'auto')

            tblBorders.append(border_elm)



        # 单元格级边框作为冗余保障

        for row in table.rows:

            for cell in row.cells:

                self._apply_cell_borders(cell)



    def _apply_cell_borders(self, cell):

        """为单元格应用边框"""

        tcPr = cell._tc.get_or_add_tcPr()

        tcBorders = tcPr.find(qn('w:tcBorders'))

        if tcBorders is None:

            tcBorders = OxmlElement('w:tcBorders')

            tcPr.append(tcBorders)



        for border_name in ["top", "left", "bottom", "right"]:

            border_elm = OxmlElement(f'w:{border_name}')

            border_elm.set(qn('w:val'), 'single')

            border_elm.set(qn('w:sz'), '4')

            border_elm.set(qn('w:space'), '0')

            border_elm.set(qn('w:color'), 'auto')



            existing_border = tcBorders.find(qn(f'w:{border_name}'))

            if existing_border is not None:

                tcBorders.remove(existing_border)

            tcBorders.append(border_elm)



    def _apply_cell_shading(self, cell, color_hex: str):

        """为单元格应用颜色底纹"""

        shading_elm = OxmlElement('w:shd')

        shading_elm.set(qn('w:fill'), color_hex)

        cell._tc.get_or_add_tcPr().append(shading_elm)



    def _apply_cover_page_table_style(self, table):

        """封面信息表格专用样式。"""

        table.style = None

        table.autofit = False



        tblPr = table._tbl.tblPr

        if tblPr is None:

            tblPr = OxmlElement('w:tblPr')

            table._tbl.insert(0, tblPr)



        tblBorders = tblPr.find(qn('w:tblBorders'))

        if tblBorders is None:

            tblBorders = OxmlElement('w:tblBorders')

            tblPr.append(tblBorders)



        for border_name in ["top", "left", "bottom", "right", "insideH", "insideV"]:

            border_elm = OxmlElement(f'w:{border_name}')

            border_elm.set(qn('w:val'), 'nil')

            border_elm.set(qn('w:sz'), '0')

            tblBorders.append(border_elm)



        if table.columns:

            for col in table.columns:

                col.width = Cm(5)



        for row in table.rows:

            for cell in row.cells:

                for para in cell.paragraphs:

                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER

                self._remove_cell_borders(cell)



    def _remove_cell_borders(self, cell):

        """移除单元格边框"""

        tcPr = cell._tc.get_or_add_tcPr()

        tcBorders = tcPr.find(qn('w:tcBorders'))

        if tcBorders is None:

            tcBorders = OxmlElement('w:tcBorders')

            tcPr.append(tcBorders)



        for border_name in ["top", "left", "bottom", "right"]:

            border_elm = OxmlElement(f'w:{border_name}')

            border_elm.set(qn('w:val'), 'nil')

            border_elm.set(qn('w:sz'), '0')

            border_elm.set(qn('w:space'), '0')

            border_elm.set(qn('w:color'), 'auto')



            existing_border = tcBorders.find(qn(f'w:{border_name}'))

            if existing_border is not None:

                tcBorders.remove(existing_border)

            tcBorders.append(border_elm)



    def _make_picture_float(self, picture):

        """设置图片浮于文字上方"""

        from docx.oxml import parse_xml



        # 获取inline元素

        inline = picture._inline



        # 创建完整的anchor XML结构

        anchor_xml = '''

        <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"

                   xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"

                   distT="0" distB="0" distL="114300" distR="114300" simplePos="0"

                   relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">

            <wp:simplePos x="0" y="0"/>

            <wp:positionH relativeFrom="column">

                <wp:posOffset>0</wp:posOffset>

            </wp:positionH>

            <wp:positionV relativeFrom="paragraph">

                <wp:posOffset>-288000</wp:posOffset>

            </wp:positionV>

            <wp:extent cx="{cx}" cy="{cy}"/>

            <wp:effectExtent l="0" t="0" r="0" b="0"/>

            <wp:wrapNone/>

            <wp:docPr id="{id}" name="图片 {id}"/>

            <wp:cNvGraphicFramePr/>

            {graphic}

        </wp:anchor>

        '''



        # 获取extent和graphic元素

        extent = inline.find(qn('wp:extent'))

        graphic = inline.find(qn('a:graphic'))

        docPr = inline.find(qn('wp:docPr'))



        if extent is not None and graphic is not None:

            cx = extent.get('cx')

            cy = extent.get('cy')

            pic_id = docPr.get('id') if docPr is not None else '1'



            # 构建完整的anchor XML

            from xml.etree.ElementTree import tostring

            graphic_str = tostring(graphic, encoding='unicode')



            anchor_xml = anchor_xml.format(cx=cx, cy=cy, id=pic_id, graphic=graphic_str)

            anchor = parse_xml(anchor_xml)



            # 替换inline为anchor

            parent = inline.getparent()

            parent.replace(inline, anchor)



    def _set_run_font(self, run, size: Optional[Pt] = None, bold: Optional[bool] = None, color: Optional[RGBColor] = None):

        """設置Run的中英文字體與字號"""

        if size is not None:

            run.font.size = size

        if bold is not None:

            run.font.bold = bold

        if color is not None:

            run.font.color.rgb = color



        run.font.name = self.FONT_ASCII

        rPr = run._element.get_or_add_rPr()

        rFonts = rPr.get_or_add_rFonts()

        rFonts.set(qn("w:ascii"), self.FONT_ASCII)

        rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)

        rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)





def export_full_database(db_path: str) -> str:

    """使用 sqlite3.backup() 安全复制运行中数据库到临时文件，返回临时文件路径。"""

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)

    tmp_path = tmp.name

    tmp.close()



    src_conn = sqlite3.connect(db_path)

    dst_conn = sqlite3.connect(tmp_path)

    try:

        src_conn.backup(dst_conn)

    finally:

        dst_conn.close()

        src_conn.close()



    return tmp_path





def _vacuum_sqlite_file(db_path: str) -> None:
    """对导出后的 SQLite 文件执行 VACUUM。"""
    conn = sqlite3.connect(db_path, isolation_level=None)
    try:
        conn.execute("VACUUM")
    finally:
        conn.close()


def export_project_database(db_path: str, project_id: int, project_name: str) -> str:
    """导出单项目数据库：先验证兼容性，再 backup 完整快照，最后裁剪非目标数据。

    Task 4.5: 在导出前验证 form_field 结构，不兼容则抛出 ExportError。
    """
    # 验证 form_field 结构兼容性
    _validate_form_field_schema(db_path)

    tmp_path = export_full_database(db_path)

    conn = sqlite3.connect(tmp_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        # 解除所有项目与 user 的外键关联
        conn.execute("UPDATE project SET owner_id = NULL")
        # 清除用户敏感数据
        conn.execute("DELETE FROM user")
        # 删除其他项目（级联删除关联数据）
        conn.execute("DELETE FROM project WHERE id != ?", (project_id,))
        conn.commit()
    finally:
        conn.close()

    _vacuum_sqlite_file(tmp_path)
    return tmp_path


def export_user_projects_database(db_path: str, owner_id: int, export_name: str = "user_projects") -> str:
    """导出当前用户全部项目数据库：先验证兼容性，再备份，最后保留该用户拥有的项目集合。

    Task 4.5: 在导出前验证 form_field 结构，不兼容则抛出 ExportError。
    """
    # 验证 form_field 结构兼容性
    _validate_form_field_schema(db_path)

    tmp_path = export_full_database(db_path)

    conn = sqlite3.connect(tmp_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        project_ids = [
            row[0]
            for row in conn.execute(
                "SELECT id FROM project WHERE owner_id = ? ORDER BY id",
                (owner_id,),
            ).fetchall()
        ]
        if not project_ids:
            raise ValueError("当前用户没有可导出的项目")

        placeholders = ",".join("?" for _ in project_ids)
        conn.execute("UPDATE project SET owner_id = NULL")
        conn.execute("DELETE FROM user")
        conn.execute(
            f"DELETE FROM project WHERE id NOT IN ({placeholders})",
            tuple(project_ids),
        )
        conn.commit()
    finally:
        conn.close()

    _vacuum_sqlite_file(tmp_path)
    return tmp_path
