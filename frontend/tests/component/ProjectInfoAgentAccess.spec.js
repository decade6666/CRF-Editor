// 旧宿主只保留项目信息；授权入口及可见性往返转由 AppAgentAccess.spec.js 验证。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ProjectInfoTab from '../../src/components/ProjectInfoTab.vue';
import AgentAccessDialog from '../../src/components/AgentAccessDialog.vue';
import { api } from '../../src/composables/useApi.js';

function projectFixture(id) {
  return { id, name: `项目${id}`, version: '1.0', db_type: '其他', company_logo_path: null };
}

describe('ProjectInfoTab 不再承载 Agent 入口', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/organization-presets') return Promise.resolve([]);
      return Promise.reject(new Error(`未脚本化 GET: ${url}`));
    });
  });

  it('初始及项目切换后都没有旧入口或授权窗口，也不请求 Agent 数据', async () => {
    const wrapper = mount(ProjectInfoTab, { props: { project: projectFixture(5) } });
    await flushPromises();

    expect(wrapper.find('[data-test="agent-access-entry"]').exists()).toBe(false);
    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    await wrapper.setProps({ project: projectFixture(7) });
    await flushPromises();
    expect(wrapper.find('[data-test="agent-access-entry"]').exists()).toBe(false);
    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(api.get.mock.calls.filter(([url]) => url.includes('/agent-access/'))).toEqual([]);
    expect(wrapper.text()).toContain('保存');
  });
});
