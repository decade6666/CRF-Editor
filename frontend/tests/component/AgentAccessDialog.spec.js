// AgentAccessDialog 挂载测试：真实 Element Plus + 警告门禁。
// 覆盖：initial-open 加载、凭据列表渲染、发放与一次性令牌（遮罩/切换/复制/关闭清除）、
// 软吊销、共享提案列表/详情/审批绑定摘要（批准与拒绝）、迟到响应丢弃、加载失败提示、刷新。
// 令牌值一律运行时拼接，绝不在源码放置完整秘密形状字面量。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ElMessage } from 'element-plus';
import AgentAccessDialog from '../../src/components/AgentAccessDialog.vue';
import { api } from '../../src/composables/useApi.js';

vi.mock('../../src/composables/clipboardCopy.js', () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(true),
}));

import { copyTextToClipboard } from '../../src/composables/clipboardCopy.js';

// gitleaks 门禁要求秘密形状值运行时拼接
const TEST_TOKEN = 'crf' + 'ag_' + 'e2e'.repeat(8) + '1';

const CREDENTIALS_URL = '/api/projects/5/agent-access/credentials';
const CHANGES_URL = '/api/projects/5/agent-access/changes?limit=50&offset=0';
const DETAIL_URL = '/api/projects/5/agent-access/changes/11';

function credentialRow(overrides = {}) {
  return {
    id: 1,
    project_id: 5,
    name: 'ci 机器人',
    permission: 'read',
    expires_at: '2026-12-01T00:00:00',
    revoked: false,
    created_at: '2026-11-01T00:00:00',
    ...overrides,
  };
}

function changeSummary(overrides = {}) {
  return {
    change_id: 11,
    definition_id: 3,
    tool_name: 'crf_preview_shared_definition_change',
    approval_state: 'pending',
    status: 'pending',
    applied: false,
    created_at: '2026-11-04T10:00:00',
    expires_at: '2099-01-01T10:10:00',
    ...overrides,
  };
}

function changeDetail(overrides = {}) {
  return {
    change_id: 11,
    definition_id: 3,
    tool_name: 'crf_preview_shared_definition_change',
    status: 'pending',
    approval_state: 'pending',
    applied: false,
    patch: { label: '新标签' },
    impact: [{ form_id: 1, form_oid: 'F_A', form_name: '表单A', visit_names: ['V1'], instance_ids: [4, 5] }],
    semantic_diff: ['label: 旧标签 → 新标签'],
    base_fingerprint: 'a'.repeat(64),
    proposal_digest: 'b'.repeat(64),
    expires_at: '2099-01-01T10:10:00',
    created_at: '2026-11-04T10:00:00',
    ...overrides,
  };
}

function routeGet(routes) {
  // 片段路由（任意 project id 命中同一处理器）；对象键顺序即匹配优先级
  return vi.spyOn(api, 'get').mockImplementation((url) => {
    const entry = Object.entries(routes).find(([fragment]) => url.includes(fragment));
    if (!entry) return Promise.reject(new Error('未脚本化 GET: ' + url));
    const handler = entry[1];
    return typeof handler === 'function' ? handler(url) : Promise.resolve(handler);
  });
}

