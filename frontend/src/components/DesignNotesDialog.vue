<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { api, getApiSessionGeneration } from '../composables/useApi';
import {
  assertSameDesignTarget,
  assertSameProjectDesignIdentity,
  cloneDesignState,
  executeDesignMutation,
  readCoherentDesign,
} from '../composables/designRevision.js';
import { confirmDesignOverwrite, isDesignCancellation } from '../composables/designConflictDialog.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  form: { type: Object, default: null },
  projectId: { type: Number, required: true },
  revision: { type: String, default: null },
});
const emit = defineEmits(['update:modelValue', 'saved']);

// 打开时复制当前已保存备注到独立草稿；取消/关闭完全丢弃草稿，不发请求。
const draft = ref('');
const saving = ref(false);
let generation = 0;
let baseline = null;

watch(
  () => [props.modelValue, props.form?.id, props.projectId],
  ([open]) => {
    generation++;
    if (open) {
      draft.value = props.form?.design_notes || '';
      baseline = { data: cloneDesignState(props.form), revision: props.revision };
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});

function cancel() {
  draft.value = '';
  emit('update:modelValue', false);
}

async function save() {
  if (!props.form?.id || saving.value) return;
  saving.value = true;
  const session = generation;
  const authSession = getApiSessionGeneration();
  const formId = props.form.id;
  const projectId = props.projectId;
  const designNotes = draft.value;
  const isCurrent = () => generation === session && authSession === getApiSessionGeneration();
  try {
    const result = await executeDesignMutation({
      method: 'put',
      url: `/api/forms/${formId}`,
      body: { design_notes: designNotes },
      baseline,
      isCurrent,
      confirm: confirmDesignOverwrite,
      readLatest: async () => {
        const latest = await readCoherentDesign(
          [`/api/projects/${projectId}/forms`, `/api/forms/${formId}/references`],
          { cached: false, isCurrent },
        );
        return {
          data: latest.data[0].find((form) => form.id === formId),
          revision: latest.revision,
          impact: latest.data[1],
        };
      },
      validateLatest: (latest, base, { baselineRevision, latestRevision }) => {
        assertSameProjectDesignIdentity(baselineRevision, latestRevision);
        assertSameDesignTarget(base, latest, { oidKey: 'code' });
      },
    });
    api.invalidateCache(`/api/projects/${projectId}/forms`);
    emit('saved', {
      formId,
      designNotes,
      form: result.data,
      revision: result.revision,
      baselineRevision: result.baselineRevision,
    });
    emit('update:modelValue', false);
    ElMessage.success('已保存');
  } catch (e) {
    if (isDesignCancellation(e)) return;
    ElMessage.error(e.committed ? '设计备注已提交，但刷新状态失败，请核对后再操作' : `设计备注保存失败：${e.message}`);
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
