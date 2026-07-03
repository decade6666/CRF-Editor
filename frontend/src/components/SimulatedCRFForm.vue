<template>
  <div class="crf-form-wrap">
    <table class="crf-table">
      <colgroup>
        <col v-for="(f, i) in columnFractions" :key="i" :style="{ width: (f * 100) + '%' }" />
      </colgroup>
      <tbody>
        <tr
          v-for="field in displayFields"
          :key="field.id"
          :class="{ 'ai-row': field._aiModified && viewMode === 'ai', 'field-row': true }"
          :style="getRowStyle(field)"
          @click="$emit('field-click', field)"
        >
          <!-- 日志行：跨列显示 -->
          <template v-if="field.is_log_row || field.field_type === '日志行'">
            <td colspan="2" class="crf-log-row" :style="getLabelCellStyle(field)">
              <span class="crf-label">{{ field.label }}</span>
            </td>
          </template>

          <!-- 标签型：跨列显示 -->
          <template v-else-if="field.field_type === '标签'">
            <td colspan="2" class="crf-label-only" :style="getLabelCellStyle(field)">
              <span class="crf-label">{{ field.label }}</span>
              <el-tag
                v-if="field._aiModified && viewMode === 'ai'"
                size="small"
                type="warning"
                class="ai-badge"
              >AI</el-tag>
            </td>
          </template>

          <!-- 普通字段：左标签 + 右控件 -->
          <template v-else>
            <td class="crf-label-cell" :style="getLabelCellStyle(field)">
              <span class="crf-label">{{ field.label }}</span>
              <el-tag
                v-if="field._aiModified && viewMode === 'ai'"
                size="small"
                type="warning"
                class="ai-badge"
              >AI</el-tag>
            </td>
            <td class="crf-control-cell" :style="getCellStyle(field)" v-html="controlCellHtml(field)"></td>
          </template>
        </tr>

        <!-- 空字段兜底 -->
        <tr v-if="!displayFields.length">
          <td colspan="2" class="empty-hint">无字段数据</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  isDefaultValueSupported,
  normalizeDefaultValue,
  renderCtrlHtml,
  planNormalColumnFractions,
  computeFillLineCharCount,
} from '../composables/useCRFRenderer'
// Task 3.3: 复用 formFieldPresentation.js 设计器预览语义
import {
  getFormFieldLabelPreviewStyle,
  getFormFieldPreviewStyle,
  getFormFieldTextColorStyle,
  buildFormDesignerRenderGroups,
} from '../composables/formFieldPresentation'
import { resolveNormalTableAvailableCm } from '../composables/visitPreviewLandscape'
import { readColumnWidthRatiosWithFallback } from '../composables/useColumnResize'
import { buildTableInstanceId } from '../composables/useRowResize'

const props = defineProps({
  fields: { type: Array, default: () => [] },
  aiSuggestions: { type: Array, default: () => [] },
  viewMode: { type: String, default: 'direct' }, // 'direct' | 'ai'
  // 可选：宿主组件传入 formId 后，优先读取设计器保存的列宽
  formId: { type: [Number, String], default: null },
  // 表单纸张方向（'auto' | 'portrait' | 'landscape'）。normal 表填写线宽度经
  // resolveNormalTableAvailableCm 解析：显式 landscape 或 mixed_landscape（auto 下普通字段
  // + 连续 inline>4）→ 23.36，否则 14.66；与后端 _build_form_table 宽度选择一致。
  paperOrientation: { type: String, default: 'auto' },
  // 显式覆盖可用内容宽度（厘米）。为 null 时按 paperOrientation 解析；
  // 与后端 PORTRAIT/LANDSCAPE_CONTENT_WIDTH_CM（14.66 / 23.36）对齐。
  availableCm: { type: Number, default: null },
})

defineEmits(['field-click'])

// 构建 AI 建议映射 {fieldIndex: suggestion}
const aiSugMap = computed(() => {
  const map = {}
  for (const s of props.aiSuggestions || []) {
    map[s.index] = s
  }
  return map
})

// 当前展示的字段列表（根据 viewMode 决定是否应用 AI 建议）
function applyPreviewDefaultValue(field) {
  const inlineMark = Boolean(field.inline_mark)
  if (!field.default_value) return field
  if (!isDefaultValueSupported(field.field_type, inlineMark)) return field
  return {
    ...field,
    default_value: normalizeDefaultValue(field.default_value, !inlineMark),
    _previewDefaultValue: true,
  }
}

// Task 3.3: 使用 formFieldPresentation.js 的样式函数
function getRowStyle(field) {
  return getFormFieldPreviewStyle(field, '')
}

