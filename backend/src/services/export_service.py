"""导出服务"""
from pathlib import Path
from typing import Optional
import html

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.enum.section import WD_SECTION, WD_ORIENT
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.enum.style import WD_STYLE_TYPE
from sqlalchemy.orm import Session

from src.models import Project
from src.repositories.project_repository import ProjectRepository
from src.services.field_rendering import build_inline_table_model, extract_default_lines


class ExportService:
    """导出服务类"""

    # 字体常量
    FONT_EAST_ASIA = "SimSun"  # 宋体
    FONT_ASCII = "Times New Roman"

    def __init__(self, session: Session):
        self.session = session
        self.project_repo = ProjectRepository(session)

    def export_project_to_word(self, project_id: int, output_path: str) -> bool:
        """导出项目到 Word 文档"""
        try:
            # 一次性 eager load 完整关系树，消除导出链路上的 N+1 查询
            project = self.project_repo.get_with_full_tree(project_id)
            if not project:
                return False

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

            # 4. 添加访视流程图
            self._add_visit_flow_diagram(doc, project)

            # 5. 添加表单内容
            self._add_forms_content(doc, project)

            # 保存文档
            doc.save(output_path)
            return True

        except Exception as e:
            print(f"导出失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _add_cover_page(self, doc: Document, project: Project):
        """添加封面页"""
        # 试验名称 - 小二号(18pt)
        if project.trial_name:
            p = doc.add_paragraph()
            run = p.add_run(project.trial_name)
            self._set_run_font(run, size=Pt(18), bold=True)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            # 第1个换行符 - 小三号(15pt)，1.5倍行距
            p1 = doc.add_paragraph()
            run1 = p1.add_run()
            self._set_run_font(run1, size=Pt(15))
            p1.paragraph_format.line_spacing = 1.5

            # 第2个换行符 - 小三号(15pt)，1.5倍行距
            p2 = doc.add_paragraph()
            run2 = p2.add_run()
            self._set_run_font(run2, size=Pt(15))
            p2.paragraph_format.line_spacing = 1.5

        # Draft CRF（建库用）- 小三号(15pt)
        p = doc.add_paragraph()
        run = p.add_run("Draft CRF（建库用）")
        self._set_run_font(run, size=Pt(15), bold=True)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        # Draft CRF和版本号之间0个换行符

        # 版本号及日期 - 11号(11pt)
        version_text = ""
        if project.crf_version:
            version_text = project.crf_version
        if project.crf_version_date:
            version_text += f"/{project.crf_version_date}"
        if version_text:
            p = doc.add_paragraph()
            run = p.add_run(f"版本号及日期：{version_text}")
            self._set_run_font(run, size=Pt(11), bold=True)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # 添加一个换行符（空段落）
        doc.add_paragraph()

        # 创建一个3行2列的表格
        table = doc.add_table(rows=3, cols=2)
        table.alignment = WD_ALIGN_PARAGRAPH.CENTER
        table.autofit = False
        
        # 定义表格内容（无冒号）
        table_data = [
            ("方案编号", project.protocol_number if project.protocol_number else ""),
            ("中心编号", "|__|__|"),
            ("筛选号", "S|__|__||__|__|__|")
        ]

        for i, (label, value) in enumerate(table_data):
            # 左列
            left_cell = table.cell(i, 0)
            left_para = left_cell.paragraphs[0]
            left_para.style = 'CoverInfo'  # 应用样式
            left_run = left_para.add_run(label)
            self._set_run_font(left_run, size=Pt(10))
            left_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            # 右列
            right_cell = table.cell(i, 1)
            right_para = right_cell.paragraphs[0]
            right_para.style = 'CoverInfo'  # 应用样式
            right_run = right_para.add_run(value)
            self._set_run_font(right_run, size=Pt(10))
            right_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        # 应用封面表格专用样式：无边框、左对齐、列宽2cm
        self._apply_cover_page_table_style(table)

        # 第1个换行符 - 小三号(15pt)，1.5倍行距
        p1 = doc.add_paragraph()
        run1 = p1.add_run()
        self._set_run_font(run1, size=Pt(15))
        p1.paragraph_format.line_spacing = 1.5

        # 第2个换行符 - 小三号(15pt)，1.5倍行距
        p2 = doc.add_paragraph()
        run2 = p2.add_run()
        self._set_run_font(run2, size=Pt(15))
        p2.paragraph_format.line_spacing = 1.5

        # 申办方 - 小三号(15pt)，整行加粗
        if project.sponsor:
            p = doc.add_paragraph()
            run = p.add_run(f"申办方：{project.sponsor}")
            self._set_run_font(run, size=Pt(15), bold=True)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            # 申办方和数据管理单位之间0个换行符

        # 数据管理单位 - 小三号(15pt)
        if project.data_management_unit:
            p = doc.add_paragraph()
            run = p.add_run(f"数据管理单位：{project.data_management_unit}")
            self._set_run_font(run, size=Pt(15), bold=True)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            doc.add_paragraph()

        # 分页
        doc.add_page_break()

    def _setup_header_footer(self, doc: Document, project: Project):
        """设置页眉页脚"""
        section = doc.sections[0]

        # 页眉：左侧公司图标，右侧版本号/日期（用段落+制表符实现）
        header = section.header
        header.paragraphs[0].clear()

        # 添加一个段落
        p = header.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT  # 改为右对齐

        # 设置页眉段落格式：段后8磅、单倍行距
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.line_spacing = 1.0

        # 左侧：公司图标
        if project.company_logo_path:
            from src.config import get_config
            logo_path = Path(get_config().upload_path) / "logos" / project.company_logo_path
            if logo_path.exists():
                try:
                    run = p.add_run()
                    picture = run.add_picture(str(logo_path), height=Inches(0.5))
                    # 设置图片浮于文字上方
                    self._make_picture_float(picture)
                except Exception as e:
                    run = p.add_run("[公司图标加载失败]")
                    self._set_run_font(run, size=Pt(8))
            else:
                run = p.add_run("[公司图标缺失]")
                self._set_run_font(run, size=Pt(8))

        # 右侧：版本号/日期（删除制表符，直接添加）
        version_text = ""
        if project.crf_version:
            version_text = project.crf_version
        if project.crf_version_date:
            version_text += f"/{project.crf_version_date}"
        if version_text:
            run = p.add_run(f"版本号/日期：{version_text}")
            self._set_run_font(run, size=Pt(9))

        # 页脚：仅保留页码
        footer = section.footer

        # 使用默认段落添加页码
        p = footer.paragraphs[0]
        p.clear()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # 添加页码字段
        run_page = p.add_run()
        fldChar1 = OxmlElement('w:fldChar')
        fldChar1.set(qn('w:fldCharType'), 'begin')
        run_page._r.append(fldChar1)

        instrText = OxmlElement('w:instrText')
        instrText.set(qn('xml:space'), 'preserve')
        instrText.text = "PAGE"
        run_page._r.append(instrText)

        fldChar2 = OxmlElement('w:fldChar')
        fldChar2.set(qn('w:fldCharType'), 'end')
        run_page._r.append(fldChar2)
        self._set_run_font(run_page, size=Pt(9))

        p.add_run(" / ")

        # 添加总页数字段
        run_total = p.add_run()
        fldChar1 = OxmlElement('w:fldChar')
        fldChar1.set(qn('w:fldCharType'), 'begin')
        run_total._r.append(fldChar1)

        instrText = OxmlElement('w:instrText')
        instrText.set(qn('xml:space'), 'preserve')
        instrText.text = "NUMPAGES"
        run_total._r.append(instrText)

        fldChar2 = OxmlElement('w:fldChar')
        fldChar2.set(qn('w:fldCharType'), 'end')
        run_total._r.append(fldChar2)
        self._set_run_font(run_total, size=Pt(9))

    def _add_toc_placeholder(self, doc: Document):
        """添加目录占位符"""
        # 目录标题：宋体、小四(12pt)、加粗、居中
        p_title = doc.add_paragraph()
        run_title = p_title.add_run("目录")
        self._set_run_font(run_title, size=Pt(12), bold=True)
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        p = doc.add_paragraph()

        # 添加 TOC 域代码
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

        doc.add_page_break()

    def _add_visit_flow_diagram(self, doc: Document, project: Project):
        """添加访视流程图"""
        doc.add_heading("表单访视分布图", level=1)

        if not project.visits:
            doc.add_paragraph("暂无访视数据")
            doc.add_page_break()
            return

        # 收集所有表单和访视-表单关系（包含序号）
        all_forms = {}
        visit_form_map = {}  # 改成字典，存储 (visit_id, form_id) -> sequence
        for visit in project.visits:
            for visit_form in visit.visit_forms:
                if visit_form.form:
                    if visit_form.form.id not in all_forms:
                        all_forms[visit_form.form.id] = visit_form.form
                    visit_form_map[(visit.id, visit_form.form.id)] = visit_form.sequence
        
        sorted_forms = sorted(all_forms.values(), key=lambda f: f.name)
        visits = sorted(project.visits, key=lambda v: v.sequence)

        if not sorted_forms:
            doc.add_paragraph("此项目的所有访视均未关联任何表单")
            doc.add_page_break()
            return

        # 创建矩阵表格：行=表单数+1（标题行），列=访视数+1（第一列为表单名称）
        table = doc.add_table(rows=len(sorted_forms) + 1, cols=len(visits) + 1)
        self._apply_grid_table_style(table)

        # 第一行第一列：访视名称
        header_cell_00 = table.rows[0].cells[0]
        header_para_00 = header_cell_00.paragraphs[0]
        header_run_00 = header_para_00.add_run("访视名称")
        self._set_run_font(header_run_00, size=Pt(10.5), bold=True)
        header_para_00.alignment = WD_ALIGN_PARAGRAPH.CENTER  # 水平居中
        header_cell_00.vertical_alignment = WD_ALIGN_VERTICAL.CENTER  # 垂直居中

        # 第一行底纹颜色#A5C9EB
        shading_elm = OxmlElement('w:shd')
        shading_elm.set(qn('w:fill'), 'A5C9EB')
        header_cell_00._tc.get_or_add_tcPr().append(shading_elm)

        # 第一行其余列：各访视名称
        for col_idx, visit in enumerate(visits, start=1):
            header_cell = table.rows[0].cells[col_idx]
            header_para = header_cell.paragraphs[0]
            header_run = header_para.add_run(visit.name)
            self._set_run_font(header_run, size=Pt(10.5), bold=True)
            header_para.alignment = WD_ALIGN_PARAGRAPH.CENTER  # 水平居中
            header_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER  # 垂直居中

            # 第一行底纹颜色#A5C9EB
            shading_elm = OxmlElement('w:shd')
            shading_elm.set(qn('w:fill'), 'A5C9EB')
            header_cell._tc.get_or_add_tcPr().append(shading_elm)

        # 第一列其余行：各表单名称，交叉点填"x"
        for row_idx, form in enumerate(sorted_forms, start=1):
            # 第一列：表单名称
            name_cell = table.rows[row_idx].cells[0]
            name_para = name_cell.paragraphs[0]
            name_run = name_para.add_run(form.name)
            self._set_run_font(name_run, size=Pt(10.5), bold=True)  # 第一列加粗
            name_para.alignment = WD_ALIGN_PARAGRAPH.LEFT  # 水平左对齐
            name_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER  # 垂直中部对齐

            # 交叉点：有关联填序号，无关联留空
            for col_idx, visit in enumerate(visits, start=1):
                cross_cell = table.rows[row_idx].cells[col_idx]
                cross_para = cross_cell.paragraphs[0]
                if (visit.id, form.id) in visit_form_map:
                    sequence = visit_form_map[(visit.id, form.id)]
                    cross_run = cross_para.add_run(str(sequence))
                    self._set_run_font(cross_run, size=Pt(10.5))
                    cross_para.alignment = WD_ALIGN_PARAGRAPH.CENTER  # 水平居中
                    cross_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER  # 垂直居中
        
        # 应用段落样式
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.style = 'VisitFlow'

        # 使用分节符（下一页）替代分页符
        doc.add_section(WD_SECTION.NEW_PAGE)


    def _add_forms_content(self, doc: Document, project: Project):
        """添加表单内容（支持横向表格渲染）"""
        if not project.forms:
            doc.add_paragraph("暂无表单数据")
            return

        for idx, form in enumerate(sorted(project.forms, key=lambda f: f.name), start=1):
            # 表单标题：序号.名称，宋体+Times New Roman，四号(14pt)
            p = doc.add_paragraph()
            run = p.add_run(f"{idx}. {form.name}")
            self._set_run_font(run, size=Pt(14))
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT

            # 直接使用 eager-loaded 的 form_fields，按 sort_order 排序，消除 N+1
            form_fields = sorted(form.form_fields, key=lambda ff: (ff.sort_order, ff.id))
            if not form_fields:
                doc.add_paragraph("暂无字段")
                continue

            # 按渲染单元处理字段（普通字段 vs 标记字段块）
            i = 0
            while i < len(form_fields):
                form_field = form_fields[i]
                field_def = form_field.field_definition

                # 日志行：直接渲染，不依赖 field_def
                if form_field.is_log_row:
                    label = form_field.label_override or "以下为log行"
                    table = doc.add_table(rows=1, cols=1)
                    self._apply_grid_table_style(table)
                    cell = table.rows[0].cells[0]
                    para = cell.paragraphs[0]
                    run = para.add_run(label)
                    self._set_run_font(run, size=Pt(10.5))
                    # 底纹颜色优先级：bg_color > 默认灰色 D9D9D9
                    bg_color = form_field.bg_color or 'D9D9D9'
                    self._apply_cell_shading(cell, bg_color)
                    # 文字颜色
                    if form_field.text_color:
                        self._set_run_font(run, color=RGBColor.from_string(form_field.text_color))
                    self._apply_cell_borders(cell)
                    i += 1
                    continue

                if not field_def:
                    i += 1
                    continue

                # 检查是否是标记字段块的开始
                if form_field.inline_mark == 1:
                    # 收集连续的标记字段
                    marked_fields = []
                    j = i
                    while j < len(form_fields) and form_fields[j].inline_mark == 1:
                        marked_fields.append(form_fields[j])
                        j += 1

                    is_wide = len(marked_fields) > 4
                    if is_wide:
                        # 切换到横向页面
                        new_sec = doc.add_section(WD_SECTION.NEW_PAGE)
                        new_sec.orientation = WD_ORIENT.LANDSCAPE
                        new_sec.page_width = Cm(29.7)
                        new_sec.page_height = Cm(21)
                        new_sec.top_margin = Cm(2.54)
                        new_sec.bottom_margin = Cm(2.54)
                        new_sec.left_margin = Cm(3.17)
                        new_sec.right_margin = Cm(3.17)

                    # 生成横向表格
                    self._add_inline_table(doc, marked_fields, is_wide)

                    if is_wide:
                        # 恢复纵向页面
                        new_sec = doc.add_section(WD_SECTION.NEW_PAGE)
                        new_sec.orientation = WD_ORIENT.PORTRAIT
                        new_sec.page_width = Cm(21)
                        new_sec.page_height = Cm(29.7)
                        new_sec.top_margin = Cm(2.54)
                        new_sec.bottom_margin = Cm(2.54)
                        new_sec.left_margin = Cm(3.17)
                        new_sec.right_margin = Cm(3.17)

                    i = j  # 跳过已处理的标记字段
                    continue

                # 普通字段：创建2列1行表格
                label = form_field.label_override or field_def.label or ""

                # 标签类型：全宽显示
                if field_def.field_type == "标签":
                    table = doc.add_table(rows=1, cols=1)
                    self._apply_grid_table_style(table)
                    cell = table.rows[0].cells[0]
                    para = cell.paragraphs[0]
                    para.style = 'FormLabel'
                    run = para.add_run(label)
                    self._set_run_font(run, size=Pt(10.5))
                    self._apply_cell_borders(cell)
                # 日志行类型：全宽显示，灰色底纹
                elif field_def.field_type == "日志行":
                    table = doc.add_table(rows=1, cols=1)
                    self._apply_grid_table_style(table)
                    cell = table.rows[0].cells[0]
                    para = cell.paragraphs[0]
                    run = para.add_run(label)
                    self._set_run_font(run, size=Pt(10.5))
                    # 设置灰色底纹
                    shading_elm = OxmlElement('w:shd')
                    shading_elm.set(qn('w:fill'), 'D9D9D9')
                    cell._tc.get_or_add_tcPr().append(shading_elm)
                    self._apply_cell_borders(cell)
                else:
                    # 普通字段：2列1行表格
                    table = doc.add_table(rows=1, cols=2)
                    self._apply_grid_table_style(table)

                    # 左侧单元格：标签（加粗）
                    left_cell = table.rows[0].cells[0]
                    left_para = left_cell.paragraphs[0]
                    left_run = left_para.add_run(label)
                    self._set_run_font(left_run, size=Pt(10.5), bold=True)
                    left_para.paragraph_format.space_before = Pt(5.25)
                    left_para.paragraph_format.space_after = Pt(5.25)
                    left_para.paragraph_format.line_spacing = 1
                    left_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    left_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

                    # 右侧单元格：控件
                    right_cell = table.rows[0].cells[1]
                    right_para = right_cell.paragraphs[0]

                    # 优先写入默认值（支持多行）
                    default_lines = extract_default_lines(form_field)
                    if default_lines:
                        for line_idx, line in enumerate(default_lines):
                            if line_idx > 0:
                                right_para.add_run().add_break()
                            right_run = right_para.add_run(line)
                            self._set_run_font(right_run, size=Pt(10.5))
                    else:
                        # 无默认值，渲染控件占位符
                        # 特殊处理单选和多选
                        if field_def.field_type in ["单选", "多选", "单选（纵向）"]:
                            self._render_choice_field(right_para, field_def)
                        else:
                            right_run = right_para.add_run(self._render_field_control(field_def))
                            self._set_run_font(right_run, size=Pt(10.5))

                    right_para.paragraph_format.space_before = Pt(5.25)
                    right_para.paragraph_format.space_after = Pt(5.25)
                    right_para.paragraph_format.line_spacing = 1
                    right_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    right_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

                    # 应用底纹颜色
                    if form_field.bg_color:
                        self._apply_cell_shading(left_cell, form_field.bg_color)
                        self._apply_cell_shading(right_cell, form_field.bg_color)
                    # 应用文字颜色
                    if form_field.text_color:
                        text_color = RGBColor.from_string(form_field.text_color)
                        self._set_run_font(left_run, color=text_color)
                        # 右侧单元格的文字也需要设置颜色
                        for para in right_cell.paragraphs:
                            for run in para.runs:
                                self._set_run_font(run, color=text_color)

                i += 1

            # 每个表单后添加分页符
            doc.add_page_break()

    def _add_inline_table(self, doc: Document, marked_fields, is_wide=False):
        """添加横向表格（1表头行+N内容行），自动分配列宽"""
        if not marked_fields:
            return

        # 使用共享模块构建表格数据模型
        headers, row_values, field_defs = build_inline_table_model(marked_fields)

        # 创建表格：1+max_rows行，N列
        table = doc.add_table(rows=1 + len(row_values), cols=len(marked_fields))
        self._apply_grid_table_style(table)

        # 自动分配列宽
        avail = Cm(23.36) if is_wide else Cm(14.66)
        col_w = int(avail / len(marked_fields))
        for col in table.columns:
            col.width = col_w

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
                    if field_def.field_type in ["单选", "多选", "单选（纵向）"]:
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
        elif field_type == "日期":
            return "|__|__|__|__|年|__|__|月|__|__|日"
        elif field_type == "日期时间":
            return "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分|__|__|秒"
        elif field_type == "时间":
            return "|__|__|时|__|__|分|__|__|秒"
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
        options = self._get_option_labels(field_def) or ["是", "否"]
        return "  ".join([f"○ {opt}" for opt in options])

    def _render_single_choice_vertical(self, field_def) -> str:
        """渲染纵向单选控件"""
        options = self._get_option_labels(field_def) or ["是", "否"]
        return "\n".join([f"○ {opt}" for opt in options])

    def _render_multi_choice(self, field_def) -> str:
        """渲染多选控件"""
        options = self._get_option_labels(field_def) or ["选项1", "选项2"]
        return "  ".join([f"□ {opt}" for opt in options])

    def _render_choice_field(self, paragraph, field_def):
        """渲染单选或多选字段，确保○□符号使用宋体"""
        field_type = field_def.field_type
        options = self._get_option_labels(field_def) or (["是", "否"] if "单选" in field_type else ["选项1", "选项2"])
        symbol = "○" if "单选" in field_type else "□"
        separator = "\n" if field_type == "单选（纵向）" else "  "

        for idx, opt in enumerate(options):
            if idx > 0 and separator == "  ":
                # 横向排列，添加空格分隔
                space_run = paragraph.add_run("  ")
                self._set_run_font(space_run, size=Pt(10.5))
            elif idx > 0 and separator == "\n":
                # 纵向排列，添加换行
                paragraph.add_run().add_break()

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

            # 添加选项文本run
            opt_run = paragraph.add_run(opt)
            self._set_run_font(opt_run, size=Pt(10.5))

    def _get_option_labels(self, field_def) -> list:
        """获取选项标签列表，trailing_underscore=1 时在标签末尾拼接 '_'"""
        if not hasattr(field_def, "codelist") or not field_def.codelist:
            return []
        if not hasattr(field_def.codelist, "options") or not field_def.codelist.options:
            return []
        options = sorted(field_def.codelist.options, key=lambda o: o.id or 0)
        labels = []
        for opt in options:
            if not opt.decode:
                continue
            label = opt.decode
            # 防御式：仅当 decode 末尾无 _ 时才追加，避免历史脏数据产生双下划线
            if getattr(opt, "trailing_underscore", 0) and not label.endswith("_"):
                label = f"{label}_"
            labels.append(label)
        return labels

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

        # 设置 Heading 1 为 22pt 粗体
        if "Heading 1" in doc.styles:
            h1_style = doc.styles["Heading 1"]
            h1_style.font.size = Pt(22)
            h1_style.font.bold = True
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
            label_style.paragraph_format.line_spacing = 1.5

    def _apply_grid_table_style(self, table):
        """为表格应用网格边框样式"""
        table.style = None
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
        """封面信息表格专用样式：无边框、左对齐、表格宽度5cm
        注意：此方法会覆盖CoverInfo样式的居中对齐设置
        """
        table.style = None
        table.autofit = False

        # 移除表格级边框
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

        # 设置列宽：第一列2cm，第二列3cm（总宽度5cm）
        if table.columns:
            table.columns[0].width = Cm(2)
            table.columns[1].width = Cm(3)

        # 遍历所有行和单元格，强制设置单元格宽度
        for row in table.rows:
            if len(row.cells) >= 2:
                # 强制设置第一列单元格宽度为2cm
                row.cells[0].width = Cm(2)
                # 强制设置第二列单元格宽度为3cm
                row.cells[1].width = Cm(3)

            for cell in row.cells:
                # 设置左对齐
                for para in cell.paragraphs:
                    para.alignment = WD_ALIGN_PARAGRAPH.LEFT

                # 移除单元格边框
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

    def _set_run_font(self, run, size: Optional[Pt] = None, bold: Optional[bool] = None):
        """设置Run的中英文字体与字号"""
        if size is not None:
            run.font.size = size
        if bold is not None:
            run.font.bold = bold
        run.font.name = self.FONT_ASCII
        rPr = run._element.get_or_add_rPr()
        rFonts = rPr.get_or_add_rFonts()
        rFonts.set(qn("w:ascii"), self.FONT_ASCII)
        rFonts.set(qn("w:hAnsi"), self.FONT_ASCII)
        rFonts.set(qn("w:eastAsia"), self.FONT_EAST_ASIA)
