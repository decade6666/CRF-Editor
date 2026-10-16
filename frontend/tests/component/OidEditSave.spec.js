// 【组件挂载回归 · 赛美斯手工 OID 长度限制】任务 10-16-saimosi-oid-limit
//
// 真实挂载 FieldsTab / FormDesignerTab，钉住编辑保存契约：
// 仅「赛美斯」项目下，人工改动的字段 OID（≤8）/ 表单 OID（≤10）超长时拒绝保存，
// 未改动的系统自动值 / 历史值 / 复制默认值豁免；拒绝时不发任何写请求或引用查询。
// 纯策略取值矩阵见 tests/oidEditLengthPolicy.test.js；本文件证明各保存面接线。
//
// 用法：npx vitest run tests/component/OidEditSave.spec.js
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import FieldsTab from '../../src/components/FieldsTab.vue';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';

// 两侧宿主都经 useSortableTable 使用 SortableJS；happy-dom 下无可拖拽布局。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const FIELD_LENGTH_ERROR = '赛美斯数据库的字段 OID 最多为 8 位';
const FORM_LENGTH_ERROR = '赛美斯数据库的表单 OID 最多为 10 位';
const PROJECT_ID = 1;
const FORM_ID = 7;

function makeDefinition(id, variableName, label, extra = {}) {
  return {
    id,
    project_id: PROJECT_ID,
    variable_name: variableName,
    label,
    field_type: '文本',
    checkbox_label: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    codelist_id: null,
    unit_id: null,
    is_multi_record: 0,
    table_type: '固定行',
    order_index: 1,
    codelist: null,
    unit: null,
    ...extra,
  };
}

async function setInputValue(input, value) {
  await input.setValue(value);
  await nextTick();
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((node) => node.text().trim() === text);
}

function buttonByAriaLabel(wrapper, label) {
  return wrapper.findAll('button').find((node) => node.attributes('aria-label') === label);
}

function formItemInputByLabel(scope, labelText) {
  const item = scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === labelText);
  return item ? item.find('input') : null;
}

// el-input / el-autocomplete 的 data-test 经 attrs 透传落在内层 <input> 本身，直接按该属性取输入。
function inputByTestData(scope, testId) {
  const node = scope.find(`[data-test="${testId}"]`);
  expect(node.exists(), `应存在 data-test=${testId} 的输入`).toBe(true);
  return node;
}

