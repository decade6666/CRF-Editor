"""字段实例默认值与横向标记的服务器端归一规则。

与前端 `frontend/src/composables/useCRFRenderer.js` 的
`isDefaultValueSupported` / `normalizeDefaultValue` 及
`FormDesignerTab.vue::canToggleInline` 保持同一契约：
- 复选：不支持默认值
- inline（横向）字段：支持多行默认值
- 非 inline：仅「文本」「数值」支持默认值，且只保留首行
- 标签 / 日志行：不允许 inline

两侧规则变化必须同步更新共享用例表
`backend/tests/fixtures/field_normalization_cases.json`
及 `frontend/tests/fieldNormalizationParity.test.js`。
"""

DEFAULT_VALUE_FIELD_TYPES = ("文本", "数值")
INLINE_FORBIDDEN_FIELD_TYPES = ("标签", "日志行")
CHECKBOX_FIELD_TYPE = "复选"


def is_default_value_supported(field_type: str, inline_mark: bool = False) -> bool:
    """判断字段类型是否支持默认值/覆盖值。"""
    if field_type == CHECKBOX_FIELD_TYPE:
        return False
    if inline_mark:
        return True
    return field_type in DEFAULT_VALUE_FIELD_TYPES


def normalize_default_value(value: str | None, single_line: bool = False) -> str:
    """按展示规则归一默认值；single_line=True 时只保留首行。"""
    normalized = str(value or "")
    if not single_line:
        return normalized
    return normalized.split("\n", 1)[0]


def can_toggle_inline(field_type: str, is_log_row: bool = False) -> bool:
    """判断字段实例是否允许切换横向标记。"""
    if is_log_row:
        return False
    return field_type not in INLINE_FORBIDDEN_FIELD_TYPES


def normalize_field_instance_default_value(
    field_type: str,
    inline_mark: int,
    default_value: str | None,
) -> str | None:
    """保存字段实例时归一默认值：不支持则清空，非 inline 截首行，空串归 None。"""
    if not is_default_value_supported(field_type, bool(inline_mark)):
        return None
    normalized = normalize_default_value(default_value, single_line=not inline_mark)
    return normalized or None


def normalize_field_instance_inline_mark(
    field_type: str,
    is_log_row: bool,
    inline_mark: int,
) -> int:
    """保存字段实例时归一横向标记：不允许 inline 的类型强制关闭。"""
    if not can_toggle_inline(field_type, is_log_row):
        return 0
    return 1 if inline_mark else 0
