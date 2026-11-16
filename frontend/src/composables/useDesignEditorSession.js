import { onUnmounted } from 'vue';
import { getApiSessionGeneration } from './useApi.js';
import {
  assertSameDesignTarget,
  assertSameProjectDesignIdentity,
  cloneDesignState,
  designStateError,
  executeDesignMutation,
  readCoherentDesign,
} from './designRevision.js';
import { confirmDesignOverwrite } from './designConflictDialog.js';

function projectReads(projectId, formId, auxiliary) {
  const entries = [['forms', `/api/projects/${projectId}/forms`]];
  if (formId != null) entries.push(['fields', `/api/forms/${formId}/fields`]);
  if (auxiliary)
    entries.push(
      ['definitions', `/api/projects/${projectId}/field-definitions`],
      ['codelists', `/api/projects/${projectId}/codelists`],
      ['units', `/api/projects/${projectId}/units`],
    );
  return entries;
}

export async function readProjectDesign(
  projectId,
  { formId = null, auxiliary = false, cached = true, isCurrent } = {},
) {
  const entries = projectReads(projectId, formId, auxiliary);
  const result = await readCoherentDesign(
    entries.map(([, url]) => url),
    { cached, isCurrent },
  );
  return {
    revision: result.revision,
    data: {
      projectId,
      formId,
      ...Object.fromEntries(entries.map(([key], index) => [key, result.data[index]])),
    },
  };
}

function commandTargets(url, body, base) {
  const field = url.match(/^\/api\/form-fields\/(\d+)/);
  const definition = url.match(/^\/api\/(?:projects\/\d+\/)?field-definitions\/(\d+)/);
  const form = url.match(/^\/api\/forms\/(\d+)/);
  const collection =
    field || /\/forms\/\d+\/fields\//.test(url)
      ? 'fields'
      : url.includes('field-definitions')
        ? 'definitions'
        : 'forms';
  const fieldIds = field ? [Number(field[1])] : url.includes('/fields/batch-delete') ? [...(body?.ids || [])] : [];
  const formIds = form ? [Number(form[1])] : collection === 'forms' && body?.ids ? [...body.ids] : [];
  const definitionIds = definition
    ? [Number(definition[1])]
    : collection === 'definitions' && body?.ids
      ? [...body.ids]
      : [];
  const operation = body?.definition_operation;
  if (operation?.operation === 'update_shared') definitionIds.push(operation.update_shared.target_definition_id);
  if (body?.binding?.mode === 'existing') definitionIds.push(body.binding.target_field_definition_id);
  if (body?.field_definition_id != null) definitionIds.push(body.field_definition_id);
  for (const id of fieldIds) {
    const row = base.fields?.find((item) => item.id === id);
    if (row?.field_definition_id != null) definitionIds.push(row.field_definition_id);
  }
  return {
    collection,
    fieldIds,
    formIds,
    definitionIds: [...new Set(definitionIds.filter((id) => id != null))],
    reorder: url.endsWith('/reorder'),
  };
}

function findDefinition(snapshot, id) {
  return (
    snapshot.definitions?.find((item) => item.id === id) ||
    snapshot.fields?.find((item) => item.field_definition_id === id)?.field_definition
  );
}

function validateTargets(base, latest, targets) {
  if (base.projectId !== latest.projectId) throw designStateError('TARGET_CHANGED', '原项目已改变，当前输入已保留');
  for (const id of targets.formIds)
    assertSameDesignTarget(
      base.forms?.find((item) => item.id === id),
      latest.forms?.find((item) => item.id === id),
      { oidKey: 'code' },
    );
  for (const id of targets.fieldIds)
    assertSameDesignTarget(
      base.fields?.find((item) => item.id === id),
      latest.fields?.find((item) => item.id === id),
      { binding: true },
    );
  for (const id of targets.definitionIds)
    assertSameDesignTarget(findDefinition(base, id), findDefinition(latest, id), { oidKey: 'variable_name' });
  if (targets.reorder) {
    const collection = targets.collection;
    const beforeIds = (base[collection] || []).map((item) => item.id).sort((a, b) => a - b);
    const latestIds = (latest[collection] || []).map((item) => item.id).sort((a, b) => a - b);
    if (JSON.stringify(beforeIds) !== JSON.stringify(latestIds)) {
      throw designStateError('TARGET_CHANGED', '列表成员已改变，不能把旧排序用于新列表；原排序意图已保留，请重新排序');
    }
  }
}

