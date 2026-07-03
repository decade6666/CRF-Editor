"""Word文档截图服务 - 将 docx 转 PDF 再转图片

策略：
    1. 自动选择 MS Word COM 或 LibreOffice headless 将 docx 转为 PDF
    2. 调用 PyMuPDF 将 PDF 按页转为 PNG
    3. 任务状态以 temp_id 为 key 缓存在进程内存中
    4. 图片写入 uploads/docx_temp/{temp_id}/pages/ 目录
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from src.config import DocxScreenshotBackend, get_config
from src.services.toc_pagination import find_libreoffice

logger = logging.getLogger(__name__)

# 全局任务状态表（进程内存，单 worker 场景足够用）
_tasks: Dict[str, "ScreenshotTask"] = {}
_tasks_lock = threading.Lock()

# 最大并发截图任务数（Word COM 接口并发不稳定）
_semaphore = threading.Semaphore(2)

_LIBREOFFICE_TIMEOUT_SEC = 120
_PROCESS_OUTPUT_SNIPPET = 1200


@dataclass
class ScreenshotTask:
    """截图任务状态"""
    status: str = "idle"       # idle | starting | running | done | failed
    pages: List[str] = field(default_factory=list)   # 各页图片路径列表
    error: Optional[str] = None
    page_count: int = 0
    page_ranges: Dict[str, List[int]] = field(default_factory=dict)  # {表单名: [start, end]}
    field_pages: Dict[str, Dict[int, int]] = field(default_factory=dict)  # {表单名: {字段索引: 页码}}


@dataclass(frozen=True)
class _PdfBackendSelection:
    backend: DocxScreenshotBackend
    soffice_path: Optional[str] = None


class DocxScreenshotService:
    """Word 文档截图服务"""

    # 使用绝对路径，避免工作目录不同导致文件找不到
    BASE_DIR = str(Path(__file__).resolve().parent.parent.parent / "uploads" / "docx_temp")

    # ── 任务管理 ──

    @staticmethod
    def get_task(temp_id: str) -> Optional[ScreenshotTask]:
        with _tasks_lock:
            return _tasks.get(temp_id)

    @staticmethod
    def _set_task(temp_id: str, task: ScreenshotTask) -> None:
        with _tasks_lock:
            _tasks[temp_id] = task

    @staticmethod
    def remove_task(temp_id: str) -> None:
        with _tasks_lock:
            _tasks.pop(temp_id, None)

    # ── 路径工具 ──

    @classmethod
    def _get_pages_dir(cls, temp_id: str) -> Path:
        return Path(cls.BASE_DIR) / temp_id / "pages"

    @classmethod
    def get_page_path(cls, temp_id: str, page: int) -> Optional[str]:
        """返回指定页的图片路径（page 从 1 开始），不存在则返回 None"""
        task = DocxScreenshotService.get_task(temp_id)
        if not task or task.status != "done":
            return None
        idx = page - 1
        if idx < 0 or idx >= len(task.pages):
            return None
        p = task.pages[idx]
        return p if os.path.exists(p) else None

    # ── 任务启动 ──

    @classmethod
    def start(cls, temp_id: str, docx_path: str, forms_data: Optional[List[dict]] = None) -> ScreenshotTask:
        """启动截图任务（非阻塞），立即返回 task 对象

        Args:
            forms_data: 表单数据列表，每项包含 name 和 fields
        """
        with _tasks_lock:
            existing = _tasks.get(temp_id)
            if existing and existing.status in ("starting", "running"):
                return existing
            # 已完成：同步刷新页码范围
            if existing and existing.status == "done":
                if forms_data:
                    cls._refresh_page_ranges(temp_id, existing, forms_data)
                return existing
            task = ScreenshotTask(status="starting")
            _tasks[temp_id] = task

        # 后台线程执行完整转换
        t = threading.Thread(
            target=cls._run,
            args=(temp_id, docx_path, task, forms_data or []),
            daemon=True,
        )
        t.start()
        return task

    @classmethod
    def _refresh_page_ranges(cls, temp_id: str, task: ScreenshotTask, forms_data: List[dict]) -> None:
        """同步刷新页码范围和字段页码"""
        try:
            pages_dir = cls._get_pages_dir(temp_id)
            pdf_files = list(pages_dir.glob("*.pdf"))
            if not pdf_files:
                return

            form_names = [f.get("name", "") for f in forms_data]
            task.page_ranges = cls._detect_form_pages(str(pdf_files[0]), form_names, task.page_count)
            task.field_pages = cls._detect_field_pages(str(pdf_files[0]), forms_data, task.page_ranges)
        except Exception as exc:
            logger.exception("刷新页码范围失败 temp_id=%s: %s", temp_id, exc)

    @staticmethod
    def _load_pythoncom():
        try:
            import pythoncom
        except ImportError as exc:
            raise RuntimeError("Word 文档渲染后端不可用：缺少 pythoncom/pywin32") from exc
        return pythoncom

    @staticmethod
    def _is_word_backend_available() -> bool:
        import importlib.util

        return importlib.util.find_spec("pythoncom") is not None

    @staticmethod
    def _configured_backend() -> DocxScreenshotBackend:
        raw_backend = get_config().docx_screenshot.backend
        return (
            raw_backend
            if isinstance(raw_backend, DocxScreenshotBackend)
            else DocxScreenshotBackend(raw_backend)
        )

    @classmethod
    def _select_pdf_backend(cls) -> _PdfBackendSelection:
        configured = cls._configured_backend()
        if configured == DocxScreenshotBackend.WORD:
            if cls._is_word_backend_available():
                return _PdfBackendSelection(DocxScreenshotBackend.WORD)
            raise RuntimeError("指定的 Word 文档渲染后端不可用")

        if configured == DocxScreenshotBackend.LIBREOFFICE:
            soffice = find_libreoffice()
            if soffice:
                return _PdfBackendSelection(DocxScreenshotBackend.LIBREOFFICE, soffice)
            raise RuntimeError("指定的 LibreOffice 文档渲染后端不可用")

        if cls._is_word_backend_available():
            return _PdfBackendSelection(DocxScreenshotBackend.WORD)

        soffice = find_libreoffice()
        if soffice:
            return _PdfBackendSelection(DocxScreenshotBackend.LIBREOFFICE, soffice)

        raise RuntimeError("无可用的文档渲染后端，请安装 LibreOffice 或配置 Word 后端")

    @classmethod
    def _run(cls, temp_id: str, docx_path: str, task: ScreenshotTask, forms_data: List[dict]) -> None:
        """实际执行转换逻辑（在后台线程中运行）"""
        try:
            backend = cls._select_pdf_backend()
            with _semaphore:
                task.status = "running"
                pages_dir = cls._get_pages_dir(temp_id)
                pages_dir.mkdir(parents=True, exist_ok=True)

                # 步骤1：docx → pdf（后端选择独立，后续 PyMuPDF 逻辑不变）
                pdf_path = cls._convert_to_pdf(docx_path, pages_dir, backend)

                # 步骤2：pdf → png 列表
                page_paths = cls._convert_to_images(pdf_path, pages_dir)

                # 步骤3：检测各表单对应页码范围
                if forms_data:
                    form_names = [f.get("name", "") for f in forms_data]
                    task.page_ranges = cls._detect_form_pages(pdf_path, form_names, len(page_paths))
                    # 步骤4：检测字段级页码
                    task.field_pages = cls._detect_field_pages(pdf_path, forms_data, task.page_ranges)

                task.pages = page_paths
                task.page_count = len(page_paths)
                task.status = "done"
                logger.info("截图完成 temp_id=%s 共 %d 页", temp_id, len(page_paths))
        except Exception as exc:
            task.status = "failed"
            task.error = str(exc)
            logger.exception("截图失败 temp_id=%s", temp_id)

    # ── docx → pdf ──

    @classmethod
    def _convert_to_pdf(
        cls,
        docx_path: str,
        output_dir: Path,
        backend: Optional[_PdfBackendSelection] = None,
    ) -> str:
        """按选中的后端将 docx 转为 PDF，返回 PDF 路径。"""
        selection = backend or cls._select_pdf_backend()
        if selection.backend == DocxScreenshotBackend.WORD:
            return cls._convert_to_pdf_word(docx_path, output_dir)
        if not selection.soffice_path:
            raise RuntimeError("指定的 LibreOffice 文档渲染后端不可用")
        return cls._convert_to_pdf_libreoffice(docx_path, output_dir, selection.soffice_path)

    @classmethod
    def _convert_to_pdf_word(cls, docx_path: str, output_dir: Path) -> str:
        """使用 docx2pdf/MS Word COM 将 docx 转为 PDF，返回 PDF 路径。"""
        pythoncom = cls._load_pythoncom()
        com_initialized = False
        try:
            pythoncom.CoInitialize()
            com_initialized = True
            try:
                from docx2pdf import convert
            except ImportError as exc:
                raise RuntimeError("Word 文档渲染后端不可用：缺少 docx2pdf 依赖") from exc

            docx_abs = str(Path(docx_path).resolve())
            output_abs = str(output_dir.resolve())

            convert(docx_abs, output_abs)
            pdf_path = cls._find_nonempty_pdf_output(docx_path, output_dir)
            if pdf_path is None:
                raise RuntimeError("文档渲染失败：未生成输出 PDF")
            return str(pdf_path)
        finally:
            if com_initialized:
                pythoncom.CoUninitialize()

    @classmethod
    def _convert_to_pdf_libreoffice(cls, docx_path: str, output_dir: Path, soffice: str) -> str:
        """使用 LibreOffice headless 将 docx 转为 PDF，返回 PDF 路径。"""
        docx_abs = str(Path(docx_path).resolve())
        output_abs = str(output_dir.resolve())
        profile_dir = tempfile.mkdtemp(prefix="crf_docx_lo_")
        cmd = [
            soffice,
            f"-env:UserInstallation={Path(profile_dir).as_uri()}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--convert-to",
            "pdf:writer_pdf_Export",
            "--outdir",
            output_abs,
            docx_abs,
        ]
        result: Optional[subprocess.CompletedProcess] = None
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=_LIBREOFFICE_TIMEOUT_SEC,
            )
        except subprocess.TimeoutExpired as exc:
            logger.error(
                "LibreOffice 文档渲染超时 timeout=%ss stdout=%s stderr=%s",
                _LIBREOFFICE_TIMEOUT_SEC,
                cls._summarize_process_output(exc.stdout),
                cls._summarize_process_output(exc.stderr),
            )
            raise RuntimeError("文档渲染失败：渲染超时") from exc
        except (subprocess.SubprocessError, OSError) as exc:
            logger.exception("LibreOffice 文档渲染失败：%s", exc)
            raise RuntimeError("文档渲染失败") from exc
        finally:
            shutil.rmtree(profile_dir, ignore_errors=True)

        if result.returncode != 0:
            logger.error(
                "LibreOffice 文档渲染失败 returncode=%s stdout=%s stderr=%s",
                result.returncode,
                cls._summarize_process_output(result.stdout),
                cls._summarize_process_output(result.stderr),
            )
            raise RuntimeError("文档渲染失败")

        pdf_path = cls._find_nonempty_pdf_output(docx_path, output_dir)
        if pdf_path is None:
            logger.error(
                "LibreOffice 文档渲染失败：未生成非空 PDF stdout=%s stderr=%s",
                cls._summarize_process_output(result.stdout),
                cls._summarize_process_output(result.stderr),
            )
            raise RuntimeError("文档渲染失败：未生成输出 PDF")
        return str(pdf_path)

    @staticmethod
    def _summarize_process_output(value) -> str:
        if value is None:
            return "<empty>"
        if isinstance(value, bytes):
            text = value.decode("utf-8", errors="replace")
        else:
            text = str(value)
        text = text.strip()
        if not text:
            return "<empty>"
        if len(text) > _PROCESS_OUTPUT_SNIPPET:
            return f"{text[:_PROCESS_OUTPUT_SNIPPET]}..."
        return text

    @staticmethod
    def _find_nonempty_pdf_output(docx_path: str, output_dir: Path) -> Optional[Path]:
        expected = output_dir / (Path(docx_path).stem + ".pdf")
        candidates = []
        if expected.exists():
            candidates.append(expected)
        candidates.extend(p for p in output_dir.glob("*.pdf") if p != expected)
        for pdf_path in candidates:
            try:
                if pdf_path.is_file() and pdf_path.stat().st_size > 0:
                    return pdf_path
            except OSError:
                logger.warning("检查 PDF 输出失败: %s", pdf_path)
        return None

    # ── pdf → images ──

    @staticmethod
    def _convert_to_images(pdf_path: str, output_dir: Path) -> List[str]:
        """使用 PyMuPDF 将 PDF 转为 PNG 列表，无需 poppler"""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise RuntimeError("缺少依赖：请执行 pip install pymupdf")

        doc = fitz.open(pdf_path)
        page_files = []
        # DPI=150 对应 matrix 缩放系数 150/72 ≈ 2.083
        zoom = 150 / 72
        mat = fitz.Matrix(zoom, zoom)

        for i, page in enumerate(doc, 1):
            pix = page.get_pixmap(matrix=mat, alpha=False)
            p = output_dir / f"page-{i:03d}.png"
            pix.save(str(p))
            page_files.append(p)
            logger.info("已生成第 %d 页截图: %s", i, p)

        doc.close()
        return [str(p) for p in page_files]

    # ── 页码范围检测 ──

    @staticmethod
    def _detect_form_pages(pdf_path: str, form_names: List[str], total_pages: int) -> Dict[str, List[int]]:
        """用 PyMuPDF 提取每页文字，找出各表单标题对应的页码范围（1-based）

        跳过目录页（同时包含多个表单名的页面），取表单名唯一出现的页作为起始页。
        """
        import fitz
        import re
        import unicodedata
        doc = fitz.open(pdf_path)
        page_texts = [doc[i].get_text("text") for i in range(len(doc))]
        doc.close()

        form_name_set = set(form_names)

        def normalize_text(text: str) -> str:
            """标准化文本：NFKC归一化 + 去除控制字符和空格"""
            # NFKC归一化（兼容性分解后再组合）
            text = unicodedata.normalize('NFKC', text)
            # 去除所有空白字符
            text = re.sub(r'\s+', '', text)
            # 去除Unicode控制字符（C*类）和格式字符（Cf类）
            text = ''.join(c for c in text if unicodedata.category(c)[0] not in ('C', 'Z'))
            return text

        def match_form_in_text(form_name: str, page_text: str) -> bool:
            """检查表单名是否在页面文本中（宽松匹配，支持带编号的表单名）"""
            normalized_form = normalize_text(form_name)
            normalized_page = normalize_text(page_text)
            result = normalized_form in normalized_page
            if not result:
                logger.debug("匹配失败 '%s': repr(form)=%s, repr(page前100)=%s",
                           form_name, repr(normalized_form), repr(normalized_page[:100]))
            return result

        def is_toc_page(text: str) -> bool:
            """判断是否为目录页：同时包含 2 个以上独立表单名(排除子串包含)

            智能判断逻辑：
            - 非常短的页面(<400字符)直接排除
            - 包含4+个独立表单名的页面，高置信度判定为目录页
            - 包含2-3个独立表单名的页面，结合长度判断（>600字符才算目录页）
            """
            # 非常短的页面直接判定为非目录页（表单内容页通常<400字符）
            if len(text) < 400:
                return False

            matched = [n for n in form_name_set if match_form_in_text(n, text)]
            # 排除子串:如果表单名A是表单名B的子串,则只保留B
            independent = []
            for name in matched:
                is_substring = any(name != other and name in other for other in matched)
                if not is_substring:
                    independent.append(name)

            # 如果独立表单名>=4个，高置信度判定为目录页
            if len(independent) >= 4:
                return True

            # 如果独立表单名2-3个，结合页面长度判断（长页面更可能是目录页）
            if len(independent) >= 2:
                return len(text) >= 600

            return False

        # 找每个表单名第一次出现在非目录页的页码
        form_starts: Dict[str, int] = {}
        for name in form_names:
            found = False
            for i, text in enumerate(page_texts):
                if match_form_in_text(name, text) and not is_toc_page(text):
                    form_starts[name] = i + 1  # 1-based
                    logger.info("表单 '%s' 匹配到页码: %d", name, i + 1)
                    found = True
                    break
            if not found:
                logger.warning("表单 '%s' 未在PDF中找到匹配页码", name)

        # 按起始页排序，计算结束页（兜底：end 不小于 start）
        sorted_forms = sorted(form_starts.items(), key=lambda x: x[1])
        ranges: Dict[str, List[int]] = {}
        for idx, (name, start) in enumerate(sorted_forms):
            end = sorted_forms[idx + 1][1] - 1 if idx + 1 < len(sorted_forms) else total_pages
            end = max(end, start)  # 防止 start > end 的无效范围
            ranges[name] = [start, end]
            logger.info("表单 '%s' 页码范围: %d-%d", name, start, end)

        return ranges

    @staticmethod
    def _detect_field_pages(
        pdf_path: str,
        forms_data: List[dict],
        page_ranges: Dict[str, List[int]]
    ) -> Dict[str, Dict[int, int]]:
        """检测每个字段的页码（在表单页码范围内搜索字段label）

        Args:
            pdf_path: PDF文件路径
            forms_data: 表单数据列表，每项包含 name 和 fields
            page_ranges: 表单页码范围 {表单名: [start, end]}

        Returns:
            {表单名: {字段索引: 页码}}
        """
        import fitz
        import re
        import unicodedata

        doc = fitz.open(pdf_path)
        page_texts = [doc[i].get_text("text") for i in range(len(doc))]
        doc.close()

        def normalize_text(text: str) -> str:
            """标准化文本：NFKC归一化 + 去除控制字符和空格"""
            text = unicodedata.normalize('NFKC', text)
            text = re.sub(r'\s+', '', text)
            text = ''.join(c for c in text if unicodedata.category(c)[0] not in ('C', 'Z'))
            return text

        field_pages: Dict[str, Dict[int, int]] = {}

        for form in forms_data:
            form_name = form.get("name", "")
            fields = form.get("fields", [])
            page_range = page_ranges.get(form_name)

            if not page_range:
                continue

            start_page, end_page = page_range
            field_map: Dict[int, int] = {}

            for field_idx, field in enumerate(fields):
                label = field.get("label", "").strip()
                if not label or len(label) < 2:
                    continue

                normalized_label = normalize_text(label)

                # 在表单页码范围内搜索字段label
                for page_num in range(start_page - 1, end_page):
                    if page_num >= len(page_texts):
                        break

                    page_text = page_texts[page_num]
                    normalized_page = normalize_text(page_text)

                    if normalized_label in normalized_page:
                        field_map[field_idx] = page_num + 1  # 1-based
                        logger.info("[%s] 字段 '%s' (索引%d) 匹配到页码: %d", form_name, label, field_idx, page_num + 1)
                        break

            if field_map:
                field_pages[form_name] = field_map

        return field_pages

    # ── 清理 ──

    @classmethod
    def cleanup(cls, temp_id: str) -> None:
        """清理截图任务及图片文件（配合 DocxImportService.cleanup_temp 使用）"""
        cls.remove_task(temp_id)
        pages_dir = cls._get_pages_dir(temp_id)
        if pages_dir.exists():
            import shutil
            shutil.rmtree(str(pages_dir), ignore_errors=True)
            logger.info("已清理截图目录 %s", pages_dir)

    @classmethod
    def cleanup_old_caches(cls, days: int = 7) -> Dict[str, int]:
        """清理N天前的截图缓存

        Args:
            days: 清理多少天前的缓存，默认7天

        Returns:
            {"deleted_count": 删除的目录数, "freed_bytes": 释放的字节数}
        """
        from datetime import datetime, timedelta
        import shutil

        cutoff = datetime.now() - timedelta(days=days)
        base_dir = Path(cls.BASE_DIR)

        if not base_dir.exists():
            return {"deleted_count": 0, "freed_bytes": 0}

        deleted_count = 0
        freed_bytes = 0

        for temp_dir in base_dir.iterdir():
            if not temp_dir.is_dir():
                continue
            try:
                mtime = datetime.fromtimestamp(temp_dir.stat().st_mtime)
                if mtime < cutoff:
                    # 计算目录大小
                    dir_size = sum(f.stat().st_size for f in temp_dir.rglob('*') if f.is_file())
                    shutil.rmtree(str(temp_dir), ignore_errors=True)
                    deleted_count += 1
                    freed_bytes += dir_size
                    logger.info("已清理过期截图目录 %s (%.2f MB)", temp_dir, dir_size / 1024 / 1024)
            except Exception as e:
                logger.warning("清理目录失败 %s: %s", temp_dir, e)

        logger.info("清理完成：删除 %d 个目录，释放 %.2f MB", deleted_count, freed_bytes / 1024 / 1024)
        return {"deleted_count": deleted_count, "freed_bytes": freed_bytes}
