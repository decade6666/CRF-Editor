import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils';
import { ElCheckbox, ElInputNumber, ElMessage, ElMessageBox, ElSelect } from 'element-plus';
import { captureDownloads } from './appTestHarness.js';
import { api } from '../../src/composables/useApi.js';
import DesignBaselinesView from '../../src/components/DesignBaselinesView.vue';

const TAG = '"crf-design-v1:p11:original:r0"';
const ID = 'a'.repeat(32);

function context(label = '原始字段') {
  return {
    source_revision: TAG,
    suggested_label: '正式版本',
    content_hash: 'c'.repeat(64),
    logo_data_url: null,
    snapshot: {
      schema_version: 1,
      project: { id: 11, name: '冻结项目' },
      asset_references: { company_logo: null },
      tables: {
        form: [
          {
            id: 21,
            name: '冻结表单',
            code: 'FORM',
            domain: 'Lb',
            paper_orientation: 'portrait',
            annotation_positions: null,
          },
        ],
        form_field: [{ id: 51, form_id: 21, field_definition_id: 41, order_index: 1, inline_mark: 0 }],
        field_definition: [{ id: 41, variable_name: 'FIELD', label, field_type: '文本' }],
        codelist: [],
        codelist_option: [],
        unit: [],
        visit: [],
        visit_form: [],
        field: [],
      },
    },
  };
}

function archive() {
  return {
    id: ID,
    project_id: 11,
    label: '已保存留档',
    remark: '不可变备注',
    creator_name: '管理员',
    created_at: '2026-11-20T01:00:00Z',
    origin: 'manual',
    content_hash: 'c'.repeat(64),
    layout_hash: 'd'.repeat(64),
    asset_hash: null,
    source_revision: TAG,
    artifacts: [
      { kind: 'ecrf', byte_count: 8, sha256: 'e'.repeat(64) },
      { kind: 'acrf', byte_count: 8, sha256: 'f'.repeat(64) },
    ],
  };
}

function setup({ rows = [], capture = context() } = {}) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.startsWith('/api/admin/design-baseline-projects'))
      return {
        items: [
          { id: 11, name: '项目A', owner_username: '用户A' },
          { id: 12, name: '项目B', owner_username: '用户B' },
        ],
        total: 2,
      };
    if (url.includes('/requests/')) return { status: 'pending', request_id: 'b'.repeat(32), baseline_id: null };
    if (url.endsWith('/' + ID)) return { ...archive(), snapshot: capture.snapshot, column_widths: {} };
    if (url.includes('design-baselines?')) return { items: rows, total: rows.length };
    throw new Error(`unexpected GET ${url}`);
  });
  const preview = vi
    .spyOn(api, 'getWithMetadata')
    .mockResolvedValue({ data: capture, revision: capture.source_revision });
  const post = vi.spyOn(api, 'post').mockResolvedValue(archive());
  const del = vi.spyOn(api, 'del').mockResolvedValue({ deleted: true, cleanup_complete: true });
  return { get, preview, post, del };
}

async function button(wrapper, text) {
  const target = wrapper.findAll('button').find((node) => node.text() === text);
  if (!target) throw new Error(`missing button ${text}`);
  await target.trigger('click');
  await flushPromises();
}

