// 【回归 · 双实例刷新通知】10-15-visit-flow-refresh
//
// App.vue 为「访视」(workspace="list") 与「访视流程」(workspace="flow") 各挂载一个保留的
// VisitsTab 实例（useLazyTabs 激活集 + v-show 保留，切回不重挂载）。缺陷：写操作路径
// reloadVisits 只刷新写操作自身实例，从不递增共享 refreshKey，已激活的 flow 实例停留在旧数据
// （修改访视名称/OID 保存后切回访视流程仍显示旧值）。
//
// 本文件用真实双实例宿主 + 同一个 provide('refreshKey') 复现该缺陷：单实例或 workspace prop
// 切换无法复现（实例内不切换 workspace）。缓存层控制（真实 cachedGet/put、仅 stub fetch）在
// tests/apiCacheInvalidation.test.js —— 项目级 PUT 本就会失效 visits + 矩阵缓存，
// 缺的是跨实例通知，不是缓存失效。
//
// 用法：npx vitest run tests/component/visitFlowRefresh.spec.js
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import VisitsTab from '../../src/components/VisitsTab.vue';
import { createLazyTabState } from '../../src/composables/useLazyTabs.js';
import { api } from '../../src/composables/useApi.js';

// SortableJS 是真实拖拽库，happy-dom 下没有可拖拽的布局（与 F1 集成回归同一处理）。
vi.mock('sortablejs', () => ({
  default: {
    create: () => ({ destroy() {} }),
  },
}));

const PROJECT_ID = 1;
const VISIT_TREAT_ID = 2;

// 保留式双实例宿主：复刻 App.vue + useLazyTabs 的语义 —— v-if 门控首次激活，v-show 保持
// 已激活实例挂载（App.vue 里由 el-tabs 隐藏非激活面板，宿主此处用等价的真实元素包装；
// v-show 不能直接挂在 VisitsTab 上 —— 它是多根组件，会触发 Vue 运行时警告）。
// refreshKey / editMode 由测试经 global.provide 注入，与 F1 集成回归同模式，
// 测试因此能直接统计广播次数。
const RetainedDualHost = defineComponent({
  components: { VisitsTab },
  props: {
    projectId: { type: Number, required: true },
    activeTab: { type: String, required: true },
  },
  setup(props) {
    const { activateTab, isTabActivated } = createLazyTabState(props.activeTab);
    watch(
      () => props.activeTab,
      (tab) => activateTab(tab),
    );
    return { isTabActivated };
  },
  template: `
    <div>
      <div v-if="isTabActivated('visits')" v-show="activeTab === 'visits'">
        <VisitsTab :project-id="projectId" workspace="list" />
      </div>
      <div v-if="isTabActivated('visitflow')" v-show="activeTab === 'visitflow'">
        <VisitsTab :project-id="projectId" workspace="flow" />
      </div>
    </div>
  `,
});

