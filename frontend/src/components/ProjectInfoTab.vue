<script setup>
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { api, getAuthHeaders, apiUrl } from '../composables/useApi'
import { rankFuzzyMatches } from '../composables/searchRanking'

const DEFAULT_SCREENING_NUMBER_FORMAT = 'S|__|__||__|__|__|'
const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,.webp'

const props = defineProps({ project: { type: Object, required: true } })
const emit = defineEmits(['updated'])

const form = reactive({})
const logoInput = ref(null)
const skipFormReset = ref(false)
const screeningNumberFormatTouched = ref(false)

// 单位预设候选（普通用户只读：id/单位/has_logo，不含机构名称）
const unitCandidates = ref([])
const candidatesLoaded = ref(false)

// Logo 草稿状态机：source = null(未改/项目原图) | 'preset' | 'upload' | 'clear'
const logoDraft = reactive({ source: null, presetId: null, file: null, blobUrl: null })

function revokeLogoBlob() {
  if (logoDraft.blobUrl) {
    URL.revokeObjectURL(logoDraft.blobUrl)
    logoDraft.blobUrl = null
  }
}

function resetLogoDraft() {
  logoDraft.source = null
  logoDraft.presetId = null
  logoDraft.file = null
  revokeLogoBlob()
}

async function fetchProjectLogo(projectId) {
  if (!projectId) return
  try {
    const r = await fetch(apiUrl(`/api/projects/${projectId}/logo`), { headers: getAuthHeaders() })
    if (r.ok) {
      revokeLogoBlob()
      logoDraft.blobUrl = URL.createObjectURL(await r.blob())
    }
  } catch (_error) {
    revokeLogoBlob()
    logoDraft.blobUrl = null
  }
}

async function loadUnitCandidates() {
  if (candidatesLoaded.value) return
  try {
    unitCandidates.value = await api.get('/api/organization-presets')
    candidatesLoaded.value = true
  } catch (_error) {
    unitCandidates.value = []
  }
}

watch(() => props.project, (p) => {
  if (skipFormReset.value) { skipFormReset.value = false; return }
  screeningNumberFormatTouched.value = false
  Object.assign(form, {
    name: p.name, version: p.version, db_type: p.db_type || '其他',
    trial_name: p.trial_name || '',
    crf_version: p.crf_version || '', crf_version_date: p.crf_version_date || '',
    protocol_number: p.protocol_number || '',
    screening_number_format: p.screening_number_format || DEFAULT_SCREENING_NUMBER_FORMAT,
    sponsor: p.sponsor || '',
    data_management_unit: p.data_management_unit || '',
  })
  resetLogoDraft()
  if (p.company_logo_path) {
    fetchProjectLogo(p.id)
  }
}, { immediate: true })

onUnmounted(() => {
  revokeLogoBlob()
})

function fetchUnitSuggestions(_query, cb) {
  const keyword = String(form.data_management_unit || '').trim()
  const ranked = rankFuzzyMatches(unitCandidates.value, keyword, (item) => [item.data_management_unit])
  cb(ranked.map((item) => ({
    value: item.data_management_unit,
    preset_id: item.id,
    has_logo: item.has_logo,
  })))
}

async function applyUnitPreset(item) {
  // 点击候选：填单位 + 同步 Logo 草稿（有 Logo 拉取 Blob 预览；无 Logo 置 clear）
  logoDraft.source = 'preset'
  logoDraft.presetId = item.preset_id
  logoDraft.file = null
  revokeLogoBlob()
  if (item.has_logo) {
    try {
      const r = await fetch(apiUrl(`/api/organization-presets/${item.preset_id}/logo`), { headers: getAuthHeaders() })
      if (r.ok) logoDraft.blobUrl = URL.createObjectURL(await r.blob())
      else logoDraft.source = 'clear'
    } catch (_error) {
      logoDraft.source = 'clear'
    }
  } else {
    logoDraft.source = 'clear'
  }
}

function onUnitInput() {
  // 用户随后修改单位文本：单位转自定义，已同步的 Logo 草稿降级为 keep（保留预览，保存不动项目 Logo）
  if (logoDraft.source === 'preset') {
    const matched = unitCandidates.value.find((c) => c.data_management_unit === form.data_management_unit)
    if (!matched) {
      logoDraft.presetId = null
      logoDraft.source = 'keep'
    }
  }
}

function pickLogo(e) {
  const file = e.target.files?.[0]
  if (!file) return
  logoDraft.source = 'upload'
  logoDraft.file = file
  logoDraft.presetId = null
  revokeLogoBlob()
  logoDraft.blobUrl = URL.createObjectURL(file)
  if (logoInput.value) logoInput.value = ''
}

