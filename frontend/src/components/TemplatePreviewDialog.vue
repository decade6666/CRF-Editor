<template>
  <el-dialog
    v-model="visible"
    :title="`预览导入效果 - ${formName}`"
    width="640px"
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
      <div class="preview-toolbar">
        <div class="preview-hint">以下为该表单导入后的渲染效果</div>
        <div style="display:flex;align-items:center;gap:12px">
          <el-switch v-model="selectionMode" active-text="选择导入" />
          <el-button v-if="selectionMode" size="small" @click="toggleAll">
            {{ selectedIds.size === fields.length ? '取消全选' : '全选' }}
          </el-button>
        </div>
      </div>
      
      <div v-if="selectionMode" class="selection-list">
        <div v-for="f in fields" :key="f.id" class="selection-item" @click="toggleSelect(f.id)">
          <el-checkbox :model-value="selectedIds.has(f.id)" @click.stop />
          <span class="selection-label">{{ f.label }}</span>
          <el-tag size="small" type="info">{{ f.field_type }}</el-tag>
        </div>
      </div>
      <SimulatedCRFForm v-else :fields="fields" />
    </div>

    <template #footer>
      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <div style="font-size:12px;color:var(--color-text-muted)">
          <span v-if="selectionMode">已选 {{ selectedIds.size }} / {{ fields.length }} 个字段</span>
        </div>
        <div>
          <el-button @click="$emit('update:modelValue', false)">取消</el-button>
          <el-button v-if="selectionMode" type="primary" :disabled="!selectedIds.size" @click="handleImport" :loading="importing">
            导入选中字段
          </el-button>
          <el-button v-else type="primary" @click="handleImport" :loading="importing">
            导入完整表单
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, reactive } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import SimulatedCRFForm from './SimulatedCRFForm.vue'
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
const selectionMode = ref(false)
const selectedIds = ref(new Set())

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val && props.formId) {
    loadFields()
    selectionMode.value = false
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
      errorMsg.value = '该表单暂无字段数据'
    } else {
      // 默认全选
      selectedIds.value = new Set(fields.value.map(f => f.id))
    }
  } catch (e) {
    errorMsg.value = '加载字段失败：' + e.message
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
  selectedIds.value = new Set(selectedIds.value) // trigger reactivity
}

function toggleAll() {
  if (selectedIds.value.size === fields.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(fields.value.map(f => f.id))
  }
}

async function handleImport() {
  importing.value = true
  try {
    const payload = {
      source_project_id: fields.value[0]?.project_id,
      form_ids: [props.formId]
    }
    
    if (selectionMode.value) {
      payload.field_ids = Array.from(selectedIds.value)
    }

    const data = await api.post(
      `/api/projects/${props.projectId}/import-template/execute`,
      payload
    )
    ElMessage.success(`导入成功`)
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
.preview-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 0;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.preview-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.selection-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
}

.selection-item:hover {
  background: var(--color-bg-hover);
}

.selection-label {
  flex: 1;
  font-size: 14px;
}
</style>
