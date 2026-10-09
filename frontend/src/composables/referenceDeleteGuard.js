export const REFERENCE_DELETE_BOX_CLASS = 'reference-delete-box'

// 批量弹窗中被引用明细 / 可删除名单的最大展示条数
export const REFERENCE_LIST_MAX = 10

// 字典 / 单位引用行 → '表单名(OID)-字段名(变量名)'；无 OID → '表单名-字段名(变量名)'；
// 未放入表单（form_name 为 null）→ '字段库-字段名(变量名)'
export function formatFieldReference(ref) {
  const fieldPart = `${ref?.field_label ?? ''}(${ref?.field_var ?? ''})`
  if (ref?.form_name == null) return `字段库-${fieldPart}`
  const formPart = ref?.form_code == null ? String(ref?.form_name) : `${ref.form_name}(${ref.form_code})`
  return `${formPart}-${fieldPart}`
}

// 按引用分组：refsMap 的键可能是 JSON 序列化后的字符串；
// 缺失 / 空数组 / 非数组的引用都视为可删除。不修改入参。
export function partitionByReferences(items, refsMap) {
  const blocked = []
  const deletable = []
  for (const item of items || []) {
    const refs = refsMap?.[item?.id]
    if (Array.isArray(refs) && refs.length > 0) {
      blocked.push({ item, refs })
    } else {
      deletable.push(item)
    }
  }
  return { blocked, deletable }
}

// MessageBox 的取消（'cancel'）与关闭（'close'，X / ESC）属于正常结束；
// 其余（如真正的异常）原样抛出
function isMessageBoxDismissal(error) {
  return error === 'cancel' || error === 'close'
}

// 单删被引用拦截弹窗：只提醒、不提供删除确认；关闭弹窗即结束，不产生未处理的 Promise 拒绝
export async function showReferenceBlockedAlert(messageBox, message) {
  try {
    await messageBox.alert(message, '无法删除', {
      type: 'warning',
      confirmButtonText: '知道了',
      customClass: REFERENCE_DELETE_BOX_CLASS,
    })
  } catch (e) {
    if (!isMessageBoxDismissal(e)) throw e
  }
}

function buildBlockedSectionLines(blocked, noun, nameOf, describeRefs) {
  const lines = blocked
    .slice(0, REFERENCE_LIST_MAX)
    .map(({ item, refs }) => `【${nameOf(item)}】：${describeRefs(refs)}`)
  if (blocked.length > REFERENCE_LIST_MAX) {
    lines.push(`...等共${blocked.length}个${noun}`)
  }
  return lines
}

function buildDeletableNamesLine(deletable, noun, nameOf) {
  const names = deletable.slice(0, REFERENCE_LIST_MAX).map((item) => nameOf(item))
  if (deletable.length > REFERENCE_LIST_MAX) {
    return `${names.join('、')}、...等共${deletable.length}个${noun}`
  }
  return names.join('、')
}

// 批量删除分组确认：全部被引用 → 只提醒并返回 []；
// 全部未引用 → 保持原确认文案并返回全部；混合 → 两段展示并返回可删除组。
// confirm 的取消（'cancel'）原样抛出，由调用方的 catch 处理。
export async function confirmReferenceAwareBatchDelete(messageBox, { items, refsMap, noun, nameOf, describeRefs }) {
  const selectedItems = items || []
  if (!selectedItems.length) return []
  const { blocked, deletable } = partitionByReferences(selectedItems, refsMap)
  if (!blocked.length) {
    await messageBox.confirm(`确认删除选中的 ${selectedItems.length} 个${noun}？`, '批量删除', { type: 'warning' })
    return deletable
  }
  const blockedLines = buildBlockedSectionLines(blocked, noun, nameOf, describeRefs)
  if (!deletable.length) {
    const message = [`选中的 ${blocked.length} 个${noun}均已被引用，不能删除（需先解除引用）：`, ...blockedLines].join('\n')
    await showReferenceBlockedAlert(messageBox, message)
    return []
  }
  const message = [
    `以下 ${blocked.length} 个${noun}已被引用，不能删除（需先解除引用）：`,
    ...blockedLines,
    '',
    `以下 ${deletable.length} 个${noun}未被引用，确认删除？`,
    buildDeletableNamesLine(deletable, noun, nameOf),
  ].join('\n')
  await messageBox.confirm(message, '批量删除', {
    type: 'warning',
    confirmButtonText: `删除 ${deletable.length} 个${noun}`,
    cancelButtonText: '取消',
    customClass: REFERENCE_DELETE_BOX_CLASS,
  })
  return deletable
}

export function buildPartialDeleteMessage(noun, deletedCount, blockedCount) {
  return `已删除 ${deletedCount} 个${noun}，${blockedCount} 个被引用的${noun}未删除`
}