function getCellStyle(field) {
  return getFormFieldTextColorStyle(field)
}

// 标签单元格样式：加粗 + 字号 + 文字颜色（不含背景，沿用组件自有单元格底色）
function getLabelCellStyle(field) {
  return getFormFieldLabelPreviewStyle(field, { includeBackground: false })
}

const displayFields = computed(() => {
  if (!props.fields?.length) return []

  if (props.viewMode === 'ai') {
    return props.fields.map(f => {
      const sug = aiSugMap.value[f.index]
      const nextField = sug
        ? { ...f, field_type: sug.suggested_type, _aiModified: true }
        : { ...f, _aiModified: false }
      return applyPreviewDefaultValue(nextField)
    })
  }

  // direct 模式：原始字段
  return props.fields.map(f => applyPreviewDefaultValue({ ...f, _aiModified: false }))
})

// 可用内容宽度（cm）：显式 availableCm 优先；否则按整张表单 render groups + paperOrientation
// 解析（显式 landscape 或 mixed_landscape → 23.36），镜像后端 _build_form_table 宽度选择。
const resolvedAvailableCm = computed(() => {
  if (props.availableCm != null) return props.availableCm
  const groups = buildFormDesignerRenderGroups(displayFields.value)
  return resolveNormalTableAvailableCm(groups, props.paperOrientation)
})

// 填写线下划线根数按 control 列实际宽度自适应（不换行），与后端导出共享估算公式。
function controlCellHtml(field) {
  const controlFrac = columnFractions.value[1]
  const columnCm = controlFrac * resolvedAvailableCm.value
  const fillLineChars = computeFillLineCharCount(columnCm)
  return renderCtrlHtml(field, fillLineChars, columnCm)
}

// 计算 normal 表两列比例：优先读取设计器当前 field-id key，旧 group-index key 仅作兼容兜底。
const columnFractions = computed(() => {
  const shared = readColumnWidthRatiosWithFallback(
    props.formId,
    buildTableInstanceId('normal', displayFields.value),
    2,
    '0-normal-2',
  )
  if (shared) return shared
  const fractions = planNormalColumnFractions(displayFields.value)
  return fractions.length === 2 ? fractions : [0.5, 0.5]
})
</script>

<style scoped>
.crf-form-wrap {
  --crf-paper-bg: #fff;
  --crf-paper-text: #1a1a1a;
  --crf-paper-border: #d4d4d4;
  --crf-paper-hover: #f0f9ff;
  --crf-paper-structure-bg: #fafafa;
  --crf-paper-muted: #666;
  --crf-paper-empty: #909399;

  width: 100%;
  font-family: 'SimSun', 'STSong', 'Source Han Serif CN', serif;
  font-size: 13px;
  line-height: 1.6;
  color: var(--crf-paper-text);
  background: var(--crf-paper-bg);
}

/* 主表格：模拟 CRF 纸质表格；table-layout:fixed 让 <colgroup> 宽度生效 */
.crf-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  border: 1px solid var(--crf-paper-border);
}

.crf-table tr {
  border-bottom: 1px solid var(--crf-paper-border);
}

/* 字段行可点击提示 */
.field-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.field-row:hover {
  background-color: var(--crf-paper-hover) !important;
}

/* AI 修改行高亮 */
.ai-row {
  background-color: #fef9e7 !important;
}
.ai-row td {
  border-left: 3px solid #e6a23c;
}

/* 日志行（Task 3.2） */
.crf-log-row {
  padding: 8px 10px;
  background: var(--crf-paper-structure-bg);
  text-align: center;
  font-style: italic;
  color: var(--crf-paper-muted);
}

/* 标签列（宽度由 <colgroup> 决定，不再硬编码） */
.crf-label-cell {
  padding: 6px 10px;
  border-right: 1px solid var(--crf-paper-border);
  vertical-align: top;
  word-break: break-all;
  background: var(--crf-paper-structure-bg);
}

/* 标签型字段（跨列）；加粗由内联 label 样式驱动（label_bold） */
.crf-label-only {
  padding: 6px 10px;
  background: var(--crf-paper-structure-bg);
}

.ai-badge {
  margin-left: 6px;
  vertical-align: middle;
  font-size: 10px !important;
}

/* 控件列 */
.crf-control-cell {
  padding: 6px 10px;
  vertical-align: top;
  white-space: normal; /* v-html 输出含 <br>，改为 normal */
  word-break: break-word;
}

/* 空状态 */
.empty-hint {
  text-align: center;
  color: var(--crf-paper-empty);
  padding: 30px;
  font-size: 13px;
}
</style>
