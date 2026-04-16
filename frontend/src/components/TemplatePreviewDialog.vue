<template>
  <el-dialog
    v-model="visible"
    :title="`预览导入效果 - ${formName}`"
    width="960px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    append-to-body
    @close="$emit('update:modelValue', false)"
  >
    <!-- 加载中状态 -->
    <div v-if="loading" style="text-align:center;padding:40px 0">
      <el-icon class="is-loading" size="24px"><Loading /></el-icon>
      <span style="margin-left:8px;color:var(--color-text-muted)">加载预览中...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="errorMsg" style="text-align:center;padding:40px 0;color:var(--color-danger)">
      {{ errorMsg }}
    </div>

    <!-- 左右分栏内容 -->
    <div v-else class="preview-split">
      <!-- 左侧：CRF 预览（Task 3.3: 使用 FormDesignerTab 渲染语义） -->
      <div class="preview-left">
        <div class="preview-left-hint">CRF 预览（实时反映勾选状态）</div>
        <div class="preview-left-scroll">
          <template v-if="filteredFields.length">
            <div class="designer-preview-wrap">
              <template v-for="(g, gi) in previewRenderGroups" :key="gi">
                <!-- unified 类型：统一表格布局 -->
                <table v-if="g.type === 'unified'" class="unified-table">
                  <template v-for="seg in buildFormDesignerUnifiedSegments(g.fields)" :key="seg.fields[0]?.id">
                    <tr v-if="seg.type === 'regular_field'">
                      <td class="unified-label" :colspan="computeLabelValueSpans(g.colCount).labelSpan" :style="getFormFieldPreviewStyle(seg.fields[0])">{{ getFormFieldDisplayLabel(seg.fields[0]) }}</td>
                      <td class="unified-value" :colspan="computeLabelValueSpans(g.colCount).valueSpan" :style="getFormFieldPreviewStyle(seg.fields[0])" v-html="renderCellHtml(seg.fields[0])"></td>
                    </tr>
                    <tr v-else-if="seg.type === 'full_row'">
                      <td :colspan="g.colCount" :style="'font-weight:bold;' + getFormFieldPreviewStyle(seg.fields[0], 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}</td>
                    </tr>
                    <template v-else-if="seg.type === 'inline_block'">
                      <tr><td v-for="(ff, idx) in seg.fields" :key="ff.id" class="wp-inline-header" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[idx]" :style="getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                      <tr v-for="(row, ri) in getInlineRows(seg.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :colspan="computeMergeSpans(g.colCount, seg.fields.length)[ci]" :style="getFormFieldPreviewStyle(seg.fields[ci])" v-html="cell"></td></tr>
                    </template>
                  </template>
                </table>
                <!-- normal 类型：普通表格布局 -->
                <table v-else-if="g.type === 'normal'" class="normal-table">
                  <template v-for="ff in g.fields" :key="ff.id">
                    <tr v-if="ff.field_definition?.field_type === '标签'"><td colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                    <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"><td colspan="2" :style="'font-weight:bold;' + getFormFieldPreviewStyle(ff, 'background:var(--preview-structure-bg);')">{{ getFormFieldDisplayLabel(ff) || '以下为log行' }}</td></tr>
                    <tr v-else><td class="wp-label" :style="getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td><td class="wp-ctrl" :style="getFormFieldPreviewStyle(ff)" v-html="renderCellHtml(ff)"></td></tr>
                  </template>
                </table>
                <!-- inline 类型：横向表格 -->
                <table v-else class="inline-table">
                  <tr><td v-for="ff in g.fields" :key="ff.id" class="wp-inline-header" :style="getFormFieldPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                  <tr v-for="(row, ri) in getInlineRows(g.fields)" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :style="getFormFieldPreviewStyle(g.fields[ci])" v-html="cell"></td></tr>
                </table>
              </template>
            </div>
          </template>
          <div v-else style="text-align:center;padding:40px 0;color:var(--color-text-muted)">未选择任何可导入项</div>
        </div>
      </div>

      <!-- 右侧：可导入项勾选列表（Task 3.2: 包含标签行、日志行） -->
      <div class="preview-right">
        <div class="preview-right-header">
          <span style="font-size:13px;font-weight:bold">可导入项</span>
          <el-button size="small" @click="toggleAll">
            {{ selectedIds.size === fields.length ? '取消全选' : '全选' }}
          </el-button>
        </div>
        <div class="preview-right-scroll">
          <div
            v-for="f in fields"
            :key="f.id"
            class="selection-item"
            :style="getItemStyle(f)"
            @click="toggleSelect(f.id)"
          >
            <el-checkbox :model-value="selectedIds.has(f.id)" @click.stop />
            <span class="selection-label">{{ f.label }}</span>
            <el-tag size="small" :type="getFieldTagType(f.field_type)">{{ getFieldTagText(f) }}</el-tag>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div style="font-size:12px;color:var(--color-text-muted)">
          已选 {{ selectedIds.size }} / {{ fields.length }} 个可导入项
        </div>
        <div>
          <el-button @click="$emit('update:modelValue', false)">取消</el-button>
          <el-button type="primary" :disabled="!selectedIds.size" @click="handleImport" :loading="importing">
            导入选中项
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
} from '../composables/formFieldPresentation'
import { renderCtrlHtml, normalizeDefaultValue, isDefaultValueSupported, planInlineColumnFractions, toHtml } from '../composables/useCRFRenderer'
import { api } from '../composables/useApi'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: Number, required: true },
  formId: { type: Number, default: null },
  formName: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'imported'])

