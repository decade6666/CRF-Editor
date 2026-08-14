<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../composables/useApi';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  form: { type: Object, default: null },
  projectId: { type: Number, required: true },
});
const emit = defineEmits(['update:modelValue', 'saved']);

// 打开时复制当前已保存备注到独立草稿；取消/关闭完全丢弃草稿，不发请求。
const draft = ref('');
const saving = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) draft.value = props.form?.design_notes || '';
  },
);

function cancel() {
  draft.value = '';
  emit('update:modelValue', false);
}

async function save() {
  if (!props.form?.id || saving.value) return;
  saving.value = true;
  try {
    await api.put(`/api/forms/${props.form.id}`, { design_notes: draft.value });
    api.invalidateCache(`/api/projects/${props.projectId}/forms`);
    emit('saved', { formId: props.form.id, designNotes: draft.value });
    emit('update:modelValue', false);
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(`设计备注保存失败：${e.message}`);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="设计备注"
    width="520px"
    append-to-body
    :close-on-click-modal="false"
    data-test="design-notes-dialog"
    @update:model-value="cancel"
  >
    <el-input
      v-model="draft"
      type="textarea"
      :autosize="{ minRows: 6, maxRows: 14 }"
      placeholder="输入设计备注…"
      data-test="design-notes-input"
    />
    <template #footer>
      <el-button data-test="design-notes-cancel" @click="cancel">取消</el-button>
      <el-button type="primary" data-test="design-notes-save" :loading="saving" @click="save">确定</el-button>
    </template>
  </el-dialog>
</template>
