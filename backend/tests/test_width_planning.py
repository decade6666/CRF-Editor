"""宽度规划模块测试

验证设计文档中定义的性质：
- P1. 宽度总预算不变式
- P2. 比例保持不变式
- P5. 排序稳定性不变式
- P6. 幂等性不变式
"""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.services.field_rendering import build_inline_column_demands, build_field_control_weight
from src.services.width_planning import (
    WEIGHT_ASCII,
    WEIGHT_CHINESE,
    build_column_demands,
    build_normal_table_demands,
    compute_char_weight,
    compute_choice_atom_weight,
    compute_text_weight,
    plan_inline_table_width,
    plan_normal_table_width,
    plan_unified_table_width,
    plan_width,
    ColumnDemand,
    WidthPlan,
)


class TestCharWeight:
    """字符权重计算测试"""

    def test_chinese_char_weight_is_2(self):
        """中文字符权重为 2"""
        assert compute_char_weight("中") == 2
        assert compute_char_weight("文") == 2
        assert compute_char_weight("字") == 2

    def test_ascii_char_weight_is_1(self):
        """英文/数字/标点权重为 1"""
        assert compute_char_weight("a") == 1
        assert compute_char_weight("Z") == 1
        assert compute_char_weight("0") == 1
        assert compute_char_weight("9") == 1
        assert compute_char_weight("!") == 1
        assert compute_char_weight(" ") == 1

    def test_cjk_extension_ranges(self):
        """CJK 扩展区字符权重为 2"""
        # 扩展A区
        assert compute_char_weight("㐀") == 2
        # 扩展B区（需要代理对，这里用基本区字符）
        assert compute_char_weight("𠮷") == 2  # U+20BB7 在扩展B区


class TestTextWeight:
    """文本权重计算测试"""

    def test_empty_text_weight_is_0(self):
        """空文本权重为 0"""
        assert compute_text_weight("") == 0

    def test_pure_ascii_text_weight(self):
        """纯 ASCII 文本权重"""
        assert compute_text_weight("abc") == 3
        assert compute_text_weight("Hello World") == 11

    def test_pure_chinese_text_weight(self):
        """纯中文文本权重"""
        assert compute_text_weight("中文") == 4
        assert compute_text_weight("宽度规划") == 8

    def test_mixed_text_weight(self):
        """混合文本权重"""
        # "中abc" = 2 + 1 + 1 + 1 = 5
        assert compute_text_weight("中abc") == 5
        # "Hello世界" = 5 + 4 = 9
        assert compute_text_weight("Hello世界") == 9


class TestChoiceAtomWeight:
    """选项原子权重计算测试"""

    def test_choice_atom_without_trailing(self):
        """无尾部填写线的选项原子权重"""
        # 符号 + 空格 + 标签 = 2 + 2 = 4（假设标签为空）
        weight = compute_choice_atom_weight("", False)
        assert weight == 2

        # 符号 + 空格 + 标签 = 2 + 4 = 6（标签"选项"）
        weight = compute_choice_atom_weight("选项", False)
        assert weight == 6

    def test_choice_atom_with_trailing(self):
        """有尾部填写线的选项原子权重"""
        # 符号 + 空格 + 标签 + 填写线 = 2 + 4 + 6 = 12（标签"选项"）
        weight = compute_choice_atom_weight("选项", True)
        assert weight == 12

    def test_trailing_adds_constant_weight(self):
        """尾部填写线增加固定权重"""
        without_trailing = compute_choice_atom_weight("测试", False)
        with_trailing = compute_choice_atom_weight("测试", True)
        assert with_trailing - without_trailing == 6  # FILL_LINE_WEIGHT


