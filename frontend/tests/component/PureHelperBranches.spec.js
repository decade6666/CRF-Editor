import { describe, it, expect, vi } from 'vitest'
import { copyTextToClipboard } from '../../src/composables/clipboardCopy'
import { formatBytes } from '../../src/composables/byteSize'
import { HEADER_NOTES_MAX_LENGTH, summarizeDesignNotes, normalizeDesignNotesTooltip } from '../../src/composables/designNotesSummary'
import {
  normalizePreviewHexColor,
  getFormFieldDisplayLabel,
  getFormFieldTextColorStyle,
  getFormFieldPreviewStyle,
  isLogRowField,
  getFormFieldListLabel,
  getFormFieldStructurePreviewStyle,
  isFormFieldLabelBold,
  getFormFieldLabelFontSizeStyle,
  getFormFieldLabelPreviewStyle,
  buildFormDesignerUnifiedSegments,
  buildFormDesignerRenderGroups,
  countInlineTableBlocks,
  isInlineTableCountAllowed,
  INLINE_TABLE_LIMIT_MESSAGE,
} from '../../src/composables/formFieldPresentation'
import { normalizeSearchText, rankFuzzyMatches } from '../../src/composables/searchRanking'
import {
  REFERENCE_LIST_MAX,
  formatFieldReference,
  partitionByReferences,
  showReferenceBlockedAlert,
  confirmReferenceAwareBatchDelete,
  buildPartialDeleteMessage,
} from '../../src/composables/referenceDeleteGuard'
import {
  CANDIDATE_STATE_CURRENT,
  CANDIDATE_STATE_ADDED,
  candidateTexts,
  buildAutocompleteCandidates,
  candidateDisplayText,
  hydrateEditorFromCandidate,
  buildCopyVariableName,
  findOidConflict,
} from '../../src/composables/fieldDefinitionAutocomplete'
import {
  FIELD_OID_LENGTH_ERROR,
  FORM_OID_LENGTH_ERROR,
  editedOidLengthError,
  oidMaxLength,
  toUpperAsciiOid,
  isValidOptionalOid,
  isValidRequiredOid,
  OID_PATTERN,
} from '../../src/composables/oidValidation'
import { DB_TYPE_SAIMEISI } from '../../src/composables/fieldTypeAvailability'

describe('clipboardCopy', () => {
  it('short-circuits empty input to false', async () => {
    await expect(copyTextToClipboard('')).resolves.toBe(false)
    await expect(copyTextToClipboard(null)).resolves.toBe(false)
  })

  it('prefers the async clipboard in secure contexts and falls back when it rejects', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await expect(copyTextToClipboard('x', {
      navigator: { clipboard: { writeText } },
      isSecureContext: true,
    })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')

    const failing = vi.fn().mockRejectedValue(new Error('denied'))
    const execOk = vi.fn().mockReturnValue(true)
    const doc = fakeDocument(execOk)
    await expect(copyTextToClipboard('x', {
      navigator: { clipboard: { writeText: failing } },
      document: doc,
      isSecureContext: true,
    })).resolves.toBe(true)
    expect(failing).toHaveBeenCalled()
    expect(execOk).toHaveBeenCalledWith('copy')
    expect(doc.appended).toHaveLength(1)
    expect(doc.appended[0].value).toBe('x')
    expect(doc.appended[0].parentNode).toBeNull()
  })

  it('uses the textarea path in insecure contexts and survives execCommand failures', async () => {
    const writeText = vi.fn()
    const execOk = vi.fn().mockReturnValue(true)
    await expect(copyTextToClipboard('x', {
      navigator: { clipboard: { writeText } },
      document: fakeDocument(execOk),
      isSecureContext: false,
    })).resolves.toBe(true)
    expect(writeText).not.toHaveBeenCalled()

    await expect(copyTextToClipboard('x', {
      navigator: {},
      document: fakeDocument(vi.fn().mockReturnValue(false)),
      isSecureContext: true,
    })).resolves.toBe(false)
    await expect(copyTextToClipboard('x', {
      navigator: {},
      document: fakeDocument(vi.fn().mockImplementation(() => { throw new Error('boom') })),
      isSecureContext: true,
    })).resolves.toBe(false)
    await expect(copyTextToClipboard('x', {
      document: { body: null },
      isSecureContext: false,
    })).resolves.toBe(false)
    await expect(copyTextToClipboard('x', {
      document: { body: {}, execCommand: 'not-a-function' },
      isSecureContext: false,
    })).resolves.toBe(false)
  })
})

