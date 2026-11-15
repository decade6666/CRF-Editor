// OrganizationManagementView 行为挂载测试：预设列表、Logo 缩略图读取/释放、
// 新增/编辑/删除预设与 Logo 上传/清除草稿。
// 外部边界：api.get（预设列表）、fetch（Logo 与 FormData 保存）、Blob URL、ElMessageBox。
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElMessage, ElMessageBox } from 'element-plus';
import OrganizationManagementView from '../../src/components/OrganizationManagementView.vue';
import { api } from '../../src/composables/useApi.js';
import {
  body,
  buttonByText,
  chooseFiles,
  dialogByTitle,
  fakeResponse,
  scriptApi,
  scriptFetch,
  settle,
} from './appTestHarness.js';

const SESSION = 'org-test-session';
const PRESETS = [
  { id: 3, name: '机构甲', data_management_unit: '数据部', logo_path: 'logos/3.png' },
  { id: 4, name: '机构乙', data_management_unit: '', logo_path: null },
];
const PRESETS_URL = '/api/admin/organization-presets';
const CREATE_ROUTE = `post ${PRESETS_URL}`;
const EDIT_ROUTE = `put ${PRESETS_URL}/3`;
const EDIT_4_ROUTE = `put ${PRESETS_URL}/4`;
const LOGO_ROUTE = 'GET /api/organization-presets/3/logo';

async function mountOrg({ presets = () => Promise.resolve(PRESETS.map((p) => ({ ...p }))), routes = {} } = {}) {
  localStorage.setItem('crf_token', SESSION);
  let blobCount = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:logo-${++blobCount}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  scriptApi({ get: (url) => (url === PRESETS_URL ? presets() : undefined) });
  const fetchSpy = scriptFetch({
    [LOGO_ROUTE]: () => fakeResponse(),
    [CREATE_ROUTE]: () => fakeResponse(),
    [EDIT_ROUTE]: () => fakeResponse(),
    [EDIT_4_ROUTE]: () => fakeResponse(),
    ...routes,
  });
  const wrapper = mount(OrganizationManagementView);
  await settle();
  return { wrapper, fetchSpy };
}

function dialogEl(wrapper, title) {
  const el = body()
    .findAll('.el-dialog')
    .find((candidate) => candidate.find('.el-dialog__title').text() === title);
  expect(el, `弹窗「${title}」应已渲染 DOM`).toBeTruthy();
  return el;
}

async function openDialog(wrapper, ariaLabel, title) {
  await wrapper.find(`button[aria-label="${ariaLabel}"]`).trigger('click');
  await settle();
  return dialogEl(wrapper, title);
}

async function fillFormItem(scope, label, value) {
  const item = scope.findAll('.el-form-item').find((node) => {
    const labelNode = node.find('.el-form-item__label');
    return labelNode.exists() && labelNode.text() === label;
  });
  expect(item, `应渲染表单项「${label}」`).toBeTruthy();
  await item.get('input').setValue(value);
  await settle();
}

function presetRow(wrapper, name) {
  const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(name));
  expect(row, `应渲染预设行「${name}」`).toBeTruthy();
  return row;
}

function savedForm(fetchSpy, routeKey) {
  const call = fetchSpy.mock.calls.find(([url, init]) => `${init?.method || 'GET'} ${url}` === routeKey);
  expect(call, `应提交 ${routeKey}`).toBeTruthy();
  return call[1];
}

