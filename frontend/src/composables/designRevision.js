import { api } from './useApi.js';

export function designStateError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

export function cloneDesignState(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function requireDesignRevision(revision) {
  if (typeof revision !== 'string' || !revision) {
    throw designStateError('REVISION_UNAVAILABLE', '未收到设计版本，请刷新页面后重试；当前输入已保留');
  }
  return revision;
}

// 每个响应本身是物理快照；组合只能接纳同一个不透明标签，最多重读三轮。
// 这里只重试读取，绝不自动重试写入，也不在失败时把部分结果交给编辑器。
export async function readCoherentDesign(urls, { apiClient = api, cached = true, isCurrent = () => true } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const method = cached && attempt === 0 ? 'cachedGetWithMetadata' : 'getWithMetadata';
    const responses = await Promise.all(
      urls.map(async (url) => {
        try {
          return await apiClient[method](url);
        } catch (error) {
          if (!error.designReadUrl) error.designReadUrl = url;
          throw error;
        }
      }),
    );
    if (!isCurrent()) throw designStateError('CONTEXT_CHANGED', '编辑上下文已改变');
    const revision = requireDesignRevision(responses[0]?.revision);
    responses.forEach((response) => requireDesignRevision(response?.revision));
    if (responses.every((response) => response.revision === revision)) {
      // 返回独立副本：界面乐观修改/排序不能回写缓存，否则旧标签会配上被改过的内容。
      return { data: responses.map((response) => cloneDesignState(response.data)), revision };
    }
  }
  throw designStateError('INCOHERENT_DESIGN', '设计正在被其他操作更新，未加载混合版本；请稍后重试，当前输入已保留');
}

function checkContext(isCurrent, committed = false) {
  if (!isCurrent()) throw designStateError('CONTEXT_CHANGED', '编辑上下文已改变，未自动提交原输入', { committed });
}

// 一个冻结的命令、一个已加载的基线。STALE_STATE 之后必须重新读取、审阅、确认；
// 确认只授权一次对审阅标签的尝试。第三次写入仍回到审阅，不做隐式合并。
export async function executeDesignMutation({
  apiClient = api,
  method,
  url,
  body,
  baseline,
  readLatest,
  validateLatest,
  confirm,
  isCurrent = () => true,
  onAccepted,
  invalidate,
}) {
  const intent = cloneDesignState(body);
  const base = cloneDesignState(baseline?.data);
  let revision = requireDesignRevision(baseline?.revision);
  let before = base;
  let reviewed = false;
  for (;;) {
    checkContext(isCurrent);
    let result;
    try {
      const options = { revision, ...(invalidate ? { invalidate } : {}) };
      result =
        method === 'del'
          ? await apiClient.delWithMetadata(url, options)
          : await apiClient[`${method}WithMetadata`](url, cloneDesignState(intent), options);
    } catch (error) {
      if (error?.committed || error?.status !== 409 || error?.code !== 'STALE_STATE') throw error;
      checkContext(isCurrent);
      const latest = await readLatest();
      checkContext(isCurrent);
      requireDesignRevision(latest?.revision);
      validateLatest?.(latest.data, base, { baselineRevision: baseline.revision, latestRevision: latest.revision });
      await confirm({ base, local: cloneDesignState(intent), latest: latest.data, impact: latest.impact });
      checkContext(isCurrent);
      before = cloneDesignState(latest.data);
      revision = latest.revision;
      reviewed = true;
      continue;
    }
    checkContext(isCurrent, true);
    const accepted = { ...result, before, reviewed, baselineRevision: revision };
    onAccepted?.(accepted);
    return accepted;
  }
}

// 只读取服务端固定身份前缀作相等比较；revision 后缀不转数字、不用于计数，
// 任何写请求始终原样发送完整标签，绝不由客户端拼装 If-Match。
export function projectDesignIdentity(revision) {
  return typeof revision === 'string'
    ? (/^"(crf-design-v1:p[1-9][0-9]*:[0-9a-f]{32}):r[0-9]+"$/.exec(revision)?.[1] ?? null)
    : null;
}