const visible = ref(props.modelValue)
const loading = ref(false)
const importing = ref(false)
const errorMsg = ref('')
const fields = ref([])
const selectedIds = ref(new Set())

// Task 3.2: 过滤已选项（包含日志行、标签行）
const filteredFields = computed(() =>
  fields.value.filter(f => selectedIds.value.has(f.id))
)

// Task 3.3: 使用 FormDesignerTab 渲染分组逻辑
const previewRenderGroups = computed(() => buildFormDesignerRenderGroups(filteredFields.value))

// Task 3.3: 辅助函数 - 计算 colspan
function computeMergeSpans(N, M) {
  if (M <= 0 || M > N) return Array(N).fill(1)
  const base = Math.floor(N / M), extra = N % M
  return Array.from({ length: M }, (_, i) => base + (i < extra ? 1 : 0))
}

function computeLabelValueSpans(N) {
  const labelSpan = Math.max(1, Math.min(N - 1, Math.round(N * 0.4)))
  return { labelSpan, valueSpan: N - labelSpan }
}

// Task 3.3: 内联块多行渲染
function getInlineRows(fields) {
  const cols = fields.map(ff => {
    const defaultValue = ff.default_value
    if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type || ff.field_type, true)) {
      const lines = normalizeDefaultValue(defaultValue, true).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return { lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), repeat: false }
    }
    const ctrl = renderCtrlHtml(ff).replace(/_{8,}/, '______')
    return { lines: [ctrl], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) => cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? '')))
}

// Task 3.3: 单元格渲染
function renderCellHtml(ff) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const defaultValue = ff.default_value
  if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type, false)) {
    return toHtml(normalizeDefaultValue(defaultValue, false))
  }
  return renderCtrlHtml(ff)
}

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.formId) {
    loadFields()
    selectedIds.value = new Set()
  }
})

async function loadFields() {
  loading.value = true
  errorMsg.value = ''
  fields.value = []
  try {
    const data = await api.get(
      `/api/projects/${props.projectId}/import-template/form-fields?form_id=${props.formId}`
    )
    fields.value = data.fields || []
    if (!fields.value.length) {
      errorMsg.value = '该表单暂无可导入项'
    } else {
      selectedIds.value = new Set(fields.value.map(f => f.id))
    }
  } catch (e) {
    errorMsg.value = '加载失败：' + e.message
  } finally {
    loading.value = false
  }
}

function toggleSelect(id) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function toggleAll() {
  if (selectedIds.value.size === fields.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(fields.value.map(f => f.id))
  }
}

// Task 3.2: 获取字段项样式（背景色 + 文字色）
function getItemStyle(field) {
  const bg = field.bg_color ? `background-color:#${field.bg_color}20;` : ''
  const text = field.text_color ? `color:#${field.text_color};` : ''
  return bg || text ? `${bg}${text}` : null
}

// Task 3.2: 字段类型标签样式
function getFieldTagType(fieldType) {
  if (fieldType === '标签') return 'warning'
  if (fieldType === '日志行') return 'info'
  return 'default'
}

// Task 3.2: 字段类型标签文字（日志行显示特殊标记）
function getFieldTagText(field) {
  if (field.is_log_row) return '日志行'
  return field.field_type
}

async function handleImport() {
  importing.value = true
  try {
    // 从第一个有 field_definition 的字段获取 source_project_id
    const firstFieldWithDef = fields.value.find(f => f.field_definition)
    const sourceProjectId = firstFieldWithDef?.project_id || fields.value[0]?.project_id

    const payload = {
      source_project_id: sourceProjectId,
      form_ids: [props.formId]
    }

    // 部分选中时传 field_ids
    if (selectedIds.value.size < fields.value.length) {
      payload.field_ids = Array.from(selectedIds.value)
    }

    const data = await api.post(
      `/api/projects/${props.projectId}/import-template/execute`,
      payload
    )
    ElMessage.success('导入成功')
    emit('imported', data)
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error('导入失败: ' + e.message)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.preview-split {
  display: flex;
  gap: 16px;
  max-height: 65vh;
  min-height: 300px;
}

.preview-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.preview-left-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.preview-left-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.preview-right {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.preview-right-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.preview-right-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.selection-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  margin: 4px;
}

.selection-item:hover {
  background: var(--color-bg-hover);
}

.selection-label {
  flex: 1;
  font-size: 14px;
}

/* Task 3.3: 设计器预览样式（与 FormDesignerTab 保持一致） */
.designer-preview-wrap {
  width: 100%;
}

.designer-preview-wrap table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border);
  margin-bottom: 8px;
}

.designer-preview-wrap td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
  word-break: break-word;
}

.wp-label {
  width: 30%;
  border-right: 1px solid var(--color-border);
  font-weight: 600;
}

.wp-ctrl {
  background: var(--color-bg-card);
}

.wp-inline-header {
  background: var(--preview-structure-bg);
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

.unified-label {
  border-right: 1px solid var(--color-border);
  font-weight: 600;
}

.unified-value {
  background: var(--color-bg-card);
}

.unified-table td,
.normal-table td {
  border-right: 1px solid var(--color-border);
}

.unified-table td:last-child,
.normal-table td:last-child {
  border-right: none;
}
</style>
