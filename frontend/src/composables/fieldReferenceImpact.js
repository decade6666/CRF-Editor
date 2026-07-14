function refPart(value) {
  return String(value ?? '')
}

function formatFormRef(ref) {
  return `${refPart(ref?.form_name)}(${refPart(ref?.form_code)})`
}

function buildFormKey(ref) {
  return `${refPart(ref?.form_name)}|${refPart(ref?.form_code)}`
}

function hasFormIdentity(ref) {
  return Boolean(ref) && Boolean(refPart(ref.form_name).trim() || refPart(ref.form_code).trim())
}

function collectDistinctFormLabels(refs) {
  const seen = new Set()
  const labels = []
  for (const ref of refs || []) {
    if (!hasFormIdentity(ref)) continue
    const key = buildFormKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(formatFormRef(ref))
  }
  return labels
}

function truncateLabels(labels, max, sep) {
  if (labels.length <= max) return labels.join(sep)
  return labels.slice(0, max).join(sep) + sep + `...等共${labels.length}条`
}

export function countDistinctForms(refs) {
  return collectDistinctFormLabels(refs).length
}

export function formatFieldImpactMessage(refs, opts = {}) {
  const { max = 5, sep = '、' } = opts
  return truncateLabels(collectDistinctFormLabels(refs), max, sep)
}