class TestBuildColumnDemands:
    """列需求构建测试"""

    def test_empty_headers_returns_empty(self):
        """空表头返回空需求"""
        demands = build_column_demands([], [])
        assert demands == []

    def test_single_column_demand(self):
        """单列需求"""
        demands = build_column_demands(["标签"], [])
        assert len(demands) == 1
        assert demands[0].column_key == "col_0"
        assert demands[0].intrinsic_weight > 0

    def test_row_values_contribute_to_weight(self):
        """行数据影响权重"""
        demands_empty = build_column_demands(["标签"], [[]])
        demands_with_value = build_column_demands(["标签"], [["默认值ABC"]])
        # 有默认值时权重应该更大
        assert demands_with_value[0].intrinsic_weight >= demands_empty[0].intrinsic_weight


class TestPlanWidth:
    """宽度规划测试"""

    def test_empty_demands_returns_empty_plan(self):
        """空需求返回空规划"""
        plan = plan_width([], 100)
        assert plan.column_count == 0
        assert plan.demands == []
        assert plan.normalized_fractions == []
        assert plan.fallback_applied is False

    def test_equal_demands_produce_equal_fractions(self):
        """等权需求产生等宽分配"""
        demands = [
            ColumnDemand("col_0", 10, 1),
            ColumnDemand("col_1", 10, 1),
            ColumnDemand("col_2", 10, 1),
        ]
        plan = plan_width(demands, 100)
        assert plan.column_count == 3
        # 每列应该接近 1/3
        for f in plan.normalized_fractions:
            assert abs(f - 1/3) < 0.01

    def test_unequal_demands_produce_proportional_fractions(self):
        """不等权需求产生比例分配"""
        demands = [
            ColumnDemand("col_0", 20, 1),  # 50%
            ColumnDemand("col_1", 12, 1),  # 30%
            ColumnDemand("col_2", 8, 1),   # 20%
        ]
        plan = plan_width(demands, 100)
        assert plan.column_count == 3
        assert abs(plan.normalized_fractions[0] - 0.5) < 0.01
        assert abs(plan.normalized_fractions[1] - 0.3) < 0.01
        assert abs(plan.normalized_fractions[2] - 0.2) < 0.01

    def test_overflow_triggers_fallback(self):
        """超预算触发回退"""
        demands = [
            ColumnDemand("col_0", 100, 1),
            ColumnDemand("col_1", 100, 1),
        ]
        plan = plan_width(demands, 50)  # 总需求 200，预算 50
        assert plan.fallback_applied is True
        # 仍然应该保持比例
        assert abs(plan.normalized_fractions[0] - 0.5) < 0.01

    def test_proportion_preserved_after_fallback(self):
        """回退后比例保持（P2 不变式）"""
        demands = [
            ColumnDemand("col_0", 100, 1),  # 大需求
            ColumnDemand("col_1", 50, 1),   # 小需求
        ]
        plan = plan_width(demands, 75)  # 总需求 150，预算 75
        # 回退后，列 0 仍然应该比列 1 宽
        assert plan.normalized_fractions[0] >= plan.normalized_fractions[1]


class TestPlanInlineTableWidth:
    """Inline 表格宽度规划测试"""

    def test_single_column_full_width(self):
        """单列占满可用宽度"""
        widths = plan_inline_table_width(["标签"], [[]], 20.0)
        assert len(widths) == 1
        assert abs(widths[0] - 20.0) < 0.01

    def test_total_width_within_budget(self):
        """总宽度不超预算（P1 不变式）"""
        widths = plan_inline_table_width(
            ["标签A", "标签B", "标签C"],
            [["值A", "值B", "值C"]],
            23.36,
        )
        total = sum(widths)
        assert total <= 23.36 + 0.01  # 允许浮点误差

    def test_larger_label_gets_larger_width(self):
        """更大标签获得更大宽度"""
        # 中文标签权重更高
        widths = plan_inline_table_width(
            ["短", "这是一个很长的中文标签"],
            [[None, None]],
            23.36,
        )
        # 长标签应该获得更大宽度
        assert widths[1] > widths[0]


