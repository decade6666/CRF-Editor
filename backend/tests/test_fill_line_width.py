"""填写线（下划线）按列宽自适应的根数估算器测试。

跨栈契约：与前端 useCRFRenderer.js 的 computeFillLineCharCount 同名同值。
设计要求：
- 根数随列宽单调增长；
- 保守留余量，绝不换行（物理宽度不超过列宽）；
- 设下限避免窄列出现 0 根，设上限防御异常超宽。
"""
from src.services.width_planning import (
    CELL_HPAD_CM,
    FILL_LINE_MAX_CHARS,
    FILL_LINE_MIN_CHARS,
    FILL_LINE_SAFETY_CM,
    UNDERSCORE_CHAR_CM,
    compute_fill_line_char_count,
)


def test_returns_min_chars_for_zero_or_negative_width() -> None:
    assert compute_fill_line_char_count(0) == FILL_LINE_MIN_CHARS
    assert compute_fill_line_char_count(-5) == FILL_LINE_MIN_CHARS


def test_narrow_column_floors_at_min_chars() -> None:
    # 列宽刚好只够内边距 + 余量时不应低于下限
    assert compute_fill_line_char_count(CELL_HPAD_CM + FILL_LINE_SAFETY_CM) == FILL_LINE_MIN_CHARS


def test_count_grows_with_column_width() -> None:
    narrow = compute_fill_line_char_count(4.0)
    wide = compute_fill_line_char_count(9.0)
    assert wide > narrow


def test_count_caps_at_max_chars() -> None:
    assert compute_fill_line_char_count(1000.0) == FILL_LINE_MAX_CHARS


def test_never_wraps_physical_width_within_column() -> None:
    # 保守性：根数 × 单字符物理宽度必须 ≤ 列宽（绝不换行）
    for column_cm in (5.0, 7.33, 8.8, 12.0, 20.0):
        count = compute_fill_line_char_count(column_cm)
        assert count * UNDERSCORE_CHAR_CM <= column_cm


def test_float_boundary_matches_frontend_math_floor() -> None:
    # 跨栈边界：column_cm=8.77 时前端 Math.floor 得 43；
    # 后端必须用 math.floor(+epsilon) 取得同值（Python float `//` 会误得 42）。
    assert compute_fill_line_char_count(8.77) == 43


def test_typical_portrait_control_column_is_wider_than_legacy_16() -> None:
    # 默认竖版 normal 表 control 列（≈ 0.5~0.6 × 14.66）应明显长于旧固定 16
    control_cm = 14.66 * 0.6
    assert compute_fill_line_char_count(control_cm) > 16
