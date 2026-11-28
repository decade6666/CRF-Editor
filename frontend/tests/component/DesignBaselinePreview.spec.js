import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ElSegmented, ElSelect } from 'element-plus';
import DesignBaselinePreview from '../../src/components/DesignBaselinePreview.vue';
import {
  baselineTables,
  buildBaselineForms,
  columnWeightsToOverrides,
} from '../../src/composables/designBaselinePreview.js';
import { buildAnnotationStyle } from '../../src/composables/acrfAnnotationGeometry.js';
import { computeFillLineCharCount } from '../../src/composables/useCRFRenderer.js';
import { AVAILABLE_CM_PORTRAIT } from '../../src/composables/visitPreviewLandscape.js';

function snapshot() {
  return {
    schema_version: 1,
    project: { id: 1, name: '冻结项目' },
    asset_references: { company_logo: null },
    tables: {
      form: [
        { id: 2, name: '空表单', code: 'EMPTY', order_index: 2, annotation_positions: null },
        {
          id: 1,
          name: '冻结表单',
          code: 'legacy.lower',
          domain: ' Lb ',
          order_index: 1,
          paper_orientation: 'portrait',
          annotation_positions: '{"_form":{"y":20},"Legacy.lower":{"y":30}}',
        },
      ],
      form_field: [
        { id: 14, form_id: 1, field_definition_id: 4, order_index: 4, inline_mark: 1, default_value: null },
        { id: 12, form_id: 1, field_definition_id: 2, order_index: 2, inline_mark: 0, default_value: null },
        { id: 11, form_id: 1, field_definition_id: 1, order_index: 1, inline_mark: 0, default_value: null },
        { id: 13, form_id: 1, field_definition_id: 3, order_index: 3, inline_mark: 1, default_value: '甲\n乙' },
      ],
      field_definition: [
        { id: 1, field_type: '文本', variable_name: 'Legacy.lower', label: '<固定字段>', unit_id: 41 },
        { id: 2, field_type: '标签', variable_name: 'LABEL', label: '静态说明' },
        { id: 3, field_type: '文本', variable_name: 'INLINE_A', label: '多行默认值' },
        { id: 4, field_type: '单选', variable_name: 'INLINE_B', label: '选项', codelist_id: 31 },
      ],
      codelist: [
        { id: 31, name: '选择字典' },
        { id: 32, name: '未放置字典' },
      ],
      codelist_option: [
        { id: 312, codelist_id: 31, order_index: 2, code: 'N', decode: '否' },
        { id: 311, codelist_id: 31, order_index: 1, code: 'Y', decode: '是' },
      ],
      unit: [{ id: 41, symbol: 'kg' }],
      field: [],
      visit: [],
      visit_form: [],
    },
  };
}

async function selectForm(wrapper, id) {
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', id);
  await flushPromises();
}

async function acrf(wrapper) {
  wrapper.findComponent(ElSegmented).vm.$emit('update:modelValue', 'aCRF');
  await flushPromises();
}