class TestPlanUnifiedTableWidth:
    """Unified 表格宽度规划测试"""

    def test_empty_segments_returns_empty(self):
        """空片段返回空列表"""
        widths = plan_unified_table_width([], 23.36)
        assert widths == []

    def test_inline_block_segments_produce_widths(self):
        """inline block 片段产生宽度"""
        segments = [
            ("inline_block", ["列A", "列B", "列C"], [["值A", "值B", "值C"]]),
        ]
        widths = plan_unified_table_width(segments, 23.36)
        assert len(widths) == 3
        assert sum(widths) <= 23.36 + 0.01

    def test_multiple_inline_blocks_share_width_semantics(self):
        """多个 inline block 按列槽位取最大共享宽度语义（P3 不变式）"""
        # 两个 block 都是 2 列，映射到同一 unified 网格
        segments = [
            ("inline_block", ["短", "短"], [[None, None]]),
            ("inline_block", ["短", "这是一个很长的标签"], [[None, None]]),
        ]
        widths = plan_unified_table_width(segments, 23.36, column_count=2)
        # 应该返回 2 列宽度
        assert len(widths) == 2
        # 第二列聚合后应比第一列更宽（因为第二个 block 的长标签）
        assert widths[1] > widths[0]

    def test_slot_max_monotonicity(self):
        """P2：增大某槽位需求后该槽位宽度不减小"""
        segments_small = [
            ("inline_block", ["短", "中"], [[None, None]]),
        ]
        segments_large = [
            ("inline_block", ["短", "中"], [[None, None]]),
            ("inline_block", ["短", "这是一个非常非常长的标签文本"], [[None, None]]),
        ]
        widths_small = plan_unified_table_width(segments_small, 23.36, column_count=2)
        widths_large = plan_unified_table_width(segments_large, 23.36, column_count=2)
        # 第二列需求增大后，其宽度不减小
        assert widths_large[1] >= widths_small[1] - 0.01

    def test_scale_to_fit_preserves_relative_order(self):
        """P4：超预算缩放后较高需求列仍不窄于较低需求列"""
        segments = [
            ("inline_block",
             ["短", "这是一个非常非常非常长的中文标签"],
             [[None, None]]),
        ]
        widths = plan_unified_table_width(segments, 5.0, column_count=2)
        assert len(widths) == 2
        assert widths[1] >= widths[0]

    def test_unified_idempotence(self):
        """P7：unified 规划幂等性"""
        segments = [
            ("inline_block", ["标签A", "标签B"], [["值", "值"]]),
            ("inline_block", ["短", "长标签文本"], [[None, None]]),
        ]
        w1 = plan_unified_table_width(segments, 23.36, column_count=2)
        w2 = plan_unified_table_width(segments, 23.36, column_count=2)
        assert w1 == w2

    def test_block_demands_parameter(self):
        """block_demands 参数优先于 header/row 文本"""
        segments = [
            ("inline_block", ["短", "短"], [[None, None]]),
        ]
        # 通过 block_demands 注入不对称的语义需求
        block_demands = [
            [("短", 4.0), ("长语义需求", 20.0)],
        ]
        widths = plan_unified_table_width(
            segments, 23.36, column_count=2, block_demands=block_demands
        )
        assert len(widths) == 2
        assert widths[1] > widths[0]

    def test_regular_field_demands_are_distributed_across_value_span(self):
        """regular_field 的 control 权重按 value colspan 分摊到物理列。"""
        widths = plan_unified_table_width(
            [],
            23.36,
            column_count=7,
            regular_field_demands=[{"label_weight": 8.0, "control_weight": 24.0}],
        )
        total = sum(widths)
        fractions = [w / total for w in widths]
        assert all(abs(fractions[i] - (1 / 9)) < 1e-9 for i in range(3))
        assert all(abs(fractions[i] - (1 / 6)) < 1e-9 for i in range(3, 7))

    def test_semantic_demands_for_inline(self):
        """plan_inline_table_width 接受 semantic_demands 参数"""
        headers = ["短", "短"]
        row_values = [[None, None]]
        # 不带语义需求
        widths_basic = plan_inline_table_width(headers, row_values, 20.0)
        # 带语义需求（第二列更重）
        semantic = [("短", 4.0), ("长选项需求", 20.0)]
        widths_semantic = plan_inline_table_width(
            headers, row_values, 20.0, semantic_demands=semantic
        )
        # 语义需求应使第二列更宽
        assert widths_semantic[1] > widths_semantic[0]


