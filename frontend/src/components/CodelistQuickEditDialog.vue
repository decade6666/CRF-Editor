<script setup>
import { ref, computed, watch, onScopeDispose } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, getApiSessionGeneration, truncRefs } from '../composables/useApi';
import { countDistinctForms } from '../composables/fieldReferenceImpact';
import { confirmDelete } from '../composables/projectDeleteConfirmation';

// FieldsTab / FormDesignerTab 共用的字典快捷增/改弹窗（shared-rule-convergence R3）。
// 表单状态、校验、引用确认与缓存失效（codelists + field-definitions）都在本组件内完成；
// 宿主通过 awaitable afterChange(kind, { codelist }) 承接刷新 / codelist_id 绑定 / 提示，
// 弹窗在 afterChange 完整 resolve 后才关闭（失败路径同样先刷新后关闭）。
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: Number, required: true },
  mode: {
    type: String,
    default: 'add',
    validator: (value) => ['add', 'edit'].includes(value),
  },
  codelistId: { type: Number, default: null },
  codelists: { type: Array, default: () => [] },
  addTitle: { type: String, default: '新增选项字典' },
  showCodeColumn: { type: Boolean, default: true },
  codePlaceholder: { type: String, default: '编码' },
  decodePlaceholder: { type: String, default: '标签' },
  // 提交前把裁剪后的名称/选项写回弹窗状态（FormDesignerTab 原始行为，参数化保留）：
  // true 时失败后弹窗回显规范化值；默认 false 保持字段库的原样回显。
  normalizeDraftBeforeSubmit: { type: Boolean, default: false },
  // 新增成功提示文案（FieldsTab 传入以保留其原有关闭后提示的顺序；空串 = 不提示，设计器保持静默）
  addSuccessMessage: { type: String, default: '' },
  afterChange: { type: Function, required: true },
});

const emit = defineEmits(['update:modelValue']);

const dialogTitle = computed(() => (props.mode === 'edit' ? '编辑选项字典' : props.addTitle));

const formName = ref('');
const formDescription = ref('');
const opts = ref([]);
const optCode = ref('');
const optDecode = ref('');
const saving = ref(false);

function resetForm() {
  formName.value = '';
  formDescription.value = '';
  opts.value = [];
  optCode.value = '';
  optDecode.value = '';
}

// 未添加选项提醒：确认时若标签框仍有未点击「添加」的内容，先征求用户意见再保存。
// 「返回编辑」、关闭或 Escape 都是普通用户决定：保留全部输入、不保存、不报错（无丢弃并保存动作）。
const PENDING_OPTION_TITLE = '未添加选项';
const PENDING_OPTION_MESSAGE = '有一项标签尚未点击“添加”，是否添加并保存？';
// dialogSession 每次打开递增：提醒未决期间弹窗关闭重开或切换目标后，迟到的决定一律失效；
// pendingReminderActive 独立于 saving——若复用 saving，confirmAdd/confirmSave 的在途守卫会直接 no-op。
// lastClosedSession 记录最近一次真实关闭（@close）时的会话：会话被替换但弹窗从未关闭（项目/
// 目标在途切换）属于同一弹窗实例，旧操作仍可静默收尾；关闭后重开则是新弹窗，旧收尾必须完全静默。
let dialogSession = 0;
let lastClosedSession = 0;
let pendingReminderActive = false;
// S1：编辑快照保存的在途登记（「项目:字典」目标键）。真实宿主用独立固定 edit 实例：保存
// 在途时关闭并以同目标重开，重开会话会播种宿主旧行（陈旧种子）；快照 PUT 整份替换名称/
// 描述/标签并删除未包含的选项，陈旧种子的再次提交会回退已提交数据。在途登记使该重开会话
// 保持提交忙锁定；旧保存完成仍触发宿主刷新/广播，并收尾关闭这个陈旧种子弹窗。
const pendingEditSaves = new Set();
const editSaveKey = (projectId, codelistId) => `${projectId}:${codelistId}`;

