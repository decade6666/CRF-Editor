import { describe, expect, it } from 'vitest';
import { api } from '../../src/composables/useApi.js';
import DesignBaselinesView from '../../src/components/DesignBaselinesView.vue';
import { mountApp, settle } from './appTestHarness.js';

async function chooseAdminPage(wrapper, text) {
  const label = wrapper
    .get('.admin-nav')
    .findAll('label')
    .find((node) => node.text() === text);
  expect(label, `应显示管理员入口 ${text}`).toBeTruthy();
  await label.get('input').setValue(true);
  await settle();
}

describe('App 管理员留档入口', () => {
  it('只在管理员主动进入备份与留档时挂载并读取专用项目列表', async () => {
    const wrapper = await mountApp({
      admin: true,
      get: (url) => (url.startsWith('/api/admin/design-baseline-projects') ? { items: [], total: 0 } : undefined),
    });
    expect(wrapper.findComponent(DesignBaselinesView).exists()).toBe(false);
    expect(api.get.mock.calls.some(([url]) => url.startsWith('/api/admin/design-baseline-projects'))).toBe(false);
    await chooseAdminPage(wrapper, '备份与留档');
    expect(wrapper.findComponent(DesignBaselinesView).exists()).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/api/admin/design-baseline-projects?limit=100&offset=0');
    expect(wrapper.find('.project-workspace').exists()).toBe(false);
  });

  it('普通用户工作台没有管理员留档导航与后台请求', async () => {
    const wrapper = await mountApp();
    expect(wrapper.findComponent(DesignBaselinesView).exists()).toBe(false);
    expect(wrapper.find('.admin-nav').exists()).toBe(false);
    expect(api.get.mock.calls.some(([url]) => url.includes('design-baseline'))).toBe(false);
  });

  it('切出留档页使其停止活动，返回时显式重新读取列表', async () => {
    const wrapper = await mountApp({
      admin: true,
      get: (url) => (url.startsWith('/api/admin/design-baseline-projects') ? { items: [], total: 0 } : undefined),
    });
    await chooseAdminPage(wrapper, '备份与留档');
    const count = () =>
      api.get.mock.calls.filter(([url]) => url.startsWith('/api/admin/design-baseline-projects')).length;
    expect(count()).toBe(1);
    await chooseAdminPage(wrapper, '用户管理');
    expect(count()).toBe(1);
    await chooseAdminPage(wrapper, '备份与留档');
    expect(count()).toBe(2);
  });
});