export function assertSameProjectDesignIdentity(before, latest) {
  const identity = projectDesignIdentity(before);
  if (!identity || identity !== projectDesignIdentity(latest)) {
    throw designStateError(
      'TARGET_CHANGED',
      '原项目已被替换或无法验证项目身份，不能覆盖或重放旧命令；当前输入已保留，请重新载入设计',
    );
  }
}

// 同项目内删除后以相同 ID/OID/绑定重建的对象无法区分（2026-11-15 用户确认 C4 不新增持久实体身份）：
// 普通覆盖由冲突审阅展示最新内容并经明确确认把关；历史命令在版本变化后一律不重放。
export function assertSameDesignTarget(before, latest, { binding = false, oidKey } = {}) {
  if (
    !before ||
    !latest ||
    before.id !== latest.id ||
    (before.project_id != null && before.project_id !== latest.project_id) ||
    (binding && (before.form_id !== latest.form_id || before.field_definition_id !== latest.field_definition_id)) ||
    (oidKey && before[oidKey] !== latest[oidKey])
  ) {
    throw designStateError(
      'TARGET_CHANGED',
      '原目标已删除、更换绑定或更换标识，不能覆盖或自动重建；当前输入已保留，请重新选择目标',
    );
  }
}

// 本宿主自己已被接受的写入链（写入实际依据的标签 → 提交后的标签）。旧基线只有沿此链可达时，
// 才能换成同一宿主在链上更新版本的精确快照；外部写入不在链上，审阅后才接受的写入也不会连上更早的旧标签。
export function createOwnDesignChain(limit = 256) {
  const next = new Map();
  return {
    record(from, to) {
      if (!from || !to || from === to) return;
      next.delete(from);
      next.set(from, to);
      if (next.size > limit) next.delete(next.keys().next().value);
    },
    reaches(from, to) {
      let cursor = from;
      for (let steps = 0; cursor && steps <= next.size; steps += 1) {
        if (cursor === to) return true;
        cursor = next.get(cursor);
      }
      return false;
    },
    reset: () => next.clear(),
  };
}

const FORM_URL = /^\/api\/forms\/(\d+)$/;
const FORMS_COMMAND_URL = /^\/api\/projects\/\d+\/forms\/(reorder|batch-delete)$/;
const FIELDS_REORDER_URL = /^\/api\/forms\/(\d+)\/fields\/reorder$/;
const DEFINITIONS_REORDER_URL = /^\/api\/projects\/\d+\/field-definitions\/reorder$/;
const FIELD_COMMAND_URL =
  /^\/api\/(?:form-fields\/|forms\/\d+\/(?:fields|field-profile)\b|(?:projects\/\d+\/)?field-definitions\b)/;

const byOrder = (a, b) => a.order_index - b.order_index || a.id - b.id;

// 后端两阶段重排要求完整成员，并按请求顺序写回 1..n。
function reorderRows(rows, ids) {
  if (!Array.isArray(rows) || !Array.isArray(ids) || ids.length !== rows.length) return null;
  const position = new Map(ids.map((id, index) => [id, index + 1]));
  if (position.size !== ids.length || rows.some((row) => !position.has(row.id))) return null;
  return rows.map((row) => ({ ...row, order_index: position.get(row.id) })).sort(byOrder);
}

// 单删：其后序号前移一位；批删：剩余记录按 (序号, id) 压缩为 1..n。含 NULL 序号时服务端会先自愈，效果未知。
function removeRows(rows, ids, compactAll) {
  if (!Array.isArray(rows) || rows.some((row) => !Number.isInteger(row.order_index))) return null;
  const removed = rows.filter((row) => ids.includes(row.id));
  if (removed.length !== ids.length) return null;
  const kept = rows.filter((row) => !ids.includes(row.id)).sort(byOrder);
  if (compactAll) return kept.map((row, index) => ({ ...row, order_index: index + 1 }));
  const position = removed[0].order_index;
  return kept.map((row) => (row.order_index > position ? { ...row, order_index: row.order_index - 1 } : row));
}

function formsCommand(data, kind, { body, result }) {
  if (kind === 'reorder') return reorderRows(data.forms, body);
  const ids = body?.ids || [];
  if (result?.deleted !== ids.length || ids.includes(data.formId)) return null;
  return removeRows(data.forms, ids, true);
}

