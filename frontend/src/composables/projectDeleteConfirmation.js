function formatQuestionTargetText(targetText) {
  return /["”]$/.test(targetText) ? `${targetText} ` : targetText
}

export function buildFinalDeleteConfirmMessage(options = {}) {
  const actionText = options.actionText || '删除'
  const targetText = options.targetText || '该内容'
  return `请再次确认：确定要${actionText}${formatQuestionTargetText(targetText)}吗？此操作不可恢复。`
}

export async function confirmDelete(confirm, options = {}) {
  const actionText = options.actionText || '删除'
  const targetText = options.targetText || '该内容'
  await confirm(`确认${actionText}${formatQuestionTargetText(targetText)}吗？`, options.title || '确认', {
    type: 'warning',
    confirmButtonText: options.firstConfirmButtonText || `确认${actionText}`,
    cancelButtonText: '取消',
  })
}

export async function confirmFinalDelete(confirm, options = {}) {
  await confirm(buildFinalDeleteConfirmMessage(options), '最终确认', {
    type: 'warning',
    confirmButtonText: options.confirmButtonText || '确认删除',
    cancelButtonText: '取消',
  })
}

export function getProjectDeleteTargetText({ projectName = '', projectCount = 0 } = {}) {
  if (projectCount > 0) return `选中的 ${projectCount} 个项目`
  if (projectName) return `项目 "${projectName}"`
  return '该项目'
}

export function buildFinalProjectDeleteConfirmMessage(options = {}) {
  return buildFinalDeleteConfirmMessage({
    ...options,
    targetText: getProjectDeleteTargetText(options),
  })
}

export async function confirmFinalProjectDelete(confirm, options = {}) {
  await confirmFinalDelete(confirm, {
    ...options,
    targetText: getProjectDeleteTargetText(options),
  })
}
