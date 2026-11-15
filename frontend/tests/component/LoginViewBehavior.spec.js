// LoginView 行为挂载测试：真实登录表单走 fetch 边界。
// 覆盖持久化用户名回显、空账号/密码校验、成功登录的令牌写入与事件、
// 401/429/其他状态与网络错误的提示分支，以及回车触发登录。
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElMessage } from 'element-plus';
import LoginView from '../../src/components/LoginView.vue';
import { fakeResponse, scriptFetch, settle } from './appTestHarness.js';

const LOGIN_ROUTE = 'POST /api/auth/login';

// LoginView 读取 r.status；fakeResponse 不带 status，这里补一个带状态的响应构造器。
function loginResponse({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: () => Promise.resolve(json), headers: { get: () => null } };
}

function mountLogin() {
  return mount(LoginView);
}

async function submit(wrapper) {
  await wrapper.find('form').trigger('submit');
  await settle();
}

async function typeCredentials(wrapper, username, password) {
  const inputs = wrapper.findAll('input');
  if (username !== undefined) await inputs[0].setValue(username);
  if (password !== undefined) await inputs[1].setValue(password);
}

describe('LoginView 行为', () => {
  it('回显持久化的上次登录账号', async () => {
    localStorage.setItem('crf_last_username', 'alice');

    const wrapper = mountLogin();

    expect(wrapper.findAll('input')[0].element.value).toBe('alice');
    expect(wrapper.text()).toContain('CRF 编辑器');
  });

  it.each([
    ['账号为空', { username: '   ', password: 'secret', message: '请输入账号' }],
    ['密码为空', { username: 'alice', password: '', message: '请输入密码' }],
  ])('%s时不发请求并提示', async (_case, { username, password, message }) => {
    const fetchSpy = scriptFetch({});

    const wrapper = mountLogin();
    await typeCredentials(wrapper, username, password);
    await submit(wrapper);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ElMessage.error).toHaveBeenCalledWith(message);
  });

  it('登录成功写入令牌与账号、清空密码并发出 login-success', async () => {
    const fetchSpy = scriptFetch({
      [LOGIN_ROUTE]: () => fakeResponse({ json: { access_token: 'token-abc' } }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, '  alice  ', 'secret');
    await submit(wrapper);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ username: 'alice', password: 'secret' });
    expect(localStorage.getItem('crf_token')).toBe('token-abc');
    expect(localStorage.getItem('crf_last_username')).toBe('alice');
    expect(wrapper.findAll('input')[1].element.value).toBe('');
    expect(wrapper.emitted('login-success')).toHaveLength(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('401 带明细时开发模式展示明细', async () => {
    scriptFetch({
      [LOGIN_ROUTE]: () => loginResponse({ ok: false, status: 401, json: { detail: '账号已停用' } }),
    });
    // vitest 下 import.meta.env.DEV 为 true：带明细应展示明细而非通用文案。

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'bad');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('账号已停用');
    expect(localStorage.getItem('crf_token')).toBeNull();
    expect(wrapper.emitted('login-success')).toBeUndefined();
  });

  it('401 无明细时展示通用账号或密码错误', async () => {
    scriptFetch({
      [LOGIN_ROUTE]: () => loginResponse({ ok: false, status: 401, json: {} }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'bad');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('用户名或密码错误');
  });

  it('429 展示限频明细', async () => {
    scriptFetch({
      [LOGIN_ROUTE]: () => loginResponse({ ok: false, status: 429, json: { detail: '尝试次数过多' } }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'bad');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('尝试次数过多');
  });

  it('其他失败状态回落到通用失败文案', async () => {
    scriptFetch({
      [LOGIN_ROUTE]: () => loginResponse({ ok: false, status: 500, json: { detail: '服务器内部错误' } }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'bad');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('服务器内部错误');
  });

  it('失败响应 JSON 解析失败时仍给出登录失败文案', async () => {
    scriptFetch({
      [LOGIN_ROUTE]: () => ({
        ok: false,
        status: 401,
        json: () => Promise.reject(new SyntaxError('bad json')),
        headers: { get: () => null },
      }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'bad');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('用户名或密码错误');
  });

  it('网络错误提示稍后重试', async () => {
    scriptFetch({ [LOGIN_ROUTE]: () => Promise.reject(new TypeError('offline')) });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'secret');
    await submit(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('网络错误，请稍后重试');
    expect(wrapper.emitted('login-success')).toBeUndefined();
  });

  it('密码输入框回车触发登录', async () => {
    const fetchSpy = scriptFetch({
      [LOGIN_ROUTE]: () => fakeResponse({ json: { access_token: 'token-enter' } }),
    });

    const wrapper = mountLogin();
    await typeCredentials(wrapper, 'alice', 'secret');
    await wrapper.findAll('input')[1].trigger('keyup.enter');
    await settle();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('login-success')).toHaveLength(1);
  });
});
