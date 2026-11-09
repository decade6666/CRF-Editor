/**
 * Agent 访问弹窗的按次独立状态机（无模块级可变状态：一次调用 = 一个弹窗实例）。
 *
 * - 单调失效代（generation）：项目切换、弹窗关闭（invalidate）、作用域卸载都
 *   递增；每个在途异步操作捕获其发起时的代号，回写状态前必须一致——
 *   迟到响应（含一次性令牌）在任何关闭/切换/重开序列后都不会复活。
 * - 每条数据流（凭据 / 提案列表 / 提案详情）另有各自的流内序号，防止同类
 *   并发加载互相覆盖。
 * - 一次性令牌只存在 issuedToken ref 中；项目切换、关闭与卸载都会清除。
 * - 提案列表支持显式分页（refresh 首页替换、loadMore 追加），不做轮询。
 * - API 一律走 useApi.js；本组合式函数只做状态与请求编排，提示文案归宿主组件。
 */

import { onScopeDispose, ref, watch } from 'vue';
import { api } from './useApi';

export function useAgentAccess(projectId) {
  const credentials = ref([]);
  const changes = ref([]);
  const changesTotal = ref(0);
  const changesHasMore = ref(false);
  const loadingCredentials = ref(false);
  const loadingChanges = ref(false);
  const loadingDetail = ref(false);
  const issuedToken = ref(null);
  const selectedChange = ref(null);

  let generation = 0;
  let credentialTicket = 0;
  let changesTicket = 0;
  let detailTicket = 0;
  let disposed = false;
  const CHANGES_PAGE_SIZE = 50;

  function credentialsUrl() {
    return `/api/projects/${projectId.value}/agent-access/credentials`;
  }

  function changesUrl(offset) {
    return `/api/projects/${projectId.value}/agent-access/changes?limit=${CHANGES_PAGE_SIZE}&offset=${offset}`;
  }

  function changeDetailUrl(changeId) {
    return `/api/projects/${projectId.value}/agent-access/changes/${changeId}`;
  }

  /** 关闭弹窗或离开上下文时调用：作废全部在途异步写回。 */
  function invalidate() {
    generation += 1;
  }

  function clearIssuedToken() {
    issuedToken.value = null;
  }

  function clearSelectedChange() {
    selectedChange.value = null;
  }

  async function loadCredentials() {
    const gen = generation;
    const ticket = ++credentialTicket;
    loadingCredentials.value = true;
    try {
      const list = await api.get(credentialsUrl());
      if (disposed || gen !== generation || ticket !== credentialTicket) return;
      credentials.value = Array.isArray(list) ? list : [];
    } finally {
      if (!disposed && gen === generation && ticket === credentialTicket) loadingCredentials.value = false;
    }
  }

  async function loadChangesPage(offset, append) {
    const gen = generation;
    const ticket = ++changesTicket;
    loadingChanges.value = true;
    try {
      const payload = await api.get(changesUrl(offset));
      if (disposed || gen !== generation || ticket !== changesTicket) return;
      const rows = Array.isArray(payload?.changes) ? payload.changes : [];
      changes.value = append ? [...changes.value, ...rows] : rows;
      changesTotal.value = Number(payload?.total) || 0;
      changesHasMore.value = Boolean(payload?.has_more);
    } finally {
      if (!disposed && gen === generation && ticket === changesTicket) loadingChanges.value = false;
    }
  }

  async function loadChanges() {
    await loadChangesPage(0, false);
  }

  async function loadMoreChanges() {
    await loadChangesPage(changes.value.length, true);
  }

  async function loadChangeDetail(changeId) {
    const gen = generation;
    const ticket = ++detailTicket;
    loadingDetail.value = true;
    try {
      const detail = await api.get(changeDetailUrl(changeId));
      if (disposed || gen !== generation || ticket !== detailTicket) return null;
      selectedChange.value = detail;
      return detail;
    } finally {
      if (!disposed && gen === generation && ticket === detailTicket) loadingDetail.value = false;
    }
  }

  async function refresh() {
    await Promise.all([loadCredentials(), loadChanges()]);
  }

  async function issueCredential(payload) {
    const gen = generation;
    const requestedFor = projectId.value;
    const issued = await api.post(credentialsUrl(), payload);
    if (disposed || gen !== generation) {
      // 关闭/切换/卸载后到达的发放结果：一次性令牌就地丢弃
      return issued;
    }
    if (projectId.value === requestedFor) {
      issuedToken.value = issued?.token ?? null;
    }
    await loadCredentials();
    return issued;
  }

  async function revokeCredential(credentialId) {
    const gen = generation;
    await api.post(`/api/projects/${projectId.value}/agent-access/credentials/${credentialId}/revoke`);
    if (disposed || gen !== generation) return;
    await loadCredentials();
  }

  async function decideChange(changeId, proposalDigest, approve) {
    const payload = { proposal_digest: proposalDigest };
    if (approve) {
      await api.post(`/api/projects/${projectId.value}/agent-access/changes/${changeId}/approve`, payload);
    } else {
      await api.post(`/api/projects/${projectId.value}/agent-access/changes/${changeId}/reject`, payload);
    }
  }

  // 项目切换：作废全部在途响应，清空状态与一次性令牌
  watch(projectId, () => {
    invalidate();
    credentialTicket += 1;
    changesTicket += 1;
    detailTicket += 1;
    credentials.value = [];
    changes.value = [];
    changesTotal.value = 0;
    changesHasMore.value = false;
    selectedChange.value = null;
    clearIssuedToken();
  });

  onScopeDispose(() => {
    disposed = true;
    invalidate();
    clearIssuedToken();
  });

  return {
    credentials,
    changes,
    changesTotal,
    changesHasMore,
    loadingCredentials,
    loadingChanges,
    loadingDetail,
    issuedToken,
    selectedChange,
    invalidate,
    clearIssuedToken,
    clearSelectedChange,
    refresh,
    loadCredentials,
    loadChanges,
    loadMoreChanges,
    loadChangeDetail,
    issueCredential,
    revokeCredential,
    decideChange,
  };
}
