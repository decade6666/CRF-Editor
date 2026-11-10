// DocxCompareDialog 挂载测试：AI 复核移除后，Word 导入比较弹窗只剩「原始文档截图 + 确定性模拟预览」。
// 只替换外部截图边界（DocxScreenshotPanel，其轮询/图片加载不属本契约）；SimulatedCRFForm 用真实组件，
// 覆盖解析字段渲染、默认值归一化、列宽缓存回退、纸张方向与字段点击证据联动。
// 弹窗启用 append-to-body：内容经真实 teleport 渲染到 document.body，用 DOMWrapper(document.body) 查询。
import { describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import DocxCompareDialog from '../../src/components/DocxCompareDialog.vue';
import SimulatedCRFForm from '../../src/components/SimulatedCRFForm.vue';
import { computeFillLineCharCount, planNormalColumnFractions } from '../../src/composables/useCRFRenderer';
import { AVAILABLE_CM_LANDSCAPE, AVAILABLE_CM_PORTRAIT } from '../../src/composables/visitPreviewLandscape';

vi.mock('../../src/components/DocxScreenshotPanel.vue', async () => {
  const { h } = await import('vue');
  return {
    __esModule: true,
    default: {
      name: 'DocxScreenshotPanel',
      props: {
        tempId: { type: String, default: '' },
        projectId: { type: Number, default: 0 },
        formNames: { type: Array, default: () => [] },
        currentFormName: { type: String, default: '' },
        highlightedField: { type: Object, default: null },
        allFormsData: { type: Array, default: () => [] },
      },
      setup(props) {
        return () => h('div', { 'data-test': 'screenshot-stub', 'data-highlight': String(props.highlightedField !== null) });
      },
    },
  };
});

const TEMP_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

function makeFormData() {
  return {
    index: 0,
    name: '知情同意书',
    paper_orientation: 'auto',
    fields: [
      { index: 0, label: '姓名', field_type: '文本' },
      { index: 1, label: '签名日期', field_type: '日期', date_format: 'yyyy-MM-dd' },
      {
        index: 2,
        label: '是否同意',
        field_type: '单选',
        options: ['是', '否'],
      },
      { label: '日志行', field_type: '日志行', is_log_row: 1 },
      { index: 3, label: '备注', field_type: '标签' },
    ],
  };
}

async function mountCompare(formData = makeFormData()) {
  const wrapper = mount(DocxCompareDialog, {
    props: {
      modelValue: true,
      formData,
      tempId: TEMP_ID,
      projectId: 7,
      allFormNames: [formData.name],
      allFormsData: [formData],
    },
  });
  await flushPromises();
  const dialog = new DOMWrapper(document.body);
  return { wrapper, dialog };
}

describe('DocxCompareDialog', () => {
  it('渲染左右两个面板：原始文档截图与导入效果', async () => {
    const { dialog } = await mountCompare();

    const headers = dialog.findAll('.panel-header').map((node) => node.text());
    expect(headers).toEqual(['原始文档截图', '导入效果']);
    expect(dialog.find('[data-test="screenshot-stub"]').exists()).toBe(true);
    expect(dialog.find('.crf-form-wrap').exists()).toBe(true);
  });

  it('截图面板收到精确 temp-id、项目 id 与表单名，模拟预览收到字段与纸张方向', async () => {
    const formData = makeFormData();
    const { wrapper, dialog } = await mountCompare(formData);

    const screenshot = wrapper.findComponent({ name: 'DocxScreenshotPanel' });
    expect(screenshot.props('tempId')).toBe(TEMP_ID);
    expect(screenshot.props('projectId')).toBe(7);
    expect(screenshot.props('currentFormName')).toBe('知情同意书');
    expect(screenshot.props('allFormsData')).toHaveLength(1);

    const preview = wrapper.findComponent({ name: 'SimulatedCRFForm' });
    expect(preview.props('fields')).toEqual(formData.fields);
    expect(preview.props('paperOrientation')).toBe('auto');
    expect(dialog.find('.crf-form-wrap').exists()).toBe(true);
  });

  it('模拟预览行点击把字段转发给截图面板的 highlighted-field', async () => {
    const { wrapper, dialog } = await mountCompare();

    expect(dialog.find('[data-test="screenshot-stub"]').attributes('data-highlight')).toBe('false');
    await dialog.find('.crf-table tbody tr').trigger('click');
    await flushPromises();

    const screenshot = wrapper.findComponent({ name: 'DocxScreenshotPanel' });
    expect(screenshot.props('highlightedField')).toMatchObject({ label: '姓名' });
    expect(dialog.find('[data-test="screenshot-stub"]').attributes('data-highlight')).toBe('true');
  });

  it('点击关闭按钮向上抛出 update:modelValue=false', async () => {
    const { wrapper, dialog } = await mountCompare();

    const closeButton = dialog.findAll('button').find((node) => node.text().trim() === '关闭');
    expect(closeButton).toBeTruthy();
    await closeButton.trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('AI 复核移除后不再有任何建议卡片、接受控件或建议事件', async () => {
    const { dialog } = await mountCompare();

    // 全部经由 teleported 弹窗根（document.body）断言，而非组件挂载根。
    expect(dialog.text()).not.toContain('AI 复核');
    expect(dialog.text()).not.toContain('本表单全接受');
    expect(dialog.text()).not.toContain('AI 正在复核');
    expect(dialog.find('.ai-review-card').exists()).toBe(false);
    expect(dialog.findAll('.ai-suggestion-item')).toHaveLength(0);
    expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('遗留 ai_suggestions 数据形状不触发 AI 控件或建议事件，字段按解析类型原样渲染', async () => {
    // 旧版把建议挂在表单对象上：有建议即渲染 AI 复核卡片与接受控件，并在接受后展开替换类型。
    const formData = makeFormData();
    formData.ai_suggestions = [{ index: 2, suggested_type: '日期', reason: '识别为日期' }];
    const { wrapper, dialog } = await mountCompare(formData);

    expect(dialog.find('.ai-review-card').exists()).toBe(false);
    expect(dialog.text()).not.toContain('AI 复核');
    expect(dialog.text()).not.toContain('本表单全接受');
    expect(dialog.findAll('.ai-suggestion-item')).toHaveLength(0);

    // 模拟预览仅声明确定性渲染的 props：无 aiSuggestions / viewMode 通道，字段原样下传。
    const preview = wrapper.findComponent({ name: 'SimulatedCRFForm' });
    expect(Object.keys(preview.props()).sort()).toEqual(['availableCm', 'fields', 'formId', 'paperOrientation']);
    expect(preview.props('fields')).toEqual(formData.fields);

    // 建议指向的单选字段仍按解析类型渲染（○选项标记出现在控件列，而非被替换为日期格子）。
    const choiceControl = dialog.findAll('.crf-control-cell').find((cell) => cell.text().includes('○是'));
    expect(choiceControl).toBeTruthy();
    expect(choiceControl.text()).toContain('○否');
  });
});

describe('SimulatedCRFForm（确定性解析字段预览）', () => {
  it('普通字段按标签+控件两列渲染，填写线宽度来自可用宽度计算链', () => {
    const nameField = { index: 0, label: '姓名', field_type: '文本' };
    const wrapper = mount(SimulatedCRFForm, {
      props: {
        fields: [
          nameField,
          { index: 1, label: '体温', field_type: '数值', unit_symbol: '℃', integer_digits: 3, decimal_digits: 1 },
        ],
      },
    });

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('.crf-label-cell').text()).toBe('姓名');
    // 控件列与标签列隔离：填写线 span 的 min-width 由 columnCm → computeFillLineCharCount 推得。
    const fractions = planNormalColumnFractions([nameField]);
    const expectedMinEm = (computeFillLineCharCount(fractions[1] * AVAILABLE_CM_PORTRAIT) * 0.5).toFixed(1);
    const fillStyle = rows[0].find('.crf-control-cell .fill-line').attributes('style');
    expect(fillStyle).toContain(`min-width:${expectedMinEm}em`);
    expect(fillStyle).toContain('max-width:10.0em');
    expect(wrapper.findAll('colgroup col')).toHaveLength(2);
  });

  it('文本字段的默认值经归一化分支处理，控件仍渲染生成填写线', () => {
    // 默认值归一化发生在预览模型内（多行取首行）；该控件本身只渲染生成填写线。
    const wrapper = mount(SimulatedCRFForm, {
      props: {
        fields: [{ index: 0, label: '姓名', field_type: '文本', default_value: '张三\n第二行' }],
      },
    });

    const controlHtml = wrapper.find('.crf-control-cell').html();
    expect(controlHtml).toContain('fill-line');
    expect(controlHtml).not.toContain('第二行');
  });

  it('日志行与标签型字段各自跨两列渲染', () => {
    const wrapper = mount(SimulatedCRFForm, {
      props: {
        fields: [
          { label: '随访记录', field_type: '日志行', is_log_row: 1 },
          { index: 0, label: '段落标题', field_type: '标签' },
        ],
      },
    });

    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].find('.crf-log-row').exists()).toBe(true);
    expect(rows[1].find('.crf-label-only').exists()).toBe(true);
    expect(rows[1].find('.crf-label').text()).toBe('段落标题');
  });

  it('单选与复选的选项标记渲染在控件列，与标签列文本隔离', () => {
    const wrapper = mount(SimulatedCRFForm, {
      props: {
        fields: [
          { index: 0, label: '是否同意', field_type: '单选', options: ['是', '否'] },
          { index: 1, label: '确认项', field_type: '复选' },
        ],
      },
    });

    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].find('.crf-label-cell').text()).toBe('是否同意');
    const choiceControl = rows[0].find('.crf-control-cell');
    expect(choiceControl.text()).toContain('○是');
    expect(choiceControl.text()).toContain('○否');

    expect(rows[1].find('.crf-label-cell').text()).toBe('确认项');
    const checkboxControl = rows[1].find('.crf-control-cell');
    expect(checkboxControl.text()).toContain('□✔');
    expect(checkboxControl.text()).not.toContain('○');
  });

  it('字段行点击向上抛出字段对象', async () => {
    const field = { index: 0, label: '姓名', field_type: '文本' };
    const wrapper = mount(SimulatedCRFForm, { props: { fields: [field] } });

    await wrapper.find('tbody tr').trigger('click');

    expect(wrapper.emitted('field-click')).toEqual([[field]]);
  });

  it('无字段数据时展示空状态兜底', () => {
    const wrapper = mount(SimulatedCRFForm, { props: { fields: [] } });

    expect(wrapper.find('.empty-hint').text()).toBe('无字段数据');
  });

  it('宿主保存的列宽缓存优先生效（legacy 键回退路径）', () => {
    localStorage.setItem(`crf:designer:col-widths:88:0-normal-2`, JSON.stringify([0.3, 0.7]));
    try {
      const wrapper = mount(SimulatedCRFForm, {
        props: {
          formId: 88,
          fields: [{ index: 0, label: '姓名', field_type: '文本' }],
        },
      });

      const widths = wrapper.findAll('colgroup col').map((col) => col.attributes('style'));
      expect(widths[0]).toContain('30%');
      expect(widths[1]).toContain('70%');
    } finally {
      localStorage.clear();
    }
  });

  it('无缓存时按内容规划两列宽度', () => {
    localStorage.clear();
    const wrapper = mount(SimulatedCRFForm, {
      props: {
        formId: 99,
        fields: [{ index: 0, label: '姓名', field_type: '文本' }],
      },
    });

    expect(wrapper.findAll('colgroup col')).toHaveLength(2);
  });

  it('显式 availableCm 与横向纸张按各自可用宽度计算填写线 min-width', () => {
    const fields = [{ index: 0, label: '长文本字段', field_type: '文本' }];
    const explicit = mount(SimulatedCRFForm, {
      props: { fields, availableCm: 10 },
    });
    const landscape = mount(SimulatedCRFForm, {
      props: { fields, paperOrientation: 'landscape' },
    });

    // 与组件同一计算链：planNormalColumnFractions → columnCm → computeFillLineCharCount → min-width。
    const fractions = planNormalColumnFractions(fields);
    const explicitMin = (computeFillLineCharCount(fractions[1] * 10) * 0.5).toFixed(1);
    const landscapeMin = (computeFillLineCharCount(fractions[1] * AVAILABLE_CM_LANDSCAPE) * 0.5).toFixed(1);
    expect(Number(explicitMin)).toBeLessThan(Number(landscapeMin));

    expect(explicit.find('.crf-control-cell .fill-line').attributes('style')).toContain(`min-width:${explicitMin}em`);
    expect(landscape.find('.crf-control-cell .fill-line').attributes('style')).toContain(
      `min-width:${landscapeMin}em`,
    );
    expect(explicit.find('.crf-control-cell .fill-line').attributes('style')).not.toContain(
      `min-width:${landscapeMin}em`,
    );
  });
});
