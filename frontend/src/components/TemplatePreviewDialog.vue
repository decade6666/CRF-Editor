<template>
  <el-dialog
    v-model="visible"
    :title="`预览导入效果 - ${formName}`"
    width="95vw"
    class="import-preview-dialog"
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
            <div
              :class="[
                'word-page',
                'form-designer-word-page',
                'designer-scaled-word-page',
                { landscape: previewLandscapeMode },
              ]"
            >
              <template v-for="(gv, gi) in previewRenderGroupsView" :key="gi">
                <!-- unified 类型：统一表格布局 -->
                <table v-if="gv.type === 'unified'" class="unified-table">
                  <colgroup>
                    <col v-for="(f, i) in getColumnFractions(gv, gi)" :key="i" :style="{ width: (f * 100) + '%' }" />
                  </colgroup>
                  <template v-for="seg in gv.segments" :key="seg.fields[0]?.id">
                    <tr v-if="seg.type === 'regular_field'">
                      <td class="unified-label" :colspan="gv.labelValueSpans.labelSpan" :style="getFormFieldLabelPreviewStyle(seg.fields[0])">{{ getFormFieldDisplayLabel(seg.fields[0]) }}</td>
                      <td class="unified-value" :colspan="gv.labelValueSpans.valueSpan" :style="getFormFieldPreviewStyle(seg.fields[0])" v-html="renderCellHtml(seg.fields[0])"></td>
                    </tr>
                    <tr v-else-if="seg.type === 'full_row'">
                      <td :class="{ 'wp-structure-label--multiline': seg.fields[0].field_definition?.field_type === '标签' }" :colspan="gv.colCount" :style="getFormFieldLabelPreviewStyle(seg.fields[0], { structure: true })">{{ getFormFieldDisplayLabel(seg.fields[0]) || '以下为log行' }}</td>
                    </tr>
                    <template v-else-if="seg.type === 'inline_block'">
                      <tr><td v-for="(ff, idx) in seg.fields" :key="ff.id" class="wp-inline-header" :colspan="seg.mergeSpans[idx]" :style="getFormFieldLabelPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                      <tr v-for="(row, ri) in seg.inlineRows" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :colspan="seg.mergeSpans[ci]" :style="getFormFieldPreviewStyle(seg.fields[ci])" v-html="cell"></td></tr>
                    </template>
                  </template>
                </table>
                <!-- normal 类型：普通表格布局 -->
                <table v-else-if="gv.type === 'normal'" class="normal-table">
                  <colgroup>
                    <col v-for="(f, i) in getColumnFractions(gv, gi)" :key="i" :style="{ width: (f * 100) + '%' }" />
                  </colgroup>
                  <template v-for="ff in gv.fields" :key="ff.id">
                    <tr v-if="ff.field_definition?.field_type === '标签'"><td class="wp-structure-label--multiline" colspan="2" :style="getFormFieldLabelPreviewStyle(ff, { structure: true })">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                    <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'"><td colspan="2" :style="getFormFieldLabelPreviewStyle(ff, { structure: true })">{{ getFormFieldDisplayLabel(ff) || '以下为log行' }}</td></tr>
                    <tr v-else><td class="wp-label" :style="getFormFieldLabelPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td><td class="wp-ctrl" :style="getFormFieldPreviewStyle(ff)" v-html="renderCellHtml(ff, normalFillChars(gv, gi), normalColumnCm(gv, gi))"></td></tr>
                  </template>
                </table>
                <!-- inline 类型：横向表格 -->
                <table v-else class="inline-table">
                  <colgroup>
                    <col v-for="(f, i) in getColumnFractions(gv, gi)" :key="i" :style="{ width: (f * 100) + '%' }" />
                  </colgroup>
                  <tr><td v-for="ff in gv.fields" :key="ff.id" class="wp-inline-header" :style="getFormFieldLabelPreviewStyle(ff)">{{ getFormFieldDisplayLabel(ff) }}</td></tr>
                  <tr v-for="(row, ri) in gv.inlineRows" :key="ri"><td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" :style="getFormFieldPreviewStyle(gv.fields[ci])" v-html="cell"></td></tr>
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
            role="button"
            tabindex="0"
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
  getFormFieldLabelPreviewStyle,
  normalizePreviewHexColor,
} from '../composables/formFieldPresentation'
import { buildPreviewGroupViewModels } from '../composables/formDesignerPreviewModel'
import {
  renderCtrlHtml,
  normalizeDefaultValue,
  isDefaultValueSupported,
  planInlineColumnFractions,
  planNormalColumnFractions,
  planUnifiedColumnFractions,
  toHtml,
  computeFillLineCharCount,
} from '../composables/useCRFRenderer'
import { readColumnWidthRatiosWithFallback } from '../composables/useColumnResize'
import { buildTableInstanceId } from '../composables/useRowResize'
import { resolveNormalTableAvailableCm, resolveInlineTableAvailableCm } from '../composables/visitPreviewLandscape'
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
// 模板表单纸张方向（来自 form-fields 接口）；用于解析 normal 表填写线可用宽度
const paperOrientation = ref('auto')

