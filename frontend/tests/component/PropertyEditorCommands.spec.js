import { describe, it, expect, vi } from 'vitest'
import {
  normalizeDateFormat,
  syncFieldTypeSpecificProps,
  isSystemFieldVariableName,
  ensureLabelVariableName,
  buildLabelOidSession,
  withLabelOidSeed,
  resolveLabelOidSeedDefinition,
  applyLabelOidTransition,
  normalizeHexColorInput,
  buildFormPropState,
  sameFormPropState,
  sameDraftDefinitionPayload,
  buildDefinitionPayload,
  normalizeDefinitionPayload,
  buildInstanceUpsert,
  buildBindingProfileCommand,
  buildFieldProfileCommand,
  buildDeleteProfileCommand,
  buildInstanceOnlyProfileCommand,
  resolveSharedWriteTarget,
  buildEditorStateFromSnapshot,
  buildFieldPropReplayCommand,
  DRAFT_DEFINITION_DIFF_KEYS,
} from '../../src/composables/formDesignerPropertyEditor'

const DATE_OPTIONS = { '日期': ['yyyy-MM-dd', 'yyyy/M/d'], '日期时间': ['yyyy-MM-dd HH:mm'], '时间': ['HH:mm'] }
const DATE_DEFAULTS = { '日期': 'yyyy-MM-dd', '日期时间': 'yyyy-MM-dd HH:mm', '时间': 'HH:mm' }
const payloadA = buildDefinitionPayload({ variable_name: 'OID1', label: '甲', field_type: '文本' })
const payloadB = buildDefinitionPayload({ variable_name: 'OID2', label: '乙', field_type: '文本' })

describe('type-specific editor normalization', () => {
  it('normalizeDateFormat handles non-date types, blanks and invalid values', () => {
    expect(normalizeDateFormat('文本', 'yyyy-MM-dd', DATE_OPTIONS, DATE_DEFAULTS)).toBeNull()
    expect(normalizeDateFormat('日期', '', DATE_OPTIONS, DATE_DEFAULTS)).toBe('')
    expect(normalizeDateFormat('日期', 'yyyy/M/d', DATE_OPTIONS, DATE_DEFAULTS)).toBe('yyyy/M/d')
    expect(normalizeDateFormat('日期', 'bogus', DATE_OPTIONS, DATE_DEFAULTS)).toBe('yyyy-MM-dd')
    expect(normalizeDateFormat('时间', 'bogus', {}, DATE_DEFAULTS)).toBe('HH:mm')
    expect(normalizeDateFormat('时间', 'bogus', {}, {})).toBeNull()
  })

  it('syncFieldTypeSpecificProps clears keys that the new type does not use', () => {
    const base = {
      date_format: 'bogus', codelist_id: 5, unit_id: 6, checkbox_label: '是',
      integer_digits: 3, decimal_digits: 2,
    }
    expect(syncFieldTypeSpecificProps(base, '数值', DATE_OPTIONS, DATE_DEFAULTS)).toEqual({
      date_format: null, codelist_id: null, unit_id: 6, checkbox_label: null,
      integer_digits: 3, decimal_digits: 2,
    })
    expect(syncFieldTypeSpecificProps(base, '单选', DATE_OPTIONS, DATE_DEFAULTS)).toMatchObject({
      codelist_id: 5, unit_id: null, checkbox_label: null, integer_digits: null, decimal_digits: null,
    })
    expect(syncFieldTypeSpecificProps(base, '复选', DATE_OPTIONS, DATE_DEFAULTS)).toMatchObject({
      checkbox_label: '是', codelist_id: null,
    })
    expect(syncFieldTypeSpecificProps({ date_format: 'yyyy/M/d' }, '日期时间', DATE_OPTIONS, DATE_DEFAULTS))
      .toMatchObject({ date_format: 'yyyy-MM-dd HH:mm' })
  })

  it('normalizeHexColorInput expands 3-digit hex and rejects junk', () => {
    expect(normalizeHexColorInput('')).toBeNull()
    expect(normalizeHexColorInput(null)).toBeNull()
    expect(normalizeHexColorInput('#abc')).toBe('AABBCC')
    expect(normalizeHexColorInput(' aBc123 ')).toBe('ABC123')
    expect(normalizeHexColorInput('ABC123')).toBe('ABC123')
    expect(normalizeHexColorInput('xyz')).toBeNull()
    expect(normalizeHexColorInput('12345')).toBeNull()
    expect(normalizeHexColorInput('ABC1234')).toBeNull()
  })
})

