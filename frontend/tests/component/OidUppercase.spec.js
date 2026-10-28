// 【组件挂载回归 · 大写 OID 录入】任务 10-27-uppercase-oids
//
// 真实挂载五个宿主组件，以原生 input 事件（键入/粘贴同路径）证明九个 OID 录入控件：
// 键入小写立即变为实际 DOM/状态大写，保存载荷一致；历史小写值加载与未改动保存原样
// 保留；候选水合保持既有身份；非 ASCII（ß）不膨胀；选项 code / 单位符号 / 名称不改写。
// 纯 helper 与源码接线见 tests/oidUppercase.test.js。
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import FieldsTab from '../../src/components/FieldsTab.vue';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import CodelistsTab from '../../src/components/CodelistsTab.vue';
import UnitsTab from '../../src/components/UnitsTab.vue';
import VisitsTab from '../../src/components/VisitsTab.vue';
import { api } from '../../src/composables/useApi.js';

// 各宿主经 useSortableTable 使用 SortableJS；happy-dom 下无可拖拽布局。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const PROJECT_ID = 1;
const FORM_ID = 7;
const OID_ERROR = 'OID 只允许由字母、数字、“-”、“_”和“.”组成';

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

function inputByTestData(scope, testId) {
  const node = scope.find(`[data-test="${testId}"]`);
  expect(node.exists(), `应存在 data-test=${testId} 的输入`).toBe(true);
  return node;
}

function mountTab(component, { provide = {}, apiMock } = {}) {
  const mocks = stageApi(apiMock);
  const wrapper = mount(component, {
    props: { projectId: PROJECT_ID },
    global: {
      provide: { refreshKey: ref(0), editMode: ref(true), ...provide },
    },
  });
  return { wrapper, mocks };
}

function stageApi({ cachedGet = {}, post, put, get } = {}) {
  const posts = [];
  const puts = [];
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    if (url in cachedGet) return Promise.resolve(cachedGet[url]);
    return Promise.resolve([]);
  });
  vi.spyOn(api, 'get').mockImplementation((url) => (get ? get(url) : Promise.resolve([])));
  vi.spyOn(api, 'post').mockImplementation((url, body) => {
    posts.push([url, body]);
    return Promise.resolve(post ? post(url, body) : { id: 99 });
  });
  vi.spyOn(api, 'put').mockImplementation((url, body) => {
    puts.push([url, body]);
    return Promise.resolve(put ? put(url, body) : {});
  });
  return { posts, puts };
}

async function settle(wrapper) {
  await flushPromises();
  await nextTick();
  return wrapper;
}

describe('FieldsTab 字段库（大写 OID 录入）', () => {
  async function mountFields(definitions) {
    const { wrapper, mocks } = mountTab(FieldsTab, {
      provide: { projectDbType: ref('其他') },
      apiMock: { cachedGet: { [`/api/projects/${PROJECT_ID}/field-definitions`]: definitions } },
    });
    await settle(wrapper);
    return { wrapper, mocks };
  }

  it('历史小写 OID 原样加载；未改动保存原样携带（不得隐藏改名）', async () => {
    const { wrapper, mocks } = await mountFields([makeDefinition(5, 'ae01', '甲字段')]);
    await wrapper.find('.el-table__row').trigger('click');
    await settle(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    expect(oidInput.element.value).toBe('ae01');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][1].variable_name).toBe('ae01');
  });

  it('键入小写立即转为实际大写，保存载荷一致', async () => {
    const { wrapper, mocks } = await mountFields([makeDefinition(5, 'AE01', '甲字段')]);
    await wrapper.find('.el-table__row').trigger('click');
    await settle(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    await setInputValue(oidInput, 'ab_01.x');
    expect(oidInput.element.value).toBe('AB_01.X');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[0][1].variable_name).toBe('AB_01.X');
  });

  it('非 ASCII 不得膨胀：ß 原样保留并被既有字符集校验拒绝', async () => {
    const { wrapper, mocks } = await mountFields([makeDefinition(5, 'AE01', '甲字段')]);
    await wrapper.find('.el-table__row').trigger('click');
    await settle(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    await setInputValue(oidInput, 'ß');
    expect(oidInput.element.value).toBe('ß');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(ElMessage.warning).toHaveBeenCalledWith(OID_ERROR);
    expect(mocks.puts).toHaveLength(0);
  });

  it('新增流程键入小写同样立即归一（生成默认值之外的改写）', async () => {
    const { wrapper, mocks } = await mountFields([]);
    await buttonByAriaLabel(wrapper, '新增字段').trigger('click');
    await nextTick();
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    await setInputValue(oidInput, 'new_fld');
    expect(oidInput.element.value).toBe('NEW_FLD');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][1].variable_name).toBe('NEW_FLD');
  });
});

