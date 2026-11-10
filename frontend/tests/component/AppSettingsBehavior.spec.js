// 真实 App + Element Plus：设置弹窗内的既有功能——普通用户改密、管理员全局设置与 AI 连接测试、
// 主题切换、数据库导出与项目导入。只替换外部边界：api 对象、fetch / 浏览器下载、ElMessageBox；不消音 Vue 警告。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElMessage, ElMessageBox } from 'element-plus';
import LoginView from '../../src/components/LoginView.vue';
import { api } from '../../src/composables/useApi.js';
import {
  body,
  buttonByText,
  captureDownloads,
  chooseFiles,
  dialogByTitle,
  fakeResponse,
  formItem,
  mountApp,
  openSettings,
  requestedUrls,
  scriptFetch,
  settle,
} from './appTestHarness.js';

// 低于门禁检测长度的一次性测试口令，不对应任何真实账号。
const OLD_PW = 'old-pw-1';
const NEW_PW = 'new-pw-2';

async function openPasswordDialog(wrapper) {
  const settings = await openSettings(wrapper);
  await buttonByText(settings, '修改密码').trigger('click');
  await settle();
  return dialogByTitle(wrapper, '修改密码');
}

async function fillPasswords(current, next, confirm) {
  await formItem(body(), '当前密码').get('input').setValue(current);
  await formItem(body(), '新密码').get('input').setValue(next);
  await formItem(body(), '确认新密码').get('input').setValue(confirm);
}

function passwordValues() {
  return ['当前密码', '新密码', '确认新密码'].map((label) => formItem(body(), label).get('input').element.value);
}

async function submitPassword() {
  await buttonByText(body(), '确认修改').trigger('click');
  await settle();
}