// 打开时按模式初始化（原 FieldsTab openQuickAddCodelist / openQuickEditCodelist 的
// 状态播种序列迁入此处）：add 清空并以 C.1 起始；edit 按 codelistId 从 codelists 回填。
// immediate 兼容「挂载时 modelValue 已为 true」的懒挂载用法。
// 重开即全新会话：释放上一轮的提交忙状态，迟到的旧收尾不得锁住新会话的按钮；唯一例外是
// 同目标编辑保存在途（S1）——此时重开播种的是陈旧种子，保持提交忙锁定直到在途保存收尾。
watch(
  () => [props.modelValue, props.mode, props.codelistId],
  ([visible]) => {
    if (!visible) {
      // 关闭即记为「本会话弹窗已真实关闭」：此后的重开属于新弹窗实例（模型值先于过渡
      // 事件变化，@close 在过渡后触发会漏记/晚记，happy-dom 下甚至不触发）。
      lastClosedSession = dialogSession;
      return;
    }
    resetForm();
    dialogSession += 1;
    saving.value =
      props.mode === 'edit' &&
      props.codelistId != null &&
      pendingEditSaves.has(editSaveKey(props.projectId, props.codelistId));
    if (props.mode === 'add') {
      optCode.value = 'C.1';
      return;
    }
    const cl = props.codelists.find((c) => c.id === props.codelistId);
    if (!cl) return;
    formName.value = cl.name;
    formDescription.value = cl.description || '';
    opts.value = (cl.options || []).map((o) => ({ id: o.id, code: o.code, decode: o.decode }));
    optCode.value = `C.${(cl.options || []).length + 1}`;
  },
  { immediate: true },
);

function addOptRow() {
  if (!optDecode.value.trim()) return ElMessage.warning('请输入标签');
  const n = opts.value.length;
  opts.value = [
    ...opts.value,
    {
      id: null,
      code: optCode.value.trim() || `C.${n + 1}`,
      decode: optDecode.value.trim(),
    },
  ];
  optCode.value = `C.${n + 2}`;
  optDecode.value = '';
}

async function delOptRow(idx) {
  try {
    await confirmDelete(ElMessageBox.confirm, { targetText: `选项 "${opts.value[idx]?.decode || idx + 1}"` });
    opts.value = opts.value.filter((_, i) => i !== idx);
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message);
  }
}

function closeDialog() {
  emit('update:modelValue', false);
}

function onDialogClose() {
  emit('update:modelValue', false);
  resetForm();
}

function normalizeQuickOptions(rows) {
  return rows.map((opt) => ({
    ...opt,
    code: String(opt.code ?? '').trim(),
    decode: String(opt.decode ?? '').trim(),
  }));
}

function validateForm() {
  const savedName = formName.value.trim();
  if (!savedName) {
    ElMessage.warning('请输入字典名称');
    return null;
  }
  const normalizedOptions = normalizeQuickOptions(opts.value);
  const invalidIdx = normalizedOptions.findIndex((opt) => !opt.code || !opt.decode);
  if (invalidIdx !== -1) {
    ElMessage.warning(`请完整填写第 ${invalidIdx + 1} 行的编码和值标签`);
    return null;
  }
  return { savedName, normalizedOptions };
}

// 字典写操作成功/失败后统一失效两份缓存，保证宿主 afterChange 的刷新拿到新数据
// （设计器快改后左侧字段库 30 秒旧数据的 R3 缺陷在此收口）。
// projectId 必须显式传入：await 期间 props 可能已切换，缓存失效必须落在写入所在的原项目。
function invalidateCodelistCaches(projectId) {
  api.invalidateCache(`/api/projects/${projectId}/codelists`);
  api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
}

// 一次提交固定其发起时的项目/字典上下文；await 期间 props 变化（如程序化切换项目）
// 视为操作过期：不再触发宿主 afterChange 与成功提示，只失效原项目缓存并关闭弹窗，
// 避免把旧项目的写入结果回绑或刷新进新项目。
function isOperationStale(opProjectId, opCodelistId) {
  return props.projectId !== opProjectId || (props.mode === 'edit' && props.codelistId !== opCodelistId);
}