// 伪服务端：权威夹具只在写请求里更新；每次读取返回全新独立快照（组件间/调用间不共享可变
// 对象，否则 flow 会因共享引用「碰巧」更新，掩盖通知缺失）。
function makeServer() {
  const state = {
    visits: [
      { id: 1, name: '筛选期', code: 'V_SCREEN', sequence: 1 },
      { id: 2, name: '治疗期', code: 'V_TREAT', sequence: 2 },
    ],
    forms: [{ id: 10, name: '知情同意', code: 'ICF' }],
  };
  let nextId = 3;

  function visitRows() {
    return state.visits.map((visit) => ({ ...visit }));
  }
  function matrixPayload() {
    const matrix = {};
    for (const visit of state.visits) matrix[visit.id] = { 10: 1 };
    return { visits: visitRows(), forms: state.forms.map((f) => ({ ...f })), matrix };
  }

  async function handle(url, options = {}) {
    const method = options.method || 'GET';
    if (method === 'GET' && url === `/api/projects/${PROJECT_ID}/visits`) return visitRows();
    if (method === 'GET' && url === `/api/projects/${PROJECT_ID}/visit-form-matrix`) return matrixPayload();
    if (method === 'GET' && url === `/api/projects/${PROJECT_ID}/forms`) return state.forms.map((f) => ({ ...f }));
    if (method === 'PUT' && url === `/api/projects/${PROJECT_ID}/visits/${VISIT_TREAT_ID}`) {
      const body = JSON.parse(options.body);
      state.visits[1].name = body.name;
      state.visits[1].code = body.code;
      return { ok: true };
    }
    if (method === 'DELETE' && url === `/api/visits/${VISIT_TREAT_ID}`) {
      state.visits = state.visits.filter((v) => v.id !== VISIT_TREAT_ID);
      return undefined;
    }
    if (method === 'POST' && url === `/api/visits/${VISIT_TREAT_ID}/copy`) {
      const source = state.visits.find((v) => v.id === VISIT_TREAT_ID);
      const copy = {
        ...source,
        id: nextId++,
        name: `${source.name}-副本`,
        code: `${source.code}_COPY`,
        sequence: state.visits.length + 1,
      };
      state.visits.push(copy);
      return { ...copy };
    }
    if (method === 'POST' && url === `/api/projects/${PROJECT_ID}/visits`) {
      const body = JSON.parse(options.body);
      const created = { id: nextId++, name: body.name, code: body.code, sequence: state.visits.length + 1 };
      state.visits.push(created);
      return { ...created };
    }
    if (method === 'POST' && url === `/api/projects/${PROJECT_ID}/visits/reorder`) {
      const ids = JSON.parse(options.body);
      if (ids.length !== state.visits.length) throw new Error('reorder id 数量不符');
      const byId = new Map(state.visits.map((v) => [v.id, v]));
      state.visits = ids.map((id, index) => {
        const visit = byId.get(id);
        visit.sequence = index + 1;
        return visit;
      });
      return { ok: true };
    }
    if (method === 'POST' && url === `/api/projects/${PROJECT_ID}/visits/batch-delete`) {
      const { ids } = JSON.parse(options.body);
      const removed = new Set(ids);
      state.visits = state.visits.filter((v) => !removed.has(v.id));
      return { ok: true };
    }
    throw new Error(`visitFlowRefresh 未预期的请求：${method} ${url}`);
  }
  return { state, handle };
}

// API 边界 spy：真实 api 对象 + 伪服务端（quality-guidelines「Component Mount Tests」约定）。
function stageApi(server) {
  vi.spyOn(api, 'cachedGet').mockImplementation((url) => Promise.resolve(server.handle(url)));
  vi.spyOn(api, 'put').mockImplementation((url, body) =>
    Promise.resolve(server.handle(url, { method: 'PUT', body: JSON.stringify(body) })),
  );
  vi.spyOn(api, 'post').mockImplementation((url, body) =>
    Promise.resolve(server.handle(url, { method: 'POST', body: JSON.stringify(body) })),
  );
  vi.spyOn(api, 'del').mockImplementation((url) => Promise.resolve(server.handle(url, { method: 'DELETE' })));
}

