import { h } from 'vue';
import { ElMessageBox } from 'element-plus';

// 用文本节点显示完整审阅内容，包含 '<' 的名称/备注也不会作为 HTML 执行。
export function confirmDesignOverwrite({ base, local, latest, impact, history = false, cancelText = '保留我的输入' }) {
  const section = (label, value) =>
    h('section', { style: { minWidth: 0 } }, [
      h('strong', label),
      h(
        'pre',
        { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0 14px' } },
        JSON.stringify(value ?? null, null, 2),
      ),
    ]);
  return ElMessageBox.confirm(
    h('div', { 'data-test': 'design-conflict-review' }, [
      h(
        'p',
        history
          ? '设计版本已改变，无法确认旧撤销/重做仍指向原对象。本次历史命令不会重放。请核对最新内容，随后明确重新载入设计以重建编辑上下文；当前输入和历史暂时保留。'
          : '设计已被其他编辑更新。你的输入已保留；请核对以下内容。确认只覆盖本次审阅的版本，不会跳过权限、引用或校验。',
      ),
      h('div', { style: { maxHeight: '50vh', overflow: 'auto' } }, [
        section('打开时的内容', base),
        section('本次原始修改', local),
        section('最新已保存内容', latest),
        section('当前引用影响', impact ?? '无额外共享引用；服务端仍会重新校验引用与权限'),
      ]),
    ]),
    history ? '历史上下文已改变' : '设计冲突：核对后覆盖',
    {
      type: 'warning',
      confirmButtonText: history ? '已核对，不执行旧命令' : '确认覆盖此版本',
      cancelButtonText: cancelText,
      distinguishCancelAndClose: true,
      closeOnClickModal: false,
      customStyle: { width: 'min(760px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)' },
    },
  );
}

export function isDesignCancellation(error) {
  return error === 'cancel' || error === 'close' || error?.code === 'CONTEXT_CHANGED';
}
