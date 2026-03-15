<template>
  <div class="screenshot-panel">
    <!-- 状态：加载中 / 生成中 -->
    <div v-if="status === 'idle' || status === 'starting'" class="status-view">
      <div class="spinner-wrap">
        <div class="spinner"></div>
      </div>
      <div class="status-text">准备生成截图…</div>
    </div>

    <div v-else-if="status === 'running'" class="status-view">
      <div class="spinner-wrap">
        <div class="spinner"></div>
      </div>
      <div class="status-text">截图生成中，请稍候…</div>
      <div class="status-sub">正在调用 Word 渲染原始文档</div>
    </div>

    <!-- 状态：失败 -->
    <div v-else-if="status === 'failed'" class="status-view status-failed">
      <div class="fail-icon">✕</div>
      <div class="status-text">截图生成失败</div>
      <div class="status-sub">{{ errorMsg || '请确认已安装 MS Word 并重试' }}</div>
    </div>

    <!-- 状态：完成，展示图片 -->
    <div v-else-if="status === 'done'" class="pages-container">
      <img
        v-for="p in displayPages"
        :key="p"
        :ref="el => pageRefs[p] = el"
        :src="pageUrl(p)"
        :class="['page-img', { 'page-highlight': p === highlightPage }]"
        :alt="`第 ${p} 页`"
        loading="lazy"
      />
    </div>

    <!-- 兜底 -->
    <div v-else class="status-view">
      <div class="status-text">等待截图…</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { api } from '../composables/useApi'

const props = defineProps({
  tempId: { type: String, default: '' },
  projectId: { type: Number, required: true },
  formNames: { type: Array, default: () => [] },       // 所有表单名（传给 start 接口）
  currentFormName: { type: String, default: '' },      // 当前表单名（用于过滤页码）
  highlightedField: { type: Object, default: null },   // 高亮的字段
  allFormsData: { type: Array, default: () => [] },    // 所有表单的完整数据（包含字段列表）
})

console.log('[DocxScreenshotPanel] 组件加载！tempId:', props.tempId, 'currentFormName:', props.currentFormName)

const status = ref('idle')
const pageCount = ref(0)
const errorMsg = ref('')
const pageRanges = ref({})  // {表单名: [start, end]}
const fieldPages = ref({})  // {表单名: {字段索引: 页码}}
const pageRefs = ref({})     // 页面元素引用
const highlightPage = ref(null)  // 当前高亮的页码

let pollTimer = null
let retryCount = 0
const MAX_RETRIES = 60

// 当前表单要显示的页码列表（1-based）
const displayPages = computed(() => {
  if (status.value !== 'done') return []
  const range = pageRanges.value[props.currentFormName]
  console.log('[DocxScreenshotPanel] 当前表单:', props.currentFormName)
  console.log('[DocxScreenshotPanel] pageRanges:', pageRanges.value)
  console.log('[DocxScreenshotPanel] 匹配到的range:', range)
  // 仅在范围有效时（start <= end）精确展示，否则降级显示全部
  if (range && range[0] <= range[1]) {
    const pages = []
    for (let i = range[0]; i <= range[1]; i++) pages.push(i)
    console.log('[DocxScreenshotPanel] 显示页码:', pages)
    return pages
  }
  // 未检测到范围 或 范围无效（start > end）→ 显示全部页面
  const allPages = Array.from({ length: pageCount.value }, (_, i) => i + 1)
  console.warn('[DocxScreenshotPanel] 未找到范围，显示全部页面:', allPages)
  return allPages
})

watch(() => props.tempId, (id) => {
  if (id) kickoff()
  else reset()
}, { immediate: true })

// 监听字段点击，滚动到对应页面并高亮
watch(() => props.highlightedField, (field) => {
  if (!field || status.value !== 'done') return

  // 优先使用字段级页码
  const formFieldPages = fieldPages.value[props.currentFormName]
  let targetPage = null

  if (formFieldPages && field.index !== undefined) {
    targetPage = formFieldPages[field.index]
  }

  // 降级：使用表单级页码范围的第一页
  if (!targetPage) {
    const range = pageRanges.value[props.currentFormName]
    if (range && range[0] <= range[1]) {
      targetPage = range[0]
    }
  }

  if (targetPage) {
    highlightPage.value = targetPage
    // 滚动到目标页面
    setTimeout(() => {
      const el = pageRefs.value[targetPage]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    // 3秒后取消高亮
    setTimeout(() => {
      highlightPage.value = null
    }, 3000)
  }
})

onUnmounted(stopPoll)

function reset() {
  stopPoll()
  status.value = 'idle'
  pageCount.value = 0
  errorMsg.value = ''
  pageRanges.value = {}
  retryCount = 0
}

async function kickoff() {
  reset()
  if (!props.tempId || !props.projectId) return

  status.value = 'starting'
  try {
    // 构建forms_data：只包含name和fields，过滤掉不必要的字段
    const formsData = props.allFormsData.map(form => ({
      name: form.name,
      fields: (form.fields || []).map(f => ({
        label: f.label,
        field_type: f.field_type,
        type: f.type
      }))
    }))

    await api.post(
      `/api/projects/${props.projectId}/import-docx/${props.tempId}/screenshots/start`,
      {
        form_names: props.formNames,
        forms_data: formsData.length > 0 ? formsData : null
      },
    )
  } catch (e) {
    status.value = 'failed'
    errorMsg.value = e?.message || '启动截图任务失败'
    return
  }

  status.value = 'running'
  startPoll()
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(poll, 3000)
  poll()
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function poll() {
  if (retryCount >= MAX_RETRIES) {
    stopPoll()
    status.value = 'failed'
    errorMsg.value = '截图生成超时（超过3分钟）'
    return
  }
  retryCount++

  try {
    const res = await api.get(
      `/api/projects/${props.projectId}/import-docx/${props.tempId}/screenshots/status`,
    )
    if (res.status === 'done') {
      stopPoll()
      pageCount.value = res.page_count || 0
      pageRanges.value = res.page_ranges || {}
      fieldPages.value = res.field_pages || {}
      status.value = 'done'
    } else if (res.status === 'failed') {
      stopPoll()
      status.value = 'failed'
      errorMsg.value = res.error || '截图生成失败'
    }
  } catch {
    // 网络抖动，继续等
  }
}

function pageUrl(page) {
  return `/api/projects/${props.projectId}/import-docx/${props.tempId}/screenshots/pages/${page}`
}
</script>

<style scoped>
.screenshot-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f9f9f9;
  overflow-y: auto;
}

/* 状态视图 */
.status-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  min-height: 200px;
  color: #606266;
}

.status-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.status-sub {
  font-size: 12px;
  color: #909399;
}

.status-failed {
  color: #f56c6c;
}

.fail-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fef0f0;
  color: #f56c6c;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* 旋转加载动画 */
.spinner-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e4e7ed;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 图片展示区 */
.pages-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 12px;
  width: 100%;
  box-sizing: border-box;
}

.page-img {
  width: 100%;
  max-width: 100%;
  height: auto;
  border: 1px solid #dcdfe6;
  border-radius: 2px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  display: block;
  transition: all 0.3s ease;
}

.page-highlight {
  border: 3px solid #409eff;
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.5);
  transform: scale(1.02);
}
</style>