describe('label OID session helpers', () => {
  it('detects system-generated variable names', () => {
    expect(isSystemFieldVariableName('FIELD_20261117090000_ABC123')).toBe(true)
    expect(isSystemFieldVariableName(' FIELD_20261117090000_ABC123_copy ')).toBe(true)
    expect(isSystemFieldVariableName('FIELD_short')).toBe(false)
    expect(isSystemFieldVariableName('MY_OID')).toBe(false)
    expect(isSystemFieldVariableName(null)).toBe(false)
  })

  it('falls back to the generator only for invalid label OIDs', () => {
    expect(ensureLabelVariableName('VALID_OID', () => 'GEN')).toBe('VALID_OID')
    expect(ensureLabelVariableName('bad space', () => 'GEN')).toBe('GEN')
  })

  it('reuses label or system OIDs as the session seed', () => {
    expect(buildLabelOidSession({ variable_name: 'OID1', field_type: '标签' }).labelVariableName).toBe('OID1')
    expect(buildLabelOidSession({ variable_name: 'FIELD_20261117090000_ABC123', field_type: '文本' }).labelVariableName)
      .toBe('FIELD_20261117090000_ABC123')
    expect(buildLabelOidSession({ variable_name: 'OID1', field_type: '文本' }).labelVariableName).toBeNull()
    expect(buildLabelOidSession({ variable_name: null, field_type: '文本' }).labelVariableName).toBeNull()
    expect(buildLabelOidSession(null)).toEqual({ rememberedVariableName: null, labelVariableName: null })
  })

  it('attaches the creation seed to drafts and resolves it only for fresh drafts', () => {
    const draft = withLabelOidSeed({ field_definition: { variable_name: 'OID1', field_type: '标签' } })
    expect(draft.__labelOidSeed).toEqual({ variable_name: 'OID1', field_type: '标签' })
    expect(withLabelOidSeed({}).__labelOidSeed).toEqual({ variable_name: null, field_type: null })
    expect(resolveLabelOidSeedDefinition(null)).toBeNull()
    expect(resolveLabelOidSeedDefinition({ is_log_row: 1 })).toBeNull()
    const draftField = { __draft: true, __labelOidSeed: { variable_name: 'SEED' }, field_definition: { variable_name: 'MIRRORED' } }
    expect(resolveLabelOidSeedDefinition(draftField)).toEqual({ variable_name: 'SEED' })
    expect(resolveLabelOidSeedDefinition({ __draft: true, field_definition: { variable_name: 'LOADED' } }))
      .toEqual({ variable_name: 'LOADED' })
    expect(resolveLabelOidSeedDefinition({ field_definition: { variable_name: 'X' } })).toEqual({ variable_name: 'X' })
  })

  it('transitions the variable name in and out of the label type', () => {
    const into = applyLabelOidTransition({
      variableName: 'USER_OID', session: { rememberedVariableName: null, labelVariableName: null },
      previousType: '文本', nextType: '标签', generateVariableName: () => 'FIELD_GEN',
    })
    expect(into.variableName).toBe('FIELD_GEN')
    expect(into.session).toEqual({ rememberedVariableName: 'USER_OID', labelVariableName: 'FIELD_GEN' })

    const out = applyLabelOidTransition({
      variableName: 'FIELD_GEN', session: into.session,
      previousType: '标签', nextType: '文本', generateVariableName: () => 'FIELD_GEN',
    })
    expect(out.variableName).toBe('USER_OID')
    expect(out.session.rememberedVariableName).toBeNull()

    const sticky = applyLabelOidTransition({
      variableName: 'FIELD_GEN', session: { rememberedVariableName: null, labelVariableName: 'FIELD_GEN' },
      previousType: '标签', nextType: '文本', generateVariableName: () => 'FIELD_GEN',
    })
    expect(sticky.variableName).toBe('FIELD_GEN')

    const untouched = applyLabelOidTransition({
      variableName: 'OID', session: { rememberedVariableName: null, labelVariableName: null },
      previousType: '文本', nextType: '数值', generateVariableName: () => 'X',
    })
    expect(untouched.variableName).toBe('OID')
    expect(untouched.session).toEqual({ rememberedVariableName: null, labelVariableName: null })
  })
})

