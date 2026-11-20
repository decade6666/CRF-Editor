// CodelistsTab 行为挂载测试：字典/选项的增删改查、引用拦截与影响提醒、
// 批量删除分组确认、模糊搜索过滤、序号快捷改序与 refreshKey 同步。
// 外部边界：api 对象（cachedGet/get/post/put/del/invalidateCache）、ElMessageBox、sortablejs。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import CodelistsTab from '../../src/components/CodelistsTab.vue';
import FieldsTab from '../../src/components/FieldsTab.vue';
import { stageDesignServer } from './designServerFixture.js';
import { api } from '../../src/composables/useApi.js';
import { OID_ERROR } from '../../src/composables/oidValidation.js';

// happy-dom 无可拖拽布局，Sortable.create 返回的实例需要 destroy / option 两个能力
// （useSortableTable 在过滤切换时调用 instance.option('disabled', …)）。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({
      destroy() {},
      option() {},
    }),
  },
}));

const PROJECT_ID = 1;
const CODELISTS = [
  {
    id: 11,
    name: '性别',
    code: 'CL_SEX',
    description: '性别字典',
    order_index: 1,
    options: [
      { id: 111, code: 'C.1', decode: '男', order_index: 1 },
      { id: 112, code: 'C.2', decode: '女', order_index: 2 },
    ],
  },
  { id: 12, name: '是否', code: 'CL_YN', description: '', order_index: 2, options: [] },
];

function cloneCodelists() {
  return JSON.parse(JSON.stringify(CODELISTS));
}