class TestIdempotence:
    """幂等性测试（P6 不变式）"""

    def test_plan_width_is_idempotent(self):
        """宽度规划幂等性"""
        demands = [
            ColumnDemand("col_0", 20, 1),
            ColumnDemand("col_1", 15, 1),
            ColumnDemand("col_2", 10, 1),
        ]
        plan1 = plan_width(demands, 100)
        plan2 = plan_width(demands, 100)
        plan3 = plan_width(demands, 100)

        # 多次规划应该产生相同结果
        assert plan1.normalized_fractions == plan2.normalized_fractions
        assert plan2.normalized_fractions == plan3.normalized_fractions

    def test_plan_inline_table_width_is_idempotent(self):
        """inline 表格宽度规划幂等性"""
        headers = ["标签A", "标签B"]
        row_values = [["值A", "值B"]]

        widths1 = plan_inline_table_width(headers, row_values, 20.0)
        widths2 = plan_inline_table_width(headers, row_values, 20.0)
        widths3 = plan_inline_table_width(headers, row_values, 20.0)

        assert widths1 == widths2
        assert widths2 == widths3


# ---------------------------------------------------------------------------
# Hypothesis 属性测试
# ---------------------------------------------------------------------------

@given(
    labels=st.lists(st.text(min_size=1, max_size=20), min_size=1, max_size=6),
)
@settings(max_examples=20, deadline=None)
def test_pbt_total_width_within_budget(labels):
    """P1 不变式：任意标签组合，总宽度不超预算"""
    widths = plan_inline_table_width(labels, [], 23.36)
    total = sum(widths)
    assert total <= 23.36 + 0.01, f"总宽度 {total} 超过预算 23.36"


@given(
    label1=st.text(min_size=1, max_size=10),
    label2=st.text(min_size=1, max_size=10),
)
@settings(max_examples=20, deadline=None)
def test_pbt_proportion_preserved(label1, label2):
    """P2 不变式：权重大的列保持更宽"""
    w1 = compute_text_weight(label1)
    w2 = compute_text_weight(label2)

    widths = plan_inline_table_width([label1, label2], [], 23.36)

    if w1 > w2:
        assert widths[0] >= widths[1], f"权重 {w1} > {w2}，但宽度 {widths[0]} < {widths[1]}"
    elif w2 > w1:
        assert widths[1] >= widths[0], f"权重 {w2} > {w1}，但宽度 {widths[1]} < {widths[0]}"


# ---------------------------------------------------------------------------
# Phase 11：normal 表内容驱动规划 + CJK 扩展区字符权重
# ---------------------------------------------------------------------------


def _stub_from_dict(data: dict):
    """将 fixture JSON 中的字段字典转为类 FormField 的 SimpleNamespace 结构。

    兼容两种形态：运行态平铺 / designer 侧 `field_definition` 包装。
    `field_rendering.build_inline_column_demands` 读取的属性集合：
      - label_override
      - is_log_row
      - inline_mark
      - default_value
      - field_definition.{ field_type, label, codelist.options, options }
    """
    if data is None:
        return None
    fd_raw = data.get("field_definition")
    field_definition = None
    if fd_raw is not None:
        options = fd_raw.get("options")
        codelist = None
        if options:
            codelist = SimpleNamespace(
                options=[
                    SimpleNamespace(
                        decode=o.get("decode"),
                        trailing_underscore=1 if o.get("trailingUnderscore") else 0,
                        order_index=o.get("order_index", 0),
                        id=idx,
                    )
                    for idx, o in enumerate(options)
                ]
            )
        field_definition = SimpleNamespace(
            field_type=fd_raw.get("field_type"),
            label=fd_raw.get("label"),
            codelist=codelist,
            options=None,  # 后端走 codelist.options 路径
            date_format=fd_raw.get("date_format"),
            integer_digits=fd_raw.get("integer_digits"),
            decimal_digits=fd_raw.get("decimal_digits"),
        )
    return SimpleNamespace(
        label_override=data.get("label_override"),
        is_log_row=data.get("is_log_row", 0),
        inline_mark=data.get("inline_mark", 0),
        default_value=data.get("default_value"),
        field_definition=field_definition,
    )


