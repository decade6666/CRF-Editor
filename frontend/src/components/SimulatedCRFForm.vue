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
            <td colspan="2" class="crf-log-row">
              <span class="crf-label">{{ field.label }}</span>
            </td>
          </template>

          <!-- 标签型：跨列显示 -->
          <template v-else-if="field.field_type === '标签'">
            <td colspan="2" class="crf-label-only" :style="getCellStyle(field)">
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
            <td class="crf-label-cell" :style="getCellStyle(field)">
              <span class="crf-label">{{ field.label }}</span>
              <el-tag
                v-if="field._aiModified && viewMode === 'ai'"
                size="small"
                type="warning"
                class="ai-badge"
              >AI</el-tag>
            </td>
            <td class="crf-control-cell" :style="getCellStyle(field)" v-html="renderCtrlHtml(field)"></td>
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
} from '../composables/useCRFRenderer'
// Task 3.3: 复用 formFieldPresentation.js 设计器预览语义
import { getFormFieldPreviewStyle, getFormFieldDisplayLabel } from '../composables/formFieldPresentation'

const props = defineProps({
  fields: { type: Array, default: () => [] },
  aiSuggestions: { type: Array, default: () => [] },
  viewMode: { type: String, default: 'direct' }, // 'direct' | 'ai'
  // 可选：宿主组件传入 formId 后，优先读取设计器保存的列宽
  formId: { type: [Number, String], default: null },
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

// 只读读取设计器持久化列宽；格式不合法或与当前列数不匹配时返回 null
function readSharedRatios(formId, tableKind, expectedLength) {
  if (formId == null || tableKind == null) return null
  try {
    const raw = localStorage.getItem(`crf:designer:col-widths:${formId}:${tableKind}`)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length !== expectedLength) return null
    if (!arr.every(r => Number.isFinite(r) && r >= 0.1 && r <= 0.9)) return null
    const sum = arr.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 1) > 1e-3) return null
    return arr
  } catch {
    return null
  }
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

// 计算 normal 表两列比例：优先设计器保存值，否则回退 planner
// 注意：designer 使用 `${groupIndex}-normal-2` 作为 tableKind，但 SimulatedCRFForm 无分组概念，
// 仅尝试 `0-normal-2`（多数表单第一组即 normal 表）；命中失败即自然降级 planner。
const columnFractions = computed(() => {
  const shared = readSharedRatios(props.formId, '0-normal-2', 2)
  if (shared) return shared
  const fractions = planNormalColumnFractions(displayFields.value)
  return fractions.length === 2 ? fractions : [0.5, 0.5]
})
</script>

<style scoped>
.crf-form-wrap {
  width: 100%;
  font-family: 'SimSun', 'STSong', 'Source Han Serif CN', serif;
  font-size: 13px;
  line-height: 1.6;
  color: #1a1a1a;
}

/* 主表格：模拟 CRF 纸质表格；table-layout:fixed 让 <colgroup> 宽度生效 */
.crf-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  border: 1px solid #d4d4d4;
}

.crf-table tr {
  border-bottom: 1px solid #d4d4d4;
}

/* 字段行可点击提示 */
.field-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.field-row:hover {
  background-color: #f0f9ff !important;
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
  background: #f5f5f5;
  text-align: center;
  font-style: italic;
  color: #666;
}

/* 标签列（宽度由 <colgroup> 决定，不再硬编码） */
.crf-label-cell {
  padding: 6px 10px;
  border-right: 1px solid #d4d4d4;
  vertical-align: top;
  word-break: break-all;
  background: #fafafa;
}

/* 标签型字段（跨列） */
.crf-label-only {
  padding: 6px 10px;
  font-weight: bold;
  background: #fafafa;
}

.crf-label {
  font-weight: 600;
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
  color: #909399;
  padding: 30px;
  font-size: 13px;
}
</style>