// R2：一次新增固定其发起时的项目/弹窗会话/鉴权会话与卸载状态；POST 之后、宿主 afterChange
// 之后各重查一次。弹窗已被关闭重开（dialogSession 变化）或宿主已卸载时，迟到响应不再触发
// 宿主 afterChange、不再关闭新弹窗、不再弹成功提示；只失效原项目缓存（写入已提交不回滚）。
let disposed = false;
onScopeDispose(() => {
  disposed = true;
});

// CL-2：已提交创建 ≠ 刷新失败。POST 成功即记录 committedSession：之后的宿主刷新/读取
// 失败不再是「创建失败」，原会话弹窗一次性终态（关闭 + 唯一如实警告），关闭传播期间
// 重复确认也不会对同一会话发起第二次 POST；重开是全新会话，不是自动重试。
const COMMITTED_REFRESH_FAILED_MESSAGE = '字典已创建，但列表刷新失败，请刷新后核对，勿重复新增。';
const COMMITTED_NOT_VISIBLE_MESSAGE = '字典已创建，但当前列表尚未显示新字典，请刷新后核对，勿重复新增。';
let committedSession = null;

async function confirmAdd() {
  if (saving.value) return;
  if (committedSession === dialogSession) return;
  const draft = validateForm();
  if (!draft) return;
  const opProjectId = props.projectId;
  const opSession = dialogSession;
  const opAuthSession = getApiSessionGeneration();
  const operationCurrent = () =>
    !disposed &&
    props.modelValue === true &&
    props.projectId === opProjectId &&
    dialogSession === opSession &&
    getApiSessionGeneration() === opAuthSession;
  saving.value = true;
  try {
    if (props.normalizeDraftBeforeSubmit) {
      // FormDesignerTab 原始序列：提交前写回裁剪/规范化后的值，POST 失败时弹窗内展示规范化值
      formName.value = draft.savedName;
      opts.value = draft.normalizedOptions.map((o) => ({ id: o.id, code: o.code, decode: o.decode }));
    }
    // F1 过渡写入：响应体与服务器证明的前后标签一体返回；旧服务端缺失标签只是无链边。
    const created = await api.postWithTransitionMetadata(`/api/projects/${opProjectId}/codelists`, {
      name: draft.savedName,
      description: formDescription.value,
      options: draft.normalizedOptions.map((opt, index) => ({
        code: opt.code,
        decode: opt.decode,
        order_index: index + 1,
      })),
    });
    // 仅仍归属本会话的操作才记录提交标记：迟到的旧会话成功不得接管新会话的提交状态，
    // 否则新会话的已提交读取失败会被误判成创建失败、弹窗保持可再次提交（F1）。
    if (dialogSession === opSession) committedSession = opSession;
    invalidateCodelistCaches(opProjectId);
    if (!operationCurrent()) {
      // 迟到/失效响应不再管理弹窗：仅同会话（未被重开/替换）时才代表原操作收尾关闭。
      if (!disposed && dialogSession === opSession) closeDialog();
      return;
    }
    const outcome = await props.afterChange('add', {
      codelist: created.data,
      isCurrent: operationCurrent,
      transition: {
        projectId: opProjectId,
        beforeRevision: created.beforeRevision,
        revision: created.revision,
      },
    });
    if (!operationCurrent()) {
      // 迟到/失效响应不再管理弹窗：仅同会话（未被重开/替换）时才代表原操作收尾关闭。
      if (!disposed && dialogSession === opSession) closeDialog();
      return;
    }
    if (outcome?.status === 'cancelled') {
      // 宿主编辑器/选择/项目生命周期已结束：静默关闭仍归原操作所有的弹窗，无成功/失败提示。
      closeDialog();
      return;
    }
    if (outcome?.status === 'not-visible') {
      // 读取成功但新字典不在已验证列表里：不回绑、不假装创建失败，给唯一「尚未显示」提醒。
      closeDialog();
      ElMessage.warning(COMMITTED_NOT_VISIBLE_MESSAGE);
      return;
    }
    closeDialog();
    // 关闭后再提示，保持 FieldsTab 原有的 close→toast 顺序
    if (props.addSuccessMessage) ElMessage.success(props.addSuccessMessage);
  } catch (e) {
    if (committedSession === opSession) {
      // 已提交创建：宿主刷新/读取失败 ≠ 创建失败。仅原会话弹窗终态（关闭 + 唯一警告）；
      // 会话已被重开/替换或组件卸载时不再打扰新会话，仍归原操作所有的弹窗静默收尾。
      if (operationCurrent()) {
        closeDialog();
        ElMessage.warning(COMMITTED_REFRESH_FAILED_MESSAGE);
      } else if (!disposed && dialogSession === opSession && props.modelValue) {
        closeDialog();
      }
      return;
    }
    // 会话已被重开/替换、鉴权已变化或组件已卸载：迟到的 POST 失败不再弹旧错误、不动新会话。
    if (disposed || dialogSession !== opSession || getApiSessionGeneration() !== opAuthSession) return;
    // 过期操作失败与 confirmSave 失败路径对齐：只报原始错误并关闭弹窗，不触发宿主刷新
    if (isOperationStale(opProjectId)) {
      ElMessage.error(e.message);
      closeDialog();
      return;
    }
    ElMessage.error(e.message);
  } finally {
    // 每次提交只释放自己会话的忙状态：迟到的旧收尾不得解锁重开后的新会话按钮。
    if (dialogSession === opSession) saving.value = false;
  }
}