function fakeDocument(execCommand) {
  const appended = []
  return {
    appended,
    execCommand,
    body: {
      appendChild(el) { appended.push(el) },
      removeChild() {},
    },
    createElement() {
      const el = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), parentNode: null }
      el.parentNode = {
        removeChild(child) { child.parentNode = null },
      }
      return el
    },
  }
}

describe('byteSize.formatBytes', () => {
  it('returns a dash for invalid input', () => {
    expect(formatBytes(null)).toBe('-')
    expect(formatBytes('abc')).toBe('-')
    expect(formatBytes(-5)).toBe('-')
  })

  it('formats B through TB with a plateau above TB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB')
    expect(formatBytes(1024 ** 5)).toBe('1024.0 TB')
  })
})

describe('designNotesSummary', () => {
  it('summarizes only the first non-empty line and marks continuation', () => {
    expect(summarizeDesignNotes(null)).toBe('')
    expect(summarizeDesignNotes('  \n \n')).toBe('')
    expect(summarizeDesignNotes('第一行\n第二行')).toBe('第一行…')
    expect(summarizeDesignNotes('单行')).toBe('单行')
    expect(summarizeDesignNotes('多   个 空格')).toBe('多 个 空格')
    expect(summarizeDesignNotes('\n\n第二行才是内容')).toBe('第二行才是内容')
  })

  it('truncates over-long first lines at the configured length', () => {
    const long = '甲'.repeat(HEADER_NOTES_MAX_LENGTH + 5)
    expect(summarizeDesignNotes(long)).toBe('甲'.repeat(HEADER_NOTES_MAX_LENGTH) + '…')
    const exact = '乙'.repeat(HEADER_NOTES_MAX_LENGTH)
    expect(summarizeDesignNotes(exact)).toBe(exact)
    expect(summarizeDesignNotes(exact, 10)).toBe('乙'.repeat(10) + '…')
  })

  it('normalizes tooltip line breaks and trims boundary blank lines only', () => {
    expect(normalizeDesignNotesTooltip(null)).toBe('')
    expect(normalizeDesignNotesTooltip('\r\n甲\r\n乙\r\n')).toBe('甲\n乙')
    expect(normalizeDesignNotesTooltip('  甲  \n 乙 ')).toBe('  甲  \n 乙 ')
    expect(normalizeDesignNotesTooltip('  \n甲\n')).toBe('甲')
  })
})

