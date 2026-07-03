<template>
  <div class="screenshot-panel">
    <div v-if="locateHint" class="locate-hint" aria-live="polite">{{ locateHint }}</div>

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
      <div class="status-sub">正在渲染原始文档</div>
    </div>

    <!-- 状态：失败 -->
    <div v-else-if="status === 'failed'" class="status-view status-failed">
      <div class="fail-icon">✕</div>
      <div class="status-text">截图生成失败</div>
      <div class="status-sub">{{ errorMsg || '请确认文档渲染环境可用后重试' }}</div>
    </div>

    <!-- 状态：完成，展示图片 -->
    <div v-else-if="status === 'done'" class="pages-container">
      <img
        v-for="p in displayPages"
        :key="p"
        :ref="(el) => (pageRefs[p] = el)"
        :src="pageBlobUrls[p]"
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
import { ref, computed, watch, onUnmounted } from 'vue';
import { api, getAuthHeaders } from '../composables/useApi';

const props = defineProps({
  tempId: { type: String, default: '' },
  projectId: { type: Number, required: true },
  formNames: { type: Array, default: () => [] }, // 所有表单名（传给 start 接口）
  currentFormName: { type: String, default: '' }, // 当前表单名（用于过滤页码）
  highlightedField: { type: Object, default: null }, // 高亮的字段
  allFormsData: { type: Array, default: () => [] }, // 所有表单的完整数据（包含字段列表）
});

const status = ref('idle');
const pageCount = ref(0);
const errorMsg = ref('');
const locateHint = ref('');
const pageRanges = ref({}); // {表单名: [start, end]}
const fieldPages = ref({}); // {表单名: {字段索引: 页码}}
const pageRefs = ref({}); // 页面元素引用
const highlightPage = ref(null); // 当前高亮的页码
const pageBlobUrls = ref({}); // {页码: objectURL}；截图需鉴权，<img> 不带 JWT 头，改为带头拉取 blob 后显示

let pollTimer = null;
let hintTimer = null;
let retryCount = 0;
const MAX_RETRIES = 60;

// 当前表单要显示的页码列表（1-based）
const displayPages = computed(() => {
  if (status.value !== 'done') return [];
  const range = pageRanges.value[props.currentFormName];
  // 仅在范围有效时（start <= end）精确展示，否则降级显示全部
  if (range && range[0] <= range[1]) {
    const pages = [];
    for (let i = range[0]; i <= range[1]; i++) pages.push(i);
    return pages;
  }
  // 未检测到范围 或 范围无效（start > end）→ 显示全部页面
  return Array.from({ length: pageCount.value }, (_, i) => i + 1);
});

// 当前表单要展示的页码变化时（完成 / 切换表单），带鉴权拉取对应页图片
watch(displayPages, (pages) => {
  if (pages && pages.length) loadDisplayPageImages(pages);
});

watch(
  () => props.tempId,
  (id) => {
    if (id) kickoff();
    else reset();
  },
  { immediate: true },
);

