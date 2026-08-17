<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'

import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, EditPen, UploadFilled, CircleCloseFilled, Refresh } from '@element-plus/icons-vue'
import { api, getAuthHeaders, apiUrl } from '../composables/useApi'
import { confirmDelete } from '../composables/projectDeleteConfirmation'

const presets = ref([])
const loading = ref(false)
const selectedId = ref(null)
const editing = ref(false)
const saving = ref(false)
const draftId = ref(null)
const draft = reactive({ name: '', data_management_unit: '' })
const logoDraftSource = ref('keep') // keep | upload | clear
const logoFile = ref(null)
const logoPreviewUrl = ref(null)
const logoPreviewOwned = ref(false) // 仅 pickLogo 创建的 URL 归预览持有
const logoInput = ref(null)
const logoPreviewRefs = new Map() // id -> el-image 实例（showPreview）
const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,.webp'

// id -> blob URL，列表缩略图；每个 URL 有唯一释放责任点。
// reactive Map：模板依赖其条目变化重渲染缩略图列。
const thumbnailUrls = reactive(new Map())
const inFlightLogo = new Set()
let disposed = false

function revokeLogoUrl(id) {
  const url = thumbnailUrls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    thumbnailUrls.delete(id)
  }
}

function revokeLogoPreview() {
  if (logoPreviewOwned.value && logoPreviewUrl.value) {
    URL.revokeObjectURL(logoPreviewUrl.value)
  }
  logoPreviewUrl.value = null
  logoPreviewOwned.value = false
}

function releaseAllThumbnails() {
  for (const id of thumbnailUrls.keys()) revokeLogoUrl(id)
}

async function loadLogoUrl(id) {
  if (!id) return null
  if (inFlightLogo.has(id)) return thumbnailUrls.get(id) ?? null
  inFlightLogo.add(id)
  try {
    const r = await fetch(apiUrl(`/api/organization-presets/${id}/logo`), { headers: getAuthHeaders() })
    if (disposed) return null
    if (r.ok) {
      const url = URL.createObjectURL(await r.blob())
      if (disposed) {
        URL.revokeObjectURL(url)
        return null
      }
      revokeLogoUrl(id)
      thumbnailUrls.set(id, url)
      return url
    }
    ElMessage.error('加载机构 Logo 失败')
    return null
  } catch (_error) {
    if (!disposed) ElMessage.error('加载机构 Logo 失败')
    return null
  } finally {
    inFlightLogo.delete(id)
  }
}

function deleteLogoUrl(id) {
  revokeLogoUrl(id)
  if (inFlightLogo.has(id)) inFlightLogo.delete(id)
}

async function load() {
  loading.value = true
  try {
    presets.value = await api.get('/api/admin/organization-presets')
    // 对账：已删除或清除 Logo 的预设回收缩略图 URL
    const keepIds = new Set(presets.value.filter((p) => p.logo_path).map((p) => p.id))
    for (const id of [...thumbnailUrls.keys()]) {
      if (!keepIds.has(id)) revokeLogoUrl(id)
    }
    const needs = presets.value.filter((p) => p.logo_path && !thumbnailUrls.has(p.id))
    await Promise.all(needs.map((p) => loadLogoUrl(p.id)))
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
  selectedId.value = row.id
  resetDraft()
  editing.value = true
  draftId.value = row.id
  draft.name = row.name
  draft.data_management_unit = row.data_management_unit || ''
  logoDraftSource.value = 'keep'
  if (row.logo_path) {
    const url = await loadLogoUrl(row.id)
    if (url) {
      // 借用缩略图 Map 的 URL 展示，预览不拥有其所有权
      logoPreviewUrl.value = url
      logoPreviewOwned.value = false
    }
  }
}

let previewOpeningId = null

function showPreview(id) {
  previewOpeningId = id
  logoPreviewRefs.get(id)?.showPreview()
  // 缩略图点击会同时触发 el-table 行选中；短暂窗口内抑制自动编辑，随后恢复
  setTimeout(() => {
    if (previewOpeningId === id) previewOpeningId = null
  }, 800)
}

function onRowChange(row) {
  if (!row) return
  if (previewOpeningId === row.id) {
    previewOpeningId = null
    return // 缩略图点击，仅打开预览，不自动进入编辑
  }
  openEdit(row)
}

function pickLogo(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoFile.value = file
  logoDraftSource.value = 'upload'
  revokeLogoPreview()
  logoPreviewUrl.value = URL.createObjectURL(file)
  logoPreviewOwned.value = true
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
        if (typeof body?.detail === 'string' && body.detail) {
          detail = body.detail
        } else if (Array.isArray(body?.detail)) {
          detail = body.detail.map((item) => item?.msg || String(item)).join('; ')
        }
      } catch (_error) { /* keep default */ }
      ElMessage.error('保存失败: ' + detail)
      return
    }
    const isEdit = Boolean(draftId.value)
    if (isEdit) revokeLogoUrl(draftId.value) // 让 load 按最新 logo 状态重拉
    await load()
    resetDraft()
    ElMessage.success(isEdit ? '保存成功' : '创建成功')
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
    deleteLogoUrl(row.id)
    if (selectedId.value === row.id) {
      selectedId.value = null
      resetDraft()
    }
    await load()
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