describe('formFieldPresentation', () => {
  const def = (field_type, extra = {}) => ({ field_definition: { field_type, ...extra } })

  it('normalizes preview hex colors strictly', () => {
    expect(normalizePreviewHexColor('#AbCdEf')).toBe('AbCdEf')
    expect(normalizePreviewHexColor(' 123456 ')).toBe('123456')
    expect(normalizePreviewHexColor('#12345')).toBeNull()
    expect(normalizePreviewHexColor('#Gggggg')).toBeNull()
    expect(normalizePreviewHexColor(null)).toBeNull()
    expect(normalizePreviewHexColor('######')).toBeNull()
  })

  it('resolves display labels, colors and log-row detection', () => {
    expect(getFormFieldDisplayLabel({ label_override: '覆', field_definition: { label: '定' } }, '回')).toBe('覆')
    expect(getFormFieldDisplayLabel({ field_definition: { label: '定' } }, '回')).toBe('定')
    expect(getFormFieldDisplayLabel({}, '回')).toBe('回')
    expect(getFormFieldTextColorStyle({ text_color: '#ff0000' })).toBe('color:#ff0000')
    expect(getFormFieldTextColorStyle({ text_color: 'zzz' })).toBe('')
    expect(getFormFieldPreviewStyle({ bg_color: '#123456', text_color: '#654321' }))
      .toBe('background:#123456;color:#654321')
    expect(getFormFieldPreviewStyle({}, 'background:def;')).toBe('background:def;color:#000000')
    expect(isLogRowField(def('日志行'))).toBe(true)
    expect(isLogRowField({ field_type: '文本', is_log_row: 1 })).toBe(true)
    expect(isLogRowField(def('文本'))).toBe(false)
    expect(getFormFieldListLabel(def('日志行'))).toBe('以下为log行')
    expect(getFormFieldListLabel(def('文本'))).toBe('')
  })

  it('composes structure, bold and font-size label styles', () => {
    expect(getFormFieldStructurePreviewStyle(def('日志行')))
      .toBe('background:var(--preview-structure-bg);color:#000000')
    expect(isFormFieldLabelBold({ label_bold: 0 })).toBe(false)
    expect(isFormFieldLabelBold({})).toBe(true)
    expect(getFormFieldLabelFontSizeStyle({ label_font_size: 'large' })).toBe('font-size:16px;')
    expect(getFormFieldLabelFontSizeStyle({ label_font_size: 'small' })).toBe('font-size:11px;')
    expect(getFormFieldLabelFontSizeStyle({ label_font_size: 'default' })).toBe('')
    const full = getFormFieldLabelPreviewStyle({ text_color: '#112233', label_font_size: 'large', label_bold: 0 })
    expect(full).toBe('font-weight:normal;font-size:16px;color:#112233')
    expect(getFormFieldLabelPreviewStyle(def('日志行'), { structure: true }))
      .toContain('font-weight:bold;background:var(--preview-structure-bg);')
    expect(getFormFieldLabelPreviewStyle({ text_color: '#445566' }, { includeBackground: false }))
      .toBe('font-weight:bold;color:#445566')
  })

  it('segments unified fields by inline runs and structural types', () => {
    const fields = [
      { id: 2, order_index: 1, inline_mark: 1, field_definition: { field_type: '文本' } },
      { id: 1, order_index: 2, inline_mark: 1, field_definition: { field_type: '文本' } },
      { id: 3, order_index: 3, field_definition: { field_type: '标签' } },
      { id: 4, order_index: 4, is_log_row: 1, field_definition: { field_type: '文本' } },
      { id: 5, order_index: 5, field_definition: { field_type: '文本' } },
    ]
    const segments = buildFormDesignerUnifiedSegments(fields)
    expect(segments.map((s) => s.type)).toEqual(['inline_block', 'full_row', 'full_row', 'regular_field'])
    expect(segments[0].fields.map((f) => f.id)).toEqual([2, 1])
    expect(buildFormDesignerUnifiedSegments([{ id: 1, inline_mark: 1, field_definition: { field_type: '文本' } }]))
      .toEqual([{ type: 'inline_block', fields: [{ id: 1, inline_mark: 1, field_definition: { field_type: '文本' } }] }])
  })

  it('groups render runs and counts inline table blocks', () => {
    expect(buildFormDesignerRenderGroups([])).toEqual([])
    const fields = [
      { id: 1, inline_mark: 0, order_index: 1 },
      { id: 2, inline_mark: 1, order_index: 2 },
      { id: 3, inline_mark: 1, order_index: 3 },
      { id: 4, inline_mark: 0, order_index: 4 },
    ]
    const groups = buildFormDesignerRenderGroups(fields)
    expect(groups.map((g) => g.type)).toEqual(['normal', 'inline', 'normal'])
    expect(groups[1].fields.map((f) => f.id)).toEqual([2, 3])
    expect(countInlineTableBlocks(fields)).toBe(1)
    expect(countInlineTableBlocks([{ id: 2, inline_mark: 1, order_index: 2 }, { id: 1, inline_mark: 0, order_index: 1 }])).toBe(1)
    expect(countInlineTableBlocks(null)).toBe(0)
    expect(INLINE_TABLE_LIMIT_MESSAGE).toContain('横向表格')
    expect(isInlineTableCountAllowed(0, 1)).toBe(true)
    expect(isInlineTableCountAllowed(1, 1)).toBe(true)
    expect(isInlineTableCountAllowed(3, 2)).toBe(true)
    expect(isInlineTableCountAllowed(1, 2)).toBe(false)
    expect(isInlineTableCountAllowed(0, 2)).toBe(false)
  })
})

