<script setup>
import { ref, reactive, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, EditPen, UploadFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { api, getAuthHeaders, apiUrl } from '../composables/useApi'
import { confirmDelete } from '../composables/projectDeleteConfirmation'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const presets = ref([])
const loading = ref(false)
const editing = ref(false)
const saving = ref(false)
const draftId = ref(null)
const draft = reactive({ name: '', data_management_unit: '' })
const logoDraftSource = ref('keep') // keep | upload | clear
const logoFile = ref(null)
const logoPreviewUrl = ref(null)
const logoInput = ref(null)
const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,.webp'

function revokeLogoPreview() {
  if (logoPreviewUrl.value) {
    URL.revokeObjectURL(logoPreviewUrl.value)
    logoPreviewUrl.value = null
  }
}

async function load() {
  loading.value = true
  try {
    presets.value = await api.get('/api/admin/organization-presets')
  } catch (e) {
    ElMessage.error('加载机构预设失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

function resetDraft() {
  editing.value = false
  draftId.value = null
  draft.name = ''
  draft.data_management_unit = ''
  logoDraftSource.value = 'keep'
  logoFile.value = null
  revokeLogoPreview()
}

async function openAdd() {
  resetDraft()
  editing.value = true
}

async function openEdit(row) {
  resetDraft()
  editing.value = true
  draftId.value = row.id
  draft.name = row.name
  draft.data_management_unit = row.data_management_unit || ''
  if (row.logo_path) {
    logoDraftSource.value = 'keep'
    try {
      const r = await fetch(apiUrl(`/api/admin/organization-presets/${row.id}/logo`), { headers: getAuthHeaders() })
      if (r.ok) {
        logoPreviewUrl.value = URL.createObjectURL(await r.blob())
        logoDraftSource.value = 'keep'
      }
    } catch (_error) {
      logoDraftSource.value = 'keep'
    }
  } else {
    logoDraftSource.value = 'keep'
  }
}

function pickLogo(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value = file
  logoDraftSource.value = 'upload'
  revokeLogoPreview()
  logoPreviewUrl.value = URL.createObjectURL(file)
  if (logoInput.value) logoInput.value = ''
}

function clearLogoDraft() {
  logoFile.value = null
  logoDraftSource.value = 'clear'
  revokeLogoPreview()
}

async function saveDraft() {
  if (!draft.name.trim()) {
    ElMessage.warning('机构名称不能为空')
    return
  }
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('metadata', JSON.stringify({
      name: draft.name,
      data_management_unit: draft.data_management_unit || null,
    }))
    fd.append('logo_action', logoDraftSource.value)
    if (logoDraftSource.value === 'upload' && logoFile.value) {
      fd.append('file', logoFile.value)
    }
    const url = draftId.value
      ? `/api/admin/organization-presets/${draftId.value}`
      : '/api/admin/organization-presets'
    const method = draftId.value ? 'put' : 'post'
    const r = await fetch(apiUrl(url), { method, body: fd, headers: getAuthHeaders() })
    if (!r.ok) {
      let detail = '未知错误'
      try {
        const body = await r.json()
        if (typeof body?.detail === 'string' && body.detail) detail = body.detail
      } catch (_error) { /* keep default */ }
      ElMessage.error('保存失败: ' + detail)
      return
    }
    await load()
    resetDraft()
    ElMessage.success(draftId.value ? '保存成功' : '创建成功')
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function removePreset(row) {
  try {
    await confirmDelete(ElMessageBox.confirm, { targetText: `机构预设 "${row.name}"` })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + e.message)
    return
  }
  try {
    await api.del(`/api/admin/organization-presets/${row.id}`)
    await load()
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    resetDraft()
    load()
  }
})

onUnmounted(() => {
  revokeLogoPreview()
})
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="机构预设"
    width="640px"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @closed="resetDraft"
  >
    <div v-if="!editing" class="preset-list">
      <div class="preset-list-toolbar">
        <el-button size="small" type="primary" :icon="Plus" @click="openAdd">新增预设</el-button>
      </div>
      <el-table :data="presets" v-loading="loading" border stripe size="small">
        <el-table-column prop="name" label="机构名称" min-width="140" />
        <el-table-column prop="data_management_unit" label="数据管理单位" min-width="160">
          <template #default="{ row }">{{ row.data_management_unit || '—' }}</template>
        </el-table-column>
        <el-table-column label="Logo" width="80">
          <template #default="{ row }">
            <el-tooltip :content="row.logo_path ? '已上传 Logo' : '无 Logo'" :show-after="300">
              <span :style="{ color: row.logo_path ? 'var(--color-success)' : 'var(--color-text-secondary)' }">
                {{ row.logo_path ? '✓ 有' : '—' }}
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-tooltip content="编辑" :show-after="300">
              <el-button size="small" text :icon="EditPen" aria-label="编辑" @click="openEdit(row)" />
            </el-tooltip>
            <el-tooltip content="删除" :show-after="300">
              <el-button size="small" text type="danger" :icon="Delete" aria-label="删除" @click="removePreset(row)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-form v-else label-width="110px" @submit.prevent>
      <el-form-item label="机构名称" required>
        <el-input v-model="draft.name" placeholder="管理员内部机构名称" />
      </el-form-item>
      <el-form-item label="数据管理单位">
        <el-input v-model="draft.data_management_unit" placeholder="展示给用户的单位名称（可空）" />
      </el-form-item>
      <el-form-item label="公司Logo">
        <div style="display:flex;flex-direction:column;gap:8px;width:100%">
          <div v-if="logoPreviewUrl">
            <img :src="logoPreviewUrl" alt="Logo 预览" style="max-height:80px;max-width:200px;border:1px solid var(--color-border);border-radius:4px;padding:4px" />
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <el-button size="small" :icon="UploadFilled" @click="logoInput.click()">上传/替换</el-button>
            <el-button v-if="logoPreviewUrl || draftId" size="small" :icon="CircleCloseFilled" @click="clearLogoDraft">清除</el-button>
          </div>
          <input ref="logoInput" aria-label="上传机构预设 Logo" type="file" :accept="FILE_ACCEPT" style="display:none" @change="pickLogo">
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <template v-if="!editing">
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </template>
      <template v-else>
        <el-button @click="resetDraft">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDraft">保存</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.preset-list-toolbar {
  margin-bottom: 8px;
}
</style>
