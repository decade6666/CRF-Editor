// 本文件自测 ./vueWarnGate.js 的两条收集通道；每个用例自行调用 assertNoVueWarnings() 排空收集数组，
// 因此 setup.js 的 afterEach 门禁不会因本文件收集到的警告再次失败。
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { readonly } from 'vue';
import { assertNoVueWarnings } from './vueWarnGate.js';

describe('Vue 警告门禁', () => {
  it('el-select 挂载期间接管了 app.config.warnHandler，带组件实例的警告仍被收集并令用例失败', async () => {
    const Component = {
      props: { count: Number },
      template: '<el-select model-value="a"><el-option label="甲" value="a" /></el-select>',
    };
    const wrapper = mount(Component, { props: { count: 1 } });
    await wrapper.setProps({ count: 'not-a-number' });

    expect(() => assertNoVueWarnings()).toThrow(/Invalid prop: type check failed for prop "count"/);
  });

  it('无组件实例的 [Vue warn]（对 readonly 响应式对象赋值）经 console 通道收集', () => {
    const state = readonly({ value: 1 });
    state.value = 2;

    expect(() => assertNoVueWarnings()).toThrow(/target is readonly/);
  });
});