// Task 3.2: 过滤已选项（包含日志行、标签行）
const filteredFields = computed(() =>
  fields.value.filter(f => selectedIds.value.has(f.id))
)

// Task 3.3: 使用 FormDesignerTab 渲染分组逻辑
const previewRenderGroups = computed(() => buildFormDesignerRenderGroups(filteredFields.value))

// 预览视图模型：把模板内按单元格反复调用的纯函数提前算好（segments / inlineRows /
// mergeSpans / labelValueSpans），消除 inline 表 colspan 的 O(M²) 重建；输出逐元素等价。
const previewModelHelpers = {
  buildSegments: buildFormDesignerUnifiedSegments,
  getInlineRows,
  getInlineFillChars,
  getInlineColumnCms,
  computeMergeSpans,
  computeLabelValueSpans,
}
const previewRenderGroupsView = computed(() =>
  buildPreviewGroupViewModels(previewRenderGroups.value, previewModelHelpers),
)
const previewNeedsLandscape = computed(() =>
  previewRenderGroups.value.some(g => g.type === 'unified' || (g.type === 'inline' && g.fields.length > 4)),
)
const previewLandscapeMode = computed(() => {
  if (paperOrientation.value === 'landscape') return true
  if (paperOrientation.value === 'portrait') return false
  return previewNeedsLandscape.value
})

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
function getInlineRows(fields, fillCharsByCol = null, columnCmsByCol = null) {
  const cols = fields.map((ff, i) => {
    const fillChars = fillCharsByCol ? (fillCharsByCol[i] ?? null) : null
    const columnCm = columnCmsByCol ? (columnCmsByCol[i] ?? null) : null
    const defaultValue = ff.default_value
    if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type || ff.field_type, true)) {
      const lines = normalizeDefaultValue(defaultValue).split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false,
        fallback: renderCtrlHtml(ff, fillChars, columnCm),
      }
    }
    const ctrl = renderCtrlHtml(ff, fillChars, columnCm)
    return { lines: [ctrl], repeat: true, fallback: ctrl }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) => cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? col.fallback)))
}

// inline 整格文本填写线：每列按规划宽度自适应根数，与后端 _add_inline_table 共享公式。
function getInlineColumnCms(fields) {
  const fractions = planInlineColumnFractions(fields)
  const availableCm = resolveInlineTableAvailableCm(
    previewRenderGroups.value,
    { type: 'inline', fields },
    paperOrientation.value,
  )
  return fractions.map(f => f * availableCm)
}

function getInlineFillChars(fields) {
  return getInlineColumnCms(fields).map(columnCm => computeFillLineCharCount(columnCm))
}