describe('searchRanking.rankFuzzyMatches', () => {
  const textOf = (item) => item.text

  it('normalizeSearchText trims and lowercases', () => {
    expect(normalizeSearchText('  AbC ')).toBe('abc')
    expect(normalizeTextToNullish()).toBe('')
  })

  it('keeps source order on empty keywords and filters non-matching items', () => {
    const items = [{ text: '甲' }, { text: '乙' }]
    expect(rankFuzzyMatches(items, '  ', textOf)).toEqual(items)
    expect(rankFuzzyMatches(items, '丙', textOf)).toEqual([])
  })

  it('ranks exact above substring above subsequence above bounded typo', () => {
    const items = [
      { text: '甲乙丙丁错字' },   // tier 3 typo (甲乙丙 + one edit... see below)
      { text: '甲乙丙丁戊' },     // subsequence: 甲乙丙 spread
      { text: '甲乙丙中间' },     // substring
      { text: '甲乙丙' },         // exact
    ]
    expect(rankFuzzyMatches(items, '甲乙丙', textOf)[0]).toBe(items[3])
    expect(rankFuzzyMatches(items, '甲乙丙', textOf)).toContain(items[2])
    expect(rankFuzzyMatches(items, '甲乙丙', textOf)).toHaveLength(4)
  })

  it('enables typo tolerance only from three characters and respects the similarity floor', () => {
    const two = [{ text: '甲乙错' }]
    expect(rankFuzzyMatches(two, '甲丙', textOf)).toEqual([])
    const three = [{ text: '甲乙丙' }]
    expect(rankFuzzyMatches(three, '甲乙丁', textOf)).toHaveLength(1)
    const longKeyword = '甲乙丙丁戊己庚'
    const far = [{ text: '甲乙丙错错错错错错错' }]
    expect(rankFuzzyMatches(far, longKeyword, textOf)).toEqual([])
  })

  it('supports multiple candidate texts and keeps ties stable by index', () => {
    const items = [
      { a: '丙乙甲', b: '' },
      { a: '', b: '甲乙丙' },
    ]
    expect(rankFuzzyMatches(items, '甲乙丙', (it) => [it.a, it.b])[0].b).toBe('甲乙丙')
    const ties = [{ text: '甲乙' }, { text: '甲乙' }]
    const ordered = rankFuzzyMatches(ties, '甲乙', textOf)
    expect(ordered).toEqual(ties)
    expect(rankFuzzyMatches([{ text: 'ABC' }, { text: 'xyz' }], 'abc', textOf)).toEqual([{ text: 'ABC' }])
  })
})

function normalizeTextToNullish() {
  return normalizeSearchText(undefined)
}

