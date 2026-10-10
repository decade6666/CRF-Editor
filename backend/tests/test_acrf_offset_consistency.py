"""前后端 aCRF 默认纵向偏移常量一致性测试。"""

from __future__ import annotations

import re
from pathlib import Path

from src.services import export_service


def _read_frontend_acrf_default_vertical_offset_emu() -> str:
    """从前端 acrfAnnotationGeometry.js 解析 ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU 常量。"""
    repo_root = Path(__file__).resolve().parents[2]
    source_path = (
        repo_root / "frontend" / "src" / "composables" / "acrfAnnotationGeometry.js"
    )
    source = source_path.read_text(encoding="utf-8")
    match = re.search(
        r"export\s+const\s+ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU\s*=\s*(-?\s*\d+)",
        source,
    )
    assert match is not None, (
        "acrfAnnotationGeometry.js 缺少 ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU 常量导出"
    )
    return match.group(1).replace(" ", "")


def test_acrf_default_vertical_offset_emu_matches_frontend() -> None:
    """断言前端 acrfAnnotationGeometry.js 与后端 export_service.py 的 aCRF 默认纵向偏移常量一致。"""
    frontend_value = _read_frontend_acrf_default_vertical_offset_emu()
    backend_value = export_service.ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU
    assert int(frontend_value) == backend_value, (
        f"aCRF 默认纵向偏移常量不一致: 前端={frontend_value}, 后端={backend_value}"
    )
