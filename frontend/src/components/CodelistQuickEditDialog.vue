<script setup>
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, truncRefs } from '../composables/useApi';
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

// 打开时按模式初始化（原 FieldsTab openQuickAddCodelist / openQuickEditCodelist 的
// 状态播种序列迁入此处）：add 清空并以 C.1 起始；edit 按 codelistId 从 codelists 回填。
// immediate 兼容「挂载时 modelValue 已为 true」的懒挂载用法。
watch(
  () => [props.modelValue, props.mode, props.codelistId],
  ([visible]) => {
    if (!visible) return;
    resetForm();
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

async function confirmAdd() {
  if (saving.value) return;
  const draft = validateForm();
  if (!draft) return;
  const opProjectId = props.projectId;
  saving.value = true;
  try {
    if (props.normalizeDraftBeforeSubmit) {
      // FormDesignerTab 原始序列：提交前写回裁剪/规范化后的值，POST 失败时弹窗内展示规范化值
      formName.value = draft.savedName;
      opts.value = draft.normalizedOptions.map((o) => ({ id: o.id, code: o.code, decode: o.decode }));
    }
    const created = await api.post(`/api/projects/${opProjectId}/codelists`, {
      name: draft.savedName,
      description: formDescription.value,
      options: draft.normalizedOptions.map((opt, index) => ({
        code: opt.code,
        decode: opt.decode,
        order_index: index + 1,
      })),
    });
    invalidateCodelistCaches(opProjectId);
    if (isOperationStale(opProjectId)) {
      closeDialog();
      return;
    }
    await props.afterChange('add', { codelist: created });
    closeDialog();
    // 关闭后再提示，保持 FieldsTab 原有的 close→toast 顺序
    if (props.addSuccessMessage) ElMessage.success(props.addSuccessMessage);
  } catch (e) {
    // 过期操作失败与 confirmSave 失败路径对齐：只报原始错误并关闭弹窗，不触发宿主刷新
    if (isOperationStale(opProjectId)) {
      ElMessage.error(e.message);
      closeDialog();
      return;
    }
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function confirmSave() {
  if (saving.value) return;
  const draft = validateForm();
  if (!draft) return;
  const opProjectId = props.projectId;
  const opCodelistId = props.codelistId;
  saving.value = true;
  try {
    const refs = await api.get(`/api/projects/${opProjectId}/codelists/${opCodelistId}/references`);
    if (refs.length) {
      const msg = truncRefs(refs.map((r) => `${r.form_name}(${r.form_code})-${r.field_label}(${r.field_var})`));
      await ElMessageBox.confirm(`修改将影响以下字段：\n${msg}\n确认修改？`, '影响提醒', { type: 'warning' });
    }
    await api.put(`/api/projects/${opProjectId}/codelists/${opCodelistId}/snapshot`, {
      name: draft.savedName,
      description: formDescription.value,
      options: draft.normalizedOptions.map((opt) => ({
        id: opt.id,
        code: opt.code,
        decode: opt.decode,
      })),
    });
    invalidateCodelistCaches(opProjectId);
    if (isOperationStale(opProjectId, opCodelistId)) {
      closeDialog();
      return;
    }
    await props.afterChange('save', { codelist: { id: opCodelistId } });
    closeDialog();
    ElMessage.success('保存成功');
  } catch (e) {
    if (e === 'cancel') return;
    invalidateCodelistCaches(opProjectId);
    // 过期操作的失败只提示原始错误；「已刷新为最新字典数据」仅适用于仍刷新宿主数据的路径
    if (isOperationStale(opProjectId, opCodelistId)) {
      ElMessage.error(e.message);
      closeDialog();
      return;
    }
    await props.afterChange('save', { codelist: { id: opCodelistId } });
    closeDialog();
    ElMessage.error(`保存失败：${e.message}。已刷新为最新字典数据，请重新检查后再编辑。`);
  } finally {
    saving.value = false;
  }
}

function onConfirm() {
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
