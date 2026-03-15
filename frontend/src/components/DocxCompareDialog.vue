<template>
  <el-dialog
    v-model="visible"
    :title="`预览对比 - ${formData?.name || ''}`"
    :width="dialogWidth"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    append-to-body
    @close="$emit('update:modelValue', false)"
  >
    <div v-if="formData" class="compare-container">
      <!-- 左侧：原始文档截图 -->
      <!-- TODO: 临时屏蔽，待后续完善后恢复 -->
      <div v-if="ENABLE_LEFT_PREVIEW" class="compare-panel compare-left">
        <div class="panel-header">原始文档截图</div>
        <div class="panel-body panel-body-scroll">
          <DocxScreenshotPanel
            :temp-id="tempId"
            :project-id="projectId"
            :form-names="allFormNames"
            :current-form-name="formData.name"
            :highlighted-field="highlightedField"
            :all-forms-data="allFormsData"
          />
        </div>
      </div>

      <!-- 右侧：CRF 表单模拟 -->
      <div class="compare-panel compare-right">
        <div class="panel-header">
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="direct">直接导入效果</el-radio-button>
            <el-radio-button value="ai" :disabled="!hasAiSuggestions">AI建议导入效果</el-radio-button>
          </el-radio-group>
        </div>
        <div class="panel-body panel-body-scroll">
          <SimulatedCRFForm
            :fields="formData.fields || []"
            :ai-suggestions="formData.ai_suggestions || []"
            :view-mode="viewMode"
            @field-click="handleFieldClick"
          />

          <!-- AI 建议修改说明 -->
          <div v-if="viewMode === 'ai' && aiModifiedFields.length" class="ai-diff-summary">
            <div class="ai-diff-title">AI 修改说明（{{ aiModifiedFields.length }} 处）</div>
            <div v-for="m in aiModifiedFields" :key="m.index" class="ai-diff-item">
              <b>字段#{{ m.index }}</b> {{ m.label }}：
              <el-tag size="small" type="info">{{ m.originalType }}</el-tag>
              →
              <el-tag size="small" type="danger">{{ m.suggestedType }}</el-tag>
              <span v-if="m.reason" class="ai-diff-reason">{{ m.reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="compare-footer">
        <div class="compare-footer-left">
          <template v-if="hasAiSuggestions">
            <span style="margin-right:8px">该表单采纳AI建议：</span>
            <el-switch
              :model-value="applyAi"
              @update:model-value="$emit('update:applyAi', $event)"
              active-text="是"
              inactive-text="否"
              inline-prompt
            />
          </template>
          <span v-else style="color:var(--color-text-muted);font-size:12px">该表单无AI建议</span>
        </div>
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import DocxScreenshotPanel from './DocxScreenshotPanel.vue'
import SimulatedCRFForm from './SimulatedCRFForm.vue'

// TODO: 临时屏蔽左侧预览面板，待后续完善其他部分后再恢复
// 恢复方法：将 ENABLE_LEFT_PREVIEW 改为 true 即可
const ENABLE_LEFT_PREVIEW = false

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  formData: { type: Object, default: null },
  applyAi: { type: Boolean, default: false },
  tempId: { type: String, default: '' },
  projectId: { type: Number, default: 0 },
  allFormNames: { type: Array, default: () => [] },
  allFormsData: { type: Array, default: () => [] },  // 所有表单的完整数据
})

defineEmits(['update:modelValue', 'update:applyAi'])

const visible = computed({
  get: () => props.modelValue,
  set: () => {},
})

const viewMode = ref('direct')
const dialogWidth = 'min(92vw, 1200px)'
const highlightedField = ref(null)

// 处理字段点击
function handleFieldClick(field) {
  highlightedField.value = field
}

// 重置 viewMode
watch(() => props.modelValue, (v) => {
  if (v) viewMode.value = 'direct'
})

// AI 建议是否存在
const hasAiSuggestions = computed(() => {
  return props.formData?.ai_suggestions?.length > 0
})

// AI 修改的字段详情列表（用于底部说明区）
const aiModifiedFields = computed(() => {
  if (!props.formData?.fields || !props.formData?.ai_suggestions) return []
  return props.formData.ai_suggestions.map(s => {
    const field = props.formData.fields.find(f => f.index === s.index)
    return {
      index: s.index,
      label: field?.label || `字段${s.index}`,
      originalType: field?.field_type || '未知',
      suggestedType: s.suggested_type,
      reason: s.reason,
    }
  })
})
</script>

<style scoped>
.compare-container {
  display: flex;
  gap: 16px;
  height: 65vh;
  min-height: 400px;
}

.compare-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-width: 0;
  box-shadow: var(--shadow-sm);
}

.panel-header {
  padding: 10px 14px;
  background: var(--color-primary-subtle);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.panel-body {
  flex: 1;
  min-height: 0;
}

.panel-body-scroll {
  overflow-y: auto;
}

/* AI 建议修改说明区域 */
.ai-diff-summary {
  margin: 12px;
  padding: 12px;
  padding-left: var(--space-sm);
  background: var(--color-primary-subtle);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  border-left: 3px solid var(--color-primary);
}

.ai-diff-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-warning);
  margin-bottom: 8px;
}

.ai-diff-item {
  font-size: 12px;
  margin-bottom: 6px;
  line-height: 1.8;
}

.ai-diff-reason {
  color: var(--color-text-muted);
  margin-left: 6px;
}

/* 底部布局 */
.compare-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.compare-footer-left {
  display: flex;
  align-items: center;
  font-size: 13px;
}
</style>