describe('referenceDeleteGuard', () => {
  const alertBox = (rejectWith) => ({ alert: vi.fn().mockRejectedValue(rejectWith), confirm: vi.fn() })
  const confirmBox = (resolve) => ({ confirm: vi.fn().mockResolvedValue(resolve), alert: vi.fn() })

  it('formats references with and without form metadata', () => {
    expect(formatFieldReference({ field_label: '甲', field_var: 'F_A', form_name: '表', form_code: 'F1' }))
      .toBe('表(F1)-甲(F_A)')
    expect(formatFieldReference({ field_label: '甲', field_var: 'F_A', form_name: '表' }))
      .toBe('表-甲(F_A)')
    expect(formatFieldReference({ field_label: '甲', field_var: 'F_A' }))
      .toBe('字段库-甲(F_A)')
  })

  it('partitions items by present references only', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const refsMap = { 1: [{ x: 1 }], 2: [] }
    const { blocked, deletable } = partitionByReferences(items, refsMap)
    expect(blocked.map((b) => b.item.id)).toEqual([1])
    expect(blocked[0].refs).toEqual([{ x: 1 }])
    expect(deletable.map((i) => i.id)).toEqual([2, 3])
    expect(partitionByReferences(null, refsMap)).toEqual({ blocked: [], deletable: [] })
  })

  it('swallows message box dismissal but rethrows real alert failures', async () => {
    await expect(showReferenceBlockedAlert(alertBox('cancel'), 'msg')).resolves.toBeUndefined()
    await expect(showReferenceBlockedAlert(alertBox('close'), 'msg')).resolves.toBeUndefined()
    await expect(showReferenceBlockedAlert(alertBox(new Error('boom')), 'msg')).rejects.toThrow('boom')
    const okBox = { alert: vi.fn().mockResolvedValue('confirm') }
    await expect(showReferenceBlockedAlert(okBox, 'msg')).resolves.toBeUndefined()
    expect(okBox.alert).toHaveBeenCalledWith('msg', '无法删除', expect.objectContaining({ type: 'warning' }))
  })

  it('confirms plain batches when nothing is referenced', async () => {
    const box = confirmBox('confirm')
    const items = [{ id: 1, name: '甲' }, { id: 2, name: '乙' }]
    const result = await confirmReferenceAwareBatchDelete(box, {
      items, refsMap: {}, noun: '字典', nameOf: (i) => i.name, describeRefs: () => 'x',
    })
    expect(result).toEqual(items)
    expect(box.confirm).toHaveBeenCalledWith('确认删除选中的 2 个字典？', '批量删除', { type: 'warning' })
    expect(await confirmReferenceAwareBatchDelete(box, { items: null, refsMap: {}, noun: 'x', nameOf: () => '', describeRefs: () => '' })).toEqual([])
  })

  it('alerts without deletion when every item is referenced', async () => {
    const box = alertBox('cancel')
    const items = [{ id: 1, name: '甲' }, { id: 2, name: '乙' }]
    const result = await confirmReferenceAwareBatchDelete(box, {
      items,
      refsMap: { 1: ['r'], 2: ['r'] },
      noun: '单位',
      nameOf: (i) => i.name,
      describeRefs: (refs) => `${refs.length}处`,
    })
    expect(result).toEqual([])
    expect(box.alert).toHaveBeenCalled()
    expect(box.confirm).not.toHaveBeenCalled()
    const message = box.alert.mock.calls[0][0]
    expect(message).toContain('均已被引用')
    expect(message).toContain('【甲】')
  })

  it('shows the two-section mixed dialog and returns only the deletable items', async () => {
    const box = confirmBox('confirm')
    const many = Array.from({ length: REFERENCE_LIST_MAX + 2 }, (_, i) => ({ id: i + 10, name: `名${i}` }))
    const items = [{ id: 1, name: '被引' }, ...many]
    const refsMap = { 1: ['r'] }
    const result = await confirmReferenceAwareBatchDelete(box, {
      items, refsMap, noun: '字典', nameOf: (i) => i.name, describeRefs: () => 'x',
    })
    expect(result.map((i) => i.id)).toEqual(many.map((i) => i.id))
    const message = box.confirm.mock.calls[0][0]
    expect(message).toContain('已被引用，不能删除')
    expect(message).toContain('...等共12个字典')
    expect(message).toContain('未被引用，确认删除？')
    expect(message).toContain('...等共12个字典')
  })

  it('propagates confirm cancellation and formats partial-delete summaries', async () => {
    const box = { confirm: vi.fn().mockRejectedValue('cancel'), alert: vi.fn() }
    await expect(confirmReferenceAwareBatchDelete(box, {
      items: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }],
      refsMap: { 1: ['r'] },
      noun: '字典',
      nameOf: (i) => i.name,
      describeRefs: () => 'x',
    })).rejects.toBe('cancel')
    expect(buildPartialDeleteMessage('字典', 2, 3)).toBe('已删除 2 个字典，3 个被引用的字典未删除')
  })
})

