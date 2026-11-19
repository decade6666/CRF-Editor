import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, getApiSessionGeneration } from '../../src/composables/useApi.js';
import FieldsTab from '../../src/components/FieldsTab.vue';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import CodelistQuickEditDialog from '../../src/components/CodelistQuickEditDialog.vue';
import { stageDesignServer } from './designServerFixture.js';

vi.mock('sortablejs', () => ({ default: { create: () => ({ destroy() {}, option() {} }) } }));
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises(); };
const body = () => new DOMWrapper(document.body);
const SAVED_BUT_FOREIGN = '操作已保存，但检测到其他最新修改；保存前请先核对最新内容';
const acceptedWrites = (server) => server.writes().map((call) => call.accepted);

function inputByLabel(scope, label) {
  const item = scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === label);
  expect(item, `应有输入：${label}`).toBeTruthy();
  return item.get('input');
}
function formItemByText(scope, label) {
  return scope.findAll('.el-form-item').find((node) => node.find('.el-form-item__label').text().trim() === label);
}
async function mountEditor(component = FormDesignerTab, { open = true, codelists = [], realTransitions = false } = {}) {
  const server = stageDesignServer();
  server.state.codelists.push(...codelists);
  const refreshKey = ref(0);
  const wrapper = mount(component, { props: { projectId: 1 },
    global: {
      provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') },
      stubs: { transition: !realTransitions },
    },
  });
  await settle();
  if (component === FormDesignerTab) {
    await wrapper.vm.selectFormById(7);
    await settle();
    if (open) { await wrapper.findAll('button').find((n) => n.text().trim() === '设计表单').trigger('click'); await settle(); }
  }
  return { wrapper, server, refreshKey };
}
async function selectFirstField(wrapper) {
  await wrapper.get('.ff-item').trigger('click');
  await settle();
  return wrapper.get('[data-test="designer-field-property-form"]');
}
async function pickFieldType(scope, optionText) {
  const item = formItemByText(scope, '字段类型');
  await item.get('.el-select__wrapper').trigger('click');
  await settle();
  const option = body().findAll('.el-select-dropdown__item').find((node) => node.text() === optionText);
  expect(option, `下拉应出现选项「${optionText}」`).toBeTruthy();
  await option.trigger('click');
  await settle();
}
const unitDialog = (wrapper) => wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增单位'));
async function openUnitDialog(wrapper, symbol) {
  await wrapper.get('[aria-label="新增单位"]').trigger('click');
  await settle();
  const dialog = unitDialog(wrapper);
  expect(dialog, '应有新增单位弹窗').toBeTruthy();
  await dialog.get('input').setValue(symbol);
}
// 打开新增单位弹窗并确认（POST 是否被扣住由调用方先行安排）
async function confirmUnitDialog(wrapper, symbol) {
  await openUnitDialog(wrapper, symbol);
  const dialog = unitDialog(wrapper);
  await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// R2：一次异步管理写入/候选采纳固定其发起时的项目/表单/选择会话/鉴权会话/弹窗会话；
// 每个 await 之后重查。迟到的响应不得在新上下文里回绑编辑器、安装过期候选、关闭新弹窗、
// 清空新输入或弹出过期成功提示；已提交的业务写入不回滚，原项目缓存照常失效。
describe('主会话接管：字典父回调与兼容回退的完整生命周期', () => {
  const dictionaryComponent = (wrapper) => wrapper.findAllComponents(CodelistQuickEditDialog)
    .find((node) => node.props('mode') === 'add');
  const dictionaryDialog = (wrapper) => dictionaryComponent(wrapper).get('.el-dialog');
  const optionsItem = (wrapper, component) => formItemByText(
    component === FieldsTab ? wrapper : wrapper.get('[data-test="designer-field-property-form"]'),
    component === FieldsTab ? '选项' : '字段选项',
  );
  async function openDictionary(wrapper, name) {
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = dictionaryDialog(wrapper);
    await dialog.findAll('.el-form-item')[0].get('input').setValue(name);
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
  }
  async function prepareChoiceEditor(wrapper, component) {
    const scope = component === FieldsTab ? wrapper : await selectFirstField(wrapper);
    if (component === FieldsTab) {
      await wrapper.findAll('.el-table__row')[0].trigger('click');
      await settle();
    }
    await pickFieldType(scope, '单选');
  }

  it.each([
    ['字段库', FieldsTab, false], ['设计器', FormDesignerTab, false],
    ['字段库重开', FieldsTab, true], ['设计器重开', FormDesignerTab, true],
  ])('%s：提交后重读在途时关闭字典，旧父回调不得覆盖后来的选择', async (_name, component, reopen) => {
    const { wrapper, server } = await mountEditor(component, {
      codelists: [{ id: 30, project_id: 1, name: '已有字典', options: [] }], realTransitions: true,
    });
    server.useTransitionMetadata(true);
    await prepareChoiceEditor(wrapper, component);
    api.clearAllCache();
    const release = server.holdReadsAfterNextWrite(component === FieldsTab ? 3 : 5);
    await openDictionary(wrapper, '迟到字典');
    expect(acceptedWrites(server)).toEqual([true]);
    await dictionaryDialog(wrapper).get('.el-dialog__headerbtn').trigger('click');
    await vi.waitFor(() => expect(dictionaryComponent(wrapper).props('modelValue')).toBe(false));
    await optionsItem(wrapper, component).get('.el-select__wrapper').trigger('click');
    await settle();
    await body().findAll('.el-select-dropdown__item').find((node) => node.text() === '已有字典').trigger('click');
    await settle();
    if (reopen) {
      await wrapper.get('[aria-label="新增字典"]').trigger('click');
      await settle();
      await dictionaryDialog(wrapper).findAll('.el-form-item')[0].get('input').setValue('新草稿');
    }
    release();
    await settle();
    expect(optionsItem(wrapper, component).text()).toContain('已有字典');
    expect(ElMessage.success).not.toHaveBeenCalledWith('新增成功');
    expect(server.state.codelists.map((item) => item.name)).toContain('迟到字典');
    if (reopen) {
      expect(dictionaryComponent(wrapper).props('modelValue')).toBe(true);
      expect(dictionaryDialog(wrapper).findAll('.el-form-item')[0].get('input').element.value).toBe('新草稿');
    } else {
      const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
      const save = component === FieldsTab
        ? wrapper.findAll('button').find((node) => node.text().trim() === '保存')
        : wrapper.get('[data-test="designer-property-save"]');
      await save.trigger('click');
      await settle();
      expect(confirm, '关闭后的旧候选不得升级尚未重新载入的编辑基线').toHaveBeenCalledTimes(1);
      expect(acceptedWrites(server)).toEqual([true, false]);
    }
  });

  it.each([
    ['缺失元数据', '鉴权变化'], ['缺失元数据', '编辑会话变化'],
    ['损坏元数据', '鉴权变化'], ['损坏元数据', '编辑会话变化'],
  ])('字段库：%s回退重读遇到%s时不得安装新字典', async (metadata, change) => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(metadata === '损坏元数据');
    if (metadata === '损坏元数据') {
      const fetchResponse = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        const response = await fetchResponse(url, init);
        if (init?.method === 'POST' && String(url).endsWith('/codelists')) {
          response.headers.set('X-CRF-Design-Before-Revision', 'invalid-transition-tag');
        }
        return response;
      }));
    }
    await prepareChoiceEditor(wrapper, FieldsTab);
    const release = server.holdReadsAfterNextWrite(3);
    await openDictionary(wrapper, '旧协议迟读字典');
    expect(acceptedWrites(server)).toEqual([true]);
    if (change === '鉴权变化') {
      localStorage.setItem('crf_token', 'main-repair-next-session');
    } else {
      await wrapper.findAll('.el-table__row')[1].trigger('click');
      await settle();
      await pickFieldType(wrapper, '单选');
    }
    release();
    await settle();
    await optionsItem(wrapper, FieldsTab).get('.el-select__wrapper').trigger('click');
    await settle();
    expect(body().findAll('.el-select-dropdown__item').map((node) => node.text())).not.toContain('旧协议迟读字典');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe('R2：迟到的管理写入与候选重读不得落进新上下文', () => {
  it('单位快捷新增：写入在途时取消并重开弹窗，旧响应不得关闭新弹窗、清空输入或回绑单位', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await selectFirstField(wrapper);
    const releaseWrite = server.holdWrites();
    await openUnitDialog(wrapper, 'kg');
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // 取消在途弹窗并重新打开（新弹窗会话）
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '取消').trigger('click');
    await settle();
    await wrapper.get('[aria-label="新增单位"]').trigger('click');
    await settle();
    const reopened = unitDialog(wrapper);
    expect(reopened, '重开后弹窗应在').toBeTruthy();
    await reopened.get('input').setValue('g');
    releaseWrite();
    await settle();
    // 旧响应不得关闭新弹窗、清空新输入，也不得把 kg 回绑到编辑器
    expect(unitDialog(wrapper), '新弹窗不得被旧响应关闭').toBeTruthy();
    expect(unitDialog(wrapper).get('input').element.value).toBe('g');
    const unitItem = formItemByText(wrapper.get('[data-test="designer-field-property-form"]'), '单位');
    expect(unitItem.text()).not.toContain('kg');
  });

  it('单位快捷新增：POST 写入在途时已切换到字段 B，新单位不得回绑到 B 的编辑器', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await selectFirstField(wrapper);
    const releaseWrite = server.holdWrites();
    await openUnitDialog(wrapper, 'kg');
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // 切换到字段 B（字段 101）
    await wrapper.findAll('.ff-item')[1].trigger('click');
    await settle();
    releaseWrite();
    await settle();
    const editorB = wrapper.get('[data-test="designer-field-property-form"]');
    const unitItem = formItemByText(editorB, '单位');
    expect(unitItem.text(), '字段 B 的单位不得被迟到响应回绑').not.toContain('kg');
    // 已提交的单位写入不回滚：服务端已有该单位
    expect(server.state.units).toHaveLength(1);
    expect(acceptedWrites(server)).toEqual([true]);
  });

  it('字典快捷新增（字段库）：写入在途时卸载宿主，旧响应不得再触发宿主刷新或成功提示', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    const releaseWrite = server.holdWrites();
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('卸载期字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    const callsBeforeRelease = server.calls.length;
    wrapper.unmount();
    releaseWrite();
    await settle();
    // 卸载后迟到响应：不再触发宿主刷新（无新请求）、不弹成功提示
    expect(server.calls.length, '卸载后不得再发起任何请求').toBe(callsBeforeRelease);
    expect(ElMessage.success).not.toHaveBeenCalledWith('新增成功');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('快捷新增单位：整表复制的候选重读先落地时，过期候选不得回退快照或误报外部修改', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    const editor = await selectFirstField(wrapper);
    await inputByLabel(editor, '字段标签').setValue('本页标签');
    // 清空 30s TTL 缓存：单位快捷新增的一致重读恰好 5 个真实读全部扣住（fields 缓存在
    // /api/forms/7 前缀下，项目前缀失效杀不掉，不清会让一致读混入旧缓存标签）。
    api.clearAllCache();
    // 扣住单位快捷新增的一致重读（设计器打开时 5 个一致读全部扣住）
    const releasers = server.holdReads(5);
    await confirmUnitDialog(wrapper, 'kg');
    // 自己的整表复制先提交并安装更新快照（候选重读仍在途）
    await wrapper.findAll('.el-table__row')[0].findAll('[aria-label="复制"]')[0].trigger('click');
    await settle();
    expect(server.state.forms).toHaveLength(2);
    for (const release of releasers) release();
    await settle();
    // 过期候选不安装：本页快照已被自己的复制推进，下一次受保护写入直接提交、不误报
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
    expect(confirm).not.toHaveBeenCalled();
    expect(acceptedWrites(server)).toEqual([true, true, true]);
    expect(server.state.definitions[0].label).toBe('本页标签');
  });

  it('R2a 字段库：候选一致读在途时鉴权会话变化，旧响应不得安装列表/快照', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    // 扣住 POST 提交后的候选一致读（3 个真实 GET：definitions/codelists/units）
    const releaseReads = server.holdReadsAfterNextWrite(3);
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('迟读字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true]);
    // 读在途时鉴权会话变化（等价登出/换号）
    localStorage.setItem('crf_token', 'round2-next-auth');
    releaseReads();
    await settle();
    // RED：当前实现仍会安装旧会话的列表与快照
    await formItemByText(wrapper, '选项').get('.el-select__wrapper').trigger('click');
    await settle();
    const items = body().findAll('.el-select-dropdown__item').map((node) => node.text());
    expect(items, '失效会话不得安装候选一致读').not.toContain('迟读字典');
    expect(ElMessage.warning).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(server.state.codelists.map((c) => c.name)).toContain('迟读字典');
  });

  it('R2a 字段库：回退下拉读在途时鉴权会话变化，失效会话不得把回退数据装进下拉', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    // 挂载完成后外部先推进服务器修订：字典写入的过渡边不再从本页快照可达 → 采纳弃用（诚实警告）→ 走回退下拉读
    server.remote((state) => { state.definitions[0].label = '外部标签'; });
    // 扣住采纳的 3 个一致读 + 回退下拉读（第 4 个）
    const releasers = server.holdReads(4);
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('回退字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true]);
    // 先放行采纳的 3 个一致读：修订不匹配 + 不可证明 → 诚实警告并弃用采纳 → 走回退下拉读
    for (const release of releasers.slice(0, 3)) release();
    await settle();
    expect(ElMessage.warning).toHaveBeenCalledWith('已保存，但检测到其他最新修改；当前列表未刷新，保存前请先核对');
    // 回退下拉读（第 4 个读）在途时鉴权会话变化
    localStorage.setItem('crf_token', 'round2-fallback-auth');
    releasers[3]();
    await settle();
    // RED：失效会话的回退数据不得再落进当前编辑器下拉
    await formItemByText(wrapper, '选项').get('.el-select__wrapper').trigger('click');
    await settle();
    const codelistItems = body().findAll('.el-select-dropdown__item').map((node) => node.text())
      .filter((text) => text === '回退字典');
    expect(codelistItems, '失效会话的回退数据不得污染下拉').toEqual([]);
  });

  it('R2b 设计器：仅关闭弹窗（不重开）时迟到的单位写入不得回绑或清空输入', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await selectFirstField(wrapper);
    const releaseWrite = server.holdWrites();
    await openUnitDialog(wrapper, 'kg');
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // 只关闭弹窗：不重开（dialogSession 不变，仅 modelValue 变 false）
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '取消').trigger('click');
    await settle();
    releaseWrite();
    await settle();
    // RED：仅关闭时旧实现仍回绑单位并清空输入
    const editor = wrapper.get('[data-test="designer-field-property-form"]');
    const unitItem = formItemByText(editor, '单位');
    expect(unitItem.text(), '仅关闭弹窗后迟到写入不得回绑').not.toContain('kg');
    expect(server.state.units).toHaveLength(1);
    expect(acceptedWrites(server)).toEqual([true]);
  });

  it('R2b 设计器：字段 A→B→A 是新编辑会话，迟到的单位写入不得回绑到 A', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await selectFirstField(wrapper);
    const releaseWrite = server.holdWrites();
    await openUnitDialog(wrapper, 'kg');
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // A→B→A：回到同一字段 id 但已是不同编辑会话
    await wrapper.findAll('.ff-item')[1].trigger('click');
    await settle();
    await wrapper.findAll('.ff-item')[0].trigger('click');
    await settle();
    releaseWrite();
    await settle();
    const editorA = wrapper.get('[data-test="designer-field-property-form"]');
    const unitItem = formItemByText(editorA, '单位');
    expect(unitItem.text(), 'A→B→A 后迟到写入不得回绑').not.toContain('kg');
    expect(server.state.units).toHaveLength(1);
    expect(acceptedWrites(server)).toEqual([true]);
  });

  it('R2b 字段库：字典候选一致读在途时字段 A→B→A，旧响应不得把新字典装进旧会话列表', async () => {
    const { wrapper, server } = await mountEditor(FieldsTab);
    server.useTransitionMetadata(true);
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    await pickFieldType(wrapper, '单选');
    // 扣住 POST 提交后的候选一致读（3 个真实 GET）
    const releaseReads = server.holdReadsAfterNextWrite(3);
    await wrapper.get('[aria-label="新增字典"]').trigger('click');
    await settle();
    const dialog = wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增选项'));
    await dialog.findAll('.el-form-item')[0].get('input').setValue('插读字典');
    await dialog.findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    expect(acceptedWrites(server)).toEqual([true]);
    // 候选读在途时字段 A→B→A（两次编辑会话变更）
    await wrapper.findAll('.el-table__row')[1].trigger('click');
    await settle();
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    releaseReads();
    await settle();
    // RED：旧实现先安装候选、后查会话——旧会话的候选读把新字典装进已切换编辑器的列表。
    // A 回选后编辑器按定义回退为文本，重新切到单选以打开选项下拉观察列表内容。
    await pickFieldType(wrapper, '单选');
    await settle();
    await formItemByText(wrapper, '选项').get('.el-select__wrapper').trigger('click');
    await settle();
    const items = body().findAll('.el-select-dropdown__item').map((node) => node.text());
    expect(items, '旧会话候选读不得装入新编辑会话的下拉').not.toContain('插读字典');
    expect(ElMessage.warning).not.toHaveBeenCalled();
  });

  it('快捷新增单位：鉴权会话变化后迟到的一致重读静默放弃，不安装过期候选也不误报', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    await selectFirstField(wrapper);
    const releaseReads = server.holdReadsAfterNextWrite(5);
    // 同 T4：清缓存让写入后的一致重读恰好 5 个真实读全部被扣住（fields 缓存前缀不同）。
    api.clearAllCache();
    await confirmUnitDialog(wrapper, 'kg');
    // 鉴权会话变化（等价于登出/换号后的 crf_token 变化），期间外部又新增一个单位
    localStorage.setItem('crf_token', 'next-session-token');
    server.remote((state) => {
      state.units.push({ id: 610, project_id: 1, symbol: '外部单位', code: 'U2', order_index: 2 });
    });
    releaseReads();
    await settle();
    // 鉴权会话已变：静默放弃——不安装候选（下拉里连旧候选的 kg 都不出现）、不误报外部修改；
    // 业务写入已提交（服务端有两个单位），原项目缓存已失效，等下一次真实加载。
    await wrapper.get('.ff-item').trigger('click');
    await settle();
    const unitItem = formItemByText(wrapper.get('[data-test="designer-field-property-form"]'), '单位');
    await unitItem.get('.el-select__wrapper').trigger('click');
    await settle();
    const symbols = body().findAll('.el-select-dropdown__item').map((node) => node.text());
    expect(symbols, '失效会话不得安装候选重读').not.toContain('kg');
    expect(symbols).not.toContain('外部单位');
    expect(server.state.units).toHaveLength(2);
    expect(acceptedWrites(server)).toEqual([true]);
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
  });
});
