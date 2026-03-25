<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../composables/useApi'

const props = defineProps({ project: { type: Object, required: true } })
const emit = defineEmits(['updated'])

const form = reactive({})
const logoInput = ref(null)
const logoTs = ref(Date.now())
const skipFormReset = ref(false)

watch(() => props.project, (p) => {
  if (skipFormReset.value) { skipFormReset.value = false; return }
  Object.assign(form, {
    name: p.name, version: p.version, trial_name: p.trial_name || '',
    crf_version: p.crf_version || '', crf_version_date: p.crf_version_date || '',
    protocol_number: p.protocol_number || '', sponsor: p.sponsor || '',
    data_management_unit: p.data_management_unit || '',
  })
}, { immediate: true })

async function save() {
  try {
    const data = { ...form }
    if (!data.crf_version_date) data.crf_version_date = null
    const r = await api.put(`/api/projects/${props.project.id}`, data)
    emit('updated', r)
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error('保存失败: ' + e.message) }
}

async function uploadLogo(e) {
  const file = e.target.files[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/projects/${props.project.id}/logo`, { method: 'POST', body: fd })
  if (r.ok) {
    const d = await r.json()
    logoTs.value = Date.now()
    skipFormReset.value = true
    emit('updated', d)
    ElMessage.success('Logo上传成功')
  } else {
    ElMessage.error('上传失败')
  }
}
</script>

<template>
  <el-form :model="form" label-width="120px" style="max-width:600px">
    <el-divider content-position="left">项目信息</el-divider>
    <el-form-item label="项目名称"><el-input v-model="form.name" /></el-form-item>
    <el-form-item label="版本号"><el-input v-model="form.version" /></el-form-item>
    <el-divider content-position="left">封面页信息</el-divider>
    <el-form-item label="试验名称"><el-input v-model="form.trial_name" /></el-form-item>
    <el-form-item label="CRF版本"><el-input v-model="form.crf_version" /></el-form-item>
    <el-form-item label="CRF版本日期"><el-input v-model="form.crf_version_date" placeholder="YYYY-MM-DD" /></el-form-item>
    <el-form-item label="方案编号"><el-input v-model="form.protocol_number" /></el-form-item>
    <el-form-item label="申办方"><el-input v-model="form.sponsor" /></el-form-item>
    <el-form-item label="数据管理单位"><el-input v-model="form.data_management_unit" /></el-form-item>
    <el-form-item label="公司Logo">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div v-if="project.company_logo_path">
          <img :src="'/api/projects/'+project.id+'/logo?t='+logoTs" style="max-height:80px;max-width:200px;border:1px solid var(--color-border);border-radius:4px;padding:4px" />
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <el-button size="small" @click="logoInput.click()">{{ project.company_logo_path ? '更换Logo' : '上传Logo' }}</el-button>
          <span v-if="project.company_logo_path" style="font-size:12px;color:var(--color-success)">✓ 已上传</span>
        </div>
        <input ref="logoInput" type="file" accept="image/*" style="display:none" @change="uploadLogo">
      </div>
    </el-form-item>
    <el-form-item><el-button type="primary" @click="save">保存</el-button></el-form-item>
  </el-form>
</template>