describe('fieldDefinitionAutocomplete', () => {
  const defs = [
    { id: 1, variable_name: 'VISIT_DATE', label: '访视日期', field_type: '日期' },
    { id: 2, variable_name: 'VISIT_NO', label: '访视编号', field_type: '文本' },
    { id: 3, variable_name: 'OTHER', label: '其他', field_type: '文本' },
  ]

  it('exposes candidate texts and display triples', () => {
    expect(candidateTexts(defs[0])).toEqual(['VISIT_DATE', '访视日期'])
    expect(candidateDisplayText(defs[0])).toEqual({ oid: 'VISIT_DATE', label: '访视日期', fieldType: '日期' })
    expect(candidateDisplayText({})).toEqual({ oid: '', label: '', fieldType: '' })
  })

  it('returns no candidates for blank keywords', () => {
    expect(buildAutocompleteCandidates({ definitions: defs, keyword: '   ' })).toEqual([])
    expect(buildAutocompleteCandidates({ definitions: defs, keyword: null })).toEqual([])
  })

  it('marks current and already-added definitions and ranks matches', () => {
    const candidates = buildAutocompleteCandidates({
      definitions: defs,
      keyword: 'visit',
      currentDefinitionId: 2,
      formFieldDefinitionIds: [1, 2, 3],
      excludeOwnFormFieldId: 2,
    })
    expect(candidates.map((c) => c.definition.id)).toEqual([2, 1])
    expect(candidates[0].state).toBe(CANDIDATE_STATE_CURRENT)
    expect(candidates[0].selectable).toBe(true)
    expect(candidates[1].state).toBe(CANDIDATE_STATE_ADDED)
    expect(candidates[1].selectable).toBe(false)
    expect(candidates[1].value).toBe('visit')
  })

  it('hydrates editors from candidates while preserving presentation state', () => {
    const editor = {
      variable_name: 'OLD', label: '旧', field_type: '文本', bg_color: '#abcdef',
      label_bold: 0, label_font_size: 'default', required: true, default_value: 'x',
    }
    const next = hydrateEditorFromCandidate({
      editor,
      definition: defs[0],
      instance: { required: false, label_override: '实例标签', help_text: '帮助' },
      normalizedDefaultValue: '默认',
      normalizedInlineMark: 1,
    })
    expect(next.variable_name).toBe('VISIT_DATE')
    expect(next.bg_color).toBe('#abcdef')
    expect(next.label_bold).toBe(0)
    expect(next.default_value).toBe('默认')
    expect(next.inline_mark).toBe(1)
    expect(next.required).toBe(false)
    expect(next.label_override).toBe('实例标签')
    expect(next.help_text).toBe('帮助')
    const fallback = hydrateEditorFromCandidate({ editor, definition: { variable_name: 'X' } })
    expect(fallback.label_override).toBeNull()
    expect(fallback.field_type).toBe('文本')
  })

  it('mints uppercase copy names with the shortest free _COPY suffix', () => {
    expect(buildCopyVariableName([], 'abc')).toBe('ABC_COPY')
    expect(buildCopyVariableName(['ABC_COPY'], 'abc')).toBe('ABC_COPY1')
    expect(buildCopyVariableName(['ABC_COPY', 'ABC_COPY1'], 'abc')).toBe('ABC_COPY2')
    expect(buildCopyVariableName([null, undefined], '')).toBe('_COPY')
  })

  it('finds OID conflicts excluding the current binding and ignoring blanks', () => {
    expect(findOidConflict(defs, '  ')).toBeNull()
    expect(findOidConflict(defs, null)).toBeNull()
    expect(findOidConflict(defs, 'OTHER').id).toBe(3)
    expect(findOidConflict(defs, 'OTHER', 3)).toBeNull()
  })
})

describe('oidValidation', () => {
  it('limits manual OID length only for Saimeisi databases and changed candidates', () => {
    expect(editedOidLengthError({ dbType: '其他', kind: 'field', candidate: 'A'.repeat(30), baseline: '' })).toBeNull()
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'unknown', candidate: 'A'.repeat(30), baseline: '' })).toBeNull()
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'field', candidate: ' ABC ', baseline: 'ABC' })).toBeNull()
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'field', candidate: 'FIELD_X', baseline: 'FIELD_X' })).toBeNull()
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'field', candidate: 'A'.repeat(9), baseline: 'B' }))
      .toBe(FIELD_OID_LENGTH_ERROR)
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'form', candidate: 'A'.repeat(11), baseline: '' }))
      .toBe(FORM_OID_LENGTH_ERROR)
    expect(editedOidLengthError({ dbType: DB_TYPE_SAIMEISI, kind: 'field', candidate: null, baseline: null })).toBeNull()
  })

  it('exposes entry maxlength only for Saimeisi databases', () => {
    expect(oidMaxLength('其他', 'field')).toBeUndefined()
    expect(oidMaxLength(DB_TYPE_SAIMEISI, 'field')).toBe(8)
    expect(oidMaxLength(DB_TYPE_SAIMEISI, 'form')).toBe(10)
    expect(oidMaxLength(DB_TYPE_SAIMEISI, 'unknown')).toBeUndefined()
  })

  it('uppercases only ASCII letters', () => {
    expect(toUpperAsciiOid('abc_x-9.ß')).toBe('ABC_X-9.ß')
    expect(toUpperAsciiOid(null)).toBe('')
    expect(toUpperAsciiOid(undefined)).toBe('')
  })

  it('validates optional and required OID charset boundaries', () => {
    expect(isValidOptionalOid(null)).toBe(true)
    expect(isValidOptionalOid('  ')).toBe(true)
    expect(isValidOptionalOid('A_1.b-c')).toBe(true)
    expect(isValidOptionalOid('坏/OID')).toBe(false)
    expect(isValidRequiredOid(null)).toBe(false)
    expect(isValidRequiredOid('   ')).toBe(false)
    expect(isValidRequiredOid('FORM_1')).toBe(true)
    expect(isValidRequiredOid('空 格')).toBe(false)
    expect(OID_PATTERN.test('ABC123._-')).toBe(true)
    expect(OID_PATTERN.test('ABC!')).toBe(false)
  })
})