describe('form prop state helpers', () => {
  it('builds the four editable props with defaults and compares them', () => {
    expect(buildFormPropState({ name: '甲', code: 'F1', domain: '心电', paper_orientation: 'landscape' }))
      .toEqual({ name: '甲', code: 'F1', domain: '心电', paper_orientation: 'landscape' })
    expect(buildFormPropState(null)).toEqual({ name: '', code: '', domain: '', paper_orientation: 'auto' })
    const base = { name: '甲', code: 'F1', domain: '', paper_orientation: 'auto' }
    expect(sameFormPropState(base, { ...base })).toBe(true)
    expect(sameFormPropState(base, { ...base, domain: null })).toBe(false)
    expect(sameFormPropState(base, null)).toBe(false)
    expect(sameFormPropState(null, base)).toBe(false)
  })
})

describe('definition payload helpers', () => {
  it('sameDraftDefinitionPayload compares the nine diff keys with null-folding', () => {
    expect(sameDraftDefinitionPayload({}, null)).toBe(true)
    const payload = buildDefinitionPayload({ variable_name: 'OID1', label: '甲', field_type: '文本' })
    expect(sameDraftDefinitionPayload({ variable_name: 'OID1', label: '甲', field_type: '文本' }, payload)).toBe(true)
    expect(sameDraftDefinitionPayload({ variable_name: 'OID2' }, payload)).toBe(false)
    expect(DRAFT_DEFINITION_DIFF_KEYS).not.toContain('is_multi_record')
    expect(DRAFT_DEFINITION_DIFF_KEYS).not.toContain('table_type')
    expect(DRAFT_DEFINITION_DIFF_KEYS).toContain('codelist_id')
  })

  it('buildDefinitionPayload fills defaults and keeps explicit values', () => {
    expect(buildDefinitionPayload()).toEqual({
      variable_name: '', label: '', field_type: '文本', checkbox_label: null,
      integer_digits: null, decimal_digits: null, date_format: null,
      codelist_id: null, unit_id: null, is_multi_record: 0, table_type: '固定行',
    })
    expect(buildDefinitionPayload({ variable_name: 'OID1', is_multi_record: 1, table_type: '动态行', unit_id: 3 }))
      .toMatchObject({ variable_name: 'OID1', is_multi_record: 1, table_type: '动态行', unit_id: 3 })
  })

  it('normalizeDefinitionPayload keeps null semantics and normalizes type-specific keys', () => {
    expect(normalizeDefinitionPayload(null, DATE_OPTIONS, DATE_DEFAULTS)).toBeNull()
    const normalized = normalizeDefinitionPayload({
      field_type: '单选', codelist_id: 4, unit_id: 9, date_format: 'zzz',
    }, DATE_OPTIONS, DATE_DEFAULTS)
    expect(normalized).toMatchObject({ codelist_id: 4, unit_id: null, date_format: null, field_type: '单选' })
    const numeric = normalizeDefinitionPayload({ field_type: '数值', integer_digits: 2 }, DATE_OPTIONS, DATE_DEFAULTS)
    expect(numeric).toMatchObject({ integer_digits: 2, date_format: null })
  })

  it('buildInstanceUpsert keeps only present keys and honours explicit nulls', () => {
    expect(buildInstanceUpsert({ required: 1, bg_color: null, unused: 'x' })).toEqual({ required: 1, bg_color: null })
    expect(buildInstanceUpsert({}, ['required'])).toEqual({})
  })
})