async function selected(wrapper, id = 11) {
  const select = wrapper.findAllComponents(ElSelect).find((item) => item.attributes('data-test') === 'archive-project');
  select.vm.$emit('update:modelValue', id);
  await flushPromises();
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('管理员正式留档工作台', () => {
  it('首次只载入管理员项目，选择后读取历史，不自动捕获设计或原件', async () => {
    const calls = setup();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    expect(wrapper.text()).toContain('正式留档');
    expect(calls.get).toHaveBeenCalledWith('/api/admin/projects/11/design-baselines?limit=20&offset=0');
    expect(calls.preview).not.toHaveBeenCalled();
    expect(calls.post).not.toHaveBeenCalled();
    expect(calls.get.mock.calls.every(([url]) => url.startsWith('/api/admin/'))).toBe(true);
  });

  it('取消新建和只读纸面双击不写入，既有设计器列宽不会进入本页', async () => {
    const calls = setup();
    localStorage.setItem('crf:designer:col-widths:21:normal:fieldIds=51', '[0.1,0.9]');
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    expect(wrapper.text()).toContain('原始字段');
    expect(wrapper.find('.word-page').exists()).toBe(true);
    await wrapper.find('.word-page').trigger('dblclick');
    await button(wrapper, '取消新建');
    expect(calls.post).not.toHaveBeenCalled();
    expect(calls.del).not.toHaveBeenCalled();
    expect(localStorage.getItem('crf:designer:col-widths:21:normal:fieldIds=51')).toBe('[0.1,0.9]');
  });

  it('创建只提交已展示设计的 revision、独立标签备注和显式列宽，不写普通编辑 API', async () => {
    const calls = setup();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await wrapper.find('[data-test="archive-label"]').setValue('正式 v2');
    await wrapper.find('[data-test="archive-remark"]').setValue('本次备注');
    await button(wrapper, '生成并保存双份原件');
    expect(calls.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = calls.post.mock.calls[0];
    expect(url).toBe('/api/admin/projects/11/design-baselines');
    expect(body).toEqual({
      request_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      label: '正式 v2',
      remark: '本次备注',
      column_widths: {},
    });
    expect(options.headers['If-Match']).toBe(TAG);
    expect(ElMessage.success).toHaveBeenCalledWith('双份正式原件已保存');
  });

  it('网络结果不确定时保留请求编号，只允许查询，不自动重新 POST', async () => {
    const calls = setup();
    calls.post.mockRejectedValue(new Error('connection lost'));
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await button(wrapper, '生成并保存双份原件');
    expect(wrapper.text()).toContain('查询请求状态');
    expect(calls.post).toHaveBeenCalledTimes(1);
    await button(wrapper, '查询请求状态');
    expect(calls.get.mock.calls.some(([url]) => url.includes('/requests/'))).toBe(true);
    expect(calls.post).toHaveBeenCalledTimes(1);
  });

  it('设计冲突保留输入并要求重新预览，不隐式刷新或覆盖', async () => {
    const calls = setup();
    calls.post.mockRejectedValue(Object.assign(new Error('设计已变化'), { code: 'STALE_STATE', status: 409 }));
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await wrapper.find('[data-test="archive-label"]').setValue('保留的标签');
    await button(wrapper, '生成并保存双份原件');
    expect(wrapper.find('[data-test="archive-label"]').element.value).toBe('保留的标签');
    expect(wrapper.text()).toContain('重新加载预览');
    expect(calls.preview).toHaveBeenCalledTimes(1);
    expect(calls.post).toHaveBeenCalledTimes(1);
  });

  it('取消整对删除不请求，确认文字明确说明比较和两份原件的损失', async () => {
    const calls = setup({ rows: [archive()] });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '删除整对');
    expect(confirm.mock.calls[0][0]).toContain('eCRF 和 aCRF');
    expect(confirm.mock.calls[0][0]).toContain('比较');
    expect(calls.del).not.toHaveBeenCalled();
  });

  it('确认整对删除后提交精确确认并报告提交后的清理告警', async () => {
    const calls = setup({ rows: [archive()] });
    calls.del.mockResolvedValue({ deleted: true, cleanup_complete: false });
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '删除整对');
    expect(calls.del).toHaveBeenCalledWith(`/api/admin/projects/11/design-baselines/${ID}`, {
      data: { confirm_pair_loss: true },
      withResponse: true,
    });
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('文件清理未完成'));
  });

  it('项目 A→B→A 期间迟到的预览不能重新打开或取得创建权限', async () => {
    const calls = setup();
    const pending = deferred();
    calls.preview.mockReturnValue(pending.promise);
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper, 11);
    const opening = button(wrapper, '新建正式留档');
    await selected(wrapper, 12);
    await selected(wrapper, 11);
    pending.resolve({ data: context('迟到字段'), revision: TAG });
    await opening;
    expect(wrapper.text()).not.toContain('迟到字段');
    expect(wrapper.find('[data-test="archive-label"]').exists()).toBe(false);
    expect(calls.post).not.toHaveBeenCalled();
  });

  it('卸载后迟到的创建成功不再更新列表、提示成功或下载', async () => {
    const calls = setup();
    const pending = deferred();
    calls.post.mockReturnValue(pending.promise);
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    const creating = button(wrapper, '生成并保存双份原件');
    const reads = calls.get.mock.calls.length;
    wrapper.unmount();
    pending.resolve(archive());
    await creating;
    expect(calls.get).toHaveBeenCalledTimes(reads);
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('预览 body/tag 不一致时不展示设计也不允许创建', async () => {
    const calls = setup();
    calls.preview.mockResolvedValue({ data: context(), revision: '"different"' });
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    expect(wrapper.find('[data-test="archive-label"]').exists()).toBe(false);
    expect(calls.post).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it('手动相对列宽只进入本次原件，同时在共享预览显示相同比例', async () => {
    const calls = setup();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    const checkbox = wrapper.findComponent(ElCheckbox);
    checkbox.vm.$emit('change', true);
    await flushPromises();
    const widths = wrapper.findAllComponents(ElInputNumber);
    expect(widths).toHaveLength(2);
    widths[0].vm.$emit('update:modelValue', 30);
    widths[1].vm.$emit('update:modelValue', 70);
    await flushPromises();
    expect(wrapper.findAll('.word-page col').map((column) => column.attributes('style'))).toEqual([
      'width: 30%;',
      'width: 70%;',
    ]);
    await button(wrapper, '生成并保存双份原件');
    expect(calls.post.mock.calls[0][1].column_widths).toEqual({ 'normal:fieldIds=51': [0.3, 0.7] });
  });

  it('下载只使用原件 API 并核对索引，释放临时下载 URL', async () => {
    setup({ rows: [archive()] });
    const original = vi
      .spyOn(api, 'getOriginal')
      .mockResolvedValue({ blob: new Blob(['original']), sha256: 'e'.repeat(64) });
    const files = captureDownloads();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '下载 eCRF');
    expect(original).toHaveBeenCalledWith(`/api/admin/projects/11/design-baselines/${ID}/originals/ecrf`);
    expect(files.clicks).toEqual([
      { href: 'blob:crf-download', download: `baseline-${ID}-ecrf.docx`, attached: false },
    ]);
    expect(files.revoke).toHaveBeenCalledWith('blob:crf-download');
  });

  it('原件校验信息与索引不符时不触发浏览器下载', async () => {
    setup({ rows: [archive()] });
    vi.spyOn(api, 'getOriginal').mockResolvedValue({ blob: new Blob(['original']), sha256: 'f'.repeat(64) });
    const files = captureDownloads();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '下载 eCRF');
    expect(files.create).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('原件与当前索引不一致'));
  });

  it('项目切换后迟到的原件响应不再下载或提示成功', async () => {
    setup({ rows: [archive()] });
    const delayed = deferred();
    vi.spyOn(api, 'getOriginal').mockReturnValue(delayed.promise);
    const files = captureDownloads();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    const downloading = button(wrapper, '下载 eCRF');
    await selected(wrapper, 12);
    delayed.resolve({ blob: new Blob(['original']), sha256: 'e'.repeat(64) });
    await downloading;
    expect(files.create).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('确认弹窗未决时切换项目，迟到确认不能删除原项目留档', async () => {
    const calls = setup({ rows: [archive()] });
    const delayed = deferred();
    vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(delayed.promise);
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    const removing = button(wrapper, '删除整对');
    await selected(wrapper, 12);
    delayed.resolve('confirm');
    await removing;
    expect(calls.del).not.toHaveBeenCalled();
  });

  it('查询证实失败后才显式重试，保留原请求编号和已确认输入', async () => {
    const calls = setup();
    calls.post.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(archive());
    const defaultGet = calls.get.getMockImplementation();
    calls.get.mockImplementation((url) =>
      url.includes('/requests/') ? Promise.resolve({ status: 'failed' }) : defaultGet(url),
    );
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await button(wrapper, '生成并保存双份原件');
    const originalBody = calls.post.mock.calls[0][1];
    await button(wrapper, '查询请求状态');
    expect(calls.post).toHaveBeenCalledTimes(1);
    await button(wrapper, '显式重试同一请求');
    expect(calls.post).toHaveBeenCalledTimes(2);
    expect(calls.post.mock.calls[1][1]).toEqual({ ...originalBody, retry: true });
    expect(calls.preview).toHaveBeenCalledTimes(1);
  });

  it('请求查询证实已完成时只刷新历史，不再次生成原件', async () => {
    const calls = setup();
    calls.post.mockRejectedValue(new Error('connection lost'));
    const defaultGet = calls.get.getMockImplementation();
    calls.get.mockImplementation((url) =>
      url.includes('/requests/') ? Promise.resolve({ status: 'completed', baseline_id: ID }) : defaultGet(url),
    );
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await button(wrapper, '生成并保存双份原件');
    await button(wrapper, '查询请求状态');
    expect(calls.post).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-test="archive-label"]').exists()).toBe(false);
    expect(ElMessage.success).toHaveBeenCalledWith('已确认该请求的双份原件保存成功');
  });

  it('已保存详情使用冻结设计和版式，关闭不产生修改', async () => {
    const calls = setup({ rows: [archive()] });
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '查看设计');
    const body = new DOMWrapper(document.body);
    expect(body.text()).toContain('不可变备注');
    expect(body.text()).toContain('原始字段');
    await button(body, '关闭');
    expect(calls.post).not.toHaveBeenCalled();
    expect(calls.del).not.toHaveBeenCalled();
  });

  it('会话失效后迟到的预览不能恢复敏感设计或继续请求', async () => {
    const calls = setup();
    const delayed = deferred();
    calls.preview.mockReturnValue(delayed.promise);
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    const opening = button(wrapper, '新建正式留档');
    window.dispatchEvent(new CustomEvent('crf:auth-expired'));
    delayed.resolve({ data: context('失效会话字段'), revision: TAG });
    await opening;
    expect(wrapper.text()).not.toContain('失效会话字段');
    expect(calls.post).not.toHaveBeenCalled();
  });

  it('无关的跨标签页主题变化不能清空尚未提交的留档输入', async () => {
    setup();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await wrapper.find('[data-test="archive-label"]').setValue('保留的输入');
    window.dispatchEvent(new StorageEvent('storage', { key: 'crf_theme', newValue: 'dark' }));
    await flushPromises();
    expect(wrapper.find('[data-test="archive-label"]').element.value).toBe('保留的输入');
  });

  it('当前管理员权限被拒绝时立即清空历史和新建上下文', async () => {
    const calls = setup({ rows: [archive()] });
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    calls.get.mockRejectedValue(Object.assign(new Error('需要管理员权限'), { status: 403 }));
    await button(wrapper, '刷新记录');
    expect(wrapper.find('[data-test="archive-label"]').exists()).toBe(false);
    expect(wrapper.find('.archive-table').text()).not.toContain('已保存留档');
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('需要管理员权限'));
  });

  it('真实统一 API 将原件响应头和 Blob 交给下载，未另开认证通道', async () => {
    const read = api.get;
    const calls = setup({ rows: [archive()] });
    const ordinaryGet = calls.get.getMockImplementation();
    calls.get.mockImplementation((url, options) =>
      url.includes('/originals/') ? read(url, options) : ordinaryGet(url, options),
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'X-CRF-Original-SHA256': 'f'.repeat(64) }),
      blob: async () => new Blob(['original']),
    });
    const files = captureDownloads();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '下载 aCRF');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/design-baselines/${ID}/originals/acrf`),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(files.clicks[0].download).toBe(`baseline-${ID}-acrf.docx`);
    expect(files.revoke).toHaveBeenCalledWith('blob:crf-download');
  });

  it.each([
    ['缺失校验头', null, 8, '未收到原件校验信息'],
    ['无效校验头', 'invalid', 8, '未收到原件校验信息'],
    ['空原件', 'e'.repeat(64), 0, '原件大小无效'],
    ['超预算原件', 'e'.repeat(64), 64 * 1024 * 1024 + 1, '原件大小无效'],
  ])('真实统一 API 拒绝%s，页面不触发文件下载', async (_case, sha256, size, message) => {
    const read = api.get;
    const calls = setup({ rows: [archive()] });
    const ordinaryGet = calls.get.getMockImplementation();
    calls.get.mockImplementation((url, options) =>
      url.includes('/originals/') ? read(url, options) : ordinaryGet(url, options),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(sha256 ? { 'X-CRF-Original-SHA256': sha256 } : {}),
      blob: async () => ({ size }),
    });
    const files = captureDownloads();
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '下载 eCRF');
    expect(files.create).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining(message));
  });

  it('真实统一 DELETE 发送整对确认并消费响应，不改变普通删除默认行为', async () => {
    const remove = api.del;
    const calls = setup({ rows: [archive()] });
    calls.del.mockImplementation(remove);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ deleted: true, cleanup_complete: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '删除整对');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/design-baselines/${ID}`),
      expect.objectContaining({ method: 'DELETE', body: '{"confirm_pair_loss":true}' }),
    );
    expect(ElMessage.success).toHaveBeenCalledWith('整对留档已删除');
    expect(await api.del('/api/codelists/99')).toBeUndefined();
    expect(fetch.mock.calls[1][1]).not.toHaveProperty('body');
  });

  it('显式重载冲突预览保留标签备注，但丢弃旧列宽并展示新的冻结设计', async () => {
    const calls = setup();
    calls.post.mockRejectedValue(Object.assign(new Error('设计已变化'), { code: 'STALE_STATE', status: 409 }));
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await wrapper.find('[data-test="archive-label"]').setValue('保留标签');
    await wrapper.find('[data-test="archive-remark"]').setValue('保留备注');
    wrapper.findComponent(ElCheckbox).vm.$emit('change', true);
    await flushPromises();
    await button(wrapper, '生成并保存双份原件');
    const updated = { ...context('重新读取的字段'), source_revision: TAG.replace('r0', 'r1') };
    calls.preview.mockResolvedValue({ data: updated, revision: updated.source_revision });
    await button(wrapper, '重新加载预览');
    expect(wrapper.find('[data-test="archive-label"]').element.value).toBe('保留标签');
    expect(wrapper.find('[data-test="archive-remark"]').element.value).toBe('保留备注');
    expect(wrapper.text()).toContain('重新读取的字段');
    expect(wrapper.findAllComponents(ElInputNumber)).toHaveLength(0);
    expect(calls.post).toHaveBeenCalledTimes(1);
  });

  it('已删除请求的查询不允许原身份重试，提示重新预览发起新请求', async () => {
    const calls = setup();
    calls.post.mockRejectedValue(new Error('connection lost'));
    const ordinaryGet = calls.get.getMockImplementation();
    calls.get.mockImplementation((url) =>
      url.includes('/requests/') ? Promise.resolve({ status: 'deleted' }) : ordinaryGet(url),
    );
    const wrapper = mount(DesignBaselinesView);
    await flushPromises();
    await selected(wrapper);
    await button(wrapper, '新建正式留档');
    await button(wrapper, '生成并保存双份原件');
    await button(wrapper, '查询请求状态');
    expect(wrapper.text()).toContain('留档已删除');
    expect(wrapper.findAll('button').some((item) => item.text() === '显式重试同一请求')).toBe(false);
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('重新预览'));
    expect(calls.post).toHaveBeenCalledTimes(1);
  });
});
