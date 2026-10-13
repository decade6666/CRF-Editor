<script setup>
import { computed } from 'vue';

// Word 预览纸面标题的表单 OID 元数据（任务 word-preview-form-oid）：
// 只读展示 form.code；空值 / 纯空白不渲染任何元素。纯展示组件——无网络、无存储、无事件。
// 与 aCRF 的表单 domain 标注语义不同（domain 是数据集标注，code 是表单 OID）；
// 文字插值渲染（非 v-html），不参与 .wp-form-title 的原始名称文本。
const props = defineProps({
  code: { type: String, default: '' },
});

const displayCode = computed(() => String(props.code ?? '').trim());
</script>

<template>
  <span v-if="displayCode" class="wp-form-oid">OID: {{ displayCode }}</span>
</template>

<style scoped>
/* 纸面元数据：白纸上的深灰文字，不使用随应用主题反转的文字色变量（深色主题下白纸仍需可读）；
   与既有预览常量一致使用字面色（同 .wp-acrf-annotation 的 #c00000 模式）。 */
.wp-form-oid {
  color: #595959;
  font-family: 'SimSun', serif;
  font-size: 10.5pt;
  /* 不设 white-space: nowrap——nowrap 会禁用软换行机会使 overflow-wrap 失效，
     超长 code 被 flex 压缩后将溢出绘制进右侧 4.8cm domain 保留区（R2.5）；
     短值本就一行放得下，长值由 overflow-wrap: anywhere 在可用区域内断行。 */
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