class TestBuildNormalTableDemands:
    """Phase 11 task 11.1-11.3：build_normal_table_demands 语义契约。"""

    def test_returns_two_demands(self):
        """11.1 任意非空输入返回恰好 2 个 ColumnDemand。"""
        fields = [_stub_from_dict({
            "field_definition": {"field_type": "文本", "label": "姓名"},
        })]
        demands = build_normal_table_demands(fields)
        assert len(demands) == 2
        assert demands[0].column_key == "label"
        assert demands[1].column_key == "control"

    def test_excludes_structural_fields(self):
        """11.2 标签 / 日志行 / is_log_row 字段不参与聚合。"""
        # 仅结构字段 → 退回最小保护
        only_structural = [
            _stub_from_dict({"field_definition": {"field_type": "标签", "label": "章节"}}),
            _stub_from_dict({
                "is_log_row": 1,
                "field_definition": {"field_type": "文本", "label": "log"},
            }),
            _stub_from_dict({"field_definition": {"field_type": "日志行", "label": "日志"}}),
        ]
        demands = build_normal_table_demands(only_structural)
        min_w = WEIGHT_ASCII * 4
        assert demands[0].intrinsic_weight == min_w
        assert demands[1].intrinsic_weight == min_w

        # 混合：结构字段被剔除，只有非结构字段贡献权重
        mixed = only_structural + [_stub_from_dict({
            "field_definition": {"field_type": "文本", "label": "这是一个较长的中文标签"},
        })]
        demands_mixed = build_normal_table_demands(mixed)
        assert demands_mixed[0].intrinsic_weight > min_w

    def test_applies_min_protection(self):
        """11.3 空 label / 极短 label → 权重不低于 WEIGHT_ASCII * 4。"""
        empty_fields = [_stub_from_dict({
            "field_definition": {"field_type": "文本", "label": ""},
        })]
        demands = build_normal_table_demands(empty_fields)
        assert demands[0].intrinsic_weight >= WEIGHT_ASCII * 4
        assert demands[1].intrinsic_weight >= WEIGHT_ASCII * 4


class TestPlanUnifiedTableWidthFixtures:
    """跨栈 fixture 中 unified 用例的后端归一化校验。"""

    def test_matches_frontend_unified_fixtures(self):
        fixture_path = Path(__file__).parent / "fixtures" / "planner_cases.json"
        data = json.loads(fixture_path.read_text(encoding="utf-8"))
        unified_cases = [c for c in data["cases"] if c["kind"] == "unified"]
        assert len(unified_cases) >= 3, "至少需要 3 个 unified fixture 用例"

        for case in unified_cases:
            segments = []
            block_demands = []
            regular_field_demands = []
            for segment in case["segments"]:
                fields = [_stub_from_dict(d) for d in segment.get("fields", [])]
                if segment["type"] == "inline_block":
                    headers = [f.label_override or f.field_definition.label or "" for f in fields]
                    segments.append(("inline_block", headers, [[None for _ in fields]]))
                    block_demands.append(build_inline_column_demands(fields))
                elif segment["type"] == "regular_field" and fields:
                    field = fields[0]
                    label = field.label_override or field.field_definition.label or ""
                    regular_field_demands.append({
                        "label_weight": compute_text_weight(label),
                        "control_weight": build_field_control_weight(field),
                    })

            widths = plan_unified_table_width(
                segments,
                available_cm=23.36,
                column_count=case["columnCount"],
                block_demands=block_demands,
                regular_field_demands=regular_field_demands,
            )
            total = sum(widths) or 1.0
            actual = [w / total for w in widths]
            for i, (a, e) in enumerate(zip(actual, case["expected_fractions"])):
                assert abs(a - e) < 1e-6, f"{case['name']} col{i}: backend={a} frontend={e}"


