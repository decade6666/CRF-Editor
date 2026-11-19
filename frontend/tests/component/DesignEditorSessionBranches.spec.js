// R3：useDesignEditorSession 审阅链路的补充行为分支（不挂组件，纯会话 + 设计服务器夹具）。
// 覆盖点均为真实行为断言：无基线写入直接拒绝且零请求；历史写入缺一致基线拒绝；
// 排序审阅发现列表成员变化拒绝且绝不重写；共享定义经字段行解析后确认重绑成功；
// detached 写入在确认时发现宿主已离开（reviewable=false）拒绝 DETACHED_STALE。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import { useDesignEditorSession } from '../../src/composables/useDesignEditorSession.js';
import { readCoherentDesign } from '../../src/composables/designRevision.js';
import { stageDesignServer } from './designServerFixture.js';

// 会话组合式内部注册 onUnmounted：必须挂载真实宿主组件来创建（卸载宿主即销毁会话）。
function createSession(options = {}) {
  const Host = {
    setup(_, { expose }) {
      const session = useDesignEditorSession(options);
      expose({ session });
      return () => null;
    },
  };
  const wrapper = mount(Host);
  return { wrapper, session: wrapper.vm.session };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

async function loadBaseline(server, { withFields = true } = {}) {
  const urls = withFields
    ? ['/api/projects/1/forms', '/api/forms/7/fields']
    : ['/api/projects/1/forms'];
  const snapshot = await readCoherentDesign(urls, { cached: false });
  const data = { projectId: 1, formId: withFields ? 7 : null };
  if (withFields) {
    data.forms = snapshot.data[0];
    data.fields = snapshot.data[1];
  } else {
    data.forms = snapshot.data[0];
  }
  return { revision: snapshot.revision, data };
}

describe('R3：设计编辑会话审阅分支的真实行为', () => {
  it('无已加载快照的普通写入直接拒绝（原项目已改变），且不发起任何请求', async () => {
    const server = stageDesignServer();
    const { wrapper, session } = createSession({ getProjectId: () => 1 });
    await expect(
      session.write('put', '/api/forms/7', { name: 'x' }, { baseline: null }),
    ).rejects.toThrow('原项目已改变，未提交原命令');
    expect(server.calls, '拒绝发生在任何请求之前').toHaveLength(0);
    expect(server.state.forms[0].name).not.toBe('x');
    wrapper.unmount();
  });

  it('历史写入缺少一致基线数据时拒绝（HISTORY_CONTEXT_CHANGED）', async () => {
    const server = stageDesignServer();
    const { wrapper, session } = createSession({ getProjectId: () => 1 });
    await expect(
      session.write('put', '/api/forms/7', { name: 'x' }, { baseline: { data: null, revision: '"x"' }, history: true }),
    ).rejects.toThrow('重新载入设计');
    expect(server.calls, '拒绝发生在任何请求之前').toHaveLength(0);
    wrapper.unmount();
  });

  it('排序审阅发现列表成员已被外部改变时拒绝，绝不把旧排序用于新列表', async () => {
    const server = stageDesignServer();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const { wrapper, session } = createSession({ getProjectId: () => 1 });
    const baseline = await loadBaseline(server);
    server.remote((state) => {
      state.fields.push({
        id: 399, form_id: 7, field_definition_id: null, order_index: 3, required: 0, is_log_row: 0,
        inline_mark: 0, label_override: null, help_text: null, default_value: null, bg_color: null,
        text_color: null, label_bold: 1, label_font_size: null,
      });
    });
    const orderedIds = server.state.fields.map((item) => item.id);
    await expect(
      session.write('post', '/api/forms/7/fields/reorder', { ordered_ids: orderedIds }, { baseline }),
    ).rejects.toThrow('列表成员已改变');
    expect(confirm, '成员变化在确认弹窗之前就被拒绝').not.toHaveBeenCalled();
    expect(server.writes(), '被拒绝的排序不重试、不落库').toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(false);
    confirm.mockRestore();
    wrapper.unmount();
  });

  it('共享定义变更审阅：定义经字段行解析，确认后按最新基线重绑字段', async () => {
    const server = stageDesignServer();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const { wrapper, session } = createSession({ getProjectId: () => 1 });
    const baseline = await loadBaseline(server);
    const definitionId = server.state.fields[0].field_definition_id;
    server.remote((state) => { state.forms[0].design_notes = '外部备注'; });
    const accepted = await session.write(
      'put',
      '/api/form-fields/101/binding-profile',
      { instance: { upsert: { label_override: '新标签' } }, binding: { mode: 'existing', target_field_definition_id: definitionId } },
      { baseline },
    );
    expect(session.accepted()?.revision, '审阅后接受的写入记入会话').toBeTruthy();
    expect(server.writes().map((call) => call.accepted)).toEqual([false, true]);
    expect(server.state.fields[0].field_definition_id).toBe(definitionId);
    expect(server.state.fields[0].label_override).toBe('新标签');
    confirm.mockRestore();
    wrapper.unmount();
  });

  it('detached 排序在确认时发现宿主已离开（reviewable=false）拒绝，不保存也不重试', async () => {
    const server = stageDesignServer();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    // 默认 getContext / isCurrent（缺省参数分支）：仅提供 getProjectId。
    const { wrapper, session } = createSession({ getProjectId: () => 1 });
    const baseline = await loadBaseline(server, { withFields: false });
    server.remote((state) => { state.forms[0].design_notes = '外部备注'; });
    const orderedIds = server.state.forms.map((item) => item.id);
    await expect(
      session.write(
        'post',
        '/api/projects/1/forms/reorder',
        { ordered_ids: orderedIds },
        { baseline, detached: true, reviewable: () => false },
      ),
    ).rejects.toThrow('编辑位置已切换');
    expect(confirm, 'DETACHED_STALE 先于确认弹窗').not.toHaveBeenCalled();
    expect(server.writes(), 'detached 拒绝不重试、不落库').toHaveLength(1);
    expect(server.writes()[0].accepted).toBe(false);
    confirm.mockRestore();
    wrapper.unmount();
  });
});
