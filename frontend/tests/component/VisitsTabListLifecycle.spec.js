// R3：VisitsTab 列表工作区的访视创建生命周期（真实挂载 + api 边界 mock）。
// 行为断言：新增访视卡片 → 保存提交创建载荷 → 重读后按 id 重建选中引用 →
// 卡片切换为编辑态；取消按钮回到空态且不发起任何写入。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import VisitsTab from '../../src/components/VisitsTab.vue';
import { api } from '../../src/composables/useApi.js';

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy() {}, option() {} }) },
}));

function baseMatrix() {
  return {
    visits: [],
    forms: [{ id: 7, name: '知情同意' }],
    matrix: {},
  };
}

async function mountList() {
  const createdVisit = { id: 12, project_id: 1, name: '访视二', code: 'VISIT2', sequence: 1 };
  const matrix = baseMatrix();
  let visits = [];
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => {
    if (url === '/api/projects/1/visits') return Promise.resolve(visits);
    if (url === '/api/projects/1/visit-form-matrix') return Promise.resolve(matrix);
    if (url === '/api/projects/1/forms') {
      return Promise.resolve([{ id: 7, project_id: 1, name: '知情同意', code: 'ICF', order_index: 1 }]);
    }
    return Promise.resolve(null);
  });
  vi.spyOn(api, 'get').mockResolvedValue(matrix);
  vi.spyOn(api, 'post').mockImplementation((url, body) => {
    if (url === '/api/projects/1/visits') {
      // 创建后重读返回两条既有访视（访视一 + 刚创建的访视二）
      visits = [
        { id: 11, project_id: 1, name: '访视一', code: 'VISIT1', sequence: 1 },
        { id: 12, project_id: 1, name: '访视二', code: 'VISIT2', sequence: 2 },
      ];
      return Promise.resolve(createdVisit);
    }
    if (url === '/api/projects/1/visits/reorder') {
      // 重排写入后重读按新顺序返回
      visits = [...visits].reverse();
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });
  vi.spyOn(api, 'del').mockResolvedValue(undefined);
  vi.spyOn(api, 'put').mockResolvedValue({});
  vi.spyOn(api, 'invalidateCache').mockImplementation(() => {});
  const refreshKey = ref(0);
  const wrapper = mount(VisitsTab, {
    props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true) } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, refreshKey };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('R3：VisitsTab 列表工作区访视创建', () => {
  it('新增访视保存后创建载荷正确，重读按 id 重建选中并切换编辑态', async () => {
    const { wrapper } = await mountList();
    await wrapper.find('button[aria-label="新增访视"]').trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('新增访视');
    const nameInput = wrapper.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '访视名称');
    await nameInput.get('input').setValue('访视二');
    await wrapper.findAll('button').find((node) => node.text().trim() === '保存').trigger('click');
    await flushPromises();
    await nextTick();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [postUrl, postBody] = api.post.mock.calls[0];
    expect(postUrl).toBe('/api/projects/1/visits');
    expect(postBody.name).toBe('访视二');
    expect(postBody.code, 'OID 由 genCode 生成并大写').toMatch(/^VISIT_/);
    // 重读后新行出现，选中引用按 id 重建，卡片切换为编辑访视
    expect(wrapper.findAll('.el-table__row').some((node) => node.text().includes('访视二'))).toBe(true);
    expect(wrapper.text()).toContain('编辑访视');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('取消新建回到空态，不发起任何写入', async () => {
    const { wrapper } = await mountList();
    await wrapper.find('button[aria-label="新增访视"]').trigger('click');
    await nextTick();
    await wrapper.findAll('button').find((node) => node.text().trim() === '取消').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('← 点击行或新增访视');
    expect(api.post).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('序号快捷改序经 applyVisits 重排并保留选中引用，取消选中后同样成立', async () => {
    const { wrapper } = await mountList();
    // 造两条访视：重读返回两条（通过 post 创建第二条模拟既有数据）
    await wrapper.find('button[aria-label="新增访视"]').trigger('click');
    await nextTick();
    const nameInput = wrapper.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text() === '访视名称');
    await nameInput.get('input').setValue('访视二');
    await wrapper.findAll('button').find((node) => node.text().trim() === '保存').trigger('click');
    await flushPromises();
    // 选中「访视二」（右列编辑态），再把「访视一」改序到第 2 位
    const rowTwo = wrapper.findAll('.el-table__row').find((node) => node.text().includes('访视二'));
    await rowTwo.trigger('click');
    await nextTick();
    const rowOne = wrapper.findAll('.el-table__row').find((node) => node.text().includes('访视一'));
    await rowOne.find('button .ordinal-cell').trigger('dblclick');
    await nextTick();
    // v-if 切换重建行内 DOM：重新查询激活行上的序号输入
    const activeRow = wrapper.findAll('.el-table__row').find((node) => node.text().includes('访视一'));
    const ordinalInput = activeRow.get('.el-input-number input');
    await ordinalInput.setValue('2');
    // el-input-number 只在原生 change（Enter/失焦）时回写 v-model，先 change 再 Enter 提交
    await ordinalInput.trigger('change');
    await ordinalInput.trigger('keyup.enter');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/api/projects/1/visits/reorder', [12, 11]);
    const firstRow = wrapper.findAll('.el-table__row')[0];
    expect(firstRow.text()).toContain('访视二');
    // 选中引用按 id 重建：编辑态保持
    expect(wrapper.text()).toContain('编辑访视');
    // 取消选中后再改序：无选中引用的重排同样成立
    await wrapper.findAll('button').find((node) => node.text().trim() === '取消').trigger('click');
    await flushPromises();
    const rowOneAgain = wrapper.findAll('.el-table__row').find((node) => node.text().includes('访视一'));
    await rowOneAgain.find('button .ordinal-cell').trigger('dblclick');
    await nextTick();
    const activeRowAgain = wrapper.findAll('.el-table__row').find((node) => node.text().includes('访视一'));
    const ordinalInputAgain = activeRowAgain.get('.el-input-number input');
    await ordinalInputAgain.setValue('1');
    await ordinalInputAgain.trigger('change');
    await ordinalInputAgain.trigger('keyup.enter');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/api/projects/1/visits/reorder', [11, 12]);
    expect(wrapper.text()).toContain('← 点击行或新增访视');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});