class TestPlanNormalTableWidth:
    """Phase 11 task 11.4-11.5：plan_normal_table_width 预算与跨栈一致性。"""

    def test_sum_equals_available_cm(self):
        """11.4 返回宽度之和 = available_cm（误差 ≤ 1e-6）。"""
        fields = [
            _stub_from_dict({"field_definition": {"field_type": "文本", "label": "姓名"}}),
            _stub_from_dict({"field_definition": {"field_type": "数值", "label": "年龄"}}),
        ]
        for cm in (14.66, 20.0, 5.0):
            widths = plan_normal_table_width(fields, available_cm=cm)
            assert abs(sum(widths) - cm) < 1e-6, f"sum(widths)={sum(widths)} cm={cm}"

    def test_empty_fields_equal_distribution(self):
        """11.4 (附加) 空输入 → [available_cm/2, available_cm/2]。"""
        widths = plan_normal_table_width([], available_cm=14.66)
        assert abs(widths[0] - 7.33) < 1e-9
        assert abs(widths[1] - 7.33) < 1e-9

    def test_matches_frontend_fractions(self):
        """11.5 跨栈 fixture 验证：后端归一化结果与前端一致（≤ 1e-6）。"""
        fixture_path = (
            Path(__file__).parent / "fixtures" / "planner_cases.json"
        )
        data = json.loads(fixture_path.read_text(encoding="utf-8"))
        normal_cases = [c for c in data["cases"] if c["kind"] == "normal"]
        assert len(normal_cases) >= 2, "至少需要 2 个 normal fixture 用例"

        for case in normal_cases:
            fields = [_stub_from_dict(d) for d in case["fields"]]
            expected = case["expected_fractions"]
            widths = plan_normal_table_width(fields, available_cm=14.66)
            # 归一化后比较
            total = sum(widths) or 1.0
            actual = [w / total for w in widths]
            for i, (a, e) in enumerate(zip(actual, expected)):
                assert abs(a - e) < 1e-6, (
                    f"{case['name']} col{i}: backend={a} frontend={e}"
                )


class TestCjkExtensionRanges:
    """Phase 11 task 11.6-11.8：CJK 扩展区码点权重对齐。"""

    def test_compute_char_weight_extension_b(self):
        """11.6 扩展 B 区字符（𠮷 U+20BB7）权重 = 2。"""
        assert compute_char_weight("𠮷") == WEIGHT_CHINESE
        # 另取扩展 B 起点和终点
        assert compute_char_weight(chr(0x20000)) == WEIGHT_CHINESE
        assert compute_char_weight(chr(0x2A6DF)) == WEIGHT_CHINESE

    @pytest.mark.parametrize(
        "code_point",
        [
            0x2A700, 0x2A800, 0x2A900, 0x2AA00, 0x2AB00,  # 扩展 C
            0x2B740, 0x2B800,                              # 扩展 D
            0x2B820, 0x2C000, 0x2C500, 0x2CEAF,            # 扩展 E
            0x2CEB0, 0x2D000, 0x2E000, 0x2EBEF,            # 扩展 F
            0x2EBF0, 0x2ED00, 0x2EE5F,                     # 扩展 I
            0x30000, 0x31000, 0x3134F,                     # 扩展 G
        ],
    )
    def test_compute_char_weight_extensions_c_through_h(self, code_point):
        """11.7 扩展 C / D / E / F / G / I 区间抽样权重 = 2。"""
        assert compute_char_weight(chr(code_point)) == WEIGHT_CHINESE, (
            f"U+{code_point:05X} 应为 CJK 权重 2"
        )

    @pytest.mark.parametrize(
        "code_point",
        [0x2F800, 0x2F900, 0x2FA00, 0x2FA1F, 0xF900, 0xFA00, 0xFAFF],
    )
    def test_compute_char_weight_compatibility_supplement(self, code_point):
        """11.8 兼容汉字 + 兼容补充权重 = 2。"""
        assert compute_char_weight(chr(code_point)) == WEIGHT_CHINESE
