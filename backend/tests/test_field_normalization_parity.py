"""字段实例默认值与横向标记的跨栈归一契约（后端侧）。

共享用例表 `tests/fixtures/field_normalization_cases.json` 同时被前端
`frontend/tests/fieldNormalizationParity.test.js` 消费；新增/修改用例
必须同步验证两侧（本文件 + 前端 parity 测试）。
"""

import json
from pathlib import Path

import pytest

from src.services.field_normalization import (
    can_toggle_inline,
    is_default_value_supported,
    normalize_default_value,
    normalize_field_instance_default_value,
    normalize_field_instance_inline_mark,
)

FIXTURE = Path(__file__).parent / "fixtures" / "field_normalization_cases.json"


def load_cases():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", load_cases(), ids=lambda c: f"{c['field_type']}|inline={c['inline_mark']}")
def test_shared_fixture_case_normalization(case):
    field_type = case["field_type"]
    inline_mark = case["inline_mark"]

    assert is_default_value_supported(field_type, bool(inline_mark)) == case["default_supported"]

    # 保存顺序契约：先归 inline，再以最终 inline 归 default
    final_inline = normalize_field_instance_inline_mark(field_type, False, inline_mark)
    normalized = normalize_field_instance_default_value(field_type, final_inline, case["default_value"])
    assert normalized == case["expected_default_value"]

    assert final_inline == case["expected_inline"]
    assert can_toggle_inline(field_type, False) == case["inline_allowed"]
    assert can_toggle_inline(field_type, True) is False


def test_normalize_default_value_single_line_keeps_only_first_line():
    assert normalize_default_value("a\nb\nc", single_line=True) == "a"


def test_normalize_default_value_multiline_keeps_all_lines():
    value = "a\nb"
    assert normalize_default_value(value, single_line=False) == value


def test_normalize_empty_default_value_returns_none():
    assert normalize_field_instance_default_value("文本", 0, "") is None
    assert normalize_field_instance_default_value("文本", 0, "  ") == "  "
    assert normalize_field_instance_default_value("文本", 0, None) is None


def test_checkbox_never_supports_default_value():
    assert is_default_value_supported("复选", False) is False
    assert is_default_value_supported("复选", True) is False


def test_inline_enables_default_value_for_all_control_types():
    for field_type in ("日期", "日期时间", "时间", "单选", "多选", "单选（纵向）", "多选（纵向）"):
        assert is_default_value_supported(field_type, True) is True
