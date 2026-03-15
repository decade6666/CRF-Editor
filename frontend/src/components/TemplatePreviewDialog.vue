<template>
  <el-dialog
    v-model="visible"
    :title="`预览导入效果 - ${formName}`"
    width="560px"
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

    <!-- 预览内容 -->
    <div v-else class="preview-body">
      <div class="preview-hint">以下为该表单导入后的渲染效果</div>
      <SimulatedCRFForm :fields="fields" />
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import SimulatedCRFForm from './SimulatedCRFForm.vue'
import { api } from '../composables/useApi'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: Number, required: true },
  formId: { type: Number, default: null },
  formName: { type: String, default: '' },
})

defineEmits(['update:modelValue'])

const visible = ref(props.modelValue)
const loading = ref(false)
const errorMsg = ref('')
const fields = ref([])

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.formId) {
    loadFields()
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
      errorMsg.value = '该表单暂无字段数据'
    }
  } catch (e) {
    errorMsg.value = '加载字段失败：' + e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.preview-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 0;
}

.preview-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

</style>
