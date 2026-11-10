// 真实 ProjectInfoTab + Element Plus：项目元数据保存与 Logo 草稿（项目原图 / 上传 / 清除 / 机构预设）的既有行为。
// 只替换外部边界：api.get（机构预设）、fetch（Logo 读取与资料保存）、Blob URL；宿主按 App 的方式回写 project。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { ElMessage } from 'element-plus';
import ProjectInfoTab from '../../src/components/ProjectInfoTab.vue';
import { api } from '../../src/composables/useApi.js';
import { body, buttonByText, chooseFiles, fakeResponse, formItem, scriptFetch, settle } from './appTestHarness.js';

const SESSION = 'test-session';
const DEFAULT_SCREENING = 'S|__|__||__|__|__|';
const PRESETS = [
  { id: 3, data_management_unit: '北京临床数据中心', has_logo: true },
  { id: 4, data_management_unit: '上海统计中心', has_logo: false },
];
const PROFILE_ROUTE = 'PUT /api/projects/5/profile';
const PROJECT_LOGO_ROUTE = 'GET /api/projects/5/logo';
const PRESET_LOGO_ROUTE = 'GET /api/organization-presets/3/logo';

function projectFixture(overrides = {}) {
  return { id: 5, name: '元数据项目', version: '1.0', db_type: '其他', company_logo_path: null, ...overrides };
}

function mountTab(project, { presets = () => Promise.resolve(PRESETS) } = {}) {
  vi.spyOn(api, 'get').mockImplementation((url) =>
    url === '/api/organization-presets' ? presets() : Promise.reject(new Error(`未脚本化 GET: ${url}`)),
  );
  const current = ref(project);
  const updates = [];
  // 宿主与 App.onProjectUpdated 一致：保存成功后用服务端返回值替换 project prop。
  const Host = defineComponent({
    setup() {
      return () =>
        h(ProjectInfoTab, {
          project: current.value,
          onUpdated: (next) => {
            updates.push(next);
            current.value = next;
          },
        });
    },
  });
  return { wrapper: mount(Host), current, updates };
}

async function save(wrapper) {
  await buttonByText(wrapper, '保存').trigger('click');
  await settle();
}

function savedProfile(fetchSpy) {
  const call = fetchSpy.mock.calls.find(([url, init]) => `${init?.method || 'GET'} ${url}` === PROFILE_ROUTE);
  expect(call, '应提交项目资料').toBeTruthy();
  const form = call[1].body;
  return { form, metadata: JSON.parse(form.get('metadata')) };
}

function logoPreview(wrapper) {
  const image = wrapper.find('img[alt="项目 Logo"]');
  return image.exists() ? image.attributes('src') : null;
}

async function typeInto(wrapper, label, value) {
  await formItem(wrapper, label).get('input').setValue(value);
  await settle();
}

async function suggestions() {
  await new Promise((resolve) => setTimeout(resolve, 350)); // el-autocomplete 输入防抖 300ms
  await settle();
  return body().findAll('.el-autocomplete-suggestion__list li');
}

async function pickSuggestion(text) {
  const item = (await suggestions()).find((node) => node.text() === text);
  expect(item, `应显示候选「${text}」`).toBeTruthy();
  await item.trigger('click');
  await settle();
}

let blobCount;