describe('FieldsTab 字段库（赛美斯手工 OID 长度限制）', () => {
  const FIELDS_URL = `/api/projects/${PROJECT_ID}/field-definitions`;

  function stageFieldsApi(definitions) {
    const posts = [];
    const puts = [];
    const gets = [];
    vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
      if (url === FIELDS_URL) return Promise.resolve(definitions);
      return Promise.resolve([]);
    });
    vi.spyOn(api, 'get').mockImplementation((url) => {
      gets.push(url);
      return Promise.resolve([]);
    });
    vi.spyOn(api, 'post').mockImplementation((url, body) => {
      posts.push([url, body]);
      return Promise.resolve({ id: 99 });
    });
    vi.spyOn(api, 'put').mockImplementation((url, body) => {
      puts.push([url, body]);
      return Promise.resolve({});
    });
    return { posts, puts, gets };
  }

  async function mountFieldsTab(dbType = '赛美斯') {
    const wrapper = mount(FieldsTab, {
      props: { projectId: PROJECT_ID },
      global: {
        provide: { refreshKey: ref(0), editMode: ref(true), projectDbType: ref(dbType) },
      },
    });
    await flushPromises();
    await nextTick();
    return wrapper;
  }

  async function openRowEdit(wrapper) {
    await wrapper.find('.el-table__row').trigger('click');
    await flushPromises();
    await nextTick();
  }

  it('未改动的超长历史 OID：仅改标签保存成功（PUT 原样携带）', async () => {
    const mocks = stageFieldsApi([makeDefinition(5, 'LEGACY_OID_12', '甲字段')]);
    const wrapper = await mountFieldsTab();
    await openRowEdit(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    expect(oidInput.element.value).toBe('LEGACY_OID_12');
    await setInputValue(formItemInputByLabel(wrapper, '标签'), '改名不改OID');
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][1].variable_name).toBe('LEGACY_OID_12');
  });

  it('赛美斯下 OID 改为 9 位：提示字段上限，且不发引用查询与写请求', async () => {
    const mocks = stageFieldsApi([makeDefinition(5, 'AE01', '甲字段')]);
    const wrapper = await mountFieldsTab();
    await openRowEdit(wrapper);
    await setInputValue(formItemInputByLabel(wrapper, 'OID'), 'ABCDEFGHI');
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FIELD_LENGTH_ERROR);
    // 拒绝后保留用户输入与基线，修正为合法值后可保存
    expect(formItemInputByLabel(wrapper, 'OID').element.value).toBe('ABCDEFGHI');
    expect(mocks.puts).toHaveLength(0);
    expect(mocks.posts).toHaveLength(0);
    expect(mocks.gets).toHaveLength(0);
  });

  it('赛美斯下 OID 改为恰好 8 位：保存成功', async () => {
    const mocks = stageFieldsApi([makeDefinition(5, 'AE01', '甲字段')]);
    const wrapper = await mountFieldsTab();
    await openRowEdit(wrapper);
    await setInputValue(formItemInputByLabel(wrapper, 'OID'), 'ABCDEFGH');
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][1].variable_name).toBe('ABCDEFGH');
  });

  it('其他项目下 9 位改动保持现有行为（放行）', async () => {
    const mocks = stageFieldsApi([makeDefinition(5, 'AE01', '甲字段')]);
    const wrapper = await mountFieldsTab('其他');
    await openRowEdit(wrapper);
    await setInputValue(formItemInputByLabel(wrapper, 'OID'), 'ABCDEFGHI');
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
  });

  it('新增字段：生成 OID 未改动保存成功（豁免），改成 9 位则拒绝', async () => {
    const mocks = stageFieldsApi([]);
    const wrapper = await mountFieldsTab();
    await buttonByAriaLabel(wrapper, '新增字段').trigger('click');
    await nextTick();
    const generated = formItemInputByLabel(wrapper, 'OID').element.value;
    expect(generated).toHaveLength(27);
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(mocks.posts).toHaveLength(1);
    expect(mocks.posts[0][1].variable_name).toBe(generated);

    await buttonByAriaLabel(wrapper, '新增字段').trigger('click');
    await nextTick();
    await setInputValue(formItemInputByLabel(wrapper, 'OID'), 'ABCDEFGHI');
    await buttonByText(wrapper, '保存').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FIELD_LENGTH_ERROR);
    expect(mocks.posts).toHaveLength(1);
  });

  it('录入硬限制：赛美斯下字段 OID 输入 maxlength=8，其他下不设 maxlength；生成默认值不受程序化截断', async () => {
    stageFieldsApi([makeDefinition(5, 'AE01', '甲字段')]);
    let wrapper = await mountFieldsTab('赛美斯');
    await buttonByAriaLabel(wrapper, '新增字段').trigger('click');
    await nextTick();
    const addInput = formItemInputByLabel(wrapper, 'OID');
    expect(addInput.attributes('maxlength')).toBe('8');
    // maxlength 只拦键入/粘贴：程序化预填的 27 位生成默认值原样保留（豁免语义不变）
    expect(addInput.element.value).toHaveLength(27);
    await openRowEdit(wrapper);
    expect(formItemInputByLabel(wrapper, 'OID').attributes('maxlength')).toBe('8');

    wrapper = await mountFieldsTab('其他');
    await openRowEdit(wrapper);
    expect(formItemInputByLabel(wrapper, 'OID').attributes('maxlength')).toBeUndefined();
  });
});