function clearLogoDraft() {
  logoDraft.source = 'clear'
  logoDraft.file = null
  logoDraft.presetId = null
  revokeLogoBlob()
}

async function save() {
  try {
    const metadata = { ...form }
    if (!metadata.crf_version_date) metadata.crf_version_date = null
    if (!screeningNumberFormatTouched.value && !props.project.screening_number_format && metadata.screening_number_format === DEFAULT_SCREENING_NUMBER_FORMAT) {
      metadata.screening_number_format = null
    }
    const fd = new FormData()
    fd.append('metadata', JSON.stringify(metadata))
    fd.append('logo_action', logoDraft.source || 'keep')
    if (logoDraft.source === 'preset' && logoDraft.presetId != null) {
      fd.append('preset_id', String(logoDraft.presetId))
    }
    if (logoDraft.source === 'upload' && logoDraft.file) {
      fd.append('file', logoDraft.file)
    }
    const r = await fetch(apiUrl(`/api/projects/${props.project.id}/profile`), { method: 'PUT', body: fd, headers: getAuthHeaders() })
    if (!r.ok) {
      let detail = '未知错误'
      try {
        const body = await r.json()
        if (typeof body?.detail === 'string' && body.detail) detail = body.detail
      } catch (_error) { /* keep default */ }
      ElMessage.error('保存失败: ' + detail)
      return
    }
    const updated = await r.json()
    skipFormReset.value = true
    emit('updated', updated)
    resetLogoDraft()
    if (updated.company_logo_path) fetchProjectLogo(updated.id)
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  }
}

onMounted(() => {
  loadUnitCandidates()
})
</script>

<template>
  <el-form :model="form" label-width="120px" style="max-width:600px">
    <el-divider content-position="left">项目信息</el-divider>
    <el-form-item label="项目名称"><el-input v-model="form.name" /></el-form-item>
    <el-form-item label="版本号"><el-input v-model="form.version" /></el-form-item>
    <el-form-item label="数据库类型">
      <el-radio-group v-model="form.db_type">
        <el-radio label="赛美斯">赛美斯</el-radio>
        <el-radio label="其他">其他</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-divider content-position="left">封面页信息</el-divider>
    <el-form-item label="试验名称"><el-input v-model="form.trial_name" /></el-form-item>
    <el-form-item label="CRF版本"><el-input v-model="form.crf_version" /></el-form-item>
    <el-form-item label="CRF版本日期"><el-input v-model="form.crf_version_date" placeholder="YYYY-MM-DD" /></el-form-item>
    <el-form-item label="方案编号"><el-input v-model="form.protocol_number" /></el-form-item>
    <el-form-item label="筛选号格式"><el-input v-model="form.screening_number_format" @input="screeningNumberFormatTouched = true" /></el-form-item>
    <el-form-item label="申办方"><el-input v-model="form.sponsor" /></el-form-item>
    <el-form-item label="数据管理单位">
      <el-autocomplete
        v-model="form.data_management_unit"
        :fetch-suggestions="fetchUnitSuggestions"
        :trigger-on-focus="false"
        placeholder="输入单位名称，可从预设中选择"
        @select="applyUnitPreset"
        @input="onUnitInput"
      />
    </el-form-item>
    <el-form-item label="公司Logo">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div v-if="logoDraft.blobUrl">
          <img :src="logoDraft.blobUrl" alt="项目 Logo" style="max-height:80px;max-width:200px;border:1px solid var(--color-border);border-radius:4px;padding:4px" />
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <el-button size="small" :icon="UploadFilled" @click="logoInput.click()">上传/替换</el-button>
          <el-button v-if="logoDraft.blobUrl || project.company_logo_path || logoDraft.source === 'clear'" size="small" :icon="CircleCloseFilled" @click="clearLogoDraft">清除</el-button>
          <span v-if="logoDraft.source === 'preset'" style="font-size:12px;color:var(--color-primary)">已同步预设 Logo</span>
          <span v-else-if="logoDraft.source === 'clear'" style="font-size:12px;color:var(--color-text-secondary)">保存后清除 Logo</span>
          <span v-else-if="project.company_logo_path" style="font-size:12px;color:var(--color-success)">✓ 已上传</span>
        </div>
        <input ref="logoInput" aria-label="上传项目 Logo" type="file" :accept="FILE_ACCEPT" style="display:none" @change="pickLogo">
      </div>
    </el-form-item>
    <el-form-item><el-button type="primary" @click="save">保存</el-button></el-form-item>
  </el-form>
</template>