// 只对本宿主能精确推导的已接受写入返回提交后的数据；返回 null 表示效果未知（调用方不推进，宁可再审阅）。
// FormResponse 不含字段派生数据，所以字段/字段库命令不改变只含表单列表的快照。
export function applyOwnDesignWrite(data, { method, url, body, result } = {}) {
  if (!data) return null;
  const form = FORM_URL.exec(url || '');
  if (form && (method === 'put' || method === 'patch')) {
    if (result?.id !== Number(form[1]) || !Array.isArray(data.forms)) return null;
    return { ...data, forms: data.forms.map((item) => (item.id === result.id ? { ...item, ...result } : item)) };
  }
  if (form && method === 'del') {
    const forms = data.formId === Number(form[1]) ? null : removeRows(data.forms, [Number(form[1])], false);
    return forms ? { ...data, forms } : null;
  }
  const forms = FORMS_COMMAND_URL.exec(url || '');
  if (forms && method === 'post') {
    const next = formsCommand(data, forms[1], { body, result });
    return next ? { ...data, forms: next } : null;
  }
  const fieldsReorder = FIELDS_REORDER_URL.exec(url || '');
  if (fieldsReorder && data.fields) {
    const fields = data.formId === Number(fieldsReorder[1]) ? reorderRows(data.fields, body?.ordered_ids) : null;
    return fields ? { ...data, fields } : null;
  }
  if (DEFINITIONS_REORDER_URL.test(url || '') && data.definitions && !data.fields) {
    const definitions = reorderRows(data.definitions, body);
    return definitions ? { ...data, definitions } : null;
  }
  if (FIELD_COMMAND_URL.test(url || '')) return data.fields || data.definitions ? null : { ...data };
  return null;
}

// 只有恰好停在“该次写入实际依据标签”上的快照才可推进：此时服务端提交前状态就是该快照本身。
// 审阅后接受的写入依据的是审阅时读取的标签；旧快照不在该标签上，绝不借审阅数据整体刷新。
export function advanceOwnSnapshot(snapshot, accepted, command) {
  if (!snapshot?.data || !accepted?.revision || snapshot.revision !== accepted.baselineRevision) return snapshot;
  const data = applyOwnDesignWrite(snapshot.data, { ...command, result: accepted.data });
  return data ? { revision: accepted.revision, data } : snapshot;
}

// 编辑器/历史冻结的旧基线：只换成沿本宿主写入链可达的同项目（同表单）精确快照；外部变化不可达，仍走审阅。
export function upgradeOwnBaseline(baseline, candidates, chain) {
  if (!baseline?.revision) return baseline;
  const projectId = baseline.data?.projectId ?? null;
  const formId = baseline.data?.formId ?? null;
  for (const snapshot of candidates) {
    const data = snapshot?.data;
    if (!data || (projectId != null && data.projectId !== projectId)) continue;
    if (formId != null && data.formId != null && data.formId !== formId) continue;
    if (snapshot.revision === baseline.revision && baseline.data) return baseline;
    if (chain.reaches(baseline.revision, snapshot.revision)) return cloneDesignState(snapshot);
  }
  return baseline;
}

// F1 过渡证据：服务器证明的本页写入边（前标签→后标签）。两端都必须是同一项目身份的完整
// 合法标签，且确实前进；缺失/畸形/跨项目/未前进的证据一律不记（保守：下一次受保护写入照常审阅）。
export function isValidOwnTransition(projectId, transition) {
  const before = projectDesignIdentity(transition?.beforeRevision);
  const after = projectDesignIdentity(transition?.revision);
  if (!before || before !== after) return false;
  if (transition.beforeRevision === transition.revision) return false;
  const project = /^crf-design-v1:p(\d+):/.exec(after);
  return project !== null && Number(project[1]) === projectId;
}

export function recordOwnTransition(chain, projectId, transition) {
  if (!isValidOwnTransition(projectId, transition)) return false;
  chain.record(transition.beforeRevision, transition.revision);
  return true;
}

// 候选安装门槛：候选标签恰好是已确认的后标签，且旧宿主标签沿本页写入链可达（或已在同一标签）。
export function provenOwnCandidate(chain, { fromRevision, candidateRevision }) {
  if (!candidateRevision) return false;
  if (fromRevision === candidateRevision) return true;
  return Boolean(fromRevision) && chain.reaches(fromRevision, candidateRevision);
}
