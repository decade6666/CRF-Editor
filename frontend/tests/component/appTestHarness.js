// App / ProjectInfoTab 挂载测试的共享工具：伪 JWT、异步收敛、按标题定位弹窗与表单项、
// 外部边界（api 对象 / fetch / 浏览器下载）脚本化，以及懒加载子组件的轻量替身。
// 文件名不以 .spec.js 结尾，vitest.config.js 的 include 不会把它当作用例收集；
// App 在 mountApp 内按需导入，只用 fetch 工具的规格不会因此加载整个应用壳。
import { expect, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, inject, nextTick, unref } from 'vue';
import { api } from '../../src/composables/useApi.js';

export const PROJECTS = [
  { id: 5, name: '授权测试项目', version: '1.0', db_type: '其他' },
  { id: 7, name: '另一个测试项目', version: '1.0', db_type: '其他' },
];

export function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export async function settle() {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

// append-to-body 弹窗与 Element Plus 弹层被传送到 document.body，VTU 挂载容器不在其中。
export function body() {
  return new DOMWrapper(document.body);
}

export function dialogByTitle(wrapper, title) {
  return wrapper.findAllComponents({ name: 'ElDialog' }).find((node) => node.props('title') === title);
}

export function buttonByText(scope, text) {
  const button = scope.findAll('button').find((node) => node.text() === text);
  expect(button, `应渲染按钮「${text}」`).toBeTruthy();
  return button;
}

export function formItem(scope, label) {
  const item = scope.findAll('.el-form-item').find((node) => {
    const labelNode = node.find('.el-form-item__label');
    return labelNode.exists() && labelNode.text() === label;
  });
  expect(item, `应渲染表单项「${label}」`).toBeTruthy();
  return item;
}

// 外部 HTTP 边界（api 对象）：路由函数返回 undefined 表示走默认值；未脚本化的 GET 一律拒绝。
export function scriptApi({
  admin = false,
  username = 'temporary-owner',
  projects = PROJECTS,
  get,
  post,
  put,
  del,
} = {}) {
  vi.spyOn(api, 'get').mockImplementation((url) => {
    const override = get?.(url);
    if (override !== undefined) return Promise.resolve(override);
    if (url === '/api/auth/me') return Promise.resolve({ username, is_admin: admin });
    if (url === '/api/projects') return Promise.resolve(projects.map((project) => ({ ...project })));
    if (url === '/api/organization-presets') return Promise.resolve([]);
    if (url === '/api/settings') return Promise.resolve({});
    return Promise.reject(new Error(`未脚本化 GET: ${url}`));
  });
  vi.spyOn(api, 'post').mockImplementation((url, payload) => Promise.resolve(post?.(url, payload)));
  vi.spyOn(api, 'put').mockImplementation((url, payload) => Promise.resolve(put?.(url, payload)));
  vi.spyOn(api, 'del').mockImplementation((url) => Promise.resolve(del?.(url)));
  vi.spyOn(api, 'clearAllCache').mockImplementation(() => {});
}

export function requestedUrls(method) {
  return api[method].mock.calls.map(([url]) => url);
}

export async function selectProject(wrapper, name = PROJECTS[0].name) {
  const button = wrapper.findAll('.project-select-btn').find((node) => node.text() === name);
  expect(button, `侧栏应渲染项目「${name}」`).toBeTruthy();
  await button.trigger('click');
  await settle();
}

export async function mountApp({ token = true, select = true, stubs = {}, ...routes } = {}) {
  if (token) localStorage.setItem('crf_token', fakeJwt());
  scriptApi(routes);
  const { default: App } = await import('../../src/App.vue');
  const wrapper = mount(App, {
    global: { stubs: { WordImportDialog: true, AdminView: true, OrganizationManagementView: true, ...stubs } },
  });
  await settle();
  const projects = routes.projects ?? PROJECTS;
  if (token && select && !routes.admin) await selectProject(wrapper, projects[0].name);
  return wrapper;
}

export async function openSettings(wrapper) {
  await wrapper.get('[aria-label="打开设置"]').trigger('click');
  await settle();
  return dialogByTitle(wrapper, '设置');
}

// fetch 边界：按「方法 URL」路由到伪响应；未脚本化的请求一律拒绝。
export function fakeResponse({ ok = true, json = {}, blob = new Blob(['crf']), disposition = null } = {}) {
  return {
    ok,
    json: typeof json === 'function' ? json : () => Promise.resolve(json),
    blob: () => Promise.resolve(blob),
    headers: { get: (name) => (String(name).toLowerCase() === 'content-disposition' ? disposition : null) },
  };
}

export function scriptFetch(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url, init = {}) => {
    const key = `${init.method || 'GET'} ${url}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`未脚本化 fetch: ${key}`));
    return Promise.resolve(route(init));
  });
}

// 浏览器下载边界：记录 Blob URL 生命周期与被点击的下载链接，不触发 happy-dom 导航。
export function captureDownloads(objectUrl = 'blob:crf-download') {
  const clicks = [];
  const create = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue(objectUrl);
  const revoke = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload() {
    clicks.push({ href: this.getAttribute('href'), download: this.download, attached: document.body.contains(this) });
  });
  return { clicks, create, revoke };
}

export function chooseFiles(input, files) {
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  return input.trigger('change');
}

// 懒加载子组件替身（供 vi.mock 工厂动态引用）：逐项渲染 props 与注入值，事件只经真实按钮发出。
export function createStandIn(name, { props = [], injections = [], events = {}, expose } = {}) {
  return defineComponent({
    name: `${name}StandIn`,
    props,
    emits: [...new Set(Object.values(events).map(([event]) => event))],
    setup(componentProps, { emit, expose: exposePublic }) {
      const injected = Object.fromEntries(injections.map((key) => [key, inject(key)]));
      if (expose) exposePublic(expose);
      return () =>
        h('section', { 'data-test': name }, [
          ...props.map((key) => h('output', { 'data-prop': key }, String(componentProps[key]))),
          ...injections.map((key) => h('output', { 'data-inject': key }, String(unref(injected[key])))),
          ...Object.entries(events).map(([label, [event, ...args]]) =>
            h('button', { type: 'button', onClick: () => emit(event, ...args) }, label),
          ),
        ]);
    },
  });
}

// vi.mock 工厂返回的普通对象不是真正的模块命名空间：显式标记 __esModule，
// defineAsyncComponent 才会取 default 导出，而不是把整个 mock 对象当作组件。
export function standInModule(name, options) {
  return { __esModule: true, default: createStandIn(name, options) };
}