describe('正式留档共享只读预览', () => {
  it('正常表单填写线按实际列宽和共享预览回调签名计算', () => {
    const source = snapshot();
    const table = baselineTables(buildBaselineForms(source)[0]).find((item) => item.kind === 'normal');
    const wrapper = mount(DesignBaselinePreview, {
      props: { snapshot: source, columnWidths: { [table.key]: [0.8, 0.2] } },
    });
    const row = wrapper.findAll('tr').find((item) => item.text().includes('<固定字段>'));
    expect(row.find('.fill-line').element.style.minWidth).toBe(
      `${(computeFillLineCharCount(AVAILABLE_CM_PORTRAIT * 0.2) * 0.5).toFixed(1)}em`,
    );
  });

  it('冻结字典单位和横向多行默认值通过共享渲染器显示且源数据不变', () => {
    const source = snapshot();
    const before = JSON.stringify(source);
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: source } });
    expect(wrapper.find('.wp-form-title').text()).toBe('冻结表单');
    expect(wrapper.text()).toContain('legacy.lower');
    expect(wrapper.text()).toContain('<固定字段>');
    expect(wrapper.text()).toContain('kg');
    expect(wrapper.find('.inline-table').text()).toContain('甲');
    expect(wrapper.find('.inline-table').text()).toContain('乙');
    expect(wrapper.find('.inline-table').text()).toContain('是');
    expect(wrapper.find('固定字段').exists()).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('aCRF 使用冻结偏移且不允许拖动、重置或双击修改', async () => {
    const source = snapshot();
    const before = JSON.stringify(source);
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: source } });
    await acrf(wrapper);
    const annotation = wrapper
      .findAll('.wp-acrf-annotation--field')
      .find((item) => item.find('.wp-acrf-annotation__text').text() === 'Legacy.lower');
    expect(annotation.element.style.getPropertyValue('--acrf-annotation-top')).toBe(
      buildAnnotationStyle({ text: 'Legacy.lower', kind: 'field', deltaY01cm: 30 })['--acrf-annotation-top'],
    );
    expect(wrapper.find('.wp-acrf-annotation--form .wp-acrf-annotation__text').text()).toBe('Lb');
    expect(wrapper.find('.wp-acrf-annotation--inline-header').exists()).toBe(true);
    expect(wrapper.findAll('.wp-acrf-annotation-reset').every((button) => button.element.disabled)).toBe(true);
    await annotation.trigger('pointerdown');
    await wrapper.find('tr').trigger('dblclick');
    await wrapper.find('.resizer-handle').trigger('pointerdown');
    expect(JSON.stringify(source)).toBe(before);
    expect(wrapper.emitted('update:snapshot')).toBeUndefined();
  });

  it('切换空表单和普通表单会发布当前选择并显示对应只读内容', async () => {
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: snapshot() } });
    await selectForm(wrapper, 2);
    expect(wrapper.find('.wp-form-title').text()).toBe('空表单');
    expect(wrapper.text()).toContain('暂无字段');
    expect(wrapper.emitted('form-change').at(-1)[0].id).toBe(2);
    await selectForm(wrapper, 1);
    expect(wrapper.find('.wp-form-title').text()).toBe('冻结表单');
    expect(wrapper.emitted('form-change').at(-1)[0].id).toBe(1);
  });

  it('更换冻结设计时保留仍存在的选择，已移除的表单才回退到首项', async () => {
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: snapshot() } });
    await selectForm(wrapper, 2);
    const updated = snapshot();
    updated.tables.form[0].name = '更新后的空表单';
    await wrapper.setProps({ snapshot: updated });
    expect(wrapper.find('.wp-form-title').text()).toBe('更新后的空表单');
    await wrapper.setProps({
      snapshot: { ...updated, tables: { ...updated.tables, form: updated.tables.form.slice(1) } },
    });
    expect(wrapper.find('.wp-form-title').text()).toBe('冻结表单');
  });

  it('没有排序号的冻结表单不会抢先显示于已排序表单之前', () => {
    const source = snapshot();
    source.tables.form.unshift({ id: 9, name: '未排序表单', order_index: null, annotation_positions: null });
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: source } });
    expect(wrapper.find('.wp-form-title').text()).toBe('冻结表单');
    expect(wrapper.emitted('form-change')[0][0].id).toBe(1);
    expect(source.tables.form[0].order_index).toBe(null);
  });

  it('无表单的完整空设计显示明确占位而非虚构表单或字段', () => {
    const source = snapshot();
    source.tables.form = [];
    source.tables.form_field = [];
    const wrapper = mount(DesignBaselinePreview, { props: { snapshot: source } });
    expect(wrapper.find('.wp-form-title').exists()).toBe(false);
    expect(wrapper.text()).toContain('请选择表单');
    expect(wrapper.emitted('form-change')).toEqual([[null]]);
  });

  it('列宽空值和总和溢出会拒绝而不是生成失真的版式', () => {
    expect(() => columnWeightsToOverrides({ table: [null, 2] })).toThrow('列宽必须为正数');
    expect(() => columnWeightsToOverrides({ table: [Number.MAX_VALUE, Number.MAX_VALUE] })).toThrow('列宽超出范围');
  });

  it('未知快照格式在适配边界被拒绝而不是隐式显示', () => {
    expect(() => buildBaselineForms(null)).toThrow('不支持');
    expect(() => buildBaselineForms({ ...snapshot(), schema_version: 99 })).toThrow('不支持');
  });
});
