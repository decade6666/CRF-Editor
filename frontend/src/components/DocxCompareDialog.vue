<template>
  <el-dialog
    :model-value="modelValue"
    :title="`预览 - ${formData?.name || ''}`"
    :width="dialogWidth"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('update:modelValue', false)"
  >
    <div v-if="formData" class="compare-container">
      <!-- 左侧：原始文档截图 -->
      <div class="compare-panel compare-left">
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
        <div class="panel-header">导入效果</div>
        <div class="panel-body panel-body-scroll">
          <div v-if="showAiReviewState" class="ai-review-card" :class="`ai-review-card--${aiReviewTone}`">
            <div class="ai-review-title">
              <el-icon v-if="isAiReviewActive" class="is-loading"><Loading /></el-icon>
              <span>AI 复核</span>
            </div>
            <p v-if="isAiReviewActive" class="ai-review-text">AI 正在复核当前文档，建议会自动补充到本表单。</p>
            <p v-else-if="props.aiReviewStatus === 'failed'" class="ai-review-text">
              {{ props.aiReviewError || 'AI复核不可用，不影响继续导入。' }}
            </p>
            <p v-else class="ai-review-text">AI 已返回 {{ suggestions.length }} 条建议，请在导入前确认。</p>
            <ul v-if="suggestions.length" class="ai-suggestion-list">
              <li v-for="item in suggestions" :key="`${item.index}-${item.suggested_type}`" class="ai-suggestion-item">
                <div class="ai-suggestion-head">
                  <span class="ai-suggestion-label">{{ getFieldLabel(item.index) }}</span>
                  <span class="ai-suggestion-type">{{ getFieldType(item.index) }} → {{ item.suggested_type }}</span>
                </div>
                <p class="ai-suggestion-reason">{{ item.reason || 'AI 建议调整字段类型。' }}</p>
              </li>
            </ul>
          </div>
          <SimulatedCRFForm
            :fields="formData.fields || []"
            view-mode="direct"
            :paper-orientation="formData.paper_orientation || 'auto'"
            @field-click="handleFieldClick"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="compare-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import DocxScreenshotPanel from './DocxScreenshotPanel.vue';
import SimulatedCRFForm from './SimulatedCRFForm.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  formData: { type: Object, default: null },
  tempId: { type: String, default: '' },
  projectId: { type: Number, default: 0 },
  allFormNames: { type: Array, default: () => [] },
  allFormsData: { type: Array, default: () => [] }, // 所有表单的完整数据
  aiReviewStatus: { type: String, default: 'idle' },
  aiReviewError: { type: String, default: '' },
});

defineEmits(['update:modelValue']);

const dialogWidth = 'min(92vw, 1200px)';
const highlightedField = ref(null);
const suggestions = computed(() => props.formData?.ai_suggestions || []);
const isAiReviewActive = computed(() => props.aiReviewStatus === 'pending' || props.aiReviewStatus === 'running');
const showAiReviewState = computed(() => isAiReviewActive.value || props.aiReviewStatus === 'failed' || suggestions.value.length > 0);
const aiReviewTone = computed(() => {
  if (isAiReviewActive.value) return 'loading';
  if (props.aiReviewStatus === 'failed') return 'failed';
  return 'done';
});

// 处理字段点击
function handleFieldClick(field) {
  highlightedField.value = field;
}

function getFieldLabel(index) {
  return props.formData?.fields?.[index]?.label || `字段 ${index + 1}`;
}

function getFieldType(index) {
  return props.formData?.fields?.[index]?.field_type || '未知';
}
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

.ai-review-card {
  margin: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--el-fill-color-light, #f5f7fa);
}

.ai-review-card--loading {
  border-color: var(--el-color-info-light-5, #b3d8ff);
}

.ai-review-card--failed {
  border-color: var(--el-color-warning-light-5, #f3d19e);
}

.ai-review-card--done {
  border-color: var(--el-color-success-light-5, #b3e19d);
}

.ai-review-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.ai-review-text {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.ai-suggestion-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-suggestion-item {
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.ai-suggestion-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.ai-suggestion-label {
  font-weight: 600;
}

.ai-suggestion-type {
  color: var(--color-text-secondary);
}

.ai-suggestion-reason {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 底部布局 */
.compare-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
}

@media (max-width: 960px) {
  .compare-container {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .compare-panel {
    min-height: 280px;
  }
}
</style>
