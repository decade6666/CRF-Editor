// UnitsTab 行为挂载测试：单位列表、行选中属性编辑、新增/编辑保存与引用提醒、
// 单删/批量删除的引用拦截与分组确认、搜索过滤、序号快捷改序与 refreshKey 同步。
// 外部边界：api 对象、ElMessageBox、sortablejs。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import UnitsTab from '../../src/components/UnitsTab.vue';
import { api } from '../../src/composables/useApi.js';

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy() {}, option() {} }) },
}));

const PROJECT_ID = 1;
const UNITS = [
  { id: 21, code: 'UNIT_KG', symbol: 'kg', order_index: 1 },
  { id: 22, code: 'UNIT_MG', symbol: 'mg', order_index: 2 },
];
const UNITS_URL = `/api/projects/${PROJECT_ID}/units`;
const PLACEHOLDER = '← 点击行或新增单位';

function cloneUnits() {
  return JSON.parse(JSON.stringify(UNITS));
}

async function mountUnits({ editModeValue = true } = {}) {
  vi.spyOn(api, 'cachedGet').mockImplementation(() => Promise.resolve(cloneUnits()));
  vi.spyOn(api, 'get').mockResolvedValue([]);
  vi.spyOn(api, 'post').mockResolvedValue({ id: 23 });
  vi.spyOn(api, 'put').mockResolvedValue({});
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
  const refreshKey = ref(0);
  const wrapper = mount(UnitsTab, {
    props: { projectId: PROJECT_ID },
    global: { provide: { refreshKey, editMode: ref(editModeValue) } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

function paneTitle(wrapper) {
  return wrapper.find('.pane-tool-slot').text();
}

async function selectUnitRow(wrapper, index = 0) {
  await wrapper.findAll('.el-table__row')[index].trigger('click');
  await flushPromises();
  await nextTick();
}

async function selectRowCheckbox(wrapper, index = 0) {
  const checkbox = wrapper.findAll('.el-table__row')[index].find('.el-checkbox input');
  expect(checkbox.exists(), '行内应有选择框').toBe(true);
  await checkbox.setValue(true);
  await flushPromises();
}

function paneInput(wrapper, index = 0) {
  return wrapper.findAll('.el-form-item')[index].get('input');
}

async function clickPaneButton(wrapper, text) {
  const button = wrapper.findAll('button').find((node) => node.text() === text);
  expect(button, `属性面板应有按钮「${text}」`).toBeTruthy();
  await button.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
});

describe('UnitsTab · 加载与选择', () => {
  it('加载单位列表并按序渲染', async () => {
    const { wrapper } = await mountUnits();

    expect(wrapper.text()).toContain('kg');
    expect(wrapper.text()).toContain('mg');
    expect(wrapper.text()).toContain(PLACEHOLDER);
    expect(api.cachedGet).toHaveBeenCalledWith(UNITS_URL);
  });

  it('点击行进入编辑态并回显 OID 与符号', async () => {
    const { wrapper } = await mountUnits();

    await selectUnitRow(wrapper, 0);

    expect(paneTitle(wrapper)).toContain('编辑单位');
    expect(paneInput(wrapper, 0).element.value).toBe('UNIT_KG');
    expect(paneInput(wrapper, 1).element.value).toBe('kg');
  });

  it('取消按钮清空选择回到占位态', async () => {
    const { wrapper } = await mountUnits();
    await selectUnitRow(wrapper, 0);
    expect(paneTitle(wrapper)).toContain('编辑单位');

    await clickPaneButton(wrapper, '取消');
    await nextTick();

    expect(paneTitle(wrapper)).toContain('属性编辑');
    expect(wrapper.text()).toContain(PLACEHOLDER);
  });

  it('搜索关键字过滤单位列表', async () => {
    const { wrapper } = await mountUnits();

    await wrapper.find('.list-toolbar input').setValue('kg');
    await flushPromises();

    expect(wrapper.findAll('.el-table__row').length).toBe(1);
  });

  it('refreshKey 变化重新加载', async () => {
    const { refreshKey } = await mountUnits();
    const callsBefore = api.cachedGet.mock.calls.length;

    refreshKey.value += 1;
    await flushPromises();

    expect(api.cachedGet.mock.calls.length).toBe(callsBefore + 1);
  });

  it('切换项目清空选择并重新加载', async () => {
    const { wrapper } = await mountUnits();
    await selectUnitRow(wrapper, 0);
    expect(paneTitle(wrapper)).toContain('编辑单位');

    await wrapper.setProps({ projectId: 2 });
    await flushPromises();
    await nextTick();

    expect(api.cachedGet).toHaveBeenCalledWith('/api/projects/2/units');
    expect(wrapper.text()).toContain(PLACEHOLDER);
  });
});

describe('UnitsTab · 新增与保存', () => {
  it('新增单位预填 OID 并 POST 后重载选中', async () => {
    const { wrapper } = await mountUnits();

    await wrapper.find('button[aria-label="新增单位"]').trigger('click');
    await flushPromises();

    expect(paneTitle(wrapper)).toContain('新增单位');
    expect(paneInput(wrapper, 0).element.value).toMatch(/^UNIT_/);
    const code = paneInput(wrapper, 0).element.value;
    await paneInput(wrapper, 1).setValue('cm');

    await clickPaneButton(wrapper, '保存');

    expect(api.post).toHaveBeenCalledWith(UNITS_URL, { symbol: 'cm', code });
    expect(api.cachedGet).toHaveBeenCalledWith(UNITS_URL);
    // 重载 mock 数据不含新建 id 23，reloadAndSelectUnit 走清空选择分支。
    expect(wrapper.text()).toContain(PLACEHOLDER);
  });

  it('新增保存失败时提示', async () => {
    const { wrapper } = await mountUnits();
    api.post.mockRejectedValue(new Error('编码重复'));

    await wrapper.find('button[aria-label="新增单位"]').trigger('click');
    await flushPromises();
    await paneInput(wrapper, 1).setValue('cm');
    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.error).toHaveBeenCalledWith('编码重复');
  });

  it('编辑单位无引用时直接 PUT', async () => {
    const { wrapper } = await mountUnits();
    await selectUnitRow(wrapper, 0);
    await paneInput(wrapper, 1).setValue('千克');

    await clickPaneButton(wrapper, '保存');

    expect(api.get).toHaveBeenCalledWith('/api/units/21/references');
    expect(api.put).toHaveBeenCalledWith('/api/units/21', { symbol: '千克', code: 'UNIT_KG' });
  });

  it('有引用时先影响提醒再 PUT，取消则不提交', async () => {
    const { wrapper } = await mountUnits();
    api.get.mockImplementation((url) =>
      url === '/api/units/21/references'
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '体重', field_var: 'WEIGHT' }])
        : Promise.resolve([]),
    );
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await selectUnitRow(wrapper, 0);
    await paneInput(wrapper, 1).setValue('千克');

    await clickPaneButton(wrapper, '保存');

    expect(confirmSpy.mock.calls[0][0]).toContain('修改将影响以下字段');
    expect(api.put).toHaveBeenCalledWith('/api/units/21', { symbol: '千克', code: 'UNIT_KG' });

    confirmSpy.mockRejectedValue('cancel');
    await paneInput(wrapper, 1).setValue('公斤');
    await clickPaneButton(wrapper, '保存');

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('编辑保存失败时提示', async () => {
    const { wrapper } = await mountUnits();
    api.put.mockRejectedValue(new Error('保存冲突'));
    await selectUnitRow(wrapper, 0);
    await paneInput(wrapper, 1).setValue('千克');

    await clickPaneButton(wrapper, '保存');

    expect(ElMessage.error).toHaveBeenCalledWith('保存冲突');
  });
});

describe('UnitsTab · 删除与批量删除', () => {
  it('删除被引用单位只提醒不删除', async () => {
    const { wrapper } = await mountUnits();
    api.get.mockImplementation((url) =>
      url === '/api/units/21/references?include_unplaced=true'
        ? Promise.resolve([{ form_name: '表单甲', form_code: 'F1', field_label: '体重', field_var: 'WEIGHT' }])
        : Promise.resolve([]),
    );
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('表单甲(F1)-体重(WEIGHT)');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  it('确认后删除单位并重载', async () => {
    const { wrapper } = await mountUnits();
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await selectUnitRow(wrapper, 0);

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.del).toHaveBeenCalledWith('/api/units/21');
    expect(wrapper.text()).toContain(PLACEHOLDER);
  });

  it('取消删除确认时不提交', async () => {
    const { wrapper } = await mountUnits();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    await wrapper.findAll('.el-table__row')[0].find('button[aria-label="删除"]').trigger('click');
    await flushPromises();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('混合引用批量删除确认后只删除未引用组', async () => {
    const { wrapper } = await mountUnits();
    api.post.mockImplementation((url) => {
      if (url.includes('batch-references')) {
        return Promise.resolve({
          21: [],
          22: [{ form_name: '表单甲', form_code: 'F1', field_label: '身高', field_var: 'HEIGHT' }],
        });
      }
      return Promise.resolve({ deleted: 1 });
    });
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    await selectRowCheckbox(wrapper, 0);
    await selectRowCheckbox(wrapper, 1);
    await wrapper.find('button[aria-label="批量删除单位"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/units/batch-references?include_unplaced=true`, {
      ids: [21, 22],
    });
    expect(confirmSpy.mock.calls[0][0]).toContain('以下 1 个单位已被引用');
    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/units/batch-delete`, { ids: [21] });
    expect(ElMessage.success).toHaveBeenCalledWith('已删除 1 个单位，1 个被引用的单位未删除');
  });

  it('全部被引用时只提醒不提交删除', async () => {
    const { wrapper } = await mountUnits();
    api.post.mockImplementation((url) =>
      url.includes('batch-references')
        ? Promise.resolve({
            21: [{ form_name: '表单甲', form_code: 'F1', field_label: '体重', field_var: 'WEIGHT' }],
            22: [{ form_name: '表单乙', form_code: 'F2', field_label: '身高', field_var: 'HEIGHT' }],
          })
        : Promise.resolve({ deleted: 0 }),
    );
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');

    await selectRowCheckbox(wrapper, 0);
    await selectRowCheckbox(wrapper, 1);
    await wrapper.find('button[aria-label="批量删除单位"]').trigger('click');
    await flushPromises();

    expect(alertSpy.mock.calls[0][0]).toContain('均已被引用');
    expect(api.post.mock.calls.filter(([url]) => url.includes('batch-delete'))).toHaveLength(0);
  });
});

describe('UnitsTab · 序号快捷改序', () => {
  it('双击序号编辑并回车提交重排请求', async () => {
    const { wrapper } = await mountUnits();

    await wrapper.findAll('.el-table__row')[0].find('.ordinal-cell').trigger('dblclick');
    await flushPromises();
    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    expect(ordinalInput.exists()).toBe(true);
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/units/reorder`, [22, 21]);
  });

  it('重排保存失败时恢复并提示', async () => {
    const { wrapper } = await mountUnits();
    api.post.mockRejectedValue(new Error('排序失败'));

    await wrapper.findAll('.el-table__row')[0].find('.ordinal-cell').trigger('dblclick');
    await flushPromises();
    const ordinalInput = wrapper.findAll('.el-table__row')[0].find('.el-input-number input');
    await ordinalInput.setValue('2');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith('排序保存失败，已恢复');
  });
});


describe('UnitsTab · 展示与选择健壮性', () => {
  it('重载后按 (order_index,id) 稳定排序展示缺失序号的单位', async () => {
    const { wrapper, refreshKey } = await mountUnits();
    const messy = [
      { id: 3, code: 'UNIT_C', symbol: 'c', order_index: 1 },
      { id: 1, code: 'UNIT_A', symbol: 'a' },
      { id: 2, code: 'UNIT_B', symbol: 'b', order_index: 1 },
      { id: 4, code: 'UNIT_D', symbol: 'd', order_index: 2 },
    ];
    api.cachedGet.mockImplementationOnce(() => Promise.resolve(JSON.parse(JSON.stringify(messy))));
    refreshKey.value += 1;
    await flushPromises();
    await nextTick();

    const rows = wrapper.findAll('.el-table__row');
    expect(rows[0].text()).toContain('UNIT_B');
    expect(rows[1].text()).toContain('UNIT_C');
    expect(rows[2].text()).toContain('UNIT_D');
    expect(rows[3].text()).toContain('UNIT_A');
  });

  it('刷新后选中单位消失则清空右侧属性面板', async () => {
    const { wrapper, refreshKey } = await mountUnits();
    await selectUnitRow(wrapper, 0);
    expect(wrapper.text()).not.toContain(PLACEHOLDER);

    api.cachedGet.mockImplementationOnce(() => Promise.resolve([]));
    refreshKey.value += 1;
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain(PLACEHOLDER);
    expect(wrapper.findAll('.el-table__row')).toHaveLength(0);
  });
});
