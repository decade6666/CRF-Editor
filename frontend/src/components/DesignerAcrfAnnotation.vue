<script setup>
import { computed } from 'vue';

// aCRF 注释标记：展示单个注释，根元素一对一替换原先的内联 <span class="wp-acrf-annotation …">。
// 拖拽门禁、几何与持久化契约（cross-stack-contracts §6）都留在父组件；本组件只透传样式对象并上抛事件。
const props = defineProps({
  text: { type: String, required: true },
  kind: {
    type: String,
    required: true,
    validator: (value) => ['form', 'field', 'inline-header'].includes(value),
  },
  interactive: { type: Boolean, default: false },
  hasOverride: { type: Boolean, default: false },
  annotationStyle: { type: Object, required: true },
});

const emit = defineEmits(['pointerdown', 'reset']);

const resetAriaLabel = computed(() => (props.kind === 'form' ? '重置表单 domain 标注位置' : '重置字段标注位置'));
</script>

<template>
  <span
    :class="[
      'wp-acrf-annotation',
      kind === 'form' ? 'wp-acrf-annotation--form' : 'wp-acrf-annotation--field',
      { 'wp-acrf-annotation--inline-header': kind === 'inline-header' },
      { 'wp-acrf-annotation--interactive': interactive },
    ]"
    :style="annotationStyle"
    @pointerdown="emit('pointerdown', $event)"
  >
    <span class="wp-acrf-annotation__text">{{ text }}</span>
    <button
      type="button"
      class="wp-acrf-annotation-reset"
      :disabled="!hasOverride"
      :aria-label="resetAriaLabel"
      @pointerdown.stop
      @click.stop="emit('reset')"
    >
      R
    </button>
  </span>
</template>

<style scoped>
.wp-acrf-annotation {
  position: absolute;
  top: var(--acrf-annotation-top);
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--acrf-annotation-width);
  height: var(--acrf-annotation-height);
  max-width: min(var(--acrf-annotation-max-width), 100%);
  padding: var(--acrf-annotation-padding-y) var(--acrf-annotation-padding-x);
  box-sizing: border-box;
  border: var(--acrf-annotation-border-width) solid #c00000;
  border-radius: 2px;
  background: #fff2f2;
  color: #c00000;
  font-family: 'SimSun', serif;
  font-size: var(--acrf-annotation-font-size);
  font-weight: normal;
  white-space: nowrap;
  overflow: visible;
  user-select: none;
  touch-action: none;
  z-index: 3;
}

.wp-acrf-annotation__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wp-acrf-annotation--interactive {
  cursor: ns-resize;
}

.wp-acrf-annotation-reset {
  position: absolute;
  top: -8px;
  right: -8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #c00000;
  border-radius: 999px;
  background: #fff;
  color: #c00000;
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset {
  opacity: 1;
}

.wp-acrf-annotation-reset:hover:not(:disabled),
.wp-acrf-annotation-reset:focus-visible:not(:disabled) {
  background: #c00000;
  color: #fff;
  outline: none;
}

.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {
  opacity: 0.45;
}

.wp-acrf-annotation--inline-header {
  z-index: 4;
}
</style>