async function mountCodelists({ editModeValue = true } = {}) {
  vi.spyOn(api, 'cachedGet').mockImplementation(() => Promise.resolve(cloneCodelists()));
  vi.spyOn(api, 'get').mockResolvedValue([]);
  vi.spyOn(api, 'post').mockResolvedValue({ deleted: 1 });
  vi.spyOn(api, 'put').mockResolvedValue({});
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
  const refreshKey = ref(0);
  const wrapper = mount(CodelistsTab, {
    props: { projectId: PROJECT_ID },
    global: { provide: { refreshKey, editMode: ref(editModeValue) } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

function dialogByTitle(wrapper, title) {
  const node = wrapper.findAllComponents({ name: 'ElDialog' }).find((candidate) => candidate.props('title') === title);
  expect(node, `应渲染弹窗「${title}」`).toBeTruthy();
  return node;
}

async function openDialog(wrapper, ariaLabel, title) {
  await wrapper.find(`button[aria-label="${ariaLabel}"]`).trigger('click');
  await flushPromises();
  return dialogByTitle(wrapper, title);
}

async function fillFormItem(scope, label, value) {
  const item = scope.findAll('.el-form-item').find((node) => {
    const labelNode = node.find('.el-form-item__label');
    return labelNode.exists() && labelNode.text() === label;
  });
  expect(item, `应渲染表单项「${label}」`).toBeTruthy();
  await item.get('input').setValue(value);
  await flushPromises();
}

async function selectCodelistRow(wrapper, index = 0) {
  const row = wrapper.findAll('.el-table__row')[index];
  expect(row, '左侧应渲染字典行').toBeTruthy();
  await row.trigger('click');
  await flushPromises();
  await nextTick();
}

async function selectRowCheckbox(scope, index = 0) {
  const checkbox = scope.findAll('.el-table__row')[index].find('.el-checkbox input');
  expect(checkbox.exists(), '行内应有选择框').toBe(true);
  await checkbox.setValue(true);
  await flushPromises();
}

function rowByAction(wrapper, label) {
  const row = wrapper.findAll('.el-table__row').find((node) => node.find(`button[aria-label="${label}"]`).exists());
  expect(row, `应渲染带「${label}」操作的行`).toBeTruthy();
  return row;
}

function confirmResolved() {
  return vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
}

function confirmCancelled() {
  return vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
}

beforeEach(() => {
  localStorage.clear();
});

describe('CodelistsTab · 加载与选择', () => {
  it('加载字典列表并渲染名称与描述', async () => {
    const { wrapper } = await mountCodelists();

    expect(wrapper.text()).toContain('性别');
    expect(wrapper.text()).toContain('性别字典');
    expect(wrapper.findAll('.el-table__row').length).toBe(2);
    expect(api.cachedGet).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists`);
  });

  it('点击字典行后右侧展示选项面板', async () => {
    const { wrapper } = await mountCodelists();

    await selectCodelistRow(wrapper, 0);

    expect(wrapper.text()).toContain('性别');
    const rows = wrapper.findAll('.el-table__row');
    expect(rows.length).toBe(4); // 2 字典 + 2 选项
    expect(wrapper.text()).toContain('男');
    expect(wrapper.text()).toContain('女');
  });

  it('搜索关键字过滤字典列表', async () => {
    const { wrapper } = await mountCodelists();

    await wrapper.find('.list-toolbar input').setValue('性别');
    await flushPromises();

    const leftRows = wrapper.findAll('.el-table__row');
    expect(leftRows.length).toBe(1);
    expect(leftRows[0].text()).toContain('性别');
  });

  it('refreshKey 变化重新加载字典', async () => {
    const { refreshKey } = await mountCodelists();
    const callsBefore = api.cachedGet.mock.calls.length;

    refreshKey.value += 1;
    await flushPromises();

    expect(api.cachedGet.mock.calls.length).toBe(callsBefore + 1);
  });

  it('切换项目后按新项目重新加载并按索引回显选中行', async () => {
    const { wrapper } = await mountCodelists();
    await selectCodelistRow(wrapper, 0);
    expect(wrapper.findAll('.el-table__row').length).toBe(4);

    await wrapper.setProps({ projectId: 2 });
    await flushPromises();
    await nextTick();

    expect(api.cachedGet).toHaveBeenCalledWith('/api/projects/2/codelists');
    // el-table 在数据替换后按索引重新发出 current-change，选项面板回显新数据中的同位置行。
    expect(wrapper.findAll('.el-table__row').length).toBe(4);
  });
});

describe('CodelistsTab · 新增字典', () => {
  it('新增字典预填 OID 并提交载荷后刷新', async () => {
    const { wrapper, refreshKey } = await mountCodelists();

    const dialog = await openDialog(wrapper, '新增字典', '新增字典');
    const oidInput = dialog.findAll('.el-form-item')[0].get('input');
    expect(oidInput.element.value).toMatch(/^CL_/);
    const codePrefill = oidInput.element.value;
    await fillFormItem(dialog, '名称', '访视类型');
    await fillFormItem(dialog, '描述', '访视分类');

    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists`, {
      name: '访视类型',
      code: codePrefill,
      description: '访视分类',
    });
    expect(dialog.props('modelValue')).toBe(false);
    expect(api.invalidateCache).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists`);
    expect(refreshKey.value).toBe(1);
  });

  it('OID 非法时提示且不提交', async () => {
    const { wrapper } = await mountCodelists();

    const dialog = await openDialog(wrapper, '新增字典', '新增字典');
    await dialog.findAll('.el-form-item')[0].get('input').setValue('CL 甲!');
    await flushPromises();
    await fillFormItem(dialog, '名称', '访视类型');

    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith(OID_ERROR);
    expect(api.post).not.toHaveBeenCalled();
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('新增失败时提示且弹窗保持打开', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockRejectedValue(new Error('重名'));

    const dialog = await openDialog(wrapper, '新增字典', '新增字典');
    await fillFormItem(dialog, '名称', '性别');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('重名');
    expect(dialog.props('modelValue')).toBe(true);
  });
});

describe('CodelistsTab · 复制与单删字典', () => {
  it('复制字典提交 copy 请求并提示', async () => {
    const { wrapper } = await mountCodelists();

    await rowByAction(wrapper, '复制').find('button[aria-label="复制"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/copy`, {});
    expect(ElMessage.success).toHaveBeenCalledWith('复制成功');
  });

  it('复制失败时提示错误', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockRejectedValue(new Error('复制冲突'));

    await rowByAction(wrapper, '复制').find('button[aria-label="复制"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('复制冲突');
  });

  it('删除无引用字典：确认后 DELETE 并刷新', async () => {
    const { wrapper } = await mountCodelists();
    const confirmSpy = confirmResolved();

    await rowByAction(wrapper, '删除').find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/references?include_unplaced=true`);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.del).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11`);
  });

  it('删除被引用字典：只提醒不删除', async () => {
    const { wrapper } = await mountCodelists();
    api.get.mockImplementation((url) =>
      url === `/api/projects/${PROJECT_ID}/codelists/11/references?include_unplaced=true`
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await rowByAction(wrapper, '删除').find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('表单甲(F1)-性别(SEX)');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  it('取消删除确认时不删除也不报错', async () => {
    const { wrapper } = await mountCodelists();
    confirmCancelled();

    await rowByAction(wrapper, '删除').find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('删除非选中字典：选中字典与右侧编辑器保持不变', async () => {
    const { wrapper } = await mountCodelists();
    confirmResolved();
    await selectCodelistRow(wrapper, 0);
    expect(wrapper.text()).toContain('性别字典');

    const targetRow = wrapper.findAll('.el-table__row').find((node) => node.text().includes('是否'));
    await targetRow.find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.del).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/12`);
    expect(wrapper.text(), '右侧仍是选中的性别字典').toContain('性别字典');
  });

  it('删除请求失败时报错且不误报成功', async () => {
    const { wrapper } = await mountCodelists();
    confirmResolved();
    api.del.mockRejectedValueOnce(new Error('数据库繁忙'));

    await rowByAction(wrapper, '删除').find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error, '真实失败必须走错误提示').toHaveBeenCalledWith('数据库繁忙');
  });
});

describe('CodelistsTab · 批量删除字典', () => {
  async function selectBothRows(wrapper) {
    await selectRowCheckbox(wrapper, 0);
    await selectRowCheckbox(wrapper, 1);
  }

  it('混合引用分组确认后只删除未引用组', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockImplementation((url) => {
      if (url.includes('batch-references')) {
        return Promise.resolve({
          11: [],
          12: [{ form_name: '表单甲', form_code: 'F1', field_label: '是否', field_var: 'YN' }],
        });
      }
      return Promise.resolve({ deleted: 1 });
    });
    const confirmSpy = confirmResolved();

    await selectBothRows(wrapper);
    await wrapper.find('button[aria-label="批量删除字典"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/codelists/batch-references?include_unplaced=true`,
      { ids: [11, 12] },
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('以下 1 个字典已被引用');
    expect(confirmSpy.mock.calls[0][0]).toContain('以下 1 个字典未被引用');
    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/batch-delete`, { ids: [11] });
    expect(ElMessage.success).toHaveBeenCalledWith('已删除 1 个字典，1 个被引用的字典未删除');
  });

  it('全部被引用时只提醒不提交删除', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockImplementation((url) =>
      url.includes('batch-references')
        ? Promise.resolve({
            11: [{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }],
            12: [],
          })
        : Promise.resolve({ deleted: 0 }),
    );
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    // 全部被引用：两行都被引用时 alert 提醒且无 batch-delete
    api.post.mockImplementation((url) =>
      url.includes('batch-references')
        ? Promise.resolve({
            11: [{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }],
            12: [{ form_name: '表单乙', form_code: 'F2', field_label: '是否', field_var: 'YN' }],
          })
        : Promise.resolve({ deleted: 0 }),
    );
    await selectBothRows(wrapper);
    await wrapper.find('button[aria-label="批量删除字典"]').trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('均已被引用');
    expect(api.post.mock.calls.filter(([url]) => url.includes('batch-delete'))).toHaveLength(0);
  });

  it('分组确认取消时不提交删除', async () => {
    const { wrapper } = await mountCodelists();
    confirmCancelled();

    await selectBothRows(wrapper);
    await wrapper.find('button[aria-label="批量删除字典"]').trigger('click');
    await flushPromises();

    expect(api.post.mock.calls.filter(([url]) => url.includes('batch-delete'))).toHaveLength(0);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('CodelistsTab · 编辑字典', () => {
  it('编辑回显并以 PUT 提交', async () => {
    const { wrapper } = await mountCodelists();

    await rowByAction(wrapper, '编辑').find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    const dialog = dialogByTitle(wrapper, '编辑字典');
    const nameInput = dialog
      .findAll('.el-form-item')
      .find((node) => node.find('.el-form-item__label').text() === '名称')
      .get('input');
    expect(nameInput.element.value).toBe('性别');

    await nameInput.setValue('性别（改）');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/references`);
    expect(api.put).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11`, {
      name: '性别（改）',
      code: 'CL_SEX',
      description: '性别字典',
    });
    expect(dialog.props('modelValue')).toBe(false);
  });

  it('有引用时先影响提醒再 PUT', async () => {
    const { wrapper } = await mountCodelists();
    api.get.mockImplementation((url) =>
      url === `/api/projects/${PROJECT_ID}/codelists/11/references`
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    const confirmSpy = confirmResolved();

    await rowByAction(wrapper, '编辑').find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    const dialog = dialogByTitle(wrapper, '编辑字典');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(confirmSpy.mock.calls[0][0]).toContain('修改将影响以下字段');
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('影响提醒取消时不提交', async () => {
    const { wrapper } = await mountCodelists();
    api.get.mockImplementation((url) =>
      url === `/api/projects/${PROJECT_ID}/codelists/11/references`
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    confirmCancelled();

    await rowByAction(wrapper, '编辑').find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    const dialog = dialogByTitle(wrapper, '编辑字典');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.put).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('CodelistsTab · 选项维护', () => {
  async function selectFirstCodelist(wrapper) {
    await selectCodelistRow(wrapper, 0);
  }

  it('新增选项预填下一编码并提交', async () => {
    const { wrapper, refreshKey } = await mountCodelists();
    await selectFirstCodelist(wrapper);

    const dialog = await openDialog(wrapper, '新增选项', '新增选项');
    const codeInput = dialog.findAll('.el-form-item')[0].get('input');
    expect(codeInput.element.value).toBe('C.3');
    await fillFormItem(dialog, '标签', '未知');

    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options`, {
      code: 'C.3',
      decode: '未知',
    });
    expect(dialog.props('modelValue')).toBe(false);
    expect(refreshKey.value).toBe(1);
  });

  it('新增选项缺编码或标签时提示且不提交', async () => {
    const { wrapper } = await mountCodelists();
    await selectFirstCodelist(wrapper);

    const dialog = await openDialog(wrapper, '新增选项', '新增选项');
    // 预填了编码，先清空再保存 → 缺编码
    await dialog.findAll('.el-form-item')[0].get('input').setValue(' ');
    await fillFormItem(dialog, '标签', '未知');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('请输入编码值');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('删除选项经确认后 DELETE', async () => {
    const { wrapper } = await mountCodelists();
    await selectFirstCodelist(wrapper);
    const confirmSpy = confirmResolved();

    const optionRow = wrapper.findAll('.el-table__row').find((row) => row.text().includes('男'));
    await optionRow.find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.del).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/111`);
  });

  it('取消删除选项不提交', async () => {
    const { wrapper } = await mountCodelists();
    await selectFirstCodelist(wrapper);
    confirmCancelled();

    const optionRow = wrapper.findAll('.el-table__row').find((row) => row.text().includes('男'));
    await optionRow.find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('编辑选项无引用直接 PUT', async () => {
    const { wrapper } = await mountCodelists();
    await selectFirstCodelist(wrapper);

    const optionRow = wrapper.findAll('.el-table__row').find((row) => row.text().includes('男'));
    await optionRow.find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    const dialog = dialogByTitle(wrapper, '编辑选项');
    await fillFormItem(dialog, '标签', '男性');
    await dialog
      .findAll('button')
      .find((b) => b.text() === '确定')
      .trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/111`, {
      code: 'C.1',
      decode: '男性',
    });
  });

  it('批量删除选中选项', async () => {
    const { wrapper } = await mountCodelists();
    await selectFirstCodelist(wrapper);
    confirmResolved();

    const optionTable = wrapper.findAll('.el-table').at(-1);
    await selectRowCheckbox(optionTable, 0);
    await selectRowCheckbox(optionTable, 1);
    await wrapper.find('button[aria-label="批量删除选项"]').trigger('click');
    await flushPromises();

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确认删除选中的 2 个选项？', '批量删除', { type: 'warning' });
    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/batch-delete`, {
      ids: [111, 112],
    });
  });
});

describe('CodelistsTab · 序号快捷改序', () => {
  it('双击序号编辑并回车提交重排请求', async () => {
    const { wrapper, refreshKey } = await mountCodelists();

    const firstRow = wrapper.findAll('.el-table__row')[0];
    await firstRow.find('.ordinal-cell').trigger('dblclick');
    await flushPromises();

    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    expect(ordinalInput.exists()).toBe(true);
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/reorder`, [12, 11]);
    expect(refreshKey.value).toBe(1);
  });

  it('重排保存失败时恢复并提示', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockRejectedValue(new Error('排序失败'));

    const firstRow = wrapper.findAll('.el-table__row')[0];
    await firstRow.find('.ordinal-cell').trigger('dblclick');
    await flushPromises();
    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('排序保存失败，已恢复');
  });
});


describe('CodelistsTab · 边界与持久化补充', () => {
  it('选项搜索按 编码/标签 候选过滤显示行', async () => {
    const { wrapper } = await mountCodelists();
    await selectCodelistRow(wrapper, 0);
    const optionSearches = wrapper.findAll('input').filter((node) => (node.attributes('placeholder') || '').includes('搜索选项'));
    expect(optionSearches.length).toBeGreaterThan(0);
    const target = optionSearches[optionSearches.length - 1];
    await target.setValue('女');
    await flushPromises();
    await nextTick();
    const optionRows = wrapper.findAll('.el-table__row').filter((row) => row.text().includes('女'));
    expect(optionRows).toHaveLength(1);
  });

  it('空选时批量删除按钮禁用（防御分支不触达）', async () => {
    const { wrapper } = await mountCodelists();
    expect(wrapper.find('button[aria-label="批量删除字典"]').attributes('disabled')).toBeDefined();
    await selectCodelistRow(wrapper, 0);
    expect(wrapper.find('button[aria-label="批量删除选项"]').attributes('disabled')).toBeDefined();
    await selectRowCheckbox(wrapper, 0);
    expect(wrapper.find('button[aria-label="批量删除字典"]').attributes('disabled')).toBeUndefined();
  });

  it('字典名称列宽拖动结束持久化到 localStorage', async () => {
    const { wrapper } = await mountCodelists();
    const codelistsTable = wrapper.findAllComponents({ name: 'ElTable' })[0];
    expect(codelistsTable.exists()).toBe(true);
    codelistsTable.vm.$emit('header-dragend', 240, 120, { property: 'name' });
    codelistsTable.vm.$emit('header-dragend', 200, 120, { property: 'description' });
    await flushPromises();
    expect(localStorage.getItem('crf_codelistNameColWidth')).toBe('240');
  });

  it('刷新后选中的字典被删除时右侧回到空态', async () => {
    const { wrapper, refreshKey } = await mountCodelists();
    await selectCodelistRow(wrapper, 0);
    expect(wrapper.text()).not.toContain('← 点击行查看选项');
    vi.spyOn(api, 'cachedGet').mockImplementationOnce(() => Promise.resolve([{ ...cloneCodelists()[1] }]));
    refreshKey.value += 1;
    await flushPromises();
    await nextTick();
    expect(wrapper.findAll('.el-table__row').length).toBe(1);
    expect(wrapper.text()).toContain('是否');
    expect(wrapper.text()).not.toContain('C.1');
  });
});

describe('CodelistsTab · 编辑守卫补充（OID / 校验 / 失败反馈 / 选项改序）', () => {
  async function openEditCodelist(wrapper) {
    await rowByAction(wrapper, '编辑').find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    return dialogByTitle(wrapper, '编辑字典');
  }

  async function openEditOption(wrapper) {
    await selectCodelistRow(wrapper, 0);
    const optionRow = wrapper.findAll('.el-table__row').find((row) => row.text().includes('男'));
    await optionRow.find('button[aria-label="编辑"]').trigger('click');
    await flushPromises();
    return dialogByTitle(wrapper, '编辑选项');
  }

  function confirmButton(dialog) {
    return dialog.findAll('button').find((b) => b.text() === '确定');
  }

  it('编辑字典 OID 非法时提示且不提交', async () => {
    const { wrapper } = await mountCodelists();
    const dialog = await openEditCodelist(wrapper);
    const oidInput = dialog
      .findAll('.el-form-item')
      .find((node) => node.find('.el-form-item__label').text() === 'OID')
      .get('input');
    await oidInput.setValue('cl_sex#');
    await confirmButton(dialog).trigger('click');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith(OID_ERROR);
    expect(api.put).not.toHaveBeenCalled();
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('编辑选项编码或标签缺失时逐项提示且不提交', async () => {
    const { wrapper } = await mountCodelists();
    const dialog = await openEditOption(wrapper);
    const codeInput = dialog
      .findAll('.el-form-item')
      .find((node) => node.find('.el-form-item__label').text() === 'OID')
      .get('input');
    const decodeInput = dialog
      .findAll('.el-form-item')
      .find((node) => node.find('.el-form-item__label').text() === '标签')
      .get('input');

    await codeInput.setValue(' ');
    await confirmButton(dialog).trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith('请输入编码值');

    await codeInput.setValue('C.1');
    await decodeInput.setValue(' ');
    await confirmButton(dialog).trigger('click');
    await flushPromises();
    expect(ElMessage.warning).toHaveBeenCalledWith('请输入标签');
    expect(api.put).not.toHaveBeenCalled();
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('编辑选项有引用时先影响提醒再 PUT', async () => {
    const { wrapper } = await mountCodelists();
    api.get.mockImplementation((url) =>
      url === `/api/projects/${PROJECT_ID}/codelists/11/references`
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '性别', field_var: 'SEX' }])
        : Promise.resolve([]),
    );
    const confirmSpy = confirmResolved();
    const dialog = await openEditOption(wrapper);

    await confirmButton(dialog).trigger('click');
    await flushPromises();

    expect(confirmSpy.mock.calls[0][0]).toContain('修改将影响以下字段');
    expect(api.put).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/111`, {
      code: 'C.1',
      decode: '男',
    });
    expect(dialog.props('modelValue')).toBe(false);
  });

  it('编辑选项保存失败时提示错误且弹窗保留', async () => {
    const { wrapper } = await mountCodelists();
    api.put.mockRejectedValueOnce(new Error('并发冲突'));
    const dialog = await openEditOption(wrapper);

    await confirmButton(dialog).trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('并发冲突');
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('删除选项请求失败时提示错误且不误删本地', async () => {
    const { wrapper } = await mountCodelists();
    api.del.mockRejectedValueOnce(new Error('删除冲突'));
    confirmResolved();
    await selectCodelistRow(wrapper, 0);

    const optionRow = wrapper.findAll('.el-table__row').find((row) => row.text().includes('男'));
    await optionRow.find('button[aria-label="删除"]').trigger('click');
    await flushPromises();
    await nextTick();

    expect(api.del).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/111`);
    expect(ElMessage.error).toHaveBeenCalledWith('删除冲突');
    expect(wrapper.text()).toContain('男');
  });

  it('新增选项提交失败时提示错误且弹窗保留', async () => {
    const { wrapper } = await mountCodelists();
    api.post.mockRejectedValueOnce(new Error('写入冲突'));
    await selectCodelistRow(wrapper, 0);

    const dialog = await openDialog(wrapper, '新增选项', '新增选项');
    await fillFormItem(dialog, '标签', '未知');
    await confirmButton(dialog).trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('写入冲突');
    expect(dialog.props('modelValue')).toBe(true);
  });

  it('选项序号快捷改序提交重排请求并保持选中字典', async () => {
    const { wrapper, refreshKey } = await mountCodelists();
    await selectCodelistRow(wrapper, 0);

    const optionTable = wrapper.findAll('.el-table').at(-1);
    const firstOptionRow = optionTable.findAll('.el-table__row')[0];
    await firstOptionRow.find('.ordinal-cell').trigger('dblclick');
    await flushPromises();

    const ordinalInput = optionTable.findAll('.el-table__row')[0].find('.el-input-number input');
    expect(ordinalInput.exists()).toBe(true);
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists/11/options/reorder`, [112, 111]);
    expect(refreshKey.value).toBe(1);
    expect(wrapper.text()).toContain('性别');
    expect(wrapper.text()).not.toContain('← 点击行查看选项');
  });
});

// ── CL-1：选项页签宿主可见性转发 + 本地重激活刷新 ──────────────────────────────
// App 懒加载宿主保留已激活的 CodelistsTab；离开选项页再回来时组件不会重新挂载，
// 需要由宿主转发的 active 可见性触发一次本地重读（而不是全局 refreshKey 广播）。
describe('CodelistsTab · 重激活刷新（active 可见性）', () => {
  async function mountWithActive({ active = true, holdInitialRead = false } = {}) {
    vi.spyOn(api, 'cachedGet').mockImplementation(() => Promise.resolve(cloneCodelists()));
    vi.spyOn(api, 'get').mockResolvedValue([]);
    vi.spyOn(api, 'post').mockResolvedValue({ deleted: 1 });
    vi.spyOn(api, 'put').mockResolvedValue({});
    vi.spyOn(api, 'del').mockResolvedValue(undefined);
    vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
    let releaseInitialRead = null;
    if (holdInitialRead) {
      // 挂载前的初始读取被扣住：用于同批次 ABA/隐藏往返的原始 A 迟读见证
      api.cachedGet.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseInitialRead = resolve;
          }),
      );
    }
    const refreshKey = ref(0);
    const wrapper = mount(CodelistsTab, {
      props: { projectId: PROJECT_ID, active },
      global: { provide: { refreshKey, editMode: ref(true) } },
    });
    await flushPromises();
    await nextTick();
    return { wrapper, refreshKey, releaseInitialRead };
  }

  function codelistReads() {
    return api.cachedGet.mock.calls.filter(([url]) => url === `/api/projects/${PROJECT_ID}/codelists`);
  }

  it('初始激活只装载一次数据', async () => {
    await mountWithActive();
    expect(codelistReads()).toHaveLength(1);
  });

  it('隐藏时不读取；重新可见时仅失效本项目字典缓存并读取一次', async () => {
    const { wrapper } = await mountWithActive();
    await wrapper.setProps({ active: false });
    await flushPromises();
    expect(codelistReads()).toHaveLength(1);

    await wrapper.setProps({ active: true });
    await flushPromises();

    expect(codelistReads()).toHaveLength(2);
    expect(api.invalidateCache).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/codelists`);
  });

  it('隐藏期间 refreshKey 变化推迟到重新可见后合并为一次读取', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    await wrapper.setProps({ active: false });
    await flushPromises();
    refreshKey.value += 1;
    await flushPromises();
    expect(codelistReads(), '隐藏的消费者不得发起读取').toHaveLength(1);

    await wrapper.setProps({ active: true });
    await flushPromises();

    expect(codelistReads(), '重新可见后合并为一次读取').toHaveLength(2);
  });

  it('项目变化与 refreshKey 同批变化时合并为一次读取', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    const before = api.cachedGet.mock.calls.length;
    refreshKey.value += 1;
    await wrapper.setProps({ projectId: 2 });
    await flushPromises();

    expect(api.cachedGet.mock.calls.length).toBe(before + 1);
    expect(api.cachedGet).toHaveBeenCalledWith('/api/projects/2/codelists');
  });

  it('重新可见后保留仍存在的当前选中字典', async () => {
    const { wrapper } = await mountWithActive();
    await selectCodelistRow(wrapper, 0);
    expect(wrapper.findAll('.el-table__row').length).toBe(4);

    await wrapper.setProps({ active: false });
    await wrapper.setProps({ active: true });
    await flushPromises();
    await nextTick();

    // 选中字典仍在结果里：右侧选项面板保持，不自动改选其他字典
    expect(wrapper.findAll('.el-table__row').length).toBe(4);
    expect(wrapper.text()).toContain('男');
    expect(wrapper.text()).toContain('女');
  });

  it('当前读取失败时保留旧列表并只报告一次刷新失败', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    api.cachedGet.mockRejectedValueOnce(new Error('网络断开'));

    refreshKey.value += 1;
    await flushPromises();
    await nextTick();

    expect(ElMessage.error).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('字典列表刷新失败'));
    expect(wrapper.findAll('.el-table__row').length).toBe(2);
    expect(wrapper.text()).toContain('性别');
  });

  it('项目 A→B→A：迟到的 B 项目读取不得覆盖当前 A 项目列表', async () => {
    const { wrapper } = await mountWithActive();
    let releaseHeldRead;
    api.cachedGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHeldRead = resolve;
        }),
    );

    await wrapper.setProps({ projectId: 2 });
    await flushPromises();
    await wrapper.setProps({ projectId: 1 });
    await flushPromises();
    releaseHeldRead([{ id: 99, name: 'B项目旧字典', options: [] }]);
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).not.toContain('B项目旧字典');
    expect(wrapper.text()).toContain('性别');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  // 同一调度批次内的 A→B→A / 隐藏→显示：prop 层把同批次中间态坍缩成最终值（projectId /
  // active 看起来没变），子组件只能凭宿主单调递增的 contextVersion 计数得知发生了上下文
  // 迁移：先失效在途读取，再合并为一次新鲜读取；迟到的旧读取结果一律不得发布。
  it('同批次项目 A→B→A：初始读取被拒，合并为一次新鲜读取', async () => {
    const { wrapper, releaseInitialRead } = await mountWithActive({ holdInitialRead: true });
    const readsAtChange = codelistReads().length;

    // App 在同批次内对项目变化逐次计数（0→1→2），prop 层坍缩后子组件只看到最终值
    // projectId=1 + contextVersion=2；计数前进即视为一次上下文迁移。
    await wrapper.setProps({ projectId: PROJECT_ID, contextVersion: 2 });
    await flushPromises();

    expect(codelistReads().length, '同批次变化合并为一次新鲜读取').toBe(readsAtChange + 1);
    releaseInitialRead([{ id: 99, name: '旧A迟读行', options: [] }]);
    await flushPromises();
    await nextTick();

    expect(wrapper.text(), '失效的初始读取不得发布').not.toContain('旧A迟读行');
    expect(wrapper.findAll('.el-table__row').length, '新鲜读取发布完整列表').toBe(2);
    expect(wrapper.text()).toContain('性别');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('同批次隐藏再显示：在途读取被拒，合并为一次新鲜读取', async () => {
    const { wrapper, releaseInitialRead } = await mountWithActive({ holdInitialRead: true });
    const readsAtChange = codelistReads().length;

    // active 的最终值与初始值相同（true），仅 contextVersion 前进见证隐藏→重显示迁移
    await wrapper.setProps({ active: true, contextVersion: 2 });
    await flushPromises();

    expect(codelistReads().length, '同批次往返合并为一次新鲜读取').toBe(readsAtChange + 1);
    releaseInitialRead(cloneCodelists().concat([{ id: 77, name: '同批次迟读字典', options: [] }]));
    await flushPromises();
    await nextTick();

    expect(wrapper.text(), '失效的在途读取不得发布').not.toContain('同批次迟读字典');
    expect(wrapper.text()).toContain('性别');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('同批次返回初始值后的新鲜读取失败：保留旧列表只报一次，迟到的成功读取不发布', async () => {
    const { wrapper, releaseInitialRead } = await mountWithActive({ holdInitialRead: true });
    api.cachedGet.mockRejectedValueOnce(new Error('合并读取失败'));

    await wrapper.setProps({ projectId: PROJECT_ID, contextVersion: 2 });
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('字典列表刷新失败'));
    // 初始读取仍被扣住、合并读取失败：旧列表从未发布，保持 0 行
    expect(wrapper.findAll('.el-table__row').length).toBe(0);

    releaseInitialRead(cloneCodelists());
    await flushPromises();
    await nextTick();

    expect(ElMessage.error, '失效读取的成功结果不发布也不追加反馈').toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('.el-table__row').length, '迟到的成功读取不得发布').toBe(0);
  });

  // F2：读取触发不得依赖组件 effect scope 之外的排队（unowned nextTick 回调在卸载后
  // 仍会发出迟到的 GET）；单一批量 immediate watcher 的回调由组件 scope 持有，卸载即停。
  it('挂载后同步卸载：初始读取不得在卸载后才发出', async () => {
    vi.spyOn(api, 'cachedGet').mockImplementation(() => Promise.resolve(cloneCodelists()));
    vi.spyOn(api, 'get').mockResolvedValue([]);
    vi.spyOn(api, 'post').mockResolvedValue({ deleted: 1 });
    vi.spyOn(api, 'put').mockResolvedValue({});
    vi.spyOn(api, 'del').mockResolvedValue(undefined);
    vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
    const wrapper = mount(CodelistsTab, {
      props: { projectId: PROJECT_ID, active: true },
      global: { provide: { refreshKey: ref(0), editMode: ref(true) } },
    });
    const readsAtMount = codelistReads().length;
    wrapper.unmount();
    const readsAtUnmount = codelistReads().length;
    await flushPromises();
    await nextTick();
    expect(codelistReads().length, '卸载后不得再发出初始 GET').toBe(readsAtUnmount);
    expect(readsAtUnmount, '同步卸载前未发出的初始读取不得在卸载后补发').toBe(readsAtMount);
  });

  it('刷新广播后同步卸载：排起的重读不得在卸载后发出', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    expect(codelistReads()).toHaveLength(1);

    refreshKey.value += 1;
    wrapper.unmount();
    await flushPromises();
    await nextTick();

    expect(codelistReads().length, '卸载后不得再发出刷新重读 GET').toBe(1);
  });

  it('鉴权会话变化后迟到的读取结果不再发布也不报错', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    let releaseHeldRead;
    api.cachedGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHeldRead = resolve;
        }),
    );

    refreshKey.value += 1;
    await flushPromises();
    localStorage.setItem('crf_token', 'session-changed-late-token');
    releaseHeldRead(cloneCodelists().concat([{ id: 77, name: '迟到字典', options: [] }]));
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).not.toContain('迟到字典');
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('性别');
  });

  it('卸载后迟到的失败读取不产生任何反馈', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    let rejectHeldRead;
    api.cachedGet.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectHeldRead = reject;
        }),
    );

    refreshKey.value += 1;
    await flushPromises();
    wrapper.unmount();
    rejectHeldRead(new Error('卸载后读取失败'));
    await flushPromises();

    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('隐藏后迟到的成功读取不得发布，重新可见时重读最新数据', async () => {
    const { wrapper, refreshKey } = await mountWithActive();
    let releaseHeldRead;
    api.cachedGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHeldRead = resolve;
        }),
    );
    refreshKey.value += 1;
    await flushPromises();
    await wrapper.setProps({ active: false });
    releaseHeldRead(cloneCodelists().concat([{ id: 77, name: '隐藏期迟到字典', options: [] }]));
    await flushPromises();

    api.cachedGet.mockImplementation(() =>
      Promise.resolve(cloneCodelists().concat([{ id: 78, name: '重激活新字典', options: [] }])),
    );
    await wrapper.setProps({ active: true });
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).not.toContain('隐藏期迟到字典');
    expect(wrapper.text()).toContain('重激活新字典');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  // 真实生产者+消费者见证：同一宿主内真实 FieldsTab（共享弹窗快捷新增字典）+ 真实
  // CodelistsTab。离开选项页 → 字段库快捷新增 → 返回选项页：新字典出现在已挂载的
  // 消费者列表里，选中字典与字段输入保留，全程零 refreshKey 广播、恰好一次 POST。
  it('选项→字段快捷新增→选项：返回后新字典出现在已挂载消费者且选中与输入保留', async () => {
    const server = stageDesignServer();
    server.state.codelists.push({
      id: 11,
      project_id: 1,
      name: '性别',
      code: 'CL_SEX',
      description: '性别字典',
      order_index: 1,
      options: [
        { id: 111, codelist_id: 11, code: 'C.1', decode: '男', order_index: 1 },
        { id: 112, codelist_id: 11, code: 'C.2', decode: '女', order_index: 2 },
      ],
    });
    const refreshKey = ref(0);
    const Host = defineComponent({
      components: { CodelistsTab, FieldsTab },
      setup() {
        return { codelistsActive: ref(true) };
      },
      template: `
        <div>
          <CodelistsTab :project-id="1" :active="codelistsActive" />
          <FieldsTab :project-id="1" />
        </div>
      `,
    });
    const wrapper = mount(Host, {
      global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
    });
    await flushPromises();
    await nextTick();

    const codelistsHost = wrapper.findComponent(CodelistsTab);
    const row = codelistsHost.findAll('.el-table__row')[0];
    await row.trigger('click');
    await flushPromises();
    await nextTick();
    expect(codelistsHost.text()).toContain('男');

    // 离开选项页（仅隐藏，不卸载）
    wrapper.vm.codelistsActive = false;
    await flushPromises();

    // 字段库：选中字段、填标签、选单选类型
    const fieldsHost = wrapper.findComponent(FieldsTab);
    await fieldsHost.findAll('.el-table__row')[0].trigger('click');
    await flushPromises();
    await nextTick();
    const editor = fieldsHost.get('.el-form');
    const labelItem = editor.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '标签');
    await labelItem.get('input').setValue('保留的字段输入');
    const typeItem = editor.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '字段类型');
    await typeItem.get('.el-select__wrapper').trigger('click');
    await flushPromises();
    const option = new DOMWrapper(document.body).findAll('.el-select-dropdown__item').find((node) => node.text() === '单选');
    await option.trigger('click');
    await flushPromises();

    // 快捷新增字典（真实共享弹窗，恰好一次 POST）
    await fieldsHost.get('[aria-label="新增字典"]').trigger('click');
    await flushPromises();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    expect(dialog, '应有新增字典弹窗').toBeTruthy();
    await dialog.findAll('.el-form-item')[0].get('input').setValue('快速字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await flushPromises();

    // 返回选项页：消费端本地重读
    wrapper.vm.codelistsActive = true;
    await flushPromises();
    await nextTick();

    expect(codelistsHost.text(), '返回选项页后新字典出现在已挂载消费者').toContain('快速字典');
    expect(codelistsHost.text(), '原选中字典的选项面板保留').toContain('男');
    expect(
      editor.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '标签').get('input')
        .element.value,
      '字段编辑输入保留',
    ).toBe('保留的字段输入');
    expect(server.writes(), '恰好一次 POST 且已提交').toEqual([expect.objectContaining({ method: 'POST', accepted: true })]);
    expect(refreshKey.value, '全程零全局 refreshKey 广播').toBe(0);
    expect(ElMessage.error, '无刷新失败误报').not.toHaveBeenCalled();
    api.clearAllCache();
  });
});
