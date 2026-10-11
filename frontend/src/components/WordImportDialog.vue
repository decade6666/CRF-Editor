<script setup>
import { defineAsyncComponent, inject, ref, toRef } from 'vue';
import { Loading, UploadFilled } from '@element-plus/icons-vue';
import { apiUrl, getAuthHeaders } from '../composables/useApi';
import { useWordImport } from '../composables/useWordImport';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  projectId: { type: Number, default: null },
});

const emit = defineEmits(['update:modelValue', 'open-designer']);

const DocxCompareDialog = defineAsyncComponent(() => import('./DocxCompareDialog.vue'));

const {
  importWordStep,
  importWordLoading,
  importedFormsPreview,
  selectedFormsToImport,
  tempDocxId,
  importWordErrorMessage,
  importWordAiReviewStatus,
  importWordAiReviewError,
  showDocxCompare,
  compareFormData,
  importedResults,
  hasAnyAiSuggestions,
  allAiSuggestionsAccepted,
  allAiSuggestionsIndeterminate,
  compareFormAcceptedSuggestions,
  toggleAiSuggestionAcceptance,
  toggleAiSuggestionsForForm,
  toggleAiSuggestionsForAll,
  clearAllAiSuggestions,
  goBackToImportWordStep1,
  beforeDocxUpload,
  handleDocxUploadSuccess,
  handleDocxUploadError,
  toggleSelectAllImportWordForms,
  executeImportWord,
  openDocxCompare,
} = useWordImport({
  projectId: toRef(props, 'projectId'),
  visible: toRef(props, 'modelValue'),
  refreshKey: inject('refreshKey', ref(0)),
});
</script>

