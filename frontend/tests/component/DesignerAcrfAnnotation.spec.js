// DesignerAcrfAnnotation 挂载测试（designer-split Step 1，设计 §2.2 / §5.2）：
// aCRF 注释标记从 FormDesignerTab 抽出后的 DOM 契约——类名与顺序、:style 透传、文本、
// aria-label、disabled 来源，以及 pointerdown / reset 事件的发送语义（门禁留在父组件）。
// 事件断言用父级传入的 spy（onPointerdown / onReset），而非仅 wrapper.emitted：只有父级 spy 才能
// 捕获「声明式 emit + 移除声明后的原生 fall-through 监听」双触发，wrapper.emitted 看不到后者。
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DesignerAcrfAnnotation from '../../src/components/DesignerAcrfAnnotation.vue';
import { buildAnnotationStyle } from '../../src/composables/acrfAnnotationGeometry.js';

// 与父组件一致：父组件用 getAnnotationStyle 产出该对象并整体透传，这里直接用几何模块构造，
// 断言只比较透传结果与构造结果是否一致，不重复硬编码几何数值。
function annotationStyle(text = 'LBTESTCD', kind = 'field', deltaY01cm = 0) {
  return buildAnnotationStyle({ text, kind, deltaY01cm });
}

function mountAnnotation(props = {}) {
  return mount(DesignerAcrfAnnotation, {
    props: {
      text: 'LBTESTCD',
      kind: 'field',
      interactive: false,
      hasOverride: false,
      annotationStyle: annotationStyle(),
      ...props,
    },
  });
}

function root(wrapper) {
  return wrapper.find('span.wp-acrf-annotation');
}

function resetButton(wrapper) {
  return wrapper.find('button.wp-acrf-annotation-reset');
}

async function mountWithParentSpies(props = {}) {
  const onPointerdown = vi.fn();
  const onReset = vi.fn();
  const wrapper = mountAnnotation({ onPointerdown, onReset, ...props });
  return { wrapper, onPointerdown, onReset };
}

describe('DesignerAcrfAnnotation', () => {
  it('表单级注释类名顺序为 base → --form → --interactive，并把 style 对象原样透传到根元素', () => {
    const style = annotationStyle('LB', 'form', 0);
    const wrapper = mountAnnotation({
      text: 'LB',
      kind: 'form',
      interactive: true,
      annotationStyle: style,
    });

    expect(root(wrapper).classes()).toEqual([
      'wp-acrf-annotation',
      'wp-acrf-annotation--form',
      'wp-acrf-annotation--interactive',
    ]);
    expect(root(wrapper).element.style.getPropertyValue('--acrf-annotation-top')).toBe(style['--acrf-annotation-top']);
    expect(root(wrapper).element.style.getPropertyValue('--acrf-annotation-width')).toBe(
      style['--acrf-annotation-width'],
    );
    // 底色半透明变量随样式对象整体透传；组件 CSS 只把它用在 background 上（见 designerPreviewSplit 源守卫）。
    expect(root(wrapper).element.style.getPropertyValue('--acrf-annotation-background')).toBe(
      style['--acrf-annotation-background'],
    );
  });

  it('字段级注释只带 --field，interactive=false 时不出现 --interactive', () => {
    const wrapper = mountAnnotation({ kind: 'field', interactive: false });

    expect(root(wrapper).classes()).toEqual(['wp-acrf-annotation', 'wp-acrf-annotation--field']);
  });

  it('inline-header 注释类名顺序为 base → --field → --inline-header', () => {
    const wrapper = mountAnnotation({ kind: 'inline-header' });

    expect(root(wrapper).classes()).toEqual([
      'wp-acrf-annotation',
      'wp-acrf-annotation--field',
      'wp-acrf-annotation--inline-header',
    ]);
  });

  it('注释文本渲染在 __text 元素内', () => {
    const wrapper = mountAnnotation({ text: 'LBTESTCD' });

    expect(root(wrapper).find('.wp-acrf-annotation__text').text()).toBe('LBTESTCD');
  });

  it('表单级注释 aria-label 为「重置表单 domain 标注位置」，字段/表头为「重置字段标注位置」', () => {
    const formWrapper = mountAnnotation({ kind: 'form' });
    const fieldWrapper = mountAnnotation({ kind: 'field' });
    const inlineWrapper = mountAnnotation({ kind: 'inline-header' });

    expect(resetButton(formWrapper).attributes('aria-label')).toBe('重置表单 domain 标注位置');
    expect(resetButton(fieldWrapper).attributes('aria-label')).toBe('重置字段标注位置');
    expect(resetButton(inlineWrapper).attributes('aria-label')).toBe('重置字段标注位置');
  });

  it('重置按钮 disabled 由 hasOverride 决定', () => {
    const withoutOverride = mountAnnotation({ hasOverride: false });
    const withOverride = mountAnnotation({ hasOverride: true });

    expect(resetButton(withoutOverride).attributes('disabled')).toBeDefined();
    expect(resetButton(withOverride).attributes('disabled')).toBeUndefined();
  });

  it('根元素 pointerdown 无条件上抛：父级 spy 恰调用一次并收到同一原生事件（拖拽门禁只在父组件复检）', async () => {
    const { wrapper, onPointerdown, onReset } = await mountWithParentSpies({ interactive: false });

    await root(wrapper).trigger('pointerdown');

    expect(onPointerdown).toHaveBeenCalledTimes(1);
    const received = onPointerdown.mock.calls[0][0];
    expect(received.type).toBe('pointerdown');
    expect(received.target).toBe(root(wrapper).element);
    expect(onReset).not.toHaveBeenCalled();
    // 与声明式 emit 交叉核对：wrapper.emitted 与父级 spy 一致，均为一次。
    expect(wrapper.emitted('pointerdown')).toHaveLength(1);
  });

  it('重置按钮上的 pointerdown 不冒泡到父级 pointerdown spy，点击只触发一次 onReset', async () => {
    const { wrapper, onPointerdown, onReset } = await mountWithParentSpies({ hasOverride: true });

    await resetButton(wrapper).trigger('pointerdown');
    expect(onPointerdown).not.toHaveBeenCalled();

    await resetButton(wrapper).trigger('click');
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onPointerdown).not.toHaveBeenCalled();
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });
});
