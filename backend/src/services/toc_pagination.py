"""服务器侧用 LibreOffice 无头渲染计算 Word 导出目录的真实页码。

仅适用于装有 LibreOffice 的（共享服务器）部署：导出后把 .docx 渲染为 PDF，
从 PDF 大纲（由 Heading 1 段落生成）读取每个标题所在页码。LibreOffice 不可用
或任意环节失败时返回空 dict，调用方据此回退到"由 Word 更新域填充页码"。
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_LIBREOFFICE_BINARIES = ("soffice", "libreoffice")
_RENDER_TIMEOUT_SEC = 120


def find_libreoffice() -> str | None:
    """返回可用的 LibreOffice 可执行文件路径；未安装时返回 None。"""
    for name in _LIBREOFFICE_BINARIES:
        path = shutil.which(name)
        if path:
            return path
    return None


def compute_heading_pages(docx_path: str | Path) -> dict[str, int]:
    """渲染 docx 为 PDF 并返回 ``{标题文本: 1-based 页码}``。

    LibreOffice 不可用、渲染失败或解析失败时返回空 dict（调用方回退）。
    """
    soffice = find_libreoffice()
    if soffice is None:
        logger.info("LibreOffice 不可用，跳过目录页码预计算（回退 Word 更新域）")
        return {}
    docx_path = str(docx_path)
    if not os.path.isfile(docx_path):
        return {}
    with tempfile.TemporaryDirectory(prefix="crf_toc_") as workdir:
        pdf_path = _render_pdf(soffice, docx_path, workdir)
        if pdf_path is None:
            return {}
        return _extract_outline_pages(pdf_path)


def _render_pdf(soffice: str, docx_path: str, workdir: str) -> str | None:
    """用 LibreOffice 无头模式把 docx 转 PDF，返回 PDF 路径或 None。"""
    # 每次使用独立 user profile，避免与其他 LibreOffice 实例/会话争用文件锁
    profile = Path(workdir) / "profile"
    cmd = [
        soffice,
        f"-env:UserInstallation=file://{profile}",
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--convert-to",
        "pdf",
        "--outdir",
        workdir,
        docx_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=_RENDER_TIMEOUT_SEC)
    except (subprocess.SubprocessError, OSError):
        logger.exception("LibreOffice 渲染 PDF 失败，目录页码回退由 Word 更新")
        return None
    pdf_path = os.path.join(workdir, Path(docx_path).with_suffix(".pdf").name)
    return pdf_path if os.path.isfile(pdf_path) else None


def _extract_outline_pages(pdf_path: str) -> dict[str, int]:
    """从 PDF 大纲读取 ``{标题文本: 1-based 页码}``；解析失败返回空 dict。"""
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.info("pypdf 不可用，跳过目录页码预计算")
        return {}
    try:
        reader = PdfReader(pdf_path)
        pages: dict[str, int] = {}
        _walk_outline(reader, reader.outline, pages)
        return pages
    except Exception:
        logger.exception("解析 PDF 大纲页码失败，目录页码回退由 Word 更新")
        return {}


def _walk_outline(reader, items, pages: dict[str, int]) -> None:
    """递归遍历 PDF 大纲，把标题→1-based 页码写入 pages（同名以首次出现为准）。"""
    for item in items:
        if isinstance(item, list):
            _walk_outline(reader, item, pages)
            continue
        title = (getattr(item, "title", None) or "").strip()
        if not title or title in pages:
            continue
        try:
            page_index = reader.get_destination_page_number(item)
        except Exception:
            continue
        if page_index is not None:
            pages[title] = page_index + 1