function defaultRoutes(overrides = {}) {
  return {
    '/agent-access/changes/11': changeDetail(),
    '/agent-access/changes?': { changes: [changeSummary()], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
    ...overrides,
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mountDialog(props = {}) {
  return mount(AgentAccessDialog, {
    props: { modelValue: false, projectId: 5, ...props },
  });
}

async function switchToChangesTab(wrapper) {
  const tab = wrapper.findAll('.el-tabs__item').find((t) => t.text().includes('共享提案'));
  await tab.trigger('click');
  await flushPromises();
}

function getCredentialCallCount() {
  return api.get.mock.calls.filter(([url]) => url.includes('/agent-access/credentials')).length;
}

describe('AgentAccessDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('挂载即打开（initial-open）时加载凭据与共享提案', async () => {
    const getSpy = routeGet(defaultRoutes());

    mountDialog({ modelValue: true });
    await flushPromises();

    expect(getSpy).toHaveBeenCalledWith(CREDENTIALS_URL);
    expect(getSpy).toHaveBeenCalledWith(CHANGES_URL);
  });

  it('凭据列表渲染名称、权限与吊销状态', async () => {
    routeGet(
      defaultRoutes({
        '/agent-access/credentials': [
          credentialRow(),
          credentialRow({ id: 2, name: '只读巡检', permission: 'read_write', revoked: true }),
        ],
      })
    );
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('ci 机器人');
    expect(text).toContain('只读巡检');
    expect(text).toContain('已吊销');
    const revokeButtons = wrapper.findAll('[data-test="revoke-credential"]');
    expect(revokeButtons.length).toBe(2);
    expect(revokeButtons[1].attributes('disabled')).toBeDefined();
    expect(revokeButtons[0].attributes('disabled')).toBeUndefined();
  });

  it('发放凭据成功后一次性令牌默认遮罩显示，切换后可见且凭据列表刷新', async () => {
    routeGet(defaultRoutes());
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ ...credentialRow({ id: 9, name: 'e2e' }), token: TEST_TOKEN });
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    const credCallsBeforeIssue = getCredentialCallCount();

    await wrapper.find('[data-test="credential-name"]').setValue('e2e');
    await wrapper.find('[data-test="issue-credential"]').trigger('click');
    await flushPromises();

    expect(postSpy).toHaveBeenCalledWith(CREDENTIALS_URL, {
      name: 'e2e',
      permission: 'read',
      expires_hours: 24,
    });
    expect(getCredentialCallCount()).toBeGreaterThan(credCallsBeforeIssue);
    const panel = wrapper.find('[data-test="issued-token-panel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).not.toContain(TEST_TOKEN);
    await wrapper.find('[data-test="issued-token-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="issued-token"]').text()).toContain(TEST_TOKEN);
  });

  it('令牌复制走统一剪贴板入口并提示成功', async () => {
    routeGet(defaultRoutes());
    vi.spyOn(api, 'post').mockResolvedValue({ ...credentialRow({ id: 9 }), token: TEST_TOKEN });
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();

    await wrapper.find('[data-test="credential-name"]').setValue('e2e');
    await wrapper.find('[data-test="issue-credential"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="issued-token-copy"]').trigger('click');
    await flushPromises();

    expect(copyTextToClipboard).toHaveBeenCalledWith(TEST_TOKEN);
    expect(ElMessage.success).toHaveBeenCalledWith('已复制到剪贴板');
  });

  it('关闭弹窗清除一次性令牌，重新打开后面板不再显示', async () => {
    routeGet(defaultRoutes());
    vi.spyOn(api, 'post').mockResolvedValue({ ...credentialRow({ id: 9 }), token: TEST_TOKEN });
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    await wrapper.find('[data-test="credential-name"]').setValue('e2e');
    await wrapper.find('[data-test="issue-credential"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="issued-token-panel"]').exists()).toBe(true);

    await wrapper.setProps({ modelValue: false });
    await flushPromises();
    expect(wrapper.find('[data-test="issued-token-panel"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    expect(wrapper.find('[data-test="issued-token-panel"]').exists()).toBe(false);
  });

  it('吊销凭据调用软吊销端点并刷新列表', async () => {
    routeGet(defaultRoutes());
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(null);
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    const credCallsBeforeRevoke = getCredentialCallCount();

    await wrapper.findAll('[data-test="revoke-credential"]')[0].trigger('click');
    await flushPromises();

    expect(postSpy).toHaveBeenCalledWith('/api/projects/5/agent-access/credentials/1/revoke');
    expect(getCredentialCallCount()).toBeGreaterThan(credCallsBeforeRevoke);
  });

  it('共享提案列表渲染并按行加载详情', async () => {
    routeGet(defaultRoutes());
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    await switchToChangesTab(wrapper);

    expect(wrapper.text()).toContain('crf_preview_shared_definition_change');
    await wrapper.find('[data-test="change-detail"]').trigger('click');
    await flushPromises();

    expect(api.get.mock.calls.some(([url]) => url === DETAIL_URL)).toBe(true);
    const panel = wrapper.find('[data-test="change-detail-panel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain('表单A');
    expect(panel.text()).toContain('新标签');
    expect(wrapper.find('[data-test="proposal-digest"]').text()).toContain('b'.repeat(64));
  });

  it('批准绑定展示的 proposal_digest 并在成功后清详情刷新列表', async () => {
    routeGet(defaultRoutes());
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(null);
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    await switchToChangesTab(wrapper);
    await wrapper.find('[data-test="change-detail"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-test="approve-change"]').trigger('click');
    await flushPromises();

    expect(postSpy).toHaveBeenCalledWith('/api/projects/5/agent-access/changes/11/approve', {
      proposal_digest: 'b'.repeat(64),
    });
    expect(ElMessage.success).toHaveBeenCalledWith('已批准');
    expect(wrapper.find('[data-test="change-detail-panel"]').exists()).toBe(false);
  });

  it('拒绝同样绑定 proposal_digest', async () => {
    routeGet(defaultRoutes());
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(null);
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    await switchToChangesTab(wrapper);
    await wrapper.find('[data-test="change-detail"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-test="reject-change"]').trigger('click');
    await flushPromises();

    expect(postSpy).toHaveBeenCalledWith('/api/projects/5/agent-access/changes/11/reject', {
      proposal_digest: 'b'.repeat(64),
    });
    expect(ElMessage.success).toHaveBeenCalledWith('已拒绝');
  });

  it('审批失败保留详情并提示错误', async () => {
    routeGet(defaultRoutes());
    vi.spyOn(api, 'post').mockRejectedValue(new Error('提案已过期'));
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    await switchToChangesTab(wrapper);
    await wrapper.find('[data-test="change-detail"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-test="approve-change"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalled();
    expect(wrapper.find('[data-test="change-detail-panel"]').exists()).toBe(true);
  });

  it('项目切换丢弃迟到响应，新项目数据正常写入', async () => {
    const credsDeferrals = [];
    const changesDeferrals = [];
    routeGet({
      '/agent-access/changes/11': changeDetail(),
      '/agent-access/changes?': () => {
        const d = createDeferred();
        changesDeferrals.push(d);
        return d.promise;
      },
      '/agent-access/credentials': () => {
        const d = createDeferred();
        credsDeferrals.push(d);
        return d.promise;
      },
    });
    const wrapper = mountDialog({ modelValue: true, projectId: 5 });
    await flushPromises();
    expect(credsDeferrals.length).toBe(1);

    // 项目 5 的凭据在途时切换项目 → 旧响应必须被丢弃
    await wrapper.setProps({ projectId: 6, modelValue: false });
    await flushPromises();
    credsDeferrals[0].resolve([credentialRow({ name: '旧项目凭据' })]);
    await flushPromises();
    expect(wrapper.text()).not.toContain('旧项目凭据');

    // 重新打开（项目 6）的加载正常写入
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    const pendingCreds = credsDeferrals.length;
    const pendingChanges = changesDeferrals.length;
    expect(pendingCreds).toBeGreaterThan(1);
    credsDeferrals[pendingCreds - 1].resolve([credentialRow({ name: '新项目凭据' })]);
    changesDeferrals[pendingChanges - 1].resolve({ changes: [], total: 0, offset: 0, has_more: false });
    await flushPromises();
    expect(wrapper.text()).toContain('新项目凭据');
  });

  it('加载失败提示错误且不抛出', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('网络错误'));
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalled();
    expect(wrapper.find('[data-test="credentials-tab"]').exists()).toBe(true);
  });

  it('刷新按钮重新加载凭据列表', async () => {
    routeGet(defaultRoutes());
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();
    const callsAfterOpen = getCredentialCallCount();

    await wrapper.find('[data-test="refresh-credentials"]').trigger('click');
    await flushPromises();
    expect(getCredentialCallCount()).toBeGreaterThan(callsAfterOpen);
  });

  it('弹窗宽度经 width prop 落到真实渲染的 el-dialog 内联变量（不靠 scoped 选择器）', async () => {
    // Element Plus 把 width prop 写成 .el-dialog 的内联 --el-dialog-width（主题
    // width: var(--el-dialog-width) 由此解析）。这里断言 prop → 渲染元素内联样式的
    // 真实链接；happy-dom 不建立几何，真实 390px 浏览器验证由主会话验收完成。
    routeGet(defaultRoutes());
    const wrapper = mountDialog({ modelValue: true });
    await flushPromises();

    const dialog = wrapper.find('.el-dialog');
    expect(dialog.exists()).toBe(true);
    expect(dialog.element.style.getPropertyValue('--el-dialog-width')).toBe('min(860px, calc(100vw - 24px))');
  });
});