describe('profile command builders', () => {
  const editorState = {
    variable_name: 'OID1', label: '甲', field_type: '文本', required: 1, default_value: 'x',
  }

  it('rebinds to a selected candidate with none/update_shared definition operations', () => {
    const pure = buildBindingProfileCommand({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState,
      selectedDefinitionId: 2, candidateOid: 'OID1', candidateDefinitionPayload: payloadB,
    })
    expect(pure.binding).toEqual({ mode: 'existing', target_field_definition_id: 2 })
    expect(pure.definition_operation.operation).toBe('update_shared')
    expect(pure.definition_operation.update_shared.target_definition_id).toBe(2)
    const none = buildBindingProfileCommand({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState,
      selectedDefinitionId: 2, candidateOid: 'OID1', candidateDefinitionPayload: payloadA,
    })
    expect(none.definition_operation).toEqual({ operation: 'none' })
  })

  it('forks on an OID change and keeps the binding otherwise', () => {
    const fork = buildBindingProfileCommand({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState: { ...editorState, variable_name: 'NEW_OID' },
      preferredDefinitionId: 7,
    })
    expect(fork.binding).toEqual({ mode: 'operation_result' })
    expect(fork.definition_operation.operation).toBe('create_or_restore')
    expect(fork.definition_operation.create_or_restore.preferred_definition_id).toBe(7)
    const keep = buildBindingProfileCommand({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState, currentDefinitionPayload: payloadB,
    })
    expect(keep.binding).toEqual({ mode: 'keep' })
    expect(keep.definition_operation.update_shared.target_definition_id).toBe(1)
    const cleanup = buildBindingProfileCommand({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState, cleanupDefinitionId: 9,
    })
    expect(cleanup.cleanup_definition_id).toBe(9)
  })

  it('buildFieldProfileCommand attaches to candidates or creates definitions', () => {
    const attach = buildFieldProfileCommand({ editorState, selectedDefinitionId: 5 })
    expect(attach).toEqual({
      binding: { mode: 'existing', target_field_definition_id: 5 },
      instance: { mode: 'upsert', upsert: { required: 1, default_value: 'x' } },
    })
    const attachWithDiff = buildFieldProfileCommand({
      editorState, selectedDefinitionId: 5, candidateDefinitionPayload: payloadB,
    })
    expect(attachWithDiff.definition_operation.operation).toBe('update_shared')
    const attachPure = buildFieldProfileCommand({
      editorState, selectedDefinitionId: 5, candidateOid: 'OID1', candidateDefinitionPayload: payloadA,
    })
    expect(attachPure.definition_operation).toBeUndefined()
    const create = buildFieldProfileCommand({
      editorState, preferredDefinitionId: 3, candidateDefinitionPayload: payloadA,
    })
    expect(create.binding).toEqual({ mode: 'operation_result' })
    expect(create.definition_operation.create_or_restore.preferred_definition_id).toBe(3)
    expect(create.definition_operation.create_or_restore.definition.variable_name).toBe('OID1')
  })

  it('buildDeleteProfileCommand optionally restores the definition snapshot', () => {
    const bare = buildDeleteProfileCommand({ cleanupDefinitionId: 4 })
    expect(bare).toEqual({ instance: { mode: 'delete' }, cleanup_definition_id: 4 })
    expect(buildDeleteProfileCommand({})).toEqual({ instance: { mode: 'delete' } })
    const restore = buildDeleteProfileCommand({
      restoreDefinitionId: 5, restoreDefinition: { label: '甲' },
    })
    expect(restore.definition_operation).toEqual({
      operation: 'update_shared',
      update_shared: { target_definition_id: 5, definition: { label: '甲' } },
    })
    expect(restore.binding).toEqual({ mode: 'keep' })
  })

  it('buildInstanceOnlyProfileCommand never touches definition or binding', () => {
    expect(buildInstanceOnlyProfileCommand({ instance: { required: 0 } })).toEqual({
      definition_operation: { operation: 'none' },
      binding: { mode: 'keep' },
      instance: { mode: 'upsert', upsert: { required: 0 } },
    })
  })

  it('resolveSharedWriteTarget returns the id only for real shared writes', () => {
    expect(resolveSharedWriteTarget({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState, currentDefinitionPayload: payloadB,
    })).toBe(1)
    expect(resolveSharedWriteTarget({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState, currentDefinitionPayload: payloadA,
    })).toBeNull()
    expect(resolveSharedWriteTarget({
      currentDefinitionId: 1, currentDefinitionOid: 'OID1', editorState: { ...editorState, variable_name: 'NEW' },
    })).toBeNull()
  })
})

