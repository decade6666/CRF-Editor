/**
 * 复制文本到系统剪贴板的唯一入口（frontend/src 内仅此文件允许触碰剪贴板）。
 *
 * 浏览器 Clipboard API 仅在安全上下文（HTTPS / localhost）可用；生产 nginx 示例
 * 是明文 HTTP 部署，因此优先 navigator.clipboard.writeText，失败或不可用时回退到
 * 临时 readonly textarea + document.execCommand('copy')。env 参数可注入，
 * 供 node:test 用假的 navigator/document 验证两条路径。
 */

function defaultClipboardEnv() {
  return {
    navigator: typeof navigator !== 'undefined' ? navigator : undefined,
    document: typeof document !== 'undefined' ? document : undefined,
    isSecureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : undefined,
  };
}

function copyViaExecCommand(value, { document }) {
  if (!document?.body || typeof document.execCommand !== 'function') return false;
  let textarea = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    if (textarea?.parentNode) textarea.parentNode.removeChild(textarea);
  }
}

/**
 * 复制文本到剪贴板。
 * @param {string} text 待复制文本（空文本直接返回 false）
 * @param {{ navigator?: object, document?: object, isSecureContext?: boolean }} [env] 可注入环境，默认取全局对象
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyTextToClipboard(text, env = defaultClipboardEnv()) {
  const value = String(text ?? '');
  if (!value) return false;
  const context = { ...defaultClipboardEnv(), ...env };
  if (context.isSecureContext && context.navigator?.clipboard?.writeText) {
    try {
      await context.navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 写入失败（权限被拒等）时回退到 execCommand 路径
    }
  }
  return copyViaExecCommand(value, context);
}