function reviewState(snapshot, targets) {
  const selected = (key, ids) => (snapshot[key] || []).filter((item) => !ids.length || ids.includes(item.id));
  return {
    forms: targets.formIds.length || targets.collection === 'forms' ? selected('forms', targets.formIds) : undefined,
    fields: targets.fieldIds.length || snapshot.fields ? selected('fields', targets.fieldIds) : undefined,
    definitions: targets.definitionIds.length
      ? targets.definitionIds.map((id) => findDefinition(snapshot, id))
      : targets.collection === 'definitions'
        ? snapshot.definitions
        : undefined,
  };
}

// 每个宿主独立保留已加载快照。编辑器打开时另行 capture，后台/字典刷新不能升级其基线。
export function useDesignEditorSession({ getProjectId, getContext = () => null, isCurrent = () => true } = {}) {
  let loaded = null;
  let disposed = false;
  let lastAccepted = null;
  onUnmounted(() => {
    disposed = true;
  });

  function acceptLoaded(snapshot) {
    loaded = cloneDesignState(snapshot);
    return snapshot;
  }
  function capture() {
    return cloneDesignState(loaded);
  }
  function accepted() {
    return lastAccepted;
  }

  // detached：命令自带项目/基线（如排队的标注拖动），界面切走后仍按原基线提交一次；
  // 只有宿主仍停留在该目标（reviewable）时才允许冲突审阅，否则拒绝而不弹框。
  async function write(
    method,
    url,
    body,
    { baseline = capture(), onAccepted, invalidate, history = false, detached = false, reviewable, cancelText } = {},
  ) {
    const base = baseline?.data || {};
    const projectId = detached ? base.projectId : getProjectId();
    const session = getApiSessionGeneration();
    const context = getContext();
    const attached = () => !disposed && projectId === getProjectId() && context === getContext() && isCurrent();
    const current = () => session === getApiSessionGeneration() && (detached || attached());
    if (history && !baseline?.data)
      throw designStateError('HISTORY_CONTEXT_CHANGED', '操作已提交但尚未取得一致的新设计，请点击“重新载入设计”后继续');
    if (base.projectId !== projectId) throw designStateError('CONTEXT_CHANGED', '原项目已改变，未提交原命令');
    const targets = commandTargets(url, body, base);
    const result = await executeDesignMutation({
      method,
      url,
      body,
      baseline,
      invalidate,
      isCurrent: current,
      readLatest: async () => {
        const entries = projectReads(projectId, base.formId, Boolean(base.definitions));
        const referenceUrls = [
          ...targets.formIds.map((id) => `/api/forms/${id}/references`),
          ...targets.definitionIds.map((id) => `/api/field-definitions/${id}/references`),
        ];
        const latest = await readCoherentDesign([...entries.map(([, path]) => path), ...referenceUrls], {
          cached: false,
          isCurrent: current,
        });
        return {
          revision: latest.revision,
          data: {
            projectId,
            formId: base.formId,
            ...Object.fromEntries(entries.map(([key], index) => [key, latest.data[index]])),
          },
          impact: Object.fromEntries(referenceUrls.map((path, index) => [path, latest.data[entries.length + index]])),
        };
      },
      validateLatest: (latest, _base, { baselineRevision, latestRevision }) => {
        assertSameProjectDesignIdentity(baselineRevision, latestRevision);
        validateTargets(base, latest, targets);
      },
      confirm: async (review) => {
        if (detached && !(attached() && (reviewable?.() ?? true))) {
          throw designStateError(
            'DETACHED_STALE',
            '编辑位置已切换，期间设计已被其他编辑修改，本次未保存；请回到该表单核对后重新操作',
          );
        }
        await confirmDesignOverwrite({
          ...review,
          history,
          cancelText,
          base: reviewState(review.base, targets),
          latest: reviewState(review.latest, targets),
        });
        if (history)
          throw designStateError(
            'HISTORY_CONTEXT_CHANGED',
            '旧撤销/重做未执行；请核对后点击“重新载入设计”重建编辑上下文',
          );
      },
      onAccepted: (value) => {
        lastAccepted = value;
        onAccepted?.(value);
      },
    });
    return result.data;
  }

  return { acceptLoaded, capture, accepted, write };
}