// 监听字段点击，滚动到对应页面并高亮
watch(
  () => props.highlightedField,
  (field) => {
    if (!field || status.value !== 'done') return;

    clearLocateHint();

    // 优先使用字段级页码
    const formFieldPages = fieldPages.value[props.currentFormName];
    const targetPage = formFieldPages && field.index !== undefined ? formFieldPages[field.index] : null;

    if (!targetPage) {
      showLocateHint('未定位到原文页');
      return;
    }

    highlightPage.value = targetPage;
    // 滚动到目标页面
    setTimeout(() => {
      const el = pageRefs.value[targetPage];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    // 3秒后取消高亮
    setTimeout(() => {
      highlightPage.value = null;
    }, 3000);
  },
);

onUnmounted(() => {
  stopPoll();
  clearLocateHint();
  revokePageBlobUrls();
});

function reset() {
  stopPoll();
  clearLocateHint();
  revokePageBlobUrls();
  status.value = 'idle';
  pageCount.value = 0;
  errorMsg.value = '';
  pageRanges.value = {};
  fieldPages.value = {};
  pageRefs.value = {};
  highlightPage.value = null;
  retryCount = 0;
}

function clearLocateHint() {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  locateHint.value = '';
}

function showLocateHint(message) {
  clearLocateHint();
  locateHint.value = message;
  hintTimer = setTimeout(() => {
    locateHint.value = '';
    hintTimer = null;
  }, 3000);
}

async function kickoff() {
  reset();
  if (!props.tempId || !props.projectId) return;

  status.value = 'starting';
  try {
    // 构建forms_data：只包含name和fields，过滤掉不必要的字段
    const formsData = props.allFormsData.map((form) => ({
      name: form.name,
      fields: (form.fields || []).map((f) => ({
        label: f.label,
        field_type: f.field_type,
        type: f.type,
      })),
    }));

    await api.post(`/api/projects/${props.projectId}/import-docx/${props.tempId}/screenshots/start`, {
      form_names: props.formNames,
      forms_data: formsData.length > 0 ? formsData : null,
    });
  } catch (e) {
    status.value = 'failed';
    errorMsg.value = e?.message || '启动截图任务失败';
    return;
  }

  status.value = 'running';
  startPoll();
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(poll, 3000);
  poll();
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function poll() {
  if (retryCount >= MAX_RETRIES) {
    stopPoll();
    status.value = 'failed';
    errorMsg.value = '截图生成超时（超过3分钟）';
    return;
  }
  retryCount++;

  try {
    const res = await api.get(`/api/projects/${props.projectId}/import-docx/${props.tempId}/screenshots/status`);
    if (res.status === 'done') {
      stopPoll();
      pageCount.value = res.page_count || 0;
      pageRanges.value = res.page_ranges || {};
      fieldPages.value = res.field_pages || {};
      status.value = 'done';
    } else if (res.status === 'failed') {
      stopPoll();
      status.value = 'failed';
      errorMsg.value = res.error || '截图生成失败';
    }
  } catch {
    // 网络抖动，继续等
  }
}

function pageUrl(page) {
  return `/api/projects/${props.projectId}/import-docx/${encodeURIComponent(props.tempId)}/screenshots/pages/${page}`;
}

// 截图页端点需要 JWT 鉴权，而 <img src> 请求不携带 Authorization 头，
// 因此改为用带鉴权头的 fetch 拉取图片 blob，再以 objectURL 显示。
async function fetchPageBlob(page) {
  if (pageBlobUrls.value[page]) return; // 已加载则跳过
  try {
    const r = await fetch(pageUrl(page), { headers: getAuthHeaders() });
    if (!r.ok) return;
    const blob = await r.blob();
    pageBlobUrls.value = { ...pageBlobUrls.value, [page]: URL.createObjectURL(blob) };
  } catch {
    // 单页加载失败忽略，保留占位，不阻塞其它页
  }
}

function loadDisplayPageImages(pages) {
  pages.forEach((p) => fetchPageBlob(p));
}

function revokePageBlobUrls() {
  Object.values(pageBlobUrls.value).forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* noop */
    }
  });
  pageBlobUrls.value = {};
}
</script>

<style scoped>
.screenshot-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-hover);
  overflow-y: auto;
}

.locate-hint {
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--color-warning) 12%, white);
  border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 28%, var(--color-border));
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
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
  color: var(--color-text-secondary);
}

.status-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.status-sub {
  font-size: 12px;
  color: var(--color-text-muted);
}

.status-failed {
  color: var(--color-danger);
}

.fail-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-danger) 10%, white);
  color: var(--color-danger);
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
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
  border: 1px solid var(--color-border);
  border-radius: 2px;
  box-shadow: var(--shadow-sm);
  display: block;
  transition: all 0.3s ease;
}

.page-highlight {
  /* 必须用 outline，不得用 border！border 会改变 box model，导致图片位置偏移 */
  outline: 2px solid var(--color-primary);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
  transform: scale(1.02);
}
</style>