describe('FormDesignerTab 设计器（大写 OID 录入）', () => {
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

  const DEF_PERSISTED = makeDefinition(200, 'AE01', '甲字段');
  const DEF_CANDIDATE = makeDefinition(300, 'cand01', '候选字段');
  const FIELD_PERSISTED = makeFormField(101, DEF_PERSISTED, 1);

  function stageDesignerApi() {
    return {
      cachedGet: {
        [`/api/projects/${PROJECT_ID}/forms`]: [
          { id: FORM_ID, project_id: PROJECT_ID, name: '知情同意', code: 'oldfrm', order_index: 1 },
        ],
        [`/api/forms/${FORM_ID}/fields`]: [FIELD_PERSISTED],
        [`/api/projects/${PROJECT_ID}/field-definitions`]: [DEF_PERSISTED, DEF_CANDIDATE],
      },
      post: () => ({
        form_field_id: 501,
        form_field: { id: 501 },
        final_definition_id: 601,
        definition_created: true,
      }),
      put: () => ({ form_field: { id: FIELD_PERSISTED.id }, final_definition_id: DEF_PERSISTED.id }),
    };
  }

  async function mountDesigner() {
    const mocks = stageApi(stageDesignerApi());
    const wrapper = mount(FormDesignerTab, {
      props: { projectId: PROJECT_ID },
      global: {
        provide: { refreshKey: ref(0), editMode: ref(true), projectDbType: ref('其他') },
      },
    });
    await settle(wrapper);
    await wrapper.vm.selectFormById(FORM_ID);
    await settle(wrapper);
    const openButton = wrapper.findAll('button').find((node) => node.text().includes('设计表单'));
    await openButton.trigger('click');
    await settle(wrapper);
    await settle(wrapper);
    return { wrapper, mocks };
  }

  it('内联表单属性：键入小写即时大写并随 PUT 保存', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const codeInput = inputByTestData(wrapper, 'designer-form-property-code');
    await setInputValue(codeInput, 'frm_a');
    expect(codeInput.element.value).toBe('FRM_A');
    await wrapper.find('[data-test="designer-form-property-save"]').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[0][1].code).toBe('FRM_A');
  });

  it('新建表单弹窗：键入小写即时大写并随 POST 保存', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await buttonByAriaLabel(wrapper, '新建表单').trigger('click');
    await settle(wrapper);
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('新建表单'));
    const oidInput = formItemInputByLabel(dialog, 'OID');
    await setInputValue(oidInput, 'frm_b');
    expect(oidInput.element.value).toBe('FRM_B');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][1].code).toBe('FRM_B');
  });

  it('编辑表单弹窗：历史小写未改动保存原样携带；改写后归一', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await buttonByAriaLabel(wrapper, '编辑').trigger('click');
    await settle(wrapper);
    let dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('编辑表单'));
    const oidInput = formItemInputByLabel(dialog, 'OID');
    expect(oidInput.element.value).toBe('oldfrm');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[0][1].code).toBe('oldfrm');

    await buttonByAriaLabel(wrapper, '编辑').trigger('click');
    await settle(wrapper);
    dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('编辑表单'));
    await setInputValue(formItemInputByLabel(dialog, 'OID'), 'frm_c');
    expect(formItemInputByLabel(dialog, 'OID').element.value).toBe('FRM_C');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[1][1].code).toBe('FRM_C');
  });

  it('字段 OID 自动完成：键入小写即时大写并随保存发出', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const row = wrapper.find('.fd-canvas-list .ff-item');
    await row.trigger('click');
    await settle(wrapper);
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    await setInputValue(oidInput, 'newoid');
    expect(oidInput.element.value).toBe('NEWOID');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await settle(wrapper);
    expect(JSON.stringify(mocks.puts[0][1])).toContain('NEWOID');
  });

  it('候选水合保持既有小写身份；纯换绑保存不改写候选 OID', async () => {
    const { wrapper, mocks } = await mountDesigner();
    const row = wrapper.find('.fd-canvas-list .ff-item');
    await row.trigger('click');
    await settle(wrapper);
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    await oidInput.setValue('候选');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle(wrapper);
    const suggestion = document.body.querySelector('.el-autocomplete-suggestion__list li');
    expect(suggestion, '输入关键词后应出现候选下拉').toBeTruthy();
    suggestion.click();
    await settle(wrapper);
    expect(oidInput.element.value).toBe('cand01');
    await wrapper.find('[data-test="designer-property-save"]').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[0][1].binding).toEqual({ mode: 'existing', target_field_definition_id: DEF_CANDIDATE.id });
    expect(mocks.puts[0][1].definition_operation).toEqual({ operation: 'none' });
  });

  it('复制草稿 OID 使用大写 _COPY 梯子', async () => {
    const { wrapper, mocks } = await mountDesigner();
    await buttonByAriaLabel(wrapper, '复制 甲字段').trigger('click');
    await settle(wrapper);
    const oidInput = inputByTestData(wrapper, 'designer-field-oid-autocomplete');
    expect(oidInput.element.value).toBe('AE01_COPY');
    await wrapper.find('[data-test="designer-draft-save"]').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][0]).toBe(`/api/forms/${FORM_ID}/field-profile`);
    expect(JSON.stringify(mocks.posts[0][1])).toContain('AE01_COPY');
  });
});

