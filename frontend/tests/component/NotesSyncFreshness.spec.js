// R2c：设计备注审阅后的一致重读（synchronizeCleanEditorsAfterReviewedNotes）不得回退更新的本页状态。
// 在途重读期间任何更快的自己的写入推进了本页快照，这份更旧的候选一律不得安装；
// 组件卸载同理。断言观察点：表单属性名称输入框在重读落地后仍保持更新的值。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
import { api } from '../../src/composables/useApi.js';
import { stageDesignServer } from './designServerFixture.js';

vi.mock('sortablejs', () => ({ default: { create: () => ({ destroy() {}, option() {} }) } }));
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises(); };
const body = () => new DOMWrapper(document.body);

async function mountEditor() {
  const server = stageDesignServer();
  const refreshKey = ref(0);
  const wrapper = mount(FormDesignerTab, { props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
  });
  await settle();
  await wrapper.vm.selectFormById(7);
  await settle();
  await wrapper.findAll('button').find((n) => n.text().trim() === '设计表单').trigger('click');
  await settle();
  return { wrapper, server, refreshKey };
}

async function saveNotes(wrapper, text) {
  await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
  await settle();
  await body().get('[data-test="design-notes-input"]').setValue(text);
  await body().get('[data-test="design-notes-save"]').trigger('click');
  await settle();
}

function formNameInput(wrapper) {
  return wrapper.get('[data-test="designer-form-property-name"]').element.value;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('R2c：审阅后的一致重读不得回退更快的自己的写入', () => {
  it.each(['重新载入设计', '刷新列表'])('%s已经展示较新快照时，旧备注重读不得回退画布或属性', async (action) => {
    const { wrapper, server, refreshKey } = await mountEditor();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    server.remote((state) => { state.forms[0].design_notes = '外部备注'; });
    await body().get('[data-test="design-notes-input"]').setValue('审阅备注');
    api.clearAllCache();
    const releases = server.holdReads(7);
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
    for (const release of releases.slice(0, 2)) release();
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false, true]);
    server.remote((state) => {
      state.forms[0].name = '已加载的新表单名';
      state.definitions[0].label = '已加载的新字段标签';
    });
    api.clearAllCache();
    if (action === '重新载入设计') {
      await wrapper.get('[data-test="designer-reload-context"]').trigger('click');
    } else {
      refreshKey.value += 1;
    }
    await settle();
    expect(wrapper.findAll('.ff-item')[0].text()).toContain('已加载的新字段标签');
    if (action === '重新载入设计') expect(formNameInput(wrapper)).toBe('已加载的新表单名');
    for (const release of releases) release();
    await settle();
    expect(wrapper.findAll('.ff-item')[0].text(), '旧备注响应不得覆盖已加载的新快照').toContain('已加载的新字段标签');
    if (action === '重新载入设计') expect(formNameInput(wrapper)).toBe('已加载的新表单名');
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(server.writes().map((call) => call.accepted)).toEqual([false, true]);
  });

  it('重读在途期间本页更快的写入超越候选标签，旧候选不得回退已提交的新名称', async () => {
    const { wrapper, server } = await mountEditor();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 自己的表单属性写入先提交（宿主快照 r1；弹窗打开时冻结该基线）
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('中间表单名');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true]);
    // 打开备注弹窗后外部推进服务器：备注写入走审阅确认重写，跨出外部缺口触发一致重读
    await wrapper.get('[data-test="designer-notes-button"]').trigger('click');
    await settle();
    server.remote((state) => { state.forms[0].design_notes = '外部备注'; });
    await body().get('[data-test="design-notes-input"]').setValue('审阅备注');
    // 清空 GET 缓存：让备注写入后的一致重读恰好 5 个真实读全部被扣住（forms/fields/
    // definitions/codelists/units），响应内容在发起时冻结为「中间表单名」的旧候选。
    api.clearAllCache();
    // 扣住弹窗重读（2 个读）与备注写入后的一致重读（5 个读）
    const releasers = server.holdReads(7);
    await body().get('[data-test="design-notes-save"]').trigger('click');
    await settle();
    for (const release of releasers.slice(0, 2)) release();
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([true, false, true]);
    // 一致重读在途（候选内容=中间表单名）；期间本页更快的表单属性写入沿链越过候选标签
    await wrapper.get('[data-test="designer-form-property-name"]').setValue('更新的表单名');
    await wrapper.get('[data-test="designer-form-property-save"]').trigger('click');
    await settle();
    expect(formNameInput(wrapper)).toBe('更新的表单名');
    for (const release of releasers) release();
    await settle();
    // 全部写入均已提交：服务端新名称在案
    expect(server.writes().map((call) => call.accepted)).toEqual([true, false, true, false, true]);
    expect(ElMessage.error, '同步落地不得报错').not.toHaveBeenCalled();
    expect(server.state.forms[0].name).toBe('更新的表单名');
    // GREEN：被超越的旧候选不安装，名称保持自己写入后的值；
    // RED（无守卫）：旧候选整体回退 forms，名称退回「中间表单名」
    expect(formNameInput(wrapper), '被超越的旧候选不得回退更快的自己的写入').toBe('更新的表单名');
    confirm.mockRestore();
  });

  it('同步重读在途时组件卸载，落地后不得报错或安装', async () => {
    const { wrapper, server } = await mountEditor();
    server.remote((state) => { state.forms[0].name = '外部名'; });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const releasers = server.holdReads(15);
    await saveNotes(wrapper, '卸载期备注');
    await settle();
    for (const release of releasers.slice(0, 10)) release();
    await settle();
    expect(server.writes().map((call) => call.accepted)).toEqual([false, true]);
    wrapper.unmount();
    for (const release of releasers) release();
    await settle();
    expect(ElMessageBox, '卸载后的迟到重读不得触发用户交互').toBeDefined();
    confirm.mockRestore();
  });
});