// ── 修复轮回归（一次性令牌不复活 / 分页 / 过期与已处理提案禁操作） ──


it('关闭弹窗后到达的发放结果不会在重开时复活一次性令牌', async () => {
  routeGet(defaultRoutes());
  const pending = createDeferred();
  vi.spyOn(api, 'post').mockReturnValue(pending.promise);
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await wrapper.find('[data-test="credential-name"]').setValue('review-grant');
  await wrapper.find('[data-test="issue-credential"]').trigger('click');
  await wrapper.setProps({ modelValue: false });
  pending.resolve({ token: 'review-' + 'placeholder' });
  await flushPromises();
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  expect(wrapper.find('[data-test="issued-token-panel"]').exists()).toBe(false);
});

it('提案列表通过加载更多分页到达全部有效提案', async () => {
  routeGet({
    '/agent-access/changes?limit=50&offset=0': {
      changes: [changeSummary({ change_id: 1 })],
      total: 2,
      offset: 0,
      has_more: true,
    },
    '/agent-access/changes?limit=50&offset=1': {
      changes: [changeSummary({ change_id: 2 })],
      total: 2,
      offset: 1,
      has_more: false,
    },
    '/agent-access/credentials': [credentialRow()],
  });
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  expect(wrapper.text()).toContain('crf_preview_shared_definition_change');
  expect(wrapper.find('[data-test="load-more-changes"]').exists()).toBe(true);

  await wrapper.find('[data-test="load-more-changes"]').trigger('click');
  await flushPromises();
  expect(api.get.mock.calls.some(([url]) => url.includes('offset=1'))).toBe(true);
  expect(wrapper.find('[data-test="load-more-changes"]').exists()).toBe(false);
});