describe('App 设置 · 普通用户修改密码', () => {
  it('新密码与确认不一致时提示且不提交', async () => {
    const wrapper = await mountApp();
    await openPasswordDialog(wrapper);
    await fillPasswords(OLD_PW, NEW_PW, 'new-pw-3');

    await submitPassword();

    expect(ElMessage.error).toHaveBeenCalledWith('新密码与确认新密码不一致');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('修改成功后提示重新登录、记住用户名并结束当前会话', async () => {
    const wrapper = await mountApp();
    await openPasswordDialog(wrapper);
    await fillPasswords(OLD_PW, NEW_PW, NEW_PW);

    await submitPassword();

    expect(api.put).toHaveBeenCalledWith('/api/auth/me/password', { current_password: OLD_PW, new_password: NEW_PW });
    expect(ElMessage.success).toHaveBeenCalledWith('密码修改成功，请重新登录');
    expect(wrapper.findComponent(LoginView).exists()).toBe(true);
    expect(localStorage.getItem('crf_token')).toBeNull();
    expect(localStorage.getItem('crf_last_username')).toBe('temporary-owner');
  });

  it.each([
    [400, '当前密码错误', [['当前密码错误']]],
    [401, '登录已过期', []],
  ])('提交被拒绝（%i）时保留弹窗，仅非 401 错误在此提示', async (status, message, toasts) => {
    const wrapper = await mountApp({ put: () => Promise.reject(Object.assign(new Error(message), { status })) });
    const dialog = await openPasswordDialog(wrapper);
    await fillPasswords(OLD_PW, NEW_PW, NEW_PW);

    await submitPassword();

    expect(ElMessage.error.mock.calls).toEqual(toasts);
    expect(dialog.props('modelValue')).toBe(true);
    expect(buttonByText(body(), '确认修改').classes()).not.toContain('is-loading');
  });

  it.each(['取消按钮', '右上角关闭', '对话框关闭事件'])('通过%s关闭改密弹窗后再次打开为空表单', async (via) => {
    const wrapper = await mountApp();
    const dialog = await openPasswordDialog(wrapper);
    await fillPasswords(OLD_PW, NEW_PW, NEW_PW);

    if (via === '取消按钮') await buttonByText(body(), '取消').trigger('click');
    else if (via === '右上角关闭') await body().get('.el-dialog__headerbtn').trigger('click');
    else dialog.vm.$emit('update:modelValue', false);
    await settle();
    expect(dialog.props('modelValue')).toBe(false);
    await openPasswordDialog(wrapper);

    expect(passwordValues()).toEqual(['', '', '']);
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('App 设置 · 管理员全局设置', () => {
  const SAVED = {
    template_path: '/srv/templates/base.db',
    ai_enabled: false,
    ai_api_url: '',
    ai_api_key: '',
    ai_model: '',
    ai_api_format: '',
  };
  const AI = { url: 'https://ai.example.test/v1', key: 'test-key', model: 'test-model' };

  function settingsRoute(url) {
    return url === '/api/settings' ? { ...SAVED } : undefined;
  }

  async function enableAi(settings, fields = AI) {
    await formItem(settings, '启用AI复核').get('.el-switch').trigger('click');
    await settle();
    await formItem(settings, 'API URL').get('input').setValue(fields.url);
    await formItem(settings, 'API Key').get('input').setValue(fields.key);
    await formItem(settings, '模型').get('input').setValue(fields.model);
    await settle();
  }

  it('设置加载失败时提示原因', async () => {
    const wrapper = await mountApp({
      admin: true,
      get: (url) => (url === '/api/settings' ? Promise.reject(new Error('配置不可读')) : undefined),
    });

    await openSettings(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('加载设置失败: 配置不可读');
  });

  it('保存提交修改后的全局设置并关闭弹窗', async () => {
    const wrapper = await mountApp({ admin: true, get: settingsRoute });
    const settings = await openSettings(wrapper);
    await formItem(settings, '模板路径').get('input').setValue('/srv/templates/next.db');

    await buttonByText(settings, '保存').trigger('click');
    await settle();

    expect(api.put).toHaveBeenCalledWith('/api/settings', { ...SAVED, template_path: '/srv/templates/next.db' });
    expect(ElMessage.success).toHaveBeenCalledWith('设置已保存');
    expect(settings.props('modelValue')).toBe(false);
  });

  it('保存失败时保留弹窗并提示原因', async () => {
    const wrapper = await mountApp({
      admin: true,
      get: settingsRoute,
      put: () => Promise.reject(new Error('只读文件系统')),
    });
    const settings = await openSettings(wrapper);

    await buttonByText(settings, '保存').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('保存失败: 只读文件系统');
    expect(settings.props('modelValue')).toBe(true);
  });

  it('URL、Key、模型齐全前测试连接保持禁用', async () => {
    const wrapper = await mountApp({ admin: true, get: settingsRoute });
    const settings = await openSettings(wrapper);

    await enableAi(settings, { ...AI, model: '' });
    expect(buttonByText(settings, '测试连接').isDisabled()).toBe(true);
    await formItem(settings, '模型').get('input').setValue(AI.model);
    await settle();

    expect(buttonByText(settings, '测试连接').isDisabled()).toBe(false);
  });

  it.each([
    ['anthropic', 'Anthropic', 'anthropic'],
    [undefined, 'OpenAI', ''],
  ])('连接测试成功（格式 %s）时显示延迟与格式，并随保存记录探测结果', async (apiFormat, label, savedFormat) => {
    const wrapper = await mountApp({
      admin: true,
      get: settingsRoute,
      post: (url) =>
        url === '/api/settings/ai/test' ? { ok: true, latency_ms: 123, api_format: apiFormat } : undefined,
    });
    const settings = await openSettings(wrapper);
    await enableAi(settings);

    await buttonByText(settings, '测试连接').trigger('click');
    await settle();
    expect(settings.text()).toMatch(new RegExp(`连接成功 \\(123ms,\\s*${label}格式\\)`));
    await buttonByText(settings, '保存').trigger('click');
    await settle();

    expect(api.post).toHaveBeenCalledWith('/api/settings/ai/test', {
      ai_api_url: AI.url,
      ai_api_key: AI.key,
      ai_model: AI.model,
    });
    expect(api.put.mock.calls[0][1]).toMatchObject({ ai_enabled: true, ai_api_format: savedFormat });
  });

  it('连接测试失败时显示失败原因', async () => {
    const wrapper = await mountApp({
      admin: true,
      get: settingsRoute,
      post: () => Promise.reject(new Error('网关超时')),
    });
    const settings = await openSettings(wrapper);
    await enableAi(settings);

    await buttonByText(settings, '测试连接').trigger('click');
    await settle();

    expect(settings.text()).toContain('连接失败: 网关超时');
  });
});

describe('App 设置 · 主题', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  function theme() {
    return {
      dark: document.documentElement.classList.contains('dark'),
      attribute: document.documentElement.getAttribute('data-theme'),
      saved: localStorage.getItem('crf_theme'),
    };
  }

  it('设置中的主题开关切换深浅色并持久化', async () => {
    const wrapper = await mountApp();
    const settings = await openSettings(wrapper);

    await formItem(settings, '主题模式').get('.el-switch').trigger('click');
    await settle();
    expect(theme()).toEqual({ dark: true, attribute: 'dark', saved: 'dark' });
    await formItem(settings, '主题模式').get('.el-switch').trigger('click');
    await settle();

    expect(theme()).toEqual({ dark: false, attribute: 'light', saved: 'light' });
  });

  it.each([
    ['普通用户', false],
    ['管理员', true],
  ])('%s头部按钮在深浅色之间切换并同步按钮提示', async (_role, admin) => {
    const wrapper = await mountApp({ admin });

    await wrapper.get('[aria-label="切换到暗色模式"]').trigger('click');
    await settle();
    expect(theme().dark).toBe(true);
    await wrapper.get('[aria-label="切换到浅色模式"]').trigger('click');
    await settle();

    expect(theme()).toEqual({ dark: false, attribute: 'light', saved: 'light' });
  });

  it('启动时应用已保存的深色偏好', async () => {
    localStorage.setItem('crf_theme', 'dark');

    const wrapper = await mountApp();

    expect(theme()).toEqual({ dark: true, attribute: 'dark', saved: 'dark' });
    expect(wrapper.find('[aria-label="切换到浅色模式"]').exists()).toBe(true);
  });
});

describe('App 设置 · 数据库导出', () => {
  function confirmWith(outcome) {
    return vi
      .spyOn(ElMessageBox, 'confirm')
      .mockImplementation(() => (outcome === 'confirm' ? Promise.resolve('confirm') : Promise.reject('cancel')));
  }

  async function exportFromSettings(wrapper, label) {
    const settings = await openSettings(wrapper);
    await buttonByText(settings, label).trigger('click');
    await settle();
  }

  it('导出所有项目确认后按账号回退文件名下载', async () => {
    const confirm = confirmWith('confirm');
    const fetchSpy = scriptFetch({ 'GET /api/projects/export/database': () => fakeResponse() });
    const downloads = captureDownloads('blob:all-projects');
    const wrapper = await mountApp();

    await exportFromSettings(wrapper, '导出所有项目');

    expect(confirm).toHaveBeenCalledWith('将导出当前账号名下的全部项目，是否继续？', '导出所有项目', { type: 'info' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/projects/export/database', {
      headers: { Authorization: expect.stringMatching(/^Bearer /) },
    });
    expect(downloads.clicks).toEqual([
      { href: 'blob:all-projects', download: 'temporary-owner_projects.db', attached: true },
    ]);
    expect(downloads.revoke).toHaveBeenCalledWith('blob:all-projects');
    expect(ElMessage.success).toHaveBeenCalledWith('数据库导出成功');
  });

  it('账号没有用户名时以 my 作为回退文件名，也不记住空用户名', async () => {
    confirmWith('confirm');
    scriptFetch({ 'GET /api/projects/export/database': () => fakeResponse() });
    const downloads = captureDownloads();
    const wrapper = await mountApp({ username: '' });

    await exportFromSettings(wrapper, '导出所有项目');

    expect(downloads.clicks.map((click) => click.download)).toEqual(['my_projects.db']);
    expect(localStorage.getItem('crf_last_username')).toBeNull();
  });

  it('导出当前项目优先使用服务端文件名', async () => {
    const confirm = confirmWith('confirm');
    scriptFetch({
      'GET /api/projects/5/export/database': () =>
        fakeResponse({ disposition: "attachment; filename*=UTF-8''%E6%A8%A1%E6%9D%BF.db" }),
    });
    const downloads = captureDownloads();
    const wrapper = await mountApp();

    await exportFromSettings(wrapper, '导出当前项目');

    expect(confirm).toHaveBeenCalledWith('将导出项目「授权测试项目」的数据库，是否继续？', '导出当前项目', {
      type: 'info',
    });
    expect(downloads.clicks.map((click) => click.download)).toEqual(['模板.db']);
    expect(ElMessage.success).toHaveBeenCalledWith('项目数据库导出成功');
  });

  it.each(['导出所有项目', '导出当前项目'])('%s在确认时取消则不下载也不提示', async (label) => {
    confirmWith('cancel');
    const fetchSpy = scriptFetch({});
    const wrapper = await mountApp();

    await exportFromSettings(wrapper, label);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it.each([
    [
      '导出所有项目',
      'GET /api/projects/export/database',
      () => Promise.resolve({ detail: '导出过于频繁' }),
      '导出失败: 导出过于频繁',
    ],
    [
      '导出当前项目',
      'GET /api/projects/5/export/database',
      () => Promise.reject(new SyntaxError('Unexpected token')),
      '导出失败: 未知错误',
    ],
  ])('%s被服务端拒绝时提示原因且不下载', async (label, route, json, message) => {
    confirmWith('confirm');
    scriptFetch({ [route]: () => fakeResponse({ ok: false, json }) });
    const downloads = captureDownloads();
    const wrapper = await mountApp();

    await exportFromSettings(wrapper, label);

    expect(ElMessage.error).toHaveBeenCalledWith(message);
    expect(downloads.clicks).toEqual([]);
  });
});

describe('App 设置 · 导入项目', () => {
  const IMPORT_ROUTE = 'POST /api/projects/import/auto';
  const databaseFile = () => new File(['sqlite'], 'projects.db', { type: 'application/octet-stream' });

  function projectLoads() {
    return requestedUrls('get').filter((url) => url === '/api/projects').length;
  }

  async function chooseImportFile(wrapper, files) {
    const settings = await openSettings(wrapper);
    await chooseFiles(settings.get('input[aria-label="导入项目数据库文件"]'), files);
    await settle();
    return settings;
  }

  it('导入项目按钮转交隐藏的文件选择器', async () => {
    const wrapper = await mountApp();
    const settings = await openSettings(wrapper);
    const input = settings.get('input[aria-label="导入项目数据库文件"]');
    const click = vi.spyOn(input.element, 'click').mockImplementation(() => {});

    await buttonByText(settings, '导入项目').trigger('click');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('单个项目导入成功后提示、清空缓存并刷新项目列表', async () => {
    const fetchSpy = scriptFetch({
      [IMPORT_ROUTE]: () => fakeResponse({ json: { count: 1, imported: [{ name: '导入项目A' }], renamed: [] } }),
    });
    const wrapper = await mountApp();
    const loadsBefore = projectLoads();

    await chooseImportFile(wrapper, [databaseFile()]);

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers).toEqual({ Authorization: expect.stringMatching(/^Bearer /) });
    expect(init.body.get('file').name).toBe('projects.db');
    expect(ElMessage.success).toHaveBeenCalledWith('导入成功：导入项目A');
    expect(api.clearAllCache).toHaveBeenCalledTimes(1);
    expect(projectLoads()).toBe(loadsBefore + 1);
  });

  it('多个项目导入时以结果弹窗列出项目与重命名', async () => {
    const alert = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm');
    scriptFetch({
      [IMPORT_ROUTE]: () =>
        fakeResponse({
          json: { count: 2, imported: [{ name: 'A' }, { name: 'B (1)' }], renamed: [{ original: 'B', new: 'B (1)' }] },
        }),
    });
    const wrapper = await mountApp();

    await chooseImportFile(wrapper, [databaseFile()]);

    expect(alert).toHaveBeenCalledWith('导入 2 个项目：A、B (1)\n重命名：B → B (1)', '导入结果', { type: 'success' });
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it.each([
    [{ detail: '文件不是有效的数据库' }, '导入失败: 文件不是有效的数据库'],
    [{}, '导入失败: 导入失败'],
  ])('导入被拒绝时提示原因并恢复按钮（%#）', async (json, message) => {
    scriptFetch({ [IMPORT_ROUTE]: () => fakeResponse({ ok: false, json }) });
    const wrapper = await mountApp();

    const settings = await chooseImportFile(wrapper, [databaseFile()]);

    expect(ElMessage.error).toHaveBeenCalledWith(message);
    expect(buttonByText(settings, '导入项目').classes()).not.toContain('is-loading');
  });

  it('未选择文件时不发起导入', async () => {
    const fetchSpy = scriptFetch({});
    const wrapper = await mountApp();

    await chooseImportFile(wrapper, []);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('App 设置 · 弹窗', () => {
  it('对话框自身关闭时同步隐藏设置', async () => {
    const wrapper = await mountApp();
    const settings = await openSettings(wrapper);

    settings.vm.$emit('update:modelValue', false);
    await settle();

    expect(settings.props('modelValue')).toBe(false);
  });
});