describe('OrganizationManagementView · 预设列表与 Logo', () => {
  it('渲染预设列表并带会话令牌读取 Logo 缩略图', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const logoCall = fetchSpy.mock.calls.find(([url]) => url === '/api/organization-presets/3/logo');
    expect(logoCall, '应读取机构 Logo').toBeTruthy();
    expect(logoCall[1].headers.Authorization).toBe(`Bearer ${SESSION}`);
    const thumb = wrapper.find('img[alt="机构甲 机构 Logo"]');
    expect(thumb.exists()).toBe(true);
    expect(thumb.attributes('src')).toBe('blob:logo-1');
    expect(presetRow(wrapper, '机构乙').text()).toContain('—');
    expect(presetRow(wrapper, '机构甲').text()).toContain('数据部');
  });

  it('加载预设失败时提示', async () => {
    await mountOrg({ presets: () => Promise.reject(new Error('拒绝访问')) });

    expect(ElMessage.error).toHaveBeenCalledWith('加载机构预设失败: 拒绝访问');
  });

  it('Logo 读取失败仍渲染表格并提示', async () => {
    const { wrapper } = await mountOrg({ routes: { [LOGO_ROUTE]: () => fakeResponse({ ok: false }) } });

    expect(ElMessage.error).toHaveBeenCalledWith('加载机构 Logo 失败');
    expect(presetRow(wrapper, '机构甲').text()).toContain('机构甲');
    expect(wrapper.find('img[alt="机构甲 机构 Logo"]').exists()).toBe(false);
  });

  it('Logo 请求网络错误时提示', async () => {
    await mountOrg({ routes: { [LOGO_ROUTE]: () => Promise.reject(new TypeError('offline')) } });

    expect(ElMessage.error).toHaveBeenCalledWith('加载机构 Logo 失败');
  });

  it('卸载时释放缩略图 URL', async () => {
    const { wrapper } = await mountOrg();
    expect(wrapper.find('img[alt="机构甲 机构 Logo"]').exists()).toBe(true);

    wrapper.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
  });
});

describe('OrganizationManagementView · 新增与编辑预设', () => {
  it('新增预设空名称校验不提交', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const dialog = await openDialog(wrapper, '新增预设', '新增机构预设');
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(ElMessage.warning).toHaveBeenCalledWith('机构名称不能为空');
    expect(fetchSpy.mock.calls.filter(([url, init]) => `${init?.method} ${url}` === CREATE_ROUTE)).toHaveLength(0);
    expect(dialogByTitle(wrapper, '新增机构预设').props('modelValue')).toBe(true);
  });

  it('新增预设以 FormData 提交并刷新列表', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const dialog = await openDialog(wrapper, '新增预设', '新增机构预设');
    await fillFormItem(dialog, '机构名称', '机构丙');
    await fillFormItem(dialog, '数据管理单位', '单位丙');
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    const init = savedForm(fetchSpy, CREATE_ROUTE);
    expect(init.method).toBe('post');
    expect(init.headers.Authorization).toBe(`Bearer ${SESSION}`);
    const form = init.body;
    expect(JSON.parse(form.get('metadata'))).toEqual({ name: '机构丙', data_management_unit: '单位丙' });
    expect(form.get('logo_action')).toBe('keep');
    expect(form.has('file')).toBe(false);
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功');
    expect(api.get.mock.calls.filter(([url]) => url === PRESETS_URL).length).toBe(2);
  });

  it('编辑预设回显名称与 Logo 预览并 PUT 保存', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = dialogEl(wrapper, '编辑机构预设');
    const nameInput = dialog.findAll('.el-form-item')[0].get('input');
    expect(nameInput.element.value).toBe('机构甲');
    expect(dialog.find('img[alt="Logo 预览"]').exists()).toBe(true);

    await nameInput.setValue('机构甲改');
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    const init = savedForm(fetchSpy, EDIT_ROUTE);
    expect(init.method).toBe('put');
    expect(JSON.parse(init.body.get('metadata'))).toEqual({ name: '机构甲改', data_management_unit: '数据部' });
    expect(init.body.get('logo_action')).toBe('keep');
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
  });

  it('编辑时清除 Logo 后提交 clear 动作', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = dialogEl(wrapper, '编辑机构预设');
    await buttonByText(dialog, '清除').trigger('click');
    await settle();
    expect(dialog.find('img[alt="Logo 预览"]').exists()).toBe(false);

    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    const init = savedForm(fetchSpy, EDIT_ROUTE);
    expect(init.body.get('logo_action')).toBe('clear');
    expect(init.body.has('file')).toBe(false);
  });

  it('上传 Logo 生成预览并随保存提交文件', async () => {
    const { wrapper, fetchSpy } = await mountOrg();

    const row = presetRow(wrapper, '机构乙');
    await row.find('button[aria-label="编辑"]').trigger('click');
    await settle();
    const dialog = dialogEl(wrapper, '编辑机构预设');
    const fileInput = dialog.find('input[aria-label="上传机构预设 Logo"]');
    const file = new File(['gif-data'], 'logo.gif', { type: 'image/gif' });
    await chooseFiles(fileInput, [file]);
    await settle();

    const preview = dialog.find('img[alt="Logo 预览"]');
    expect(preview.exists()).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);

    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    const init = savedForm(fetchSpy, EDIT_4_ROUTE);
    expect(init.body.get('logo_action')).toBe('upload');
    expect(init.body.get('file').name).toBe('logo.gif');
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
  });

  it.each([
    ['detail 字符串', { detail: '名称重复' }, '保存失败: 名称重复'],
    ['detail 数组', { detail: [{ msg: '名称必填' }, { msg: '单位过长' }] }, '保存失败: 名称必填; 单位过长'],
    ['非 JSON 响应', null, '保存失败: 未知错误'],
  ])('保存失败（%s）时提示且弹窗保持打开', async (_case, json, expected) => {
    const { wrapper } = await mountOrg({
      routes: {
        [CREATE_ROUTE]: () =>
          json === null
            ? {
                ok: false,
                status: 422,
                json: () => Promise.reject(new SyntaxError('bad')),
                headers: { get: () => null },
              }
            : fakeResponse({ ok: false, json }),
      },
    });

    const dialog = await openDialog(wrapper, '新增预设', '新增机构预设');
    await fillFormItem(dialog, '机构名称', '机构丙');
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith(expected);
    expect(dialogEl(wrapper, '新增机构预设').exists()).toBe(true);
  });

  it('保存网络错误时提示异常信息', async () => {
    const { wrapper } = await mountOrg({
      routes: { [CREATE_ROUTE]: () => Promise.reject(new TypeError('网络断开')) },
    });

    const dialog = await openDialog(wrapper, '新增预设', '新增机构预设');
    await fillFormItem(dialog, '机构名称', '机构丙');
    await buttonByText(dialog, '保存').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('保存失败: 网络断开');
  });
});