describe('FormDesignerTab 设计器（赛美斯手工 OID 长度限制）', () => {
  function makeFormField(id, definition, orderIndex) {
    return {
      id,
      form_id: FORM_ID,
      field_definition_id: definition.id,
      is_log_row: 0,
      order_index: orderIndex,
      required: 0,
      label_override: null,
      help_text: null,
      default_value: null,
      inline_mark: 0,
      bg_color: null,
      text_color: null,
      label_bold: null,
      label_font_size: null,
      field_definition: definition,
    };
  }

  const DEF_PERSISTED = makeDefinition(200, 'LEGACY_OID_12', '甲字段');
  const DEF_CANDIDATE = makeDefinition(300, 'LONGCAND01', '候选字段');
  const FIELD_PERSISTED = makeFormField(101, DEF_PERSISTED, 1);

  function stageDesignerApi() {
    const posts = [];
    const puts = [];
    const gets = [];
    vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
      if (url === `/api/projects/${PROJECT_ID}/forms`) {
        return Promise.resolve([{ id: FORM_ID, project_id: PROJECT_ID, name: '知情同意', code: 'FORM_LEGACY_LONG0', order_index: 1 }]);
      }
      if (url === `/api/forms/${FORM_ID}/fields`) return Promise.resolve([FIELD_PERSISTED]);
      if (url === `/api/projects/${PROJECT_ID}/field-definitions`) {
        return Promise.resolve([DEF_PERSISTED, DEF_CANDIDATE]);
      }
      return Promise.resolve([]);
    });
    vi.spyOn(api, 'get').mockImplementation((url) => {
      gets.push(url);
      return Promise.resolve([]);
    });
    vi.spyOn(api, 'post').mockImplementation((url, body) => {
      posts.push([url, body]);
      return Promise.resolve({ form_field_id: 501, form_field: { id: 501 }, final_definition_id: 601, definition_created: true });
    });
    vi.spyOn(api, 'put').mockImplementation((url, body) => {
      puts.push([url, body]);
      return Promise.resolve({ form_field: { id: FIELD_PERSISTED.id }, final_definition_id: DEF_PERSISTED.id });
    });
    return { posts, puts, gets };
  }

  async function mountDesigner() {
    const mocks = stageDesignerApi();
    const wrapper = mount(FormDesignerTab, {
      props: { projectId: PROJECT_ID },
      global: {
        provide: { refreshKey: ref(0), editMode: ref(true), projectDbType: ref('赛美斯') },
      },
    });
    await flushPromises();
    await nextTick();
    await wrapper.vm.selectFormById(FORM_ID);
    await flushPromises();
    await nextTick();
    const openButton = wrapper.findAll('button').find((node) => node.text().includes('设计表单'));
    expect(openButton, '选中表单后应出现「设计表单」入口').toBeTruthy();
    await openButton.trigger('click');
    await flushPromises();
    await nextTick();
    await flushPromises();
    return { wrapper, mocks };
  }

  async function selectCanvasField(wrapper) {
    const row = wrapper.find('.fd-canvas-list .ff-item');
    expect(row.exists(), '画布应渲染字段行').toBe(true);
    await row.trigger('click');
    await flushPromises();
    await nextTick();
  }

  it('内联表单属性：改名称不动超长历史 OID 保存成功（PUT 原样携带）', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await setInputValue(inputByTestData(wrapper, 'designer-form-property-name'), '改名不改OID');
    await wrapper.find('[data-test="designer-form-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][0]).toBe(`/api/forms/${FORM_ID}`);
    expect(mocks.puts[0][1].code).toBe('FORM_LEGACY_LONG0');
  });

  it('内联表单属性：OID 改为 11 位被拒，且不发引用查询与写请求', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await setInputValue(inputByTestData(wrapper, 'designer-form-property-code'), 'ABCDEFGHIJK');
    await wrapper.find('[data-test="designer-form-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FORM_LENGTH_ERROR);
    expect(mocks.puts).toHaveLength(0);
    expect(mocks.gets).toHaveLength(0);
  });

  it('新建表单：生成 OID 未改动保存成功（豁免），改成 11 位则拒绝', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const openAddDialog = async () => {
      await buttonByAriaLabel(wrapper, '新建表单').trigger('click');
      await flushPromises();
      await nextTick();
      // 全屏设计器本身也是 .el-dialog 且在模板中靠前；按标题定位「新建表单」弹窗
      const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('新建表单'));
      expect(dialog, '应出现「新建表单」弹窗').toBeTruthy();
      return dialog;
    };
    let dialog = await openAddDialog();
    const oidInput = formItemInputByLabel(dialog, 'OID');
    const generated = oidInput.element.value;
    expect(generated).toHaveLength(26);
    await buttonByText(dialog, '确定').trigger('click');
    await flushPromises();
    expect(mocks.posts).toHaveLength(1);
    expect(mocks.posts[0][1].code).toBe(generated);

    dialog = await openAddDialog();
    await setInputValue(formItemInputByLabel(dialog, 'OID'), 'ABCDEFGHIJK');
    await buttonByText(dialog, '确定').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FORM_LENGTH_ERROR);
    expect(mocks.posts).toHaveLength(1);
  });

  it('编辑表单对话框：超长历史 OID 未改动保存成功（豁免），改成 11 位被拒', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const openEditDialog = async () => {
      await buttonByAriaLabel(wrapper, '编辑').trigger('click');
      await flushPromises();
      await nextTick();
      const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('编辑表单'));
      expect(dialog, '应出现「编辑表单」弹窗').toBeTruthy();
      return dialog;
    };
    let dialog = await openEditDialog();
    expect(formItemInputByLabel(dialog, 'OID').element.value).toBe('FORM_LEGACY_LONG0');
    await setInputValue(formItemInputByLabel(dialog, '名称'), '改名不改OID');
    await buttonByText(dialog, '确定').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][0]).toBe(`/api/forms/${FORM_ID}`);
    expect(mocks.puts[0][1].code).toBe('FORM_LEGACY_LONG0');

    dialog = await openEditDialog();
    await setInputValue(formItemInputByLabel(dialog, 'OID'), 'ABCDEFGHIJK');
    await buttonByText(dialog, '确定').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FORM_LENGTH_ERROR);
    // 被拒后不得产生新的写请求
    expect(mocks.puts).toHaveLength(1);
  });

  it('持久化字段：OID 改为 9 位被拒，且不发引用查询与写请求', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await selectCanvasField(wrapper);
    await setInputValue(inputByTestData(wrapper, 'designer-field-oid-autocomplete'), 'ABCDEFGHI');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FIELD_LENGTH_ERROR);
    // 拒绝后保留用户输入，不发引用查询与写请求
    expect(inputByTestData(wrapper, 'designer-field-oid-autocomplete').element.value).toBe('ABCDEFGHI');
    expect(mocks.puts).toHaveLength(0);
    expect(mocks.gets).toHaveLength(0);
  });

  it('持久化字段：仅改标签不动超长历史 OID 保存成功（binding-profile PUT 发出）', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await selectCanvasField(wrapper);
    const editorForm = wrapper.find('[data-test="designer-field-property-form"]');
    await setInputValue(formItemInputByLabel(editorForm, '字段标签'), '改名不改OID');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][0]).toBe(`/api/form-fields/${FIELD_PERSISTED.id}/binding-profile`);
    expect(JSON.stringify(mocks.puts[0][1])).toContain('LEGACY_OID_12');
  });

  it('候选绑定：选中长 OID 候选未改动保存成功（纯换绑豁免），再手输 9 位被拒', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await selectCanvasField(wrapper);
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    await oidInput.setValue('候选');
    // el-autocomplete 默认 300ms 防抖后经 fetchFieldDefSuggestions 渲染候选（teleport 到 body）
    await new Promise((resolve) => setTimeout(resolve, 400));
    await flushPromises();
    const suggestion = document.body.querySelector('.el-autocomplete-suggestion__list li');
    expect(suggestion, '输入关键词后应出现候选下拉').toBeTruthy();
    suggestion.click();
    await flushPromises();
    await nextTick();
    expect(oidInput.element.value).toBe('LONGCAND01');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][0]).toBe(`/api/form-fields/${FIELD_PERSISTED.id}/binding-profile`);
    // 纯换绑命令：按 ID 绑定候选定义、无共享定义写入；候选长 OID 未改动即豁免
    expect(mocks.puts[0][1].binding).toEqual({ mode: 'existing', target_field_definition_id: DEF_CANDIDATE.id });
    expect(mocks.puts[0][1].definition_operation).toEqual({ operation: 'none' });

    // 换绑保存成功后基线重建为候选 OID；再手输另一超长 OID 必须被拒
    await oidInput.setValue('ABCDEFGHI');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FIELD_LENGTH_ERROR);
    expect(mocks.puts).toHaveLength(1);
  });

  it('新增字段草稿：生成 OID 未改动保存成功（豁免），改成 9 位则拒绝', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await wrapper.find('[data-test="designer-new-field"]').trigger('click');
    await flushPromises();
    await nextTick();
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    const generated = oidInput.element.value;
    expect(generated).toHaveLength(27);
    await wrapper.find('[data-test="designer-draft-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.posts).toHaveLength(1);
    expect(mocks.posts[0][0]).toBe(`/api/forms/${FORM_ID}/field-profile`);
    expect(JSON.stringify(mocks.posts[0][1])).toContain(generated);

    await wrapper.find('[data-test="designer-new-field"]').trigger('click');
    await flushPromises();
    await nextTick();
    await setInputValue(inputByTestData(wrapper, 'designer-field-oid-autocomplete'), 'ABCDEFGHI');
    await wrapper.find('[data-test="designer-draft-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith(FIELD_LENGTH_ERROR);
    expect(mocks.posts).toHaveLength(1);
  });

  it('复制字段草稿：创建态复制 OID 未改动保存成功（超长豁免）', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await buttonByAriaLabel(wrapper, '复制 甲字段').trigger('click');
    await flushPromises();
    await nextTick();
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    expect(oidInput.element.value).toContain('LEGACY_OID_12');
    await wrapper.find('[data-test="designer-draft-save"]').trigger('click');
    await flushPromises();
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(mocks.posts).toHaveLength(1);
    expect(mocks.posts[0][0]).toBe(`/api/forms/${FORM_ID}/field-profile`);
  });

  it('录入硬限制：表单双入口与内联 OID maxlength=10，字段 OID 自动完成 maxlength=8', async () => {
    const { wrapper } = await mountDesigner();
    // 内联表单属性 OID
    expect(inputByTestData(wrapper, 'designer-form-property-code').attributes('maxlength')).toBe('10');
    // 新建表单弹窗 OID
    await buttonByAriaLabel(wrapper, '新建表单').trigger('click');
    await flushPromises();
    await nextTick();
    let dlg = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('新建表单'));
    expect(formItemInputByLabel(dlg, 'OID').attributes('maxlength')).toBe('10');
    await buttonByText(dlg, '取消').trigger('click');
    await flushPromises();
    // 编辑表单弹窗 OID
    await buttonByAriaLabel(wrapper, '编辑').trigger('click');
    await flushPromises();
    await nextTick();
    dlg = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('编辑表单'));
    expect(formItemInputByLabel(dlg, 'OID').attributes('maxlength')).toBe('10');
    await buttonByText(dlg, '取消').trigger('click');
    await flushPromises();
    // 设计器字段 OID 自动完成（el-autocomplete 需把 maxlength 透传到内层 input）
    await selectCanvasField(wrapper);
    expect(inputByTestData(wrapper, 'designer-field-oid-autocomplete').attributes('maxlength')).toBe('8');
  });
});
