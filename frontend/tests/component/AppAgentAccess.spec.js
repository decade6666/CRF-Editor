// 真实 App + Element Plus + AgentAccessDialog：设置中的当前项目入口及项目/会话生命周期。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessageBox } from 'element-plus';
import AgentAccessDialog from '../../src/components/AgentAccessDialog.vue';
import ProjectInfoTab from '../../src/components/ProjectInfoTab.vue';
import { api } from '../../src/composables/useApi.js';
import {
  PROJECTS,
  buttonByText,
  deferred,
  dialogByTitle,
  mountApp as mountHarnessApp,
  openSettings,
  selectProject,
  settle,
} from './appTestHarness.js';

// gitleaks 门禁要求秘密形状值运行时拼接
const TEST_TOKEN = 'crf' + 'ag_' + 'disposable'.repeat(4);
const LEAVE_REASONS = ['关闭设置', '切换项目', '删除项目', '退出登录', '会话过期'];

function settingsDialog(wrapper) {
  return dialogByTitle(wrapper, '设置');
}

function agentRequests() {
  return [...api.get.mock.calls, ...api.post.mock.calls]
    .map(([url]) => url)
    .filter((url) => url.includes('/agent-access/'));
}

function expectOnlyNumericProjectRequests() {
  for (const url of agentRequests()) expect(url).toMatch(/^\/api\/projects\/\d+\/agent-access\//);
}

function agentDialogUid(wrapper) {
  return wrapper.findComponent(AgentAccessDialog).vm.$.uid;
}

async function openAgentAccess(wrapper) {
  await settingsDialog(wrapper).get('[data-test="agent-access-entry"]').trigger('click');
  await settle();
  return wrapper.findComponent(AgentAccessDialog);
}

function agentRoutes(url) {
  if (url.includes('/agent-access/credentials')) return [];
  if (url.includes('/agent-access/changes?')) return { changes: [], total: 0, has_more: false };
  return undefined;
}

function mountApp({ admin = false, select = true, get } = {}) {
  return mountHarnessApp({
    admin,
    select,
    get: (url) => get?.(url) ?? agentRoutes(url),
    post: () => ({ id: 9, token: TEST_TOKEN }),
  });
}

async function leaveContext(wrapper, reason) {
  if (reason === '关闭设置') {
    // 普通用户不再有底部关闭按钮；公开 v-model 关闭事件覆盖宿主清理，真实 × 交互另做浏览器验收。
    settingsDialog(wrapper).vm.$emit('update:modelValue', false);
  } else if (reason === '切换项目') {
    await selectProject(wrapper, PROJECTS[1].name);
  } else if (reason === '删除项目') {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    await wrapper.findAll('[aria-label="删除项目"]')[0].trigger('click');
  } else if (reason === '退出登录') {
    await buttonByText(settingsDialog(wrapper), '退出登录').trigger('click');
  } else {
    window.dispatchEvent(new Event('crf:auth-expired'));
  }
  await settle();
}

describe('App 设置中的 Agent 授权入口', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('只打开设置不挂载授权窗口，也不请求 Agent 数据', async () => {
    const wrapper = await mountApp();
    await openSettings(wrapper);

    expect(settingsDialog(wrapper).get('[data-test="agent-access-entry"]').text()).toBe('Agent 授权');
    expect(settingsDialog(wrapper).text()).toContain(PROJECTS[0].name);
    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(agentRequests()).toEqual([]);
  });

  it('未选择项目时入口禁用并提示，点击不挂载窗口也不发请求', async () => {
    const wrapper = await mountApp({ select: false });
    await openSettings(wrapper);
    const entry = settingsDialog(wrapper).get('[data-test="agent-access-entry"]');

    expect(entry.isDisabled()).toBe(true);
    expect(settingsDialog(wrapper).text()).toContain('请先选择项目');
    await entry.trigger('click');
    await settle();
    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(agentRequests()).toEqual([]);
  });

  it('管理员设置不提供项目属主入口', async () => {
    const wrapper = await mountApp({ admin: true });
    await openSettings(wrapper);

    expect(settingsDialog(wrapper).find('[data-test="agent-access-entry"]').exists()).toBe(false);
    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(agentRequests()).toEqual([]);
  });

  it('首次打开懒挂载一个复用窗口，传入当前项目数字 id，且不嵌在设置弹窗内', async () => {
    const wrapper = await mountApp();
    await openSettings(wrapper);
    const dialog = await openAgentAccess(wrapper);

    expect(wrapper.findAllComponents(AgentAccessDialog)).toHaveLength(1);
    expect(dialog.props()).toMatchObject({ modelValue: true, projectId: 5 });
    expect(agentRequests()).toEqual([
      '/api/projects/5/agent-access/credentials',
      '/api/projects/5/agent-access/changes?limit=50&offset=0',
    ]);
    expect(settingsDialog(wrapper).findComponent(AgentAccessDialog).exists()).toBe(false);
  });

  it('关闭授权窗口保持实例并清除一次性令牌，重新打开仍可使用', async () => {
    const wrapper = await mountApp();
    await openSettings(wrapper);
    const dialog = await openAgentAccess(wrapper);
    const uid = agentDialogUid(wrapper);
    await dialog.get('[data-test="credential-name"]').setValue('临时凭据');
    await dialog.get('[data-test="issue-credential"]').trigger('click');
    await settle();
    expect(dialog.get('[data-test="issued-token-panel"]').text()).not.toContain(TEST_TOKEN);

    dialog.findComponent({ name: 'ElDialog' }).vm.$emit('update:modelValue', false);
    await settle();
    expect(wrapper.findComponent(AgentAccessDialog).props('modelValue')).toBe(false);
    expect(agentDialogUid(wrapper)).toBe(uid);

    const reopened = await openAgentAccess(wrapper);
    expect(agentDialogUid(wrapper)).toBe(uid);
    expect(reopened.props('modelValue')).toBe(true);
    expect(reopened.find('[data-test="issued-token-panel"]').exists()).toBe(false);
  });

  it.each(LEAVE_REASONS)('%s 立即卸载授权上下文，不发出无效或新项目请求', async (reason) => {
    const wrapper = await mountApp();
    await openSettings(wrapper);
    await openAgentAccess(wrapper);
    const requestsBefore = agentRequests().length;

    await leaveContext(wrapper, reason);

    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(agentRequests()).toHaveLength(requestsBefore);
    expectOnlyNumericProjectRequests();
    if (reason === '删除项目') {
      expect(settingsDialog(wrapper).get('[data-test="agent-access-entry"]').isDisabled()).toBe(true);
    }
    if (reason === '切换项目') {
      const dialog = await openAgentAccess(wrapper);
      expect(dialog.props('projectId')).toBe(7);
      expect(agentRequests()).toContain('/api/projects/7/agent-access/credentials');
    }
  });

  it.each(LEAVE_REASONS)('%s 后迟到的凭据发放结果不会恢复令牌或刷新旧列表', async (reason) => {
    const pending = deferred();
    const wrapper = await mountApp();
    api.post.mockReturnValue(pending.promise);
    await openSettings(wrapper);
    const dialog = await openAgentAccess(wrapper);
    await dialog.get('[data-test="credential-name"]').setValue('未完成发放');
    await dialog.get('[data-test="issue-credential"]').trigger('click');
    await settle();
    expect(api.post).toHaveBeenCalledWith('/api/projects/5/agent-access/credentials', {
      name: '未完成发放',
      permission: 'read',
      expires_hours: 24,
    });
    const requestsBefore = agentRequests().length;
    await leaveContext(wrapper, reason);

    pending.resolve({ id: 10, token: TEST_TOKEN });
    await settle();

    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(agentRequests()).toHaveLength(requestsBefore);
    if (reason === '关闭设置' || reason === '切换项目') {
      if (reason === '关闭设置') await openSettings(wrapper);
      const reopened = await openAgentAccess(wrapper);
      expect(reopened.find('[data-test="issued-token-panel"]').exists()).toBe(false);
    }
  });

  it('项目切换丢弃旧项目迟到的列表响应，重新打开只显示新项目凭据', async () => {
    const pending = deferred();
    const wrapper = await mountApp({
      get: (url) => {
        if (url === '/api/projects/5/agent-access/credentials') return pending.promise;
        if (url === '/api/projects/7/agent-access/credentials') {
          return [{ id: 4, name: '新项目凭据', permission: 'read', revoked: false }];
        }
        return undefined;
      },
    });
    await openSettings(wrapper);
    await openAgentAccess(wrapper);
    await selectProject(wrapper, PROJECTS[1].name);
    const dialog = await openAgentAccess(wrapper);

    pending.resolve([{ id: 1, name: '旧项目迟到凭据', permission: 'read', revoked: false }]);
    await settle();

    expect(dialog.text()).toContain('新项目凭据');
    expect(dialog.text()).not.toContain('旧项目迟到凭据');
  });

  it('同 id 项目元数据更新不关闭授权窗口，并同步当前项目名称', async () => {
    const wrapper = await mountApp();
    await openSettings(wrapper);
    await openAgentAccess(wrapper);
    const uid = agentDialogUid(wrapper);

    wrapper.findComponent(ProjectInfoTab).vm.$emit('updated', { ...PROJECTS[0], name: '已更名项目' });
    await settle();

    expect(agentDialogUid(wrapper)).toBe(uid);
    expect(wrapper.findComponent(AgentAccessDialog).props('modelValue')).toBe(true);
    expect(settingsDialog(wrapper).text()).toContain('已更名项目');
  });
});
