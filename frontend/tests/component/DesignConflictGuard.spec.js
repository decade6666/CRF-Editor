import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import DesignNotesDialog from '../../src/components/DesignNotesDialog.vue';
import { api } from '../../src/composables/useApi.js';

const BASE = `"crf-design-v1:p1:${'a'.repeat(32)}:r1"`;
const REVIEW = `"crf-design-v1:p1:${'a'.repeat(32)}:r2"`;
const REVIEW_2 = `"crf-design-v1:p1:${'a'.repeat(32)}:r3"`;
const FORM = { id: 7, project_id: 1, name: '知情同意', code: 'ICF', design_notes: '旧备注' };
const body = () => new DOMWrapper(document.body);
const reply = (data, revision, status = 200) => new Response(JSON.stringify(data), {
  status, headers: revision ? { 'X-CRF-Design-Revision': revision } : {},
});

function dialog() { return body().find('[data-test="design-notes-dialog"]'); }
function input() { return dialog().get('textarea'); }
async function save() {
  await dialog().get('[data-test="design-notes-save"]').trigger('click');
  await flushPromises();
}
async function open() {
  const wrapper = mount(DesignNotesDialog, { props: { modelValue: false, form: FORM, projectId: 1, revision: BASE } });
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  await input().setValue('我的未保存备注 <文本>');
  return wrapper;
}

beforeEach(() => { api.clearAllCache(); });

describe('核心编辑冲突：真实备注控件与 API 边界', () => {
  it('按打开时标签首次提交；冲突取消保留输入且不再发送写入', async () => {
    const writes = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') {
        writes.push(options);
        return reply({ detail: '设计已更新', code: 'STALE_STATE' }, null, 409);
      }
      if (url.endsWith('/references')) return reply([], REVIEW);
      return reply([{ ...FORM, design_notes: '别人已保存的备注' }], REVIEW);
    });
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const wrapper = await open();
    await save();
    expect(writes).toHaveLength(1);
    expect(writes[0].headers['If-Match']).toBe(BASE);
    expect(input().element.value).toBe('我的未保存备注 <文本>');
    expect(wrapper.emitted('saved')).toBeUndefined();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
  });

  it('每次第三方写入均重新审阅；只有确认过的精确标签可用于覆盖', async () => {
    const writes = [];
    let reads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') {
        writes.push(options);
        if (writes.length < 3) return reply({ detail: '设计已更新', code: 'STALE_STATE' }, null, 409);
        return reply({ ...FORM, design_notes: '我的未保存备注 <文本>' }, '"committed"');
      }
      if (url.endsWith('/references')) return reply([], reads === 1 ? REVIEW : REVIEW_2);
      reads++;
      return reply([{ ...FORM, design_notes: `他人备注${reads}` }], reads === 1 ? REVIEW : REVIEW_2);
    });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = await open();
    await save();
    expect(writes.map((request) => request.headers['If-Match'])).toEqual([BASE, REVIEW, REVIEW_2]);
    expect(writes.map((request) => JSON.parse(request.body))).toEqual(Array(3).fill({ design_notes: '我的未保存备注 <文本>' }));
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('项目切换后迟到的审阅确认不能再次提交旧备注', async () => {
    let confirm;
    const writes = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') {
        writes.push(options);
        return reply({ detail: '设计已更新', code: 'STALE_STATE' }, null, 409);
      }
      if (url.endsWith('/references')) return reply([], REVIEW);
      return reply([FORM], REVIEW);
    });
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise((resolve) => { confirm = resolve; }));
    const wrapper = await open();
    await save();
    expect(confirm).toBeTypeOf('function');
    await wrapper.setProps({ projectId: 2, form: { id: 8, project_id: 2, design_notes: '新项目备注' } });
    confirm('confirm');
    await flushPromises();
    expect(writes).toHaveLength(1);
    expect(wrapper.emitted('saved')).toBeUndefined();
  });
});