async function confirmSave() {
  if (saving.value) return;
  const draft = validateForm();
  if (!draft) return;
  const opProjectId = props.projectId;
  const opCodelistId = props.codelistId;
  const opSession = dialogSession;
  const opKey = editSaveKey(opProjectId, opCodelistId);
  // S2：描述与名称/选项一样在首个 await 之前定格——引用读在途期间同目标重开会把表单
  // 播种回宿主旧值，快照载荷必须携带最初提交的描述而非重开播种回的旧描述。
  const opDescription = formDescription.value;
  pendingEditSaves.add(opKey);
  saving.value = true;
  // 一次保存固定其发起时的弹窗会话与「项目:字典」目标。会话被替换时分三种归属：
  // - 弹窗从未真实关闭（项目/字典目标在途切换重播种同一弹窗）：沿用既有契约——成功静默
  //   关闭、失败报原始错误并关闭，均不回调宿主刷新。
  // - 弹窗已被真实关闭并重开为另一目标/模式（如编辑改为新增的混合模式）：重开的是新弹窗，
  //   迟到的旧编辑收尾完全静默——不刷新、不关闭、不报错、不解锁新会话的提交忙状态。
  // - 弹窗被真实关闭并以同一编辑目标重开（S1，真实宿主的固定 edit 实例）：重开播种的是
  //   陈旧种子（提交忙已被在途登记锁定）；已提交的编辑仍触发宿主刷新/广播，并收尾关闭
  //   这个陈旧种子弹窗（含成功提示），数据以已提交内容为准。
  const replaced = () => dialogSession !== opSession;
  const reopenedForAnotherTarget = () =>
    replaced() &&
    lastClosedSession >= opSession &&
    !(props.mode === 'edit' && props.projectId === opProjectId && props.codelistId === opCodelistId);
  try {
    const refs = await api.get(`/api/projects/${opProjectId}/codelists/${opCodelistId}/references`);
    // 影响提醒只在引用跨两个及以上表单时出现（与字段库 fieldReferenceImpact 同口径：同表单多字段/重复行合并计数）；
    // 单表单内任意多条引用直接保存。
    if (countDistinctForms(refs) > 1) {
      const msg = truncRefs(refs.map((r) => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`));
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
    }
    await api.put(`/api/projects/${opProjectId}/codelists/${opCodelistId}/snapshot`, {
      name: draft.savedName,
      description: opDescription,
      options: draft.normalizedOptions.map((opt) => ({
        id: opt.id,
        code: opt.code,
        decode: opt.decode,
      })),
    });
    invalidateCodelistCaches(opProjectId);
    if (reopenedForAnotherTarget()) return;
    if (isOperationStale(opProjectId, opCodelistId)) {
      closeDialog();
      return;
    }
    await props.afterChange('save', { codelist: { id: opCodelistId } });
    if (reopenedForAnotherTarget()) return;
    closeDialog();
    ElMessage.success('保存成功');
  } catch (e) {
    if (e === 'cancel') return;
    invalidateCodelistCaches(opProjectId);
    if (reopenedForAnotherTarget()) return;
    // 过期操作的失败只提示原始错误；「已刷新为最新字典数据」仅适用于仍刷新宿主数据的路径
    if (isOperationStale(opProjectId, opCodelistId)) {
      ElMessage.error(e.message);
      closeDialog();
      return;
    }
    await props.afterChange('save', { codelist: { id: opCodelistId } });
    if (reopenedForAnotherTarget()) return;
    closeDialog();
    ElMessage.error(`保存失败：${e.message}。已刷新为最新字典数据，请重新检查后再编辑。`);
  } finally {
    pendingEditSaves.delete(opKey);
    // 释放本会话的忙状态；同目标重开的会话（S1）在在途登记注销后一并解锁。其余情形：
    // 未重开的在途切换与另一目标重开的新会话忙状态由打开 watcher 自行计算，迟到的旧收尾
    // 不得越权解锁。
    if (!replaced() || !reopenedForAnotherTarget()) saving.value = false;
  }
}

// 确认入口：有待添加标签时先弹「未添加选项」提醒（先于引用查询/写入，也不绕过后续校验与影响提醒）。
async function onConfirm() {
  if (saving.value || pendingReminderActive) return;
  // 已提交创建的会话在终态收尾前不得再次提交（重复确定不会发起第二次 POST）。
  if (props.mode === 'add' && committedSession === dialogSession) return;
  if (optDecode.value.trim()) {
    // 校验失败只提示一次：这里先拦下并提示，confirmAdd/confirmSave 内部的二次校验静默通过
    if (!validateForm()) return;
    const opProjectId = props.projectId;
    const opMode = props.mode;
    const opCodelistId = props.codelistId;
    const session = dialogSession;
    pendingReminderActive = true;
    let accepted = false;
    try {
      await ElMessageBox.confirm(PENDING_OPTION_MESSAGE, PENDING_OPTION_TITLE, {
        type: 'warning',
        confirmButtonText: '添加并保存',
        cancelButtonText: '返回编辑',
      });
      accepted = true;
    } catch (e) {
      // 取消/关闭/Escape = 返回编辑：保留输入不保存，也不走保存失败的错误提示
      if (e !== 'cancel' && e !== 'close') ElMessage.error(e.message);
    } finally {
      pendingReminderActive = false;
    }
    if (!accepted) return;
    // 提醒未决期间弹窗关闭重开或项目/模式/字典目标已变化：迟到的决定对新上下文一律失效
    if (
      !props.modelValue ||
      props.projectId !== opProjectId ||
      props.mode !== opMode ||
      props.codelistId !== opCodelistId ||
      dialogSession !== session ||
      !optDecode.value.trim()
    ) {
      return;
    }
    addOptRow();
  }
  return props.mode === 'edit' ? confirmSave() : confirmAdd();
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @update:model-value="emit('update:modelValue', $event)"
    @close="onDialogClose"
  >
    <el-form label-width="80px" size="small">
      <el-form-item label="名称"><el-input v-model="formName" /></el-form-item>
      <el-form-item label="描述"
        ><el-input v-model="formDescription" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
      /></el-form-item>
    </el-form>
    <el-table :data="opts" size="small" border>
      <el-table-column v-if="showCodeColumn" prop="code" label="编码" width="120">
        <template #default="{ row }"><el-input v-model="row.code" size="small" /></template>
      </el-table-column>
      <el-table-column prop="decode" label="标签">
        <template #default="{ row }"><el-input v-model="row.decode" size="small" /></template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ $index }"
          ><el-button type="danger" size="small" link @click="delOptRow($index)">删除</el-button></template
        >
      </el-table-column>
    </el-table>
    <div data-test="codelist-option-add-row" style="margin-top: 8px; display: flex; gap: 6px">
      <el-input
        v-if="showCodeColumn"
        v-model="optCode"
        size="small"
        style="width: 100px"
        :placeholder="codePlaceholder"
      />
      <el-input v-model="optDecode" size="small" style="flex: 1" :placeholder="decodePlaceholder" />
      <el-button size="small" @click="addOptRow">添加</el-button>
    </div>
    <template #footer>
      <el-button :disabled="saving" @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>