describe('OrganizationManagementView · 删除预设', () => {
  it('确认后 DELETE 预设并刷新列表', async () => {
    const { wrapper } = await mountOrg();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="删除"]').trigger('click');
    await settle();

    expect(api.del).toHaveBeenCalledWith('/api/admin/organization-presets/3');
    expect(ElMessage.success).toHaveBeenCalledWith('已删除');
    expect(api.get.mock.calls.filter(([url]) => url === PRESETS_URL).length).toBe(2);
  });

  it('取消确认时不删除', async () => {
    const { wrapper } = await mountOrg();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="删除"]').trigger('click');
    await settle();

    expect(api.del).not.toHaveBeenCalled();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('确认取消以外异常时提示删除失败', async () => {
    const { wrapper } = await mountOrg();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('服务异常'));

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="删除"]').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败: 服务异常');
    expect(api.del).not.toHaveBeenCalled();
  });

  it('DELETE 失败时提示删除失败', async () => {
    const { wrapper } = await mountOrg();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    api.del.mockRejectedValue(new Error('仍有用户引用'));

    const row = presetRow(wrapper, '机构甲');
    await row.find('button[aria-label="删除"]').trigger('click');
    await settle();

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败: 仍有用户引用');
  });

  it('刷新按钮重新加载预设', async () => {
    const { wrapper } = await mountOrg();
    const callsBefore = api.get.mock.calls.length;

    await wrapper.find('button[aria-label="刷新"]').trigger('click');
    await settle();

    expect(api.get.mock.calls.length).toBe(callsBefore + 1);
  });
});
