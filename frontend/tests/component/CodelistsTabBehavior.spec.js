// CodelistsTab 行为挂载测试：字典/选项的增删改查、引用拦截与影响提醒、
// 批量删除分组确认、模糊搜索过滤、序号快捷改序与 refreshKey 同步。
// 外部边界：api 对象（cachedGet/get/post/put/del/invalidateCache）、ElMessageBox、sortablejs。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import CodelistsTab from '../../src/components/CodelistsTab.vue';
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
