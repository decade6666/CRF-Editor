// DOM 环境冒烟测试（设计 D6.3）：证明 happy-dom + 全局 Element Plus 注册可以挂载
// el-table / el-select / el-tooltip 这些拆分任务依赖的重组件，且无需 DOM polyfill。
// 内联组件在渲染函数里用 resolveComponent 按全局注册名取组件，因此本用例同时验证 setup.js 的插件注册生效。
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref, resolveComponent } from 'vue';

const EnvironmentSmoke = defineComponent({
  setup() {
    const selected = ref('op1');
    const rows = [
      { code: 'A1', text: '甲一' },
      { code: 'A2', text: '乙二' },
    ];
    return () => {
      const elTable = resolveComponent('el-table');
      const elTableColumn = resolveComponent('el-table-column');
      const elSelect = resolveComponent('el-select');
      const elOption = resolveComponent('el-option');
      const elTooltip = resolveComponent('el-tooltip');
      return h('div', { class: 'env-smoke' }, [
        h(elTable, { data: rows }, () => [
          h(elTableColumn, { prop: 'code', label: '编码' }),
          h(elTableColumn, { prop: 'text', label: '文本' }),
        ]),
        h(
          elSelect,
          {
            modelValue: selected.value,
            'onUpdate:modelValue': (value) => {
              selected.value = value;
            },
            'data-test': 'env-smoke-select',
          },
          () => [h(elOption, { label: '选项一', value: 'op1' }), h(elOption, { label: '选项二', value: 'op2' })],
        ),
        h(elTooltip, { content: '提示文本' }, () =>
          h('button', { class: 'env-smoke-tooltip-trigger', type: 'button' }, '触发'),
        ),
      ]);
    };
  },
});

describe('Element Plus 挂载环境', () => {
  it('能挂载 el-table / el-select / el-tooltip 并渲染表格行与选中项', async () => {
    const wrapper = mount(EnvironmentSmoke);
    await flushPromises();

    const bodyRows = wrapper.findAll('.el-table__row');
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].text()).toContain('A1');
    expect(bodyRows[0].text()).toContain('甲一');
    expect(bodyRows[1].text()).toContain('A2');
    expect(bodyRows[1].text()).toContain('乙二');

    expect(wrapper.find('[data-test="env-smoke-select"]').text()).toContain('选项一');

    const trigger = wrapper.find('.env-smoke-tooltip-trigger');
    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toBe('触发');
  });
});