describe('history replay commands', () => {
  const snapshot = {
    fd: { variable_name: 'OID1', label: '甲', field_type: '文本', integer_digits: 2 },
    required: 1, inline_mark: 1, label_bold: 0,
  }

  it('buildEditorStateFromSnapshot expands fd and instance keys with defaults', () => {
    const state = buildEditorStateFromSnapshot(snapshot)
    expect(state).toMatchObject({
      variable_name: 'OID1', field_type: '文本', integer_digits: 2,
      required: 1, inline_mark: 1, label_bold: 0, default_value: null,
    })
    expect(buildEditorStateFromSnapshot({})).toMatchObject({
      variable_name: '', field_type: '文本', inline_mark: 0, label_bold: 1, is_multi_record: null,
    })
  })

  it('replays shared, rebind and fork histories according to the recorded operation', () => {
    const shared = buildFieldPropReplayCommand({
      entryType: 'shared', writtenDefinitionId: 9, definitionUpdated: true, snapshot,
    })
    expect(shared.definition_operation.update_shared).toEqual({
      target_definition_id: 9, definition: buildDefinitionPayload(snapshot.fd),
    })
    const sharedNoWrite = buildFieldPropReplayCommand({
      entryType: 'shared', writtenDefinitionId: 9, definitionUpdated: false, snapshot,
    })
    expect(sharedNoWrite.definition_operation).toEqual({ operation: 'none' })

    const rebindUndo = buildFieldPropReplayCommand({
      entryType: 'rebind-undo', writtenDefinitionId: 9, originalDefinitionId: 2,
      candidateBeforePayload: payloadB, definitionUpdated: true, snapshot,
    })
    expect(rebindUndo.binding).toEqual({ mode: 'existing', target_field_definition_id: 2 })
    expect(rebindUndo.definition_operation.update_shared.definition).toEqual(payloadB)

    const rebindRedo = buildFieldPropReplayCommand({
      entryType: 'rebind-redo', writtenDefinitionId: 9, definitionUpdated: true, snapshot,
    })
    expect(rebindRedo.binding).toEqual({ mode: 'existing', target_field_definition_id: 9 })
    expect(rebindRedo.definition_operation.update_shared.definition).toEqual(buildDefinitionPayload(snapshot.fd))

    const forkUndo = buildFieldPropReplayCommand({
      entryType: 'fork-undo', writtenDefinitionId: 9, originalDefinitionId: 2, snapshot,
    })
    expect(forkUndo.definition_operation).toEqual({ operation: 'none' })
    expect(forkUndo.binding).toEqual({ mode: 'existing', target_field_definition_id: 2 })
    expect(forkUndo.cleanup_definition_id).toBe(9)

    const forkRedo = buildFieldPropReplayCommand({
      entryType: 'fork-redo', writtenDefinitionId: 9, originalDefinitionId: 2, originalDefinitionOid: 'OLD', snapshot,
    })
    expect(forkRedo.binding).toEqual({ mode: 'operation_result' })
    expect(forkRedo.definition_operation.create_or_restore.preferred_definition_id).toBe(9)

    expect(() => buildFieldPropReplayCommand({ entryType: 'bogus', snapshot })).toThrow('未知的属性回放类型')
  })
})
