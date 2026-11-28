import { computed, onScopeDispose, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, getApiSessionGeneration } from './useApi.js';
import { columnWeightsToOverrides } from './designBaselinePreview.js';

export function useDesignBaselines(active) {
  const projects = ref([]);
  const projectsTotal = ref(0);
  const projectPage = ref(1);
  const projectId = ref(null);
  const rows = ref([]);
  const total = ref(0);
  const page = ref(1);
  const loading = ref(false);
  const context = ref(null);
  const label = ref('');
  const remark = ref('');
  const manualWeights = ref({});
  const creating = ref(false);
  const opening = ref(false);
  const stale = ref(false);
  const pending = ref(null);
  const detail = ref(null);
  const deleting = ref(false);
  const error = ref('');
  let lifetime = 0;
  let projectsTicket = 0;
  let previewTicket = 0;
  let historyTicket = 0;
  let detailTicket = 0;
  let disposed = false;

  const base = () => `/api/admin/projects/${projectId.value}/design-baselines`;
  const stamp = () => ({ lifetime, projectId: projectId.value, session: getApiSessionGeneration() });
  const current = (ticket) =>
    !disposed &&
    active.value &&
    lifetime === ticket.lifetime &&
    projectId.value === ticket.projectId &&
    ticket.session === getApiSessionGeneration();
  const columnWidths = computed(() => {
    try {
      return columnWeightsToOverrides(manualWeights.value);
    } catch {
      return null;
    }
  });

  function resetCapture() {
    previewTicket += 1;
    context.value = null;
    label.value = '';
    remark.value = '';
    manualWeights.value = {};
    creating.value = false;
    opening.value = false;
    stale.value = false;
    pending.value = null;
  }

  function resetProject() {
    lifetime += 1;
    resetCapture();
    rows.value = [];
    total.value = 0;
    detail.value = null;
    page.value = 1;
    loading.value = false;
    deleting.value = false;
    error.value = '';
  }

  function report(failure, prefix = '') {
    if (failure?.status === 401 || failure?.status === 403) {
      resetProject();
      projects.value = [];
      projectId.value = null;
    }
    error.value = prefix + (failure?.message || '请求失败');
    ElMessage.error(error.value);
  }

  async function loadProjects(nextPage = 1) {
    const ticket = ++projectsTicket;
    const session = getApiSessionGeneration();
    try {
      const result = await api.get(`/api/admin/design-baseline-projects?limit=100&offset=${(nextPage - 1) * 100}`);
      if (disposed || !active.value || ticket !== projectsTicket || session !== getApiSessionGeneration()) return;
      projects.value = result.items;
      projectsTotal.value = result.total;
      projectPage.value = nextPage;
    } catch (failure) {
      if (!disposed && active.value && ticket === projectsTicket && session === getApiSessionGeneration())
        report(failure, '项目读取失败：');
    }
  }

  async function loadHistory(nextPage = 1) {
    if (!projectId.value || !active.value) return;
    const scope = stamp();
    const ticket = ++historyTicket;
    loading.value = true;
    try {
      const result = await api.get(`${base()}?limit=20&offset=${(nextPage - 1) * 20}`);
      if (!current(scope) || ticket !== historyTicket) return;
      rows.value = result.items;
      total.value = result.total;
      page.value = nextPage;
    } catch (failure) {
      if (current(scope) && ticket === historyTicket) report(failure, '留档列表读取失败：');
    } finally {
      if (current(scope) && ticket === historyTicket) loading.value = false;
    }
  }

  async function openCapture({ preserveText = false } = {}) {
    if (!projectId.value || creating.value) return;
    const scope = stamp();
    const ticket = ++previewTicket;
    const previousLabel = label.value;
    const previousRemark = remark.value;
    opening.value = true;
    try {
      const result = await api.getWithMetadata(`${base()}/capture-context`);
      if (!current(scope) || ticket !== previewTicket) return;
      if (!result.revision || result.revision !== result.data.source_revision)
        throw new Error('预览与设计版本不一致，请重新加载预览');
      context.value = result.data;
      label.value = preserveText ? previousLabel : result.data.suggested_label;
      remark.value = preserveText ? previousRemark : '';
      manualWeights.value = {};
      pending.value = null;
      stale.value = false;
      error.value = '';
    } catch (failure) {
      if (current(scope) && ticket === previewTicket) report(failure, '预览读取失败：');
    } finally {
      if (current(scope) && ticket === previewTicket) opening.value = false;
    }
  }

  function toggleWidths(table, enabled) {
    const next = { ...manualWeights.value };
    if (enabled) next[table.key] = table.ratios.map((value) => Number((value * 100).toFixed(3)));
    else delete next[table.key];
    manualWeights.value = next;
  }

  function setWeight(key, index, value) {
    const next = [...manualWeights.value[key]];
    next[index] = value;
    manualWeights.value = { ...manualWeights.value, [key]: next };
  }

  async function submit(retry = false) {
    if (!context.value || creating.value || stale.value || !columnWidths.value || !label.value.trim()) return;
    if (pending.value && !retry) return;
    if (!pending.value) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      pending.value = {
        body: {
          request_id: [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''),
          label: label.value,
          remark: remark.value,
          column_widths: JSON.parse(JSON.stringify(columnWidths.value)),
        },
        revision: context.value.source_revision,
        status: 'pending',
      };
    }
    const scope = stamp();
    const operation = pending.value;
    creating.value = true;
    try {
      await api.post(
        base(),
        { ...operation.body, ...(retry ? { retry: true } : {}) },
        { headers: { 'If-Match': operation.revision } },
      );
      if (!current(scope) || pending.value !== operation) return;
      resetCapture();
      ElMessage.success('双份正式原件已保存');
      await loadHistory();
    } catch (failure) {
      if (!current(scope) || pending.value !== operation) return;
      if (failure?.code === 'STALE_STATE' || failure?.code === 'PRECONDITION_REQUIRED') {
        stale.value = true;
        pending.value = null;
      } else {
        operation.status = 'unknown';
      }
      report(failure, '未确认留档完成；请先查询请求状态，不会自动重试：');
    } finally {
      if (current(scope)) creating.value = false;
    }
  }

  async function queryRequest() {
    if (!pending.value || creating.value) return;
    const scope = stamp();
    const operation = pending.value;
    try {
      const result = await api.get(`${base()}/requests/${operation.body.request_id}`);
      if (!current(scope) || pending.value !== operation) return;
      operation.status = result.status;
      if (result.status === 'completed') {
        resetCapture();
        ElMessage.success('已确认该请求的双份原件保存成功');
        await loadHistory();
      } else if (result.status === 'deleted') {
        ElMessage.warning('该请求的留档已删除，请重新预览后发起新请求');
      }
    } catch (failure) {
      if (current(scope) && pending.value === operation) report(failure, '请求状态查询失败，请勿自动重发：');
    }
  }

  async function showDetail(row) {
    const scope = stamp();
    const ticket = ++detailTicket;
    try {
      const result = await api.get(`${base()}/${row.id}`);
      if (current(scope) && ticket === detailTicket) detail.value = result;
    } catch (failure) {
      if (current(scope) && ticket === detailTicket) report(failure, '留档读取失败：');
    }
  }

  async function remove(row) {
    if (deleting.value) return;
    const scope = stamp();
    const url = `${base()}/${row.id}`;
    deleting.value = true;
    try {
      await ElMessageBox.confirm(
        `将删除「${row.label}」的 eCRF 和 aCRF 两份原件及设计快照；之后无法下载或参与留档比较。此操作不可恢复，确认删除整对留档？`,
        '删除正式留档',
        { type: 'warning', confirmButtonText: '删除整对留档', cancelButtonText: '保留留档' },
      );
      if (!current(scope)) return;
      const result = await api.del(url, { data: { confirm_pair_loss: true }, withResponse: true });
      if (!current(scope)) return;
      if (detail.value?.id === row.id) detail.value = null;
      if (result.cleanup_complete) ElMessage.success('整对留档已删除');
      else ElMessage.warning('留档记录已删除，但文件清理未完成，请联系管理员检查日志');
      await loadHistory();
    } catch (failure) {
      if (current(scope) && failure !== 'cancel' && failure !== 'close') report(failure, '留档删除未完成：');
    } finally {
      if (current(scope)) deleting.value = false;
    }
  }

  async function download(row, kind) {
    const scope = stamp();
    try {
      const original = await api.getOriginal(`${base()}/${row.id}/originals/${kind}`);
      if (!current(scope)) return;
      const index = row.artifacts.find((artifact) => artifact.kind === kind);
      if (!index || index.sha256 !== original.sha256 || index.byte_count !== original.blob.size)
        throw new Error('原件与当前索引不一致，未下载文件');
      const url = URL.createObjectURL(original.blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `baseline-${row.id}-${kind}.docx`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (failure) {
      if (current(scope)) report(failure, '原件下载失败：');
    }
  }

  watch(
    projectId,
    () => {
      resetProject();
      void loadHistory();
    },
    { flush: 'sync' },
  );
  watch(active, (enabled) => {
    resetProject();
    if (enabled) {
      void loadProjects(projectPage.value);
      void loadHistory();
    }
  });
  const authChanged = (event) => {
    if (event?.type === 'storage' && event.key !== null && event.key !== 'crf_token') return;
    resetProject();
    projects.value = [];
    projectId.value = null;
  };
  window.addEventListener('crf:auth-expired', authChanged);
  window.addEventListener('storage', authChanged);
  onScopeDispose(() => {
    disposed = true;
    resetProject();
    window.removeEventListener('crf:auth-expired', authChanged);
    window.removeEventListener('storage', authChanged);
  });
  return {
    projects,
    projectsTotal,
    projectPage,
    projectId,
    rows,
    total,
    page,
    loading,
    context,
    label,
    remark,
    manualWeights,
    columnWidths,
    creating,
    opening,
    stale,
    pending,
    detail,
    deleting,
    error,
    loadProjects,
    loadHistory,
    openCapture,
    resetCapture,
    toggleWidths,
    setWeight,
    submit,
    queryRequest,
    showDetail,
    remove,
    download,
  };
}
