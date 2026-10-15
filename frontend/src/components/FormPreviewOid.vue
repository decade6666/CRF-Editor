<script setup>
import { computed } from 'vue';
import { buildAnnotationStyle } from '../composables/acrfAnnotationGeometry.js';

// Word 预览纸面标题的表单 OID 元数据（任务 word-preview-form-oid / form-title-oid-style）：
// 只读展示纯 form.code 值；空值 / 纯空白不渲染任何元素。纯展示组件——无网络、无存储、无事件。
// 与 aCRF 的表单 domain 标注语义不同（domain 是数据集标注，code 是表单 OID）；
// 文字插值渲染（非 v-html），不参与 .wp-form-title 的原始名称文本。
const props = defineProps({
  code: { type: String, default: '' },
});

const displayCode = computed(() => String(props.code ?? '').trim());

// 红框装饰与字段 OID 注记共用同一份令牌（cross-stack §6）：仅取底色/内边距/边框宽度装饰变量，
// 不取定位与固定尺寸变量——标题徽章保持文档流内容尺寸布局，不是绝对定位的注记标记。
const decorationStyle = computed(() => {
  const annotationStyle = buildAnnotationStyle({ text: displayCode.value });
  return {
    '--acrf-annotation-background': annotationStyle['--acrf-annotation-background'],
    '--acrf-annotation-padding-x': annotationStyle['--acrf-annotation-padding-x'],
    '--acrf-annotation-padding-y': annotationStyle['--acrf-annotation-padding-y'],
    '--acrf-annotation-border-width': annotationStyle['--acrf-annotation-border-width'],
  };
});
</script>

<template>
  <span v-if="displayCode" class="wp-form-oid" :style="decorationStyle">{{ displayCode }}</span>
</template>

<style scoped>
/* 纸面元数据：与字段 OID 注记同源的红框——边框/文字 #c00000 不透明，底色 rgba 仅 25% 不透明；
   字面色不随应用主题反转（深色主题下白纸仍需可读）。圆角 2px 与注记一致。 */
.wp-form-oid {
  box-sizing: border-box;
  padding: var(--acrf-annotation-padding-y) var(--acrf-annotation-padding-x);
  border: var(--acrf-annotation-border-width) solid #c00000;
  border-radius: 2px;
  background: var(--acrf-annotation-background);
  color: #c00000;
  font-family: 'SimSun', serif;
  font-size: 10.5pt;
  /* 不设 white-space: nowrap——nowrap 会禁用软换行机会使 overflow-wrap 失效，
     超长 code 被 flex 压缩后将溢出绘制进右侧 4.8cm domain 保留区（R2.5）；
     短值本就一行放得下，长值由 overflow-wrap: anywhere 在可用区域内断行。 */
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
