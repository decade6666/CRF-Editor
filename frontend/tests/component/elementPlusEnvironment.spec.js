// DOM 环境冒烟测试（设计 D6.3）：证明 happy-dom + 全局 Element Plus 注册可以挂载
// el-table / el-select / el-tooltip；唯一语义补齐是 setup.js 的原生元素字符串身份，不模拟布局。
// 内联组件用 template 字符串书写：模板编译出的 slot 是编译时生成的，el-select 在渲染函数外读默认 slot 时
// 不再触发「Slot "default" invoked outside of the render function」警告（此前的 h() 函数式 slot 会触发，
// 而警告门禁已将任何 Vue 警告判为失败）；el-* 标签仍按全局注册名解析，本用例同时验证 setup.js 的插件注册生效。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const EnvironmentSmoke = defineComponent({
  setup() {
    const selected = ref('op1');
    const rows = [
      { code: 'A1', text: '甲一' },
      { code: 'A2', text: '乙二' },
    ];
    return { selected, rows };
  },
  template: `
    <div class="env-smoke">
      <el-table :data="rows">
        <el-table-column prop="code" label="编码" />
        <el-table-column prop="text" label="文本" />
      </el-table>
      <el-select v-model="selected" data-test="env-smoke-select">
        <el-option label="选项一" value="op1" />
        <el-option label="选项二" value="op2" />
      </el-select>
      <el-tooltip content="提示文本">
        <button class="env-smoke-tooltip-trigger" type="button">触发</button>
      </el-tooltip>
    </div>
  `,
});

describe('Element Plus 挂载环境', () => {
  it.each([['div', '[object HTMLDivElement]'], ['input', '[object HTMLInputElement]']])(
    '%s 的字符串转换与真实浏览器的元素身份一致', (tag, expected) => {
      const element = document.createElement(tag);
      expect(String(element)).toBe(expected);
    },
  );

  it('浮层定位读取元素身份不序列化子树，outerHTML 仍保留真实标记', () => {
    const element = document.createElement('div');
    element.innerHTML = '<span>保留的内容</span>';
    const serialize = vi.spyOn(element, 'outerHTML', 'get');
    expect(String(element)).toBe('[object HTMLDivElement]');
    expect(serialize).not.toHaveBeenCalled();
    expect(element.outerHTML).toBe('<div><span>保留的内容</span></div>');
  });

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