// 计算预览表格的列宽比例：优先设计器保存值，否则回退内容驱动 planner 结果
function getColumnFractions(g, groupIndex) {
  if (g.type === 'unified') {
    const colCount = g.colCount
    const shared = readColumnWidthRatiosWithFallback(
      props.formId,
      buildTableInstanceId('unified', g.fields),
      colCount,
      `${groupIndex}-unified-${colCount}`,
    )
    if (shared) return shared
    const plannerFractions = planUnifiedColumnFractions(g.segments, colCount)
    return plannerFractions.length === colCount
      ? plannerFractions
      : Array.from({ length: colCount }, () => 1 / colCount)
  }
  if (g.type === 'normal') {
    const shared = readColumnWidthRatiosWithFallback(
      props.formId,
      buildTableInstanceId('normal', g.fields),
      2,
      `${groupIndex}-normal-2`,
    )
    if (shared) return shared
    const plannerFractions = planNormalColumnFractions(g.fields)
    return plannerFractions.length === 2 ? plannerFractions : [0.5, 0.5]
  }
  const colCount = g.fields.length
  const shared = readColumnWidthRatiosWithFallback(
    props.formId,
    buildTableInstanceId('inline', g.fields),
    colCount,
    `${groupIndex}-inline-${colCount}`,
  )
  if (shared) return shared
  const plannerFractions = planInlineColumnFractions(g.fields)
  return plannerFractions.length === colCount
    ? plannerFractions
    : Array.from({ length: colCount }, () => 1 / colCount)
}

// Task 3.3: 单元格渲染
function renderCellHtml(ff, fillLineChars = null, columnCm = null) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const defaultValue = ff.default_value
  if (defaultValue && isDefaultValueSupported(ff.field_definition?.field_type, false)) {
    return toHtml(normalizeDefaultValue(defaultValue, false))
  }
  return renderCtrlHtml(ff, fillLineChars, columnCm)
}

// normal 表 control 列宽（cm）：使用模板表单真实纸张方向（form-fields 接口返回
// paper_orientation），可覆盖显式 landscape 及 mixed_landscape，与导出 _build_form_table
// 的宽度选择逐字一致。
function normalColumnCm(group, groupIndex) {
  if (group?.type !== 'normal') return null
  const controlFrac = getColumnFractions(group, groupIndex)?.[1]
  if (controlFrac == null) return null
  const availableCm = resolveNormalTableAvailableCm(previewRenderGroups.value, paperOrientation.value)
  return controlFrac * availableCm
}

function normalFillChars(group, groupIndex) {
  const columnCm = normalColumnCm(group, groupIndex)
  return columnCm == null ? null : computeFillLineCharCount(columnCm)
}

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.formId) {
    loadFields()
    selectedIds.value = new Set()
  }
}, { immediate: true })

async function loadFields() {
  loading.value = true
  errorMsg.value = ''
  fields.value = []
  try {
    const data = await api.get(
      `/api/projects/${props.projectId}/import-template/form-fields?form_id=${props.formId}`
    )
    fields.value = data.fields || []
    paperOrientation.value = data.paper_orientation || 'auto'
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
  const bgColor = normalizePreviewHexColor(field?.bg_color)
  const textColor = normalizePreviewHexColor(field?.text_color)
  const bg = bgColor ? `background-color:#${bgColor}20;` : ''
  const text = textColor ? `color:#${textColor};` : ''
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
  flex: 1;
  min-height: 0;
}

.preview-left {
  flex: none;
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
  overflow: auto;
  padding: 12px;
}

.preview-right {
  flex: 1;
  min-width: 200px;
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

/* 复用全局 .word-page 预览契约，并保持与设计器一致的 A4 / 横向 A4 宽度 */
.preview-left .designer-scaled-word-page {
  width: 21cm;
  max-width: none;
  margin: 0;
  padding: 0;
  box-shadow: none;
  box-sizing: border-box;
}

.preview-left .designer-scaled-word-page.landscape {
  width: 29.7cm;
}
</style>

<!-- 弹窗 append-to-body 后被 teleport 到 <body>，scoped :deep 的祖先选择器无法命中，
     故用非 scoped 块以唯一类名锁定，让弹窗占满窗口 95% 高度且 body 区域内部滚动。 -->
<style>
.import-preview-dialog {
  height: 95vh;
  max-height: 95vh;
  margin-top: 2.5vh !important;
  display: flex;
  flex-direction: column;
}

.import-preview-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
