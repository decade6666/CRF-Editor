// FormPreviewOid 挂载测试（任务 word-preview-form-oid）：
// Word 预览纸面标题的表单 OID 元数据——只读展示 form.code，空值不渲染，文字插值（非 v-html）。
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FormPreviewOid from '../../src/components/FormPreviewOid.vue';

function mountOid(props = {}) {
  return mount(FormPreviewOid, { props: { code: 'F-001', ...props } });
}

describe('FormPreviewOid', () => {
  it('渲染 OID: 前缀与 code 文本', () => {
    const wrapper = mountOid();

    expect(wrapper.find('span.wp-form-oid').exists()).toBe(true);
    expect(wrapper.find('span.wp-form-oid').text()).toBe('OID: F-001');
  });

  it('空字符串 / 纯空白 / null / undefined 不渲染任何元素', () => {
    expect(mountOid({ code: '' }).find('span.wp-form-oid').exists()).toBe(false);
    expect(mountOid({ code: '   ' }).find('span.wp-form-oid').exists()).toBe(false);
    expect(mountOid({ code: null }).find('span.wp-form-oid').exists()).toBe(false);
    expect(mountOid({ code: undefined }).find('span.wp-form-oid').exists()).toBe(false);
  });

  it('HTML 形输入按字面文本渲染，不产生子元素（禁 v-html 契约）', () => {
    const wrapper = mountOid({ code: '<b>x</b>' });

    expect(wrapper.find('span.wp-form-oid').text()).toBe('OID: <b>x</b>');
    expect(wrapper.find('span.wp-form-oid').find('b').exists()).toBe(false);
  });

  it('code 首尾空白修剪后展示，不改传入值结构', () => {
    expect(mountOid({ code: '  F9  ' }).find('span.wp-form-oid').text()).toBe('OID: F9');
  });

  it('长 code 仍为单一 span 结构（换行由宿主标题行布局负责）', () => {
    const wrapper = mountOid({ code: 'A'.repeat(80) });

    expect(wrapper.find('span.wp-form-oid').classes()).toEqual(['wp-form-oid']);
  });
});