<template>
  <!-- 导入Word弹窗 -->
  <el-dialog
    :model-value="modelValue"
    title="导入Word"
    width="620px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="importWordLoading" style="text-align: center; padding: 30px 0">
      <el-icon class="is-loading" size="24px"><Loading /></el-icon> 加载中...
    </div>
    <template v-else>
      <div v-if="importWordStep === 1">
        <el-upload
          drag
          :action="apiUrl('/api/projects/' + projectId + '/import-docx/preview')"
          :headers="getAuthHeaders()"
          :show-file-list="false"
          accept=".docx"
          :on-success="handleDocxUploadSuccess"
          :on-error="handleDocxUploadError"
          :before-upload="beforeDocxUpload"
          style="text-align: center; padding: 20px 0"
        >
          <el-icon class="el-icon--upload" size="67px"><UploadFilled /></el-icon>
          <div class="el-upload__text">将文件拖拽至此区域 或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">只支持 .docx 文件</div>
          </template>
        </el-upload>
        <el-alert
          v-if="importWordErrorMessage"
          :title="importWordErrorMessage"
          type="error"
          show-icon
          style="margin-top: 10px"
        />
      </div>
      <div v-if="importWordStep === 2">
        <el-alert
          v-if="importWordAiReviewStatus === 'pending' || importWordAiReviewStatus === 'running'"
          type="info"
          show-icon
          :closable="false"
          title="AI 复核进行中，建议会自动补充到表单预览，不影响继续导入。"
          style="margin-bottom: 12px"
        />
        <el-alert
          v-else-if="importWordAiReviewStatus === 'failed'"
          type="warning"
          show-icon
          :closable="false"
          :title="importWordAiReviewError || 'AI复核不可用，不影响继续导入。'"
          style="margin-bottom: 12px"
        />
        <div class="form-select-header">
          <div class="form-select-meta">
            <p class="form-select-prompt">请勾选要导入的表单：</p>
            <div class="docx-ai-global-actions">
              <span class="docx-ai-global-label">全部表单：</span>
              <el-checkbox
                :model-value="allAiSuggestionsAccepted"
                :indeterminate="allAiSuggestionsIndeterminate"
                :disabled="!hasAnyAiSuggestions"
                @change="toggleAiSuggestionsForAll"
              >
                全接受
              </el-checkbox>
              <el-button
                link
                size="small"
                :disabled="!allAiSuggestionsAccepted && !allAiSuggestionsIndeterminate"
                @click="clearAllAiSuggestions"
              >
                全取消
              </el-button>
            </div>
          </div>
          <el-button
            size="small"
            :disabled="importedFormsPreview.length === 0"
            aria-controls="import-word-forms-list"
            @click="toggleSelectAllImportWordForms"
          >
            {{
              selectedFormsToImport.length === importedFormsPreview.length && importedFormsPreview.length > 0
                ? '取消全选'
                : '全选'
            }}
          </el-button>
        </div>
        <el-checkbox-group
          id="import-word-forms-list"
          v-model="selectedFormsToImport"
          style="display: flex; flex-direction: column; gap: 8px"
        >
          <el-checkbox
            v-for="f in importedFormsPreview"
            :key="f.index"
            :value="f.index"
            border
            class="docx-form-checkbox"
          >
            <div class="docx-form-item">
              <el-tooltip
                :content="f.name + ' (' + f.field_count + '个字段)'"
                placement="top"
                :disabled="f.name.length <= 20"
              >
                <span class="docx-form-name">{{ f.name }} ({{ f.field_count }}个字段)</span>
              </el-tooltip>
              <span class="docx-form-actions">
                <el-tag v-if="Array.isArray(f.ai_suggestions) && f.ai_suggestions.length" size="small" type="warning">
                  AI建议 {{ f.ai_suggestions.length }} 条
                </el-tag>
                <el-tag
                  v-else-if="importWordAiReviewStatus === 'pending' || importWordAiReviewStatus === 'running'"
                  size="small"
                  type="info"
                >
                  <el-icon class="is-loading" style="margin-right: 4px"><Loading /></el-icon>
                  AI复核中
                </el-tag>
                <el-tag v-else-if="importWordAiReviewStatus === 'failed'" size="small" type="info">AI不可用</el-tag>
                <el-button size="small" link type="primary" @click="openDocxCompare(f)">预览</el-button>
              </span>
            </div>
          </el-checkbox>
        </el-checkbox-group>
        <div
          v-if="importedFormsPreview.length === 0"
          style="color: var(--color-text-muted); text-align: center; padding: 20px 0"
        >
          Word文档中没有发现表单
        </div>
        <el-alert
          v-if="importWordErrorMessage"
          :title="importWordErrorMessage"
          type="error"
          show-icon
          style="margin-top: 10px"
        />
      </div>
      <div v-if="importWordStep === 3">
        <el-alert
          type="success"
          show-icon
          :closable="false"
          :title="`导入成功，共 ${importedResults.length} 个表单`"
          style="margin-bottom: 12px"
        />
        <el-table
          :data="importedResults"
          size="small"
          border
          style="width: 100%"
          max-height="360"
          aria-label="导入结果"
        >
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="表单名称" show-overflow-tooltip />
          <el-table-column prop="field_count" label="字段数" width="90" align="center" />
          <el-table-column label="操作" width="140" align="center">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="emit('open-designer', row.form_id)"
                >打开设计页</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
    <template #footer>
      <el-button v-if="importWordStep !== 3" :disabled="importWordLoading" @click="emit('update:modelValue', false)"
        >取消</el-button
      >
      <el-button v-if="importWordStep === 2" :disabled="importWordLoading" @click="goBackToImportWordStep1"
        >上一步</el-button
      >
      <el-button
        v-if="importWordStep === 2"
        type="primary"
        :disabled="selectedFormsToImport.length === 0 || importWordLoading"
        :loading="importWordLoading"
        @click="executeImportWord"
        >确认导入</el-button
      >
      <el-button v-if="importWordStep === 3" type="primary" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>

  <!-- Word导入预览对话框 -->
  <DocxCompareDialog
    v-if="compareFormData"
    :key="compareFormData?.index"
    v-model="showDocxCompare"
    :form-data="compareFormData"
    :temp-id="tempDocxId || ''"
    :project-id="projectId || 0"
    :all-form-names="importedFormsPreview.map((f) => f.name)"
    :all-forms-data="importedFormsPreview"
    :ai-review-status="importWordAiReviewStatus"
    :ai-review-error="importWordAiReviewError"
    :accepted-suggestions="compareFormAcceptedSuggestions"
    @toggle-suggestion="toggleAiSuggestionAcceptance"
    @toggle-form="toggleAiSuggestionsForForm"
  />
</template>

<style scoped>
.form-select-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.form-select-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-select-prompt {
  margin: 0;
}

.docx-ai-global-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.docx-ai-global-label {
  color: var(--color-text-secondary);
  font-size: 13px;
}

/* 导入Word弹窗 - 表单项布局 */
:deep(.docx-form-checkbox.el-checkbox.is-bordered) {
  width: 100% !important;
  height: auto !important;
  padding: 8px 12px !important;
}

:deep(.docx-form-checkbox .el-checkbox__label) {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  padding-left: 8px !important;
}

.docx-form-item {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  gap: 12px !important;
}

.docx-form-name {
  flex: 1 1 auto !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  min-width: 0 !important;
}

.docx-form-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  margin-left: auto !important;
}
</style>