onMounted(() => {
  load()
})

onBeforeUnmount(() => {
  disposed = true
  releaseAllThumbnails()
  revokeLogoPreview()
})
</script>

<template>
  <div class="org-page">
    <div class="workspace-header">
      <div>
        <div class="workspace-title">机构管理</div>
        <div class="workspace-subtitle">维护展示给用户选择的机构预设与公司 Logo</div>
      </div>
      <div class="workspace-actions">
        <el-tooltip content="新增预设" placement="top">
          <el-button type="primary" :icon="Plus" aria-label="新增预设" @click="openAdd" />
        </el-tooltip>
        <el-tooltip content="刷新" placement="top">
          <el-button :icon="Refresh" aria-label="刷新" :loading="loading" @click="load" />
        </el-tooltip>
      </div>
    </div>
    <div class="org-layout">
      <section class="org-list" aria-label="机构预设列表">
      <el-table
        :data="presets"
        v-loading="loading"
        border
        stripe
        size="small"
        highlight-current-row
        @current-change="onRowChange"
      >
        <el-table-column prop="name" label="机构名称" min-width="140" />
        <el-table-column prop="data_management_unit" label="数据管理单位" min-width="160">
          <template #default="{ row }">{{ row.data_management_unit || '—' }}</template>
        </el-table-column>
        <el-table-column label="Logo" width="120">
          <template #default="{ row }">
            <div
              v-if="thumbnailUrls.has(row.id)"
              class="org-logo-cell"
              tabindex="0"
              role="button"
              aria-label="放大查看机构 Logo"
              @click.stop="showPreview(row.id)"
              @keydown.enter.stop.prevent="showPreview(row.id)"
              @keydown.space.stop.prevent="showPreview(row.id)"
            >
              <el-image
                :ref="(el) => el ? logoPreviewRefs.set(row.id, el) : logoPreviewRefs.delete(row.id)"
                :src="thumbnailUrls.get(row.id)"
                :preview-src-list="[thumbnailUrls.get(row.id)]"
                preview-teleported
                hide-on-click-modal
                fit="contain"
                class="org-logo-thumb"
                :alt="row.name + ' 机构 Logo'"
                @click.stop
              />
            </div>
            <span v-else class="org-logo-empty">—</span>
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
    </section>

    <section class="org-editor" aria-label="机构预设编辑">
      <el-form v-if="editing" label-width="110px" @submit.prevent>
        <el-form-item label="机构名称" required>
          <el-input v-model="draft.name" placeholder="管理员内部机构名称" />
        </el-form-item>
        <el-form-item label="数据管理单位">
          <el-input v-model="draft.data_management_unit" placeholder="展示给用户的单位名称（可空）" />
        </el-form-item>
        <el-form-item label="公司Logo">
          <div class="org-logo-editor">
            <div v-if="logoPreviewUrl">
              <img :src="logoPreviewUrl" alt="Logo 预览" class="org-logo-preview" />
            </div>
            <div class="org-logo-actions">
              <el-button size="small" :icon="UploadFilled" @click="logoInput.click()">上传/替换</el-button>
              <el-button v-if="logoPreviewUrl || draftId" size="small" :icon="CircleCloseFilled" @click="clearLogoDraft">清除</el-button>
            </div>
            <input ref="logoInput" aria-label="上传机构预设 Logo" type="file" :accept="FILE_ACCEPT" style="display:none" @change="pickLogo">
          </div>
        </el-form-item>
        <el-form-item>
          <div class="org-editor-actions">
            <el-button @click="resetDraft">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveDraft">保存</el-button>
          </div>
        </el-form-item>
      </el-form>
      <div v-else class="org-placeholder">点击左侧机构进行编辑，或点击「新增预设」创建机构。</div>
    </section>
    </div>
  </div>
</template>

<style scoped>
.org-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.org-list {
  flex: 1;
  min-width: 0;
}

.org-editor {
  flex: 1;
  min-width: 0;
}

.org-placeholder {
  color: var(--color-text-secondary);
  padding: 24px 0;
}

.org-logo-cell {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  outline: none;
}

.org-logo-cell:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.org-logo-thumb {
  max-width: 96px;
  max-height: 32px;
}

.org-logo-empty {
  color: var(--color-text-secondary);
}

.org-logo-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.org-logo-preview {
  max-height: 80px;
  max-width: 200px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px;
}

.org-logo-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.org-editor-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 900px) {
  .org-layout {
    flex-direction: column;
  }
}
</style>
