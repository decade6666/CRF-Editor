<script setup>
import { computed, ref, watch } from 'vue';
import DesignerWordPreview from './DesignerWordPreview.vue';
import { buildBaselineForms, buildBaselinePreview } from '../composables/designBaselinePreview.js';

const props = defineProps({
  snapshot: { type: Object, required: true },
  columnWidths: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['form-change']);
const selectedId = ref(null);
const viewMode = ref('eCRF');
const forms = computed(() => buildBaselineForms(props.snapshot));
watch(
  forms,
  (values) => {
    if (!values.some((form) => form.id === selectedId.value)) selectedId.value = values[0]?.id ?? null;
  },
  { immediate: true },
);
const form = computed(() => forms.value.find((row) => row.id === selectedId.value) || null);
watch(form, (value) => emit('form-change', value), { immediate: true });
const preview = computed(() => buildBaselinePreview(form.value, props.columnWidths));
</script>

<template>
  <section class="baseline-preview" aria-label="只读留档设计预览">
    <div class="preview-toolbar">
      <el-select v-model="selectedId" placeholder="选择预览表单" aria-label="留档预览表单">
        <el-option v-for="item in forms" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-segmented v-model="viewMode" :options="['eCRF', 'aCRF']" aria-label="留档预览模式" />
    </div>
    <p class="preview-note">
      只读设计结构预览；页眉、目录分页和完整排版请以保存的 Word 原件为准。不能在此编辑字段或拖动标注。
    </p>
    <div class="preview-scroll" tabindex="0" aria-label="可横向滚动的纸面预览">
      <DesignerWordPreview
        :selected-form="form"
        :groups-view="preview.groups"
        scope="main"
        :landscape-mode="preview.landscape"
        :no-fields="!form?.fields.length"
        :show-acrf-annotations="viewMode === 'aCRF'"
        :show-form-oid="true"
        v-bind="preview.handlers"
      />
    </div>
  </section>
</template>

<style scoped>
.baseline-preview {
  min-width: 0;
}
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.preview-toolbar .el-select {
  width: 260px;
  max-width: 100%;
}
.preview-note {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.preview-scroll {
  overflow: auto;
  max-height: 65vh;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-hover);
}
.preview-scroll :deep(.word-page) {
  max-width: none;
  margin: 12px;
}
.preview-scroll :deep(.resizer-handle),
.preview-scroll :deep(.row-resizer-handle),
.preview-scroll :deep(.snap-guide) {
  display: none;
}
</style>