async function mountDualInstance(initialTab) {
  const refreshKey = ref(0);
  const editMode = ref(true);
  const bumps = [];
  watch(refreshKey, () => bumps.push(refreshKey.value));
  const server = makeServer();
  stageApi(server);
  const wrapper = mount(RetainedDualHost, {
    props: { projectId: PROJECT_ID, activeTab: initialTab },
    global: { provide: { refreshKey, editMode } },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, bumps, server };
}

function instance(wrapper, workspace) {
  const found = wrapper.findAllComponents(VisitsTab).find((item) => item.props('workspace') === workspace);
  expect(found, `应存在 workspace=${workspace} 的 VisitsTab 实例`).toBeTruthy();
  return found;
}

async function activateTab(wrapper, tab) {
  await wrapper.setProps({ activeTab: tab });
  await flushPromises();
  await nextTick();
}

async function toggleFlowView(flowWrapper) {
  const switchTrigger = flowWrapper.find('.visit-flow-header .el-switch');
  expect(switchTrigger.exists(), '访视流程头部应有矩阵/列表切换 el-switch').toBe(true);
  await switchTrigger.trigger('click');
  await flushPromises();
  await nextTick();
}

async function clickVisitRow(scopeWrapper, rowIndex, expectedCount = 2) {
  const rows = scopeWrapper.findAll('.el-table__row');
  expect(rows.length, `应渲染 ${expectedCount} 行访视，实际 ${rows.length}`).toBe(expectedCount);
  await rows[rowIndex].trigger('click');
  await flushPromises();
  await nextTick();
  await nextTick();
}

async function clickRowAction(scopeWrapper, rowIndex, ariaLabel) {
  const rows = scopeWrapper.findAll('.el-table__row');
  const button = rows[rowIndex].find(`button[aria-label="${ariaLabel}"]`);
  expect(button.exists(), `第 ${rowIndex + 1} 行应有「${ariaLabel}」按钮`).toBe(true);
  await button.trigger('click');
  await flushPromises();
  await nextTick();
  await nextTick();
}

async function fillPropertyCard(listWrapper, values) {
  const items = listWrapper.findAll('.el-form-item');
  expect(items.length, '属性卡应有两个表单项（OID + 访视名称）').toBe(2);
  for (const item of items) {
    const label = item.find('.el-form-item__label').text().trim();
    if (label === 'OID') await item.find('input').setValue(values.code);
    if (label === '访视名称') await item.find('input').setValue(values.name);
  }
  await nextTick();
}

async function clickButton(scopeWrapper, text) {
  const button = scopeWrapper.findAll('button').find((b) => b.text().trim() === text);
  expect(button, `应存在「${text}」按钮`).toBeTruthy();
  await button.trigger('click');
  await flushPromises();
  await nextTick();
  await nextTick();
}

describe('访视双实例刷新通知：写操作后已挂载的访视流程实例显示最新数据', () => {
  it('AC1：已加载的 flow 在列表实例保存名称/OID 后，矩阵与单访视视图都显示新值', async () => {
    const { wrapper, bumps } = await mountDualInstance('visitflow');
    const flow = instance(wrapper, 'flow');

    // flow 先加载，进入单访视视图并选中非首行访视「治疗期」
    await toggleFlowView(flow); // matrix → single
    await clickVisitRow(flow, 1);
    expect(flow.text()).toContain('治疗期');

    // 切到访视列表（flow 保留挂载），通过属性卡修改同一访视并保存
    await activateTab(wrapper, 'visits');
    const list = instance(wrapper, 'list');
    await clickVisitRow(list, 1);
    await fillPropertyCard(list, { name: '治疗期随访', code: 'V_FUP' });
    await clickButton(list, '保存');

    // 切回保留的访视流程实例（不重挂载）：单访视视图显示新名称/OID 与选中标题
    await activateTab(wrapper, 'visitflow');
    const rows = flow.findAll('.el-table__row');
    const treated = rows.find((row) => row.text().includes('治疗期随访'));
    expect(treated, `单访视列表应渲染新名称行，实际：${rows.map((r) => r.text()).join(' | ')}`).toBeTruthy();
    expect(treated.text()).toContain('V_FUP');
    const titles = flow.findAll('.pane-tool-slot b').map((b) => b.text());
    expect(titles, `选中标题应显示新名称，实际：${titles.join(' | ')}`).toContain('治疗期随访');

    // 矩阵表头显示新名称；矩阵不渲染 OID 列
    await toggleFlowView(flow); // single → matrix
    const headers = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headers.some((text) => text.includes('治疗期随访')), `矩阵表头应显示新名称，实际：${headers.join(' | ')}`).toBe(true);
    expect(flow.text(), '矩阵视图不应渲染 OID').not.toContain('V_FUP');
    expect(flow.text(), '旧 OID 不应残留').not.toContain('V_TREAT');

    // 每次成功保存恰好广播一次刷新信号；读路径不得递归再广播
    expect(bumps.length, `保存后应恰好广播一次，实际 ${bumps.length}`).toBe(1);

    // 二次修改仍同步
    await activateTab(wrapper, 'visits');
    await fillPropertyCard(list, { name: '治疗期随访II', code: 'V_FUP2' });
    await clickButton(list, '保存');
    await activateTab(wrapper, 'visitflow');
    const headersAgain = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headersAgain.some((text) => text.includes('治疗期随访II')), `二次保存后矩阵应更新，实际：${headersAgain.join(' | ')}`).toBe(true);
    await toggleFlowView(flow); // matrix → single
    const titlesAgain = flow.findAll('.pane-tool-slot b').map((b) => b.text());
    expect(titlesAgain).toContain('治疗期随访II');
    expect(bumps.length, `每次成功保存恰好广播一次，实际 ${bumps.length}`).toBe(2);
  });

  it('AC2：取消编辑零写入；保存失败提示错误、不广播、flow 保持持久化旧值', async () => {
    const { wrapper, bumps } = await mountDualInstance('visitflow');
    const flow = instance(wrapper, 'flow');
    await toggleFlowView(flow); // matrix → single
    await clickVisitRow(flow, 1);

    await activateTab(wrapper, 'visits');
    const list = instance(wrapper, 'list');
    await clickVisitRow(list, 1);
    await fillPropertyCard(list, { name: '未保存草稿', code: 'V_DRAFT' });
    await clickButton(list, '取消');

    expect(api.put).not.toHaveBeenCalled();
    expect(list.text()).toContain('← 点击行或新增访视');

    // 重新选中同一行再尝试一次注定失败的保存
    await clickVisitRow(list, 1);
    await fillPropertyCard(list, { name: '失败草稿', code: 'V_FAIL' });
    api.put.mockRejectedValueOnce(new Error('网络故障'));
    await clickButton(list, '保存');

    expect(ElMessage.error).toHaveBeenCalled();
    expect(bumps.length, '失败的保存不得广播刷新信号').toBe(0);

    await activateTab(wrapper, 'visitflow');
    await toggleFlowView(flow); // single → matrix
    const headers = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headers.some((text) => text.includes('治疗期')), 'flow 应保持持久化旧值').toBe(true);
    expect(flow.text()).not.toContain('失败草稿');
  });

  it('AC5：首次进入访视流程前的保存也显示最新数据（既有基线）', async () => {
    const { wrapper, bumps } = await mountDualInstance('visits');
    const list = instance(wrapper, 'list');
    await clickVisitRow(list, 1);
    await fillPropertyCard(list, { name: '治疗期随访', code: 'V_FUP' });
    await clickButton(list, '保存');
    expect(bumps.length).toBe(1);

    // flow 首次激活：挂载加载天然读到最新数据
    await activateTab(wrapper, 'visitflow');
    const flow = instance(wrapper, 'flow');
    const headers = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headers.some((text) => text.includes('治疗期随访')), `矩阵表头应显示新名称，实际：${headers.join(' | ')}`).toBe(true);
  });

  it('AC3：删除选中访视后属性卡保持为空，后续主动行点击仍正常', async () => {
    const { wrapper } = await mountDualInstance('visits');
    const list = instance(wrapper, 'list');
    await clickVisitRow(list, 1); // 选中「治疗期」
    expect(list.text()).toContain('编辑访视');

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await clickRowAction(list, 1, '删除');

    // 所有 watcher 触发的 reload 结算后：属性卡回到空态，未被自动切到其他访视
    expect(list.text()).toContain('属性编辑');
    expect(list.text(), '删除后属性卡不应自动落到其他访视').not.toContain('编辑访视');

    // 后续用户主动点击仍正常选中
    await clickVisitRow(list, 0, 1);
    expect(list.text()).toContain('编辑访视');
  });

  it('AC3：批量删除含选中访视时属性卡同样回到空态', async () => {
    const { wrapper } = await mountDualInstance('visits');
    const list = instance(wrapper, 'list');
    await clickVisitRow(list, 1); // 选中「治疗期」

    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const rows = list.findAll('.el-table__row');
    expect(rows.length).toBe(2);
    // happy-dom 下 label 点击不联动 checkbox，直接对原生 input setValue 触发 selection-change
    await rows[0].find('input[type="checkbox"]').setValue(true);
    await nextTick();
    await rows[1].find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await nextTick();

    const batchButton = list.find('button[aria-label="批量删除访视"]');
    expect(batchButton.exists(), '应有批量删除按钮').toBe(true);
    expect(batchButton.attributes('disabled'), '勾选后批量删除应可用').toBeUndefined();
    await batchButton.trigger('click');
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(list.text()).toContain('属性编辑');
    expect(list.text(), '批量删除后属性卡不应自动落到其他访视').not.toContain('编辑访视');
  });

  it('AC6：复制与新增访视同步到已挂载的访视流程实例', async () => {
    const { wrapper, bumps } = await mountDualInstance('visitflow');
    const flow = instance(wrapper, 'flow');
    const headersBefore = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headersBefore.some((text) => text.includes('治疗期'))).toBe(true);

    await activateTab(wrapper, 'visits');
    const list = instance(wrapper, 'list');

    // 复制「治疗期」：伪服务端新增「治疗期-副本」（复制命名由服务端快照决定）
    await clickRowAction(list, 1, '复制');
    expect(bumps.length, '复制后应广播一次').toBe(1);

    await activateTab(wrapper, 'visitflow');
    const headersAfterCopy = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headersAfterCopy.some((text) => text.includes('治疗期-副本')), `矩阵应出现复制列，实际：${headersAfterCopy.join(' | ')}`).toBe(true);

    // 新增访视
    await activateTab(wrapper, 'visits');
    const addButtons = list.findAll('button[aria-label="新增访视"]');
    expect(addButtons.length, '应有新增访视按钮').toBe(1);
    await addButtons[0].trigger('click');
    await flushPromises();
    await nextTick();
    await fillPropertyCard(list, { name: '随访晚期', code: 'V_EOT' });
    await clickButton(list, '保存');

    await activateTab(wrapper, 'visitflow');
    const headersAfterAdd = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headersAfterAdd.some((text) => text.includes('随访晚期')), `矩阵应出现新增列，实际：${headersAfterAdd.join(' | ')}`).toBe(true);
  });

  it('AC6：序号快捷调整同步到已挂载的 flow，失败时恢复原序并提示', async () => {
    const { wrapper } = await mountDualInstance('visitflow');
    const flow = instance(wrapper, 'flow');

    await activateTab(wrapper, 'visits');
    const list = instance(wrapper, 'list');

    // 双击第二行序号 → 输入 1 → Enter：治疗期移到第一位
    await commitOrdinalEdit(list, 1, '1');
    await flushPromises();
    await nextTick();

    await activateTab(wrapper, 'visitflow');
    const headers = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headers[2], `重排后第一个访视列应为「治疗期」，实际：${headers.join(' | ')}`).toContain('治疗期');
    expect(headers[3]).toContain('筛选期');

    // 失败恢复：筛选期（现第 2 行）调到第 1 位但保存失败 → 恢复原序 + 警告
    await activateTab(wrapper, 'visits');
    api.post.mockRejectedValueOnce(new Error('排序保存失败'));
    await commitOrdinalEdit(list, 1, '1');
    await flushPromises();
    await nextTick();
    expect(ElMessage.warning).toHaveBeenCalledWith('排序保存失败，已恢复');

    // 恢复路径的 reload 也广播（既有恢复语义允许），flow 顺序保持「治疗期」第一
    await activateTab(wrapper, 'visitflow');
    const headersRestored = flow.findAll('.matrix-table thead th').map((th) => th.text());
    expect(headersRestored[2], `失败恢复后第一位仍应为「治疗期」，实际：${headersRestored.join(' | ')}`).toContain('治疗期');
    expect(headersRestored[3]).toContain('筛选期');
  });
});

// 序号快捷编辑：双击序号按钮 → el-input-number 输入目标序号 → change 提交 v-model → Enter 确认
async function commitOrdinalEdit(listWrapper, rowIndex, targetOrdinal) {
  const rows = listWrapper.findAll('.el-table__row');
  const ordinalButton = rows[rowIndex].findAll('button').find((b) => b.find('.ordinal-cell').exists());
  expect(ordinalButton, `第 ${rowIndex + 1} 行应有序号按钮`).toBeTruthy();
  await ordinalButton.trigger('dblclick');
  await nextTick();
  const ordinalInput = listWrapper.find('.el-input-number input');
  expect(ordinalInput.exists(), '双击后应出现序号输入框').toBe(true);
  await ordinalInput.setValue(targetOrdinal);
  await ordinalInput.trigger('change');
  await ordinalInput.trigger('keyup.enter');
  await flushPromises();
  await nextTick();
}