describe('CodelistsTab 字典（大写 OID 录入，选项保持自由文本）', () => {
  function mountCodelists() {
    return mountTab(CodelistsTab, {
      apiMock: { cachedGet: { [`/api/projects/${PROJECT_ID}/codelists`]: [] } },
    });
  }

  it('新增字典 OID 键入小写即时大写并随 POST 保存', async () => {
    const { wrapper, mocks } = mountCodelists();
    await settle(wrapper);
    await buttonByAriaLabel(wrapper, '新增字典').trigger('click');
    await settle(wrapper);
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('新增字典'));
    const oidInput = formItemInputByLabel(dialog, 'OID');
    await setInputValue(oidInput, 'cl_a');
    expect(oidInput.element.value).toBe('CL_A');
    await setInputValue(formItemInputByLabel(dialog, '名称'), '血压');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][1].code).toBe('CL_A');
  });

  it('编辑字典：历史小写 OID 未改动保存原样携带；粘贴式改写后 DOM 与 PUT 载荷均为大写', async () => {
    const { wrapper, mocks } = mountTab(CodelistsTab, {
      apiMock: {
        cachedGet: {
          // 历史小写 code 与选项自由编码：加载后必须原样保留
          [`/api/projects/${PROJECT_ID}/codelists`]: [
            { id: 12, code: 'oldcl', name: '历史字典', description: '备注', options: [{ code: 'opt_a', decode: '甲' }] },
          ],
        },
      },
    });
    await settle(wrapper);
    const openEditDialog = async () => {
      await buttonByAriaLabel(wrapper, '编辑').trigger('click');
      await settle(wrapper);
      const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('编辑字典'));
      expect(dialog, '应出现「编辑字典」弹窗').toBeTruthy();
      return dialog;
    };
    // 未改动：历史小写原样回显并随 PUT 原样携带（不得隐藏改名）
    let dialog = await openEditDialog();
    let oidInput = formItemInputByLabel(dialog, 'OID');
    expect(oidInput.element.value).toBe('oldcl');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0][1].code).toBe('oldcl');
    expect(mocks.puts[0][1].name).toBe('历史字典');

    // 改写：原生输入事件（键入/粘贴同路径）小写即时大写，PUT 载荷一致
    dialog = await openEditDialog();
    oidInput = formItemInputByLabel(dialog, 'OID');
    await setInputValue(oidInput, 'new_cl');
    expect(oidInput.element.value).toBe('NEW_CL');
    await buttonByText(dialog, '确定').trigger('click');
    await settle(wrapper);
    expect(mocks.puts[1][1].code).toBe('NEW_CL');
    expect(mocks.puts[1][1].name).toBe('历史字典');
    expect(mocks.puts[1][1].description).toBe('备注');
  });

  it('新增选项 OID 保持自由文本（不得归一）', async () => {
    const { wrapper } = mountTab(CodelistsTab, {
      apiMock: {
        cachedGet: {
          [`/api/projects/${PROJECT_ID}/codelists`]: [{ id: 11, code: 'CL_SEX', name: '性别', options: [] }],
        },
      },
    });
    await settle(wrapper);
    // 选项面板仅在选中字典后渲染
    await wrapper.find('.el-table__row').trigger('click');
    await settle(wrapper);
    await buttonByAriaLabel(wrapper, '新增选项').trigger('click');
    await settle(wrapper);
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.find('.el-dialog__title').text().includes('新增选项'));
    const oidInput = formItemInputByLabel(dialog, 'OID');
    await setInputValue(oidInput, 'opt_a');
    expect(oidInput.element.value).toBe('opt_a');
  });
});

