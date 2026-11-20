// R2 T5 独立文件：A→B→A 外部插队用例是全套件最重的真实挂载用例之一（隔离运行 ~2s）。
// 独立文件降低它与其它重型设计器文件同 worker 排队概率，缓解 5000ms 预算偶发超时；
// 这不是已证实的根因修复——vitest 不保证单文件专属 worker，超时与调度/负载相关
// （R4 诊断修订：负载分级 + 调度敏感，非用例缺陷；断言与 RED/GREEN 语义不变）。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../src/composables/useApi.js';
import FormDesignerTab from '../../src/components/FormDesignerTab.vue';
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
async function mountEditor(component = FormDesignerTab, { open = true } = {}) {
  const server = stageDesignServer();
  const refreshKey = ref(0);
  const wrapper = mount(component, { props: { projectId: 1 },
    global: { provide: { refreshKey, editMode: ref(true), projectDbType: ref('其他') } },
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
const unitDialog = (wrapper) => wrapper.findAll('.el-dialog').find((node) => node.text().includes('新增单位'));
async function openUnitDialog(wrapper, symbol) {
  await wrapper.get('[aria-label="新增单位"]').trigger('click');
  await settle();
  const dialog = unitDialog(wrapper);
  expect(dialog, '应有新增单位弹窗').toBeTruthy();
  await dialog.get('input').setValue(symbol);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('R2 T5：写入在途切换 A→B→A 且外部插队', () => {
  it('快捷新增单位：写入在途时切换表单 A→B→A 且外部插队，旧会话候选不得吸收外部状态绕过审阅', async () => {
    const { wrapper, server } = await mountEditor();
    server.useTransitionMetadata(true);
    // 选中字段（保持干净：切表单不触发未保存弹窗）
    await selectFirstField(wrapper);
    // 先复制出表单 B（提交在扣住窗口之前）
    await wrapper.findAll('.el-table__row')[0].findAll('[aria-label="复制"]')[0].trigger('click');
    await settle();
    const releaseWrite = server.holdWrites();
    await openUnitDialog(wrapper, 'kg');
    await unitDialog(wrapper).findAll('button').find((node) => node.text().trim() === '确定').trigger('click');
    await settle();
    // 写入在途期间 A→B→A：两次真实表单切换（选择会话递增两次），读取自由拿到当前最新数据
    await wrapper.findAll('.el-table__row')[1].trigger('click');
    await settle();
    // 期间外部写入插队（仅推进服务器状态；切换读发生在插队前，客户端基线不含外部内容）
    server.remote((state) => { state.definitions[0].label = '外部标签'; });
    await wrapper.findAll('.el-table__row')[0].trigger('click');
    await settle();
    releaseWrite();
    await settle();
    // 旧会话的候选重读带着外部插队内容返回：不得因响应时上下文恰好回到 A 就静默吸收。
    // GREEN：会话已变 → 静默放弃安装/记录链边；外部间隙由下一次受保护写入的审阅如实暴露。
    await wrapper.get('.ff-item').trigger('click');
    await settle();
    const editorA = wrapper.get('[data-test="designer-field-property-form"]');
    await inputByLabel(editorA, '字段标签').setValue('本页标签');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    await wrapper.get('[data-test="designer-property-save"]').trigger('click');
    await settle();
    expect(confirm, '外部插队后下一次写入必须审阅').toHaveBeenCalledTimes(1);
    // 写入序列：整表复制（窗口前）+ 单位快捷新增（扣住窗口内，已提交）+ 字段属性保存（审阅被拒）
    expect(acceptedWrites(server)).toEqual([true, true, false]);
    expect(server.state.definitions[0].label).toBe('外部标签');
    expect(ElMessage.warning).not.toHaveBeenCalledWith(SAVED_BUT_FOREIGN);
  });

});
