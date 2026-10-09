// DesignNotesDialog 挂载测试：真实渲染 el-dialog + el-input，验证打开复制草稿 / 取消不发请求 /
// 确定保存并通知父组件 / 保存失败提示四条行为（设计 D6.1）。
import { describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import DesignNotesDialog from '../../src/components/DesignNotesDialog.vue';
import { api } from '../../src/composables/useApi.js';

// 与 FormDesignerTab 的挂载方式一致：初始 modelValue=false，打开后 watcher 才复制备注。
// el-dialog 使用 append-to-body（真实 teleport 到 document.body，不 stub——VTU 2.5 的 teleport-stub
// 不渲染子节点），因此弹层内容统一通过 document.body 的 DOMWrapper 查询；emits 仍在 wrapper 上断言。
function mountDialog(props = {}) {
  return mount(DesignNotesDialog, {
    props: { projectId: 3, form: { id: 7, design_notes: '初始备注' }, ...props },
  });
}

function dialogLayer() {
  return new DOMWrapper(document.body);
}

async function openDialog(wrapper) {
  await wrapper.setProps({ modelValue: true });
  await nextTick();
}

describe('DesignNotesDialog', () => {
  it('打开时把已保存备注复制进文本框', async () => {
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(dialogLayer().find('textarea').element.value).toBe('初始备注');
  });

  it('点击取消只关闭弹窗，不发送任何请求', async () => {
    const wrapper = mountDialog();
    await openDialog(wrapper);
    // mockResolvedValue：即使回归误调 put 也绝不触达真实 fetch。
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);

    await dialogLayer().find('[data-test="design-notes-cancel"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('点击确定保存编辑后的备注，通知父组件刷新并关闭', async () => {
    const wrapper = mountDialog();
    await openDialog(wrapper);
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue(null);
    const invalidateSpy = vi.spyOn(api, 'invalidateCache');

    await dialogLayer().find('textarea').setValue('修改后的备注');
    await dialogLayer().find('[data-test="design-notes-save"]').trigger('click');
    await flushPromises();

    expect(putSpy).toHaveBeenCalledWith('/api/forms/7', { design_notes: '修改后的备注' });
    expect(invalidateSpy).toHaveBeenCalledWith('/api/projects/3/forms');
    expect(wrapper.emitted('saved')).toEqual([[{ formId: 7, designNotes: '修改后的备注' }]]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(ElMessage.success).toHaveBeenCalledWith('已保存');
  });

  it('保存失败时提示错误，既不发出 saved 也不关闭弹窗', async () => {
    const wrapper = mountDialog();
    await openDialog(wrapper);
    vi.spyOn(api, 'put').mockRejectedValue(new Error('网络错误'));

    await dialogLayer().find('[data-test="design-notes-save"]').trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith('设计备注保存失败：网络错误');
    expect(wrapper.emitted('saved')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