it('已处理/已过期提案的批准与拒绝按钮禁用', async () => {
  routeGet({
    '/agent-access/changes/11': changeDetail({ approval_state: 'rejected' }),
    '/agent-access/changes': { changes: [changeSummary()], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
  });
  vi.spyOn(api, 'post').mockResolvedValue(null);
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  await wrapper.find('[data-test="change-detail"]').trigger('click');
  await flushPromises();

  expect(wrapper.find('[data-test="approve-change"]').attributes('disabled')).toBeDefined();
  expect(wrapper.find('[data-test="reject-change"]').attributes('disabled')).toBeDefined();
});

it('提案详情展示派生效果、实例变化与保留覆盖', async () => {
  routeGet({
    '/agent-access/changes/11': changeDetail({
      impact: [
        {
          form_id: 1,
          form_oid: 'F_A',
          form_name: '表单A',
          visit_names: ['V1'],
          instance_ids: [4, 5],
          attribute_changes: [
            { key: 'field_type', before: '文本', after: '复选', derived: false },
            { key: 'codelist_id', before: 7, after: null, derived: true },
          ],
          instance_changes: [{ instance_id: 4, changes: [{ key: 'default_value', before: 'x', after: null }] }],
          label_overrides_preserved: [{ instance_id: 5, label_override: '本地覆盖' }],
        },
      ],
    }),
    '/agent-access/changes': { changes: [changeSummary()], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
  });
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  await wrapper.find('[data-test="change-detail"]').trigger('click');
  await flushPromises();

  const panel = wrapper.find('[data-test="change-detail-panel"]');
  expect(panel.text()).toContain('表单 #1');
  expect(panel.text()).toContain('（OID F_A）');
  expect(panel.text()).toContain('派生');
  expect(panel.text()).toContain('（清空）');
  expect(panel.text()).toContain('保留本地标签覆盖');
  // 待审批预览：真实执行指示为 未执行（不得把内部命令完成当 CRF 已应用）
  expect(panel.text()).toContain('待审批 / 未执行');
});

it('列表执行状态如实区分待审批/已批未用/已执行/已拒绝', async () => {
  routeGet({
    '/agent-access/changes?': {
      changes: [
        changeSummary(),
        changeSummary({ change_id: 12, approval_state: 'approved', applied: false }),
        changeSummary({ change_id: 13, approval_state: 'approved', applied: true }),
        changeSummary({ change_id: 14, approval_state: 'rejected' }),
      ],
      total: 4,
      offset: 0,
      has_more: false,
    },
    '/agent-access/credentials': [credentialRow()],
  });
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  // 凭据表与提案表都在 DOM 中（el-tabs 保留已渲染 pane）；取第二张表
  const rows = wrapper.findAll('.el-table')[1].findAll('.el-table__row');
  expect(rows[0].text()).toContain('待审批');
  expect(rows[0].text()).toContain('未执行');
  // 已批准但未应用：不得显示为已执行
  expect(rows[1].text()).toContain('已批准');
  expect(rows[1].text()).toContain('未执行');
  // 已应用：显示已执行
  expect(rows[2].text()).toContain('已执行');
  // 已拒绝：未执行
  expect(rows[3].text()).toContain('已拒绝');
  expect(rows[3].text()).toContain('未执行');
});

it('详情执行状态：已批准未应用显示未执行，已应用显示已执行', async () => {
  routeGet({
    '/agent-access/changes/11': changeDetail({ approval_state: 'approved', applied: false }),
    '/agent-access/changes': { changes: [changeSummary({ approval_state: 'approved' })], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
  });
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  await wrapper.find('[data-test="change-detail"]').trigger('click');
  await flushPromises();
  const panel = wrapper.find('[data-test="change-detail-panel"]');
  expect(panel.text()).toContain('已批准 / 未执行');
  expect(panel.text()).not.toContain('已执行');

  // 收起后重开一条已应用的详情 → 已批准 / 已执行
  await wrapper.find('[data-test="close-change-detail"]').trigger('click');
  await flushPromises();
  routeGet({
    '/agent-access/changes/11': changeDetail({ approval_state: 'approved', applied: true }),
    '/agent-access/changes': { changes: [changeSummary({ approval_state: 'approved', applied: true })], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
  });
  await wrapper.find('[data-test="change-detail"]').trigger('click');
  await flushPromises();
  expect(wrapper.find('[data-test="change-detail-panel"]').text()).toContain('已批准 / 已执行');
});

it('已过期提案在详情中标记已过期且操作禁用', async () => {
  routeGet({
    '/agent-access/changes/11': changeDetail({ expires_at: '2020-01-01T00:00:00' }),
    '/agent-access/changes': { changes: [changeSummary({ expires_at: '2020-01-01T00:00:00' })], total: 1, offset: 0, has_more: false },
    '/agent-access/credentials': [credentialRow()],
  });
  vi.spyOn(api, 'post').mockResolvedValue(null);
  const wrapper = mountDialog({ modelValue: true });
  await flushPromises();
  await switchToChangesTab(wrapper);
  await wrapper.find('[data-test="change-detail"]').trigger('click');
  await flushPromises();
  const panel = wrapper.find('[data-test="change-detail-panel"]');
  expect(panel.text()).toContain('（已过期）');
  expect(panel.find('[data-test="approve-change"]').attributes('disabled')).toBeDefined();
  expect(panel.find('[data-test="reject-change"]').attributes('disabled')).toBeDefined();
});