describe('UnitsTab 单位（大写 OID 录入，符号不动）', () => {
  it('新增单位 OID 键入小写即时大写并随 POST 保存；符号保持小写', async () => {
    const { wrapper, mocks } = mountTab(UnitsTab, {
      apiMock: { cachedGet: { [`/api/projects/${PROJECT_ID}/units`]: [] } },
    });
    await settle(wrapper);
    await buttonByAriaLabel(wrapper, '新增单位').trigger('click');
    await settle(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    const symbolInput = formItemInputByLabel(wrapper, '单位符号');
    await setInputValue(oidInput, 'u_a');
    await setInputValue(symbolInput, 'kg');
    expect(oidInput.element.value).toBe('U_A');
    expect(symbolInput.element.value).toBe('kg');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][1]).toEqual({ symbol: 'kg', code: 'U_A' });
  });
});

describe('VisitsTab 访视（大写 OID 录入，名称不动）', () => {
  it('新增访视 OID 键入小写即时大写并随 POST 保存；名称保持原样', async () => {
    const { wrapper, mocks } = mountTab(VisitsTab, {
      apiMock: { cachedGet: { [`/api/projects/${PROJECT_ID}/visits`]: [] } },
    });
    await settle(wrapper);
    await buttonByAriaLabel(wrapper, '新增访视').trigger('click');
    await settle(wrapper);
    const oidInput = formItemInputByLabel(wrapper, 'OID');
    const nameInput = formItemInputByLabel(wrapper, '访视名称');
    await setInputValue(oidInput, 'v_a');
    await setInputValue(nameInput, '筛选期');
    expect(oidInput.element.value).toBe('V_A');
    expect(nameInput.element.value).toBe('筛选期');
    await buttonByText(wrapper, '保存').trigger('click');
    await settle(wrapper);
    expect(mocks.posts[0][1]).toEqual({ name: '筛选期', code: 'V_A' });
  });
});
