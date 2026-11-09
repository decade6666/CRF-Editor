// ProjectInfoTab 的 Agent 访问入口挂载测试：懒挂载（首次打开才渲染对话框）、
// 打开/关闭可见性往返、项目切换转发新 project-id。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ProjectInfoTab from '../../src/components/ProjectInfoTab.vue';
import AgentAccessDialog from '../../src/components/AgentAccessDialog.vue';
import { api } from '../../src/composables/useApi.js';

function projectFixture(id) {
  return {
    id,
    name: `项目${id}`,
    version: '1.0',
    db_type: '其他',
    trial_name: '',
    crf_version: '',
    crf_version_date: '',
    protocol_number: '',
    screening_number_format: '',
    sponsor: '',
    data_management_unit: '',
    company_logo_path: null,
  };
}

function mountTab(project = projectFixture(5)) {
  return mount(ProjectInfoTab, { props: { project } });
}

describe('ProjectInfoTab 的 Agent 访问入口', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url.includes('organization-presets')) return Promise.resolve([]);
      return Promise.reject(new Error('未脚本化 GET: ' + url));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初始不挂载 AgentAccessDialog', async () => {
    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.findComponent(AgentAccessDialog).exists()).toBe(false);
    expect(wrapper.find('[data-test="agent-access-entry"]').exists()).toBe(true);
  });

  it('点击入口按钮懒挂载对话框并打开', async () => {
    const wrapper = mountTab();
    await flushPromises();

    await wrapper.find('[data-test="agent-access-entry"]').trigger('click');
    await flushPromises();

    const dialog = wrapper.findComponent(AgentAccessDialog);
    expect(dialog.exists()).toBe(true);
    expect(dialog.props('modelValue')).toBe(true);
    expect(dialog.props('projectId')).toBe(5);
  });

  it('对话框关闭后保持挂载，仅回到隐藏状态', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('[data-test="agent-access-entry"]').trigger('click');
    await flushPromises();

    wrapper.findComponent(AgentAccessDialog).vm.$emit('update:modelValue', false);
    await flushPromises();

    const dialog = wrapper.findComponent(AgentAccessDialog);
    expect(dialog.exists()).toBe(true);
    expect(dialog.props('modelValue')).toBe(false);

    // 已挂载的对话框可以直接再次打开（懒挂载是“首次打开才渲染”，不是“每次打开重挂”）
    await wrapper.find('[data-test="agent-access-entry"]').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(AgentAccessDialog).props('modelValue')).toBe(true);
  });

  it('项目切换把新 project-id 转发给已挂载的对话框', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('[data-test="agent-access-entry"]').trigger('click');
    await flushPromises();

    await wrapper.setProps({ project: projectFixture(7) });
    await flushPromises();

    expect(wrapper.findComponent(AgentAccessDialog).props('projectId')).toBe(7);
  });
});
