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
        <div class="panel-header">导入效果</div>
        <div class="panel-body panel-body-scroll">
          <SimulatedCRFForm
            :fields="formData.fields || []"
            view-mode="direct"
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
import { ref } from 'vue'
import DocxScreenshotPanel from './DocxScreenshotPanel.vue'
import SimulatedCRFForm from './SimulatedCRFForm.vue'

// TODO: 临时屏蔽左侧预览面板，待后续完善其他部分后再恢复
// 恢复方法：将 ENABLE_LEFT_PREVIEW 改为 true 即可
const ENABLE_LEFT_PREVIEW = false

defineProps({
  modelValue: { type: Boolean, default: false },
  formData: { type: Object, default: null },
  tempId: { type: String, default: '' },
  projectId: { type: Number, default: 0 },
  allFormNames: { type: Array, default: () => [] },
  allFormsData: { type: Array, default: () => [] },  // 所有表单的完整数据
})

defineEmits(['update:modelValue'])

const dialogWidth = 'min(92vw, 1200px)'
const highlightedField = ref(null)

// 处理字段点击
function handleFieldClick(field) {
  highlightedField.value = field
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

/* 底部布局 */
.compare-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
}
</style>