beforeEach(() => {
  localStorage.setItem('crf_token', SESSION);
  blobCount = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:logo-${++blobCount}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

describe('ProjectInfoTab · 项目 Logo 预览', () => {
  it('有 Logo 的项目带会话令牌读取原图并显示预览', async () => {
    const fetchSpy = scriptFetch({ [PROJECT_LOGO_ROUTE]: () => fakeResponse() });

    const { wrapper } = mountTab(projectFixture({ company_logo_path: 'logos/5.png' }));
    await settle();

    expect(fetchSpy).toHaveBeenCalledWith('/api/projects/5/logo', { headers: { Authorization: `Bearer ${SESSION}` } });
    expect(logoPreview(wrapper)).toBe('blob:logo-1');
    expect(wrapper.text()).toContain('✓ 已上传');
  });

  it.each([
    ['请求失败', () => Promise.reject(new TypeError('offline'))],
    ['不存在', () => fakeResponse({ ok: false })],
  ])('原图%s时不显示预览但保留已上传标记', async (_case, respond) => {
    scriptFetch({ [PROJECT_LOGO_ROUTE]: respond });

    const { wrapper } = mountTab(projectFixture({ company_logo_path: 'logos/5.png' }));
    await settle();

    expect(logoPreview(wrapper)).toBeNull();
    expect(wrapper.text()).toContain('✓ 已上传');
  });

  it('切换到另一个有 Logo 的项目时释放旧预览并加载新原图', async () => {
    scriptFetch({ [PROJECT_LOGO_ROUTE]: () => fakeResponse(), 'GET /api/projects/7/logo': () => fakeResponse() });
    const { wrapper, current } = mountTab(projectFixture({ company_logo_path: 'logos/5.png' }));
    await settle();

    current.value = projectFixture({ id: 7, name: '第二个项目', company_logo_path: 'logos/7.png' });
    await settle();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
    expect(logoPreview(wrapper)).toBe('blob:logo-2');
  });
});

describe('ProjectInfoTab · 保存项目资料', () => {
  it('提交填写的元数据，空版本日期与未改动的默认筛选号格式按空值保存', async () => {
    const saved = projectFixture({ name: '新名称' });
    const fetchSpy = scriptFetch({ [PROFILE_ROUTE]: () => fakeResponse({ json: saved }) });
    const { wrapper, updates } = mountTab(projectFixture());
    await settle();

    await typeInto(wrapper, '项目名称', '新名称');
    await typeInto(wrapper, '版本号', '2.0');
    const saimeisi = formItem(wrapper, '数据库类型')
      .findAll('.el-radio')
      .find((node) => node.text() === '赛美斯');
    await saimeisi.get('input').setValue(true);
    await typeInto(wrapper, '试验名称', '一项随机对照试验');
    await typeInto(wrapper, 'CRF版本', 'V1.1');
    await typeInto(wrapper, '方案编号', 'PRO-001');
    await typeInto(wrapper, '申办方', '测试申办方');
    await save(wrapper);

    const { form, metadata } = savedProfile(fetchSpy);
    expect(metadata).toEqual({
      name: '新名称',
      version: '2.0',
      db_type: '赛美斯',
      trial_name: '一项随机对照试验',
      crf_version: 'V1.1',
      crf_version_date: null,
      protocol_number: 'PRO-001',
      screening_number_format: null,
      sponsor: '测试申办方',
      data_management_unit: '',
    });
    expect(form.get('logo_action')).toBe('keep');
    expect(form.has('preset_id') || form.has('file')).toBe(false);
    expect(updates).toEqual([saved]);
    expect(ElMessage.success).toHaveBeenCalledWith('保存成功');
  });

  it('手动确认过的筛选号格式与填写的版本日期按原值保存', async () => {
    const fetchSpy = scriptFetch({ [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }) });
    const { wrapper } = mountTab(projectFixture());
    await settle();

    await typeInto(wrapper, '筛选号格式', 'S|__|');
    await typeInto(wrapper, '筛选号格式', DEFAULT_SCREENING);
    await typeInto(wrapper, 'CRF版本日期', '2026-11-09');
    await save(wrapper);

    expect(savedProfile(fetchSpy).metadata).toMatchObject({
      crf_version_date: '2026-11-09',
      screening_number_format: DEFAULT_SCREENING,
    });
  });

  it('项目已有筛选号格式时原样保存', async () => {
    const fetchSpy = scriptFetch({ [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }) });
    const { wrapper } = mountTab(projectFixture({ screening_number_format: DEFAULT_SCREENING }));
    await settle();

    await save(wrapper);

    expect(savedProfile(fetchSpy).metadata.screening_number_format).toBe(DEFAULT_SCREENING);
  });

  it.each([
    ['服务端原因', () => Promise.resolve({ detail: '项目名称已存在' }), '保存失败: 项目名称已存在'],
    ['空原因', () => Promise.resolve({ detail: '' }), '保存失败: 未知错误'],
    ['不可读响应体', () => Promise.reject(new SyntaxError('Unexpected token')), '保存失败: 未知错误'],
  ])('保存被拒绝且返回%s时提示并不回写项目', async (_case, json, message) => {
    scriptFetch({ [PROFILE_ROUTE]: () => fakeResponse({ ok: false, json }) });
    const { wrapper, updates } = mountTab(projectFixture());
    await settle();

    await save(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith(message);
    expect(updates).toEqual([]);
  });

  it('网络异常时提示保存失败', async () => {
    scriptFetch({ [PROFILE_ROUTE]: () => Promise.reject(new TypeError('Failed to fetch')) });
    const { wrapper, updates } = mountTab(projectFixture());
    await settle();

    await save(wrapper);

    expect(ElMessage.error).toHaveBeenCalledWith('保存失败: Failed to fetch');
    expect(updates).toEqual([]);
  });

  it('保存返回 Logo 时只按回写结果加载一次新预览', async () => {
    const saved = projectFixture({ company_logo_path: 'logos/5.png' });
    const fetchSpy = scriptFetch({
      [PROFILE_ROUTE]: () => fakeResponse({ json: saved }),
      [PROJECT_LOGO_ROUTE]: () => fakeResponse(),
    });
    const { wrapper, updates } = mountTab(projectFixture());
    await settle();

    await save(wrapper);

    expect(updates).toEqual([saved]);
    expect(fetchSpy.mock.calls.filter(([url]) => url === '/api/projects/5/logo')).toHaveLength(1);
    expect(logoPreview(wrapper)).toBe('blob:logo-1');
  });
});

describe('ProjectInfoTab · 上传与清除 Logo', () => {
  it('点击上传/替换转交隐藏的文件选择器', async () => {
    const { wrapper } = mountTab(projectFixture());
    await settle();
    const input = wrapper.get('input[aria-label="上传项目 Logo"]');
    const click = vi.spyOn(input.element, 'click').mockImplementation(() => {});

    await buttonByText(wrapper, '上传/替换').trigger('click');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('选择图片后预览，并在保存时上传该文件', async () => {
    const fetchSpy = scriptFetch({ [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }) });
    const { wrapper } = mountTab(projectFixture());
    await settle();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    await chooseFiles(wrapper.get('input[aria-label="上传项目 Logo"]'), [file]);
    await settle();
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(logoPreview(wrapper)).toBe('blob:logo-1');
    await save(wrapper);

    const { form } = savedProfile(fetchSpy);
    expect(form.get('logo_action')).toBe('upload');
    expect(form.get('file').name).toBe('logo.png');
  });

  it('取消文件选择时保持当前 Logo 草稿', async () => {
    const { wrapper } = mountTab(projectFixture());
    await settle();

    await chooseFiles(wrapper.get('input[aria-label="上传项目 Logo"]'), []);
    await settle();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(logoPreview(wrapper)).toBeNull();
  });

  it('清除 Logo 后释放预览、提示保存后清除并提交清除动作', async () => {
    const fetchSpy = scriptFetch({
      [PROJECT_LOGO_ROUTE]: () => fakeResponse(),
      [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }),
    });
    const { wrapper } = mountTab(projectFixture({ company_logo_path: 'logos/5.png' }));
    await settle();

    await buttonByText(wrapper, '清除').trigger('click');
    await settle();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-1');
    expect(logoPreview(wrapper)).toBeNull();
    expect(wrapper.text()).toContain('保存后清除 Logo');
    await save(wrapper);

    expect(savedProfile(fetchSpy).form.get('logo_action')).toBe('clear');
  });
});

describe('ProjectInfoTab · 数据管理单位预设', () => {
  it('按输入模糊匹配显示预设单位候选', async () => {
    const { wrapper } = mountTab(projectFixture());
    await settle();

    await typeInto(wrapper, '数据管理单位', '上海');

    expect((await suggestions()).map((node) => node.text())).toEqual(['上海统计中心']);
  });

  it('选择带 Logo 的预设后同步预设 Logo，并在保存时提交预设', async () => {
    const fetchSpy = scriptFetch({
      [PRESET_LOGO_ROUTE]: () => fakeResponse(),
      [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }),
    });
    const { wrapper } = mountTab(projectFixture());
    await settle();

    await typeInto(wrapper, '数据管理单位', '北京');
    await pickSuggestion('北京临床数据中心');
    expect(logoPreview(wrapper)).toBe('blob:logo-1');
    expect(wrapper.text()).toContain('已同步预设 Logo');
    await save(wrapper);

    const { form, metadata } = savedProfile(fetchSpy);
    expect(metadata.data_management_unit).toBe('北京临床数据中心');
    expect(form.get('logo_action')).toBe('preset');
    expect(form.get('preset_id')).toBe('3');
  });

  it.each([
    ['预设没有 Logo', '上海', '上海统计中心', {}],
    [
      '预设 Logo 读取失败',
      '北京',
      '北京临床数据中心',
      { [PRESET_LOGO_ROUTE]: () => Promise.reject(new TypeError('offline')) },
    ],
    ['预设 Logo 不存在', '北京', '北京临床数据中心', { [PRESET_LOGO_ROUTE]: () => fakeResponse({ ok: false }) }],
  ])('%s时改为保存后清除 Logo', async (_case, keyword, unit, routes) => {
    const fetchSpy = scriptFetch({ ...routes, [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }) });
    const { wrapper } = mountTab(projectFixture());
    await settle();

    await typeInto(wrapper, '数据管理单位', keyword);
    await pickSuggestion(unit);
    expect(wrapper.text()).toContain('保存后清除 Logo');
    await save(wrapper);

    const { form } = savedProfile(fetchSpy);
    expect(form.get('logo_action')).toBe('clear');
    expect(form.has('preset_id')).toBe(false);
  });

  it('改写预设单位文字后保留预览，但保存时不再同步预设', async () => {
    const fetchSpy = scriptFetch({
      [PRESET_LOGO_ROUTE]: () => fakeResponse(),
      [PROFILE_ROUTE]: () => fakeResponse({ json: projectFixture() }),
    });
    const { wrapper } = mountTab(projectFixture());
    await settle();
    await typeInto(wrapper, '数据管理单位', '北京');
    await pickSuggestion('北京临床数据中心');

    // 逐字输入两次：el-autocomplete 先发 input 再发 update:modelValue，
    // 降级判定读到的是上一次输入后的单位文本，因此只在断言前多输入一次。
    await typeInto(wrapper, '数据管理单位', '北京临床数据中心A');
    await typeInto(wrapper, '数据管理单位', '北京临床数据中心AB');
    expect(wrapper.text()).not.toContain('已同步预设 Logo');
    expect(logoPreview(wrapper)).toBe('blob:logo-1');
    await save(wrapper);

    const { form, metadata } = savedProfile(fetchSpy);
    expect(metadata.data_management_unit).toBe('北京临床数据中心AB');
    expect(form.get('logo_action')).toBe('keep');
    expect(form.has('preset_id')).toBe(false);
  });

  it('机构预设加载失败时不提供候选', async () => {
    const { wrapper } = mountTab(projectFixture(), { presets: () => Promise.reject(new Error('无权限')) });
    await settle();

    await typeInto(wrapper, '数据管理单位', '北京');

    expect(await suggestions()).toHaveLength(0);
  });
});
