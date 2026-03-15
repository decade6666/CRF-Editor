<template>
  <div class="crf-form-wrap">
    <table class="crf-table">
      <tbody>
        <tr
          v-for="field in displayFields"
          :key="field.index"
          :class="{ 'ai-row': field._aiModified && viewMode === 'ai', 'field-row': true }"
          @click="$emit('field-click', field)"
        >
          <!-- 标签型：跨列显示 -->
          <template v-if="field.field_type === '标签'">
            <td colspan="2" class="crf-label-only">
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
            <td class="crf-label-cell">
              <span class="crf-label">{{ field.label }}</span>
              <el-tag
                v-if="field._aiModified && viewMode === 'ai'"
                size="small"
                type="warning"
                class="ai-badge"
              >AI</el-tag>
            </td>
            <td class="crf-control-cell" v-html="renderCtrlHtml(field)"></td>
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
import { renderCtrlHtml } from '../composables/useCRFRenderer'

const props = defineProps({
  fields: { type: Array, default: () => [] },
  aiSuggestions: { type: Array, default: () => [] },
  viewMode: { type: String, default: 'direct' }, // 'direct' | 'ai'
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
const displayFields = computed(() => {
  if (!props.fields?.length) return []

  if (props.viewMode === 'ai') {
    return props.fields.map(f => {
      const sug = aiSugMap.value[f.index]
      if (sug) {
        return { ...f, field_type: sug.suggested_type, _aiModified: true }
      }
      return { ...f, _aiModified: false }
    })
  }

  // direct 模式：原始字段
  return props.fields.map(f => ({ ...f, _aiModified: false }))
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

/* 主表格：模拟 CRF 纸质表格 */
.crf-table {
  width: 100%;
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

/* 标签列 */
.crf-label-cell {
  width: 30%;
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
