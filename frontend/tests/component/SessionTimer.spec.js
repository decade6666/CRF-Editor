// SessionTimer 挂载测试：组件级接线（v-if、状态样式、title / aria-label、点击续期），
// 与 tests/sessionTimer.test.js 的 composable 级行为测试互补（设计 D6.2）。
import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import SessionTimer from '../../src/components/SessionTimer.vue';
import { api } from '../../src/composables/useApi.js';
import { TOKEN_STORAGE_KEY } from '../../src/composables/useSessionTimer.js';

const FIXED_NOW_MS = Date.parse('2026-10-09T00:00:00Z');

// 与 src/composables/useSessionTimer.js 的 decodeBase64Url 相对应的 base64url 编码。
function makeToken(expiresInSeconds) {
  const payload = { sub: '1', username: 'tester', ver: 5, exp: expiresInSeconds };
  const base64url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `e30.${base64url}.sig`;
}

function mountTimerWith(expiresInSeconds) {
  localStorage.setItem(TOKEN_STORAGE_KEY, makeToken(expiresInSeconds));
  return mount(SessionTimer);
}

describe('SessionTimer', () => {
  it('正常剩余时长按秒显示，title 与 aria-label 同步倒计时文本', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    const wrapper = mountTimerWith(FIXED_NOW_MS / 1000 + 600);

    expect(wrapper.find('.session-timer').classes()).toContain('session-timer--normal');
    expect(wrapper.find('.session-timer__text').text()).toBe('600(s)');
    expect(wrapper.find('.session-timer').attributes('title')).toBe('600(s)，点击续期');
    expect(wrapper.find('.session-timer').attributes('aria-label')).toBe('600(s)，点击续期');

    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(wrapper.find('.session-timer__text').text()).toBe('599(s)');
  });

  it('剩余时长进入五分钟窗口后显示警告态，窗口内再次走秒仍只提醒一次', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    const wrapper = mountTimerWith(FIXED_NOW_MS / 1000 + 300);

    expect(wrapper.find('.session-timer').classes()).toContain('session-timer--warning');
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
    expect(ElMessage.warning).toHaveBeenCalledWith('会话即将过期，请尽快续期或保存进度');

    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(wrapper.find('.session-timer__text').text()).toBe('299(s)');
    expect(ElMessage.warning).toHaveBeenCalledTimes(1);
  });

  it('localStorage 无令牌时不渲染倒计时按钮', () => {
    const wrapper = mount(SessionTimer);

    expect(wrapper.find('.session-timer').exists()).toBe(false);
  });

  it('点击按钮重新拉取会话信息并提示续期成功', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ username: 'tester', is_admin: false });
    const wrapper = mountTimerWith(Math.floor(Date.now() / 1000) + 600);

    await wrapper.find('.session-timer').trigger('click');
    await flushPromises();

    expect(getSpy).toHaveBeenCalledWith('/api/auth/me');
    expect(ElMessage.success).toHaveBeenCalledWith('会话已续期');
  });
});
