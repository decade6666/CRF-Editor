import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/composables/formDesignerPropertyEditor.js'),
  'utf8',
)

async function loadModule() {
  return import('../src/composables/formDesignerPropertyEditor.js')
}

const EDITOR = {
  variable_name: 'BASE_DEF',
  label: '基础字段',
  field_type: '文本',
  integer_digits: null,
  decimal_digits: null,
  date_format: null,
  checkbox_label: null,
  codelist_id: null,
  unit_id: null,
  default_value: 'A',
  inline_mark: 0,
  required: 1,
  label_override: null,
  help_text: null,
  bg_color: 'FFEEDD',
  text_color: null,
  label_bold: 1,
  label_font_size: null,
}

const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'yyyy/MM/dd'],
  日期时间: ['yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH:mm:ss'],
  时间: ['HH:mm', 'HH:mm:ss'],
}
const DEFAULT_DATE_FORMATS = { 日期: 'yyyy-MM-dd', 日期时间: 'yyyy-MM-dd HH:mm', 时间: 'HH:mm' }

describe('field profile command builders', () => {
  test('shared update when oid unchanged and no candidate selected', async () => {
    const { buildBindingProfileCommand } = await loadModule()
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: EDITOR,
    })
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 5)
    assert.equal(command.definition_operation.update_shared.definition.variable_name, 'BASE_DEF')
    assert.equal(command.binding.mode, 'keep')
    assert.equal(command.instance.mode, 'upsert')
    assert.equal(command.instance.upsert.bg_color, 'FFEEDD')
    assert.equal(command.instance.upsert.default_value, 'A')
  })

  test('fork when oid changed', async () => {
    const { buildBindingProfileCommand } = await loadModule()
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'FORKED_OID' },
    })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.definition_operation.create_or_restore.definition.variable_name, 'FORKED_OID')
    assert.equal(command.definition_operation.create_or_restore.preferred_definition_id, undefined)
    assert.equal(command.binding.mode, 'operation_result')
  })

  test('fork carries preferred_definition_id for history redo', async () => {
    const { buildBindingProfileCommand } = await loadModule()
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'FORKED_OID' },
      preferredDefinitionId: 99,
      cleanupDefinitionId: 5,
    })
    assert.equal(command.definition_operation.create_or_restore.preferred_definition_id, 99)
    assert.equal(command.cleanup_definition_id, 5)
  })

  test('candidate rebind uses existing binding plus shared update', async () => {
    const { buildBindingProfileCommand } = await loadModule()
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'CAND_DEF', label: '候选字段' },
      selectedDefinitionId: 8,
      candidateOid: 'CAND_DEF',
    })
    assert.equal(command.binding.mode, 'existing')
    assert.equal(command.binding.target_field_definition_id, 8)
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 8)
    assert.equal(command.definition_operation.update_shared.definition.variable_name, 'CAND_DEF')
  })

  test('oid change wins over candidate rebind (fork)', async () => {
    const { buildBindingProfileCommand } = await loadModule()
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'TYPED_NEW_OID' },
      selectedDefinitionId: 8,
      candidateOid: 'CAND_DEF',
    })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.binding.mode, 'operation_result')
  })

  test('new draft attaches existing definition when candidate selected', async () => {
    const { buildFieldProfileCommand } = await loadModule()
    const command = buildFieldProfileCommand({ editorState: EDITOR, selectedDefinitionId: 7 })
    assert.equal(command.binding.mode, 'existing')
    assert.equal(command.binding.target_field_definition_id, 7)
    assert.equal(command.definition_operation, undefined)
    assert.equal(command.instance.upsert.required, 1)
  })

  test('draft attach without definition-level changes stays a pure binding', async () => {
    const { buildFieldProfileCommand, buildDefinitionPayload } = await loadModule()
    const candidatePayload = buildDefinitionPayload(EDITOR)
    const command = buildFieldProfileCommand({
      editorState: EDITOR,
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidatePayload,
    })
    assert.equal(command.binding.mode, 'existing')
    assert.equal(command.binding.target_field_definition_id, 7)
    assert.equal(command.definition_operation, undefined)
    assert.equal(command.instance.mode, 'upsert')
  })

  test('draft attach with definition-level changes updates the shared candidate definition', async () => {
    const { buildFieldProfileCommand, buildDefinitionPayload } = await loadModule()
    const candidatePayload = buildDefinitionPayload(EDITOR)
    const command = buildFieldProfileCommand({
      editorState: { ...EDITOR, label: '修改后的标签' },
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidatePayload,
    })
    assert.equal(command.binding.mode, 'existing')
    assert.equal(command.binding.target_field_definition_id, 7)
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 7)
    assert.equal(command.definition_operation.update_shared.definition.label, '修改后的标签')
    assert.equal(command.definition_operation.update_shared.definition.variable_name, 'BASE_DEF')
    assert.equal(command.instance.mode, 'upsert')
    assert.equal(command.instance.upsert.required, 1)
  })

  test('draft attach diff ignores reserved is_multi_record/table_type but preserves target structure on update', async () => {
    const { buildFieldProfileCommand, buildDefinitionPayload } = await loadModule()
    const candidatePayload = { ...buildDefinitionPayload(EDITOR), is_multi_record: 1, table_type: 'log行' }
    const editorState = { ...EDITOR, is_multi_record: 0, table_type: '固定行' }
    const sameCommand = buildFieldProfileCommand({
      editorState,
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidatePayload,
    })
    assert.equal(sameCommand.definition_operation, undefined, '保留结构键不参与差异判断')
    const changedCommand = buildFieldProfileCommand({
      editorState: { ...editorState, label: '改了标签' },
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidatePayload,
    })
    assert.equal(changedCommand.definition_operation.update_shared.definition.is_multi_record, 1)
    assert.equal(changedCommand.definition_operation.update_shared.definition.table_type, 'log行')
  })

  test('new draft creates definition otherwise', async () => {
    const { buildFieldProfileCommand } = await loadModule()
    const command = buildFieldProfileCommand({ editorState: EDITOR })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.binding.mode, 'operation_result')
    assert.equal(command.instance.mode, 'upsert')
    assert.equal(command.definition_operation.create_or_restore.preferred_definition_id, undefined)
  })

  test('new draft create carries preferred_definition_id', async () => {
    const { buildFieldProfileCommand } = await loadModule()
    const command = buildFieldProfileCommand({ editorState: EDITOR, preferredDefinitionId: 42 })
    assert.equal(command.definition_operation.create_or_restore.preferred_definition_id, 42)
  })

  test('undo-new-field delete command carries cleanup id', async () => {
    const { buildDeleteProfileCommand } = await loadModule()
    const command = buildDeleteProfileCommand({ cleanupDefinitionId: 33 })
    assert.equal(command.instance.mode, 'delete')
    assert.equal(command.cleanup_definition_id, 33)
  })

  test('definition payload excludes instance-only keys and defaults structure fields', async () => {
    const { buildDefinitionPayload } = await loadModule()
    const payload = buildDefinitionPayload({ variable_name: 'X', label: 'Y', field_type: '数值', default_value: 'nope' })
    assert.equal(payload.variable_name, 'X')
    assert.equal(payload.label, 'Y')
    assert.equal(payload.is_multi_record, 0)
    assert.equal(payload.table_type, '固定行')
    assert.ok(!('default_value' in payload))
    assert.ok(!('bg_color' in payload))
  })

  test('module exposes builders as named exports', () => {
    assert.match(source, /export function buildBindingProfileCommand/)
    assert.match(source, /export function buildFieldProfileCommand/)
    assert.match(source, /export function buildDeleteProfileCommand/)
    assert.match(source, /export function buildDefinitionPayload/)
    assert.match(source, /export function buildInstanceUpsert/)
    assert.match(source, /export function buildInstanceOnlyProfileCommand/)
    assert.match(source, /export function resolveSharedWriteTarget/)
    assert.match(source, /export function buildEditorStateFromSnapshot/)
    assert.match(source, /export function sameDraftDefinitionPayload/)
    assert.match(source, /export function normalizeDefinitionPayload/)
    assert.match(source, /export function buildFieldPropReplayCommand/)
  })

  test('instance-only command keeps definition and binding untouched', async () => {
    const { buildInstanceOnlyProfileCommand } = await loadModule()
    const command = buildInstanceOnlyProfileCommand({ instance: { inline_mark: 1 } })
    assert.deepEqual(command.definition_operation, { operation: 'none' })
    assert.deepEqual(command.binding, { mode: 'keep' })
    assert.deepEqual(command.instance, { mode: 'upsert', upsert: { inline_mark: 1 } })
  })

  test('resolveSharedWriteTarget mirrors command priority: rebind > fork > shared', async () => {
    const { resolveSharedWriteTarget } = await loadModule()
    assert.equal(
      resolveSharedWriteTarget({
        currentDefinitionId: 5,
        currentDefinitionOid: 'BASE',
        editorState: { variable_name: 'CAND' },
        selectedDefinitionId: 8,
        candidateOid: 'CAND',
      }),
      8,
    )
    assert.equal(
      resolveSharedWriteTarget({
        currentDefinitionId: 5,
        currentDefinitionOid: 'BASE',
        editorState: { variable_name: 'NEW_OID' },
        selectedDefinitionId: null,
        candidateOid: null,
      }),
      null,
    )
    assert.equal(
      resolveSharedWriteTarget({
        currentDefinitionId: 5,
        currentDefinitionOid: 'BASE',
        editorState: { variable_name: 'BASE' },
      }),
      5,
    )
  })

  test('draft fork: candidate-selected OID edit keeps the candidate structural keys', async () => {
    const { buildFieldProfileCommand, buildDefinitionPayload } = await loadModule()
    const candidateDefinitionPayload = {
      ...buildDefinitionPayload(EDITOR),
      is_multi_record: 0,
      table_type: '固定行',
    }
    const command = buildFieldProfileCommand({
      editorState: { ...EDITOR, variable_name: 'TYPED_OID', is_multi_record: 1, table_type: 'log行' },
      selectedDefinitionId: 7,
      candidateOid: 'CAND_OID',
      candidateDefinitionPayload,
    })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.definition_operation.create_or_restore.definition.variable_name, 'TYPED_OID')
    assert.equal(command.definition_operation.create_or_restore.definition.is_multi_record, 0)
    assert.equal(command.definition_operation.create_or_restore.definition.table_type, '固定行')
    assert.deepEqual(command.binding, { mode: 'operation_result' })
  })

  test('buildEditorStateFromSnapshot flattens fd and instance keys for replay', async () => {
    const { buildEditorStateFromSnapshot } = await loadModule()
    const state = buildEditorStateFromSnapshot({
      required: 1,
      label_override: '覆盖',
      default_value: 'A',
      inline_mark: 0,
      bg_color: null,
      label_bold: 1,
      fd: {
        variable_name: 'X',
        label: 'Y',
        field_type: '数值',
        integer_digits: 3,
        decimal_digits: 1,
        is_multi_record: 1,
        table_type: 'log行',
      },
    })
    assert.equal(state.variable_name, 'X')
    assert.equal(state.field_type, '数值')
    assert.equal(state.required, 1)
    assert.equal(state.label_override, '覆盖')
    assert.equal(state.default_value, 'A')
    assert.equal(state.inline_mark, 0)
    assert.equal(state.is_multi_record, 1)
    assert.equal(state.table_type, 'log行')
  })
})

describe('normalizeDefinitionPayload', () => {
  test('returns null for a null definition', async () => {
    const { normalizeDefinitionPayload } = await loadModule()
    assert.equal(normalizeDefinitionPayload(null, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), null)
  })

  test('type-normalizes date format defaults and keeps structural keys', async () => {
    const { normalizeDefinitionPayload } = await loadModule()
    const payload = normalizeDefinitionPayload(
      {
        variable_name: 'VISIT_DATE',
        label: '访视日期',
        field_type: '日期',
        date_format: null,
        is_multi_record: 1,
        table_type: 'log行',
      },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    assert.equal(payload.variable_name, 'VISIT_DATE')
    assert.equal(payload.field_type, '日期')
    assert.equal(payload.date_format, 'yyyy-MM-dd')
    assert.equal(payload.is_multi_record, 1)
    assert.equal(payload.table_type, 'log行')
  })

  test('clears type-inapplicable keys the same way the editor does', async () => {
    const { normalizeDefinitionPayload } = await loadModule()
    const payload = normalizeDefinitionPayload(
      {
        variable_name: 'VISIT_DATE',
        label: '访视日期',
        field_type: '日期',
        unit_id: 3,
        codelist_id: 9,
        integer_digits: 2,
      },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    assert.equal(payload.unit_id, null)
    assert.equal(payload.codelist_id, null)
    assert.equal(payload.integer_digits, null)
  })
})

describe('persisted binding-profile diff behavior', () => {
  test('pure rebind with an equal candidate snapshot sends none with existing binding', async () => {
    const { buildBindingProfileCommand, resolveSharedWriteTarget, normalizeDefinitionPayload } =
      await loadModule()
    const candidate = normalizeDefinitionPayload(
      {
        variable_name: 'CAND_DEF',
        label: '候选字段',
        field_type: '文本',
        is_multi_record: 1,
        table_type: 'log行',
      },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const args = {
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'CAND_DEF', label: '候选字段' },
      selectedDefinitionId: 8,
      candidateOid: 'CAND_DEF',
      candidateDefinitionPayload: candidate,
    }
    const command = buildBindingProfileCommand(args)
    assert.deepEqual(command.definition_operation, { operation: 'none' })
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 8 })
    assert.equal(command.instance.upsert.default_value, 'A')
    assert.equal(resolveSharedWriteTarget(args), null)
  })

  test('presentation-only edit with an equal current snapshot sends none with keep binding', async () => {
    const { buildBindingProfileCommand, resolveSharedWriteTarget, normalizeDefinitionPayload } =
      await loadModule()
    const current = normalizeDefinitionPayload(EDITOR, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)
    const args = {
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, bg_color: 'FF0000', label_font_size: 'large' },
      currentDefinitionPayload: current,
    }
    const command = buildBindingProfileCommand(args)
    assert.deepEqual(command.definition_operation, { operation: 'none' })
    assert.deepEqual(command.binding, { mode: 'keep' })
    assert.equal(command.instance.upsert.bg_color, 'FF0000')
    assert.equal(command.instance.upsert.label_font_size, 'large')
    assert.equal(resolveSharedWriteTarget(args), null)
  })

  test('genuine rebind change writes update_shared on the candidate with its structural keys', async () => {
    const { buildBindingProfileCommand, resolveSharedWriteTarget, normalizeDefinitionPayload } =
      await loadModule()
    const candidate = normalizeDefinitionPayload(
      {
        variable_name: 'CAND_DEF',
        label: '候选字段',
        field_type: '文本',
        is_multi_record: 1,
        table_type: 'log行',
      },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const args = {
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'CAND_DEF', label: '改后的标签' },
      selectedDefinitionId: 8,
      candidateOid: 'CAND_DEF',
      candidateDefinitionPayload: candidate,
    }
    const command = buildBindingProfileCommand(args)
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 8)
    assert.equal(command.definition_operation.update_shared.definition.label, '改后的标签')
    assert.equal(command.definition_operation.update_shared.definition.is_multi_record, 1)
    assert.equal(command.definition_operation.update_shared.definition.table_type, 'log行')
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 8 })
    assert.equal(resolveSharedWriteTarget(args), 8)
  })

  test('genuine keep change writes update_shared on the current definition with its structural keys', async () => {
    const { buildBindingProfileCommand, resolveSharedWriteTarget, normalizeDefinitionPayload } =
      await loadModule()
    const current = normalizeDefinitionPayload(
      { ...EDITOR, is_multi_record: 1, table_type: 'log行' },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const args = {
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, label: '改了标签' },
      currentDefinitionPayload: current,
    }
    const command = buildBindingProfileCommand(args)
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 5)
    assert.equal(command.definition_operation.update_shared.definition.label, '改了标签')
    assert.equal(command.definition_operation.update_shared.definition.is_multi_record, 1)
    assert.equal(command.definition_operation.update_shared.definition.table_type, 'log行')
    assert.deepEqual(command.binding, { mode: 'keep' })
    assert.equal(resolveSharedWriteTarget(args), 5)
  })

  test('oid change still forks and copies structural keys from the selected candidate snapshot', async () => {
    const { buildBindingProfileCommand, resolveSharedWriteTarget, normalizeDefinitionPayload } =
      await loadModule()
    const current = normalizeDefinitionPayload(
      { ...EDITOR, is_multi_record: 0, table_type: '固定行' },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const candidate = normalizeDefinitionPayload(
      {
        variable_name: 'CAND_DEF',
        label: '候选字段',
        field_type: '文本',
        is_multi_record: 1,
        table_type: 'log行',
      },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const args = {
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'TYPED_NEW_OID' },
      selectedDefinitionId: 8,
      candidateOid: 'CAND_DEF',
      currentDefinitionPayload: current,
      candidateDefinitionPayload: candidate,
    }
    const command = buildBindingProfileCommand(args)
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.definition_operation.create_or_restore.definition.is_multi_record, 1)
    assert.equal(command.definition_operation.create_or_restore.definition.table_type, 'log行')
    assert.deepEqual(command.binding, { mode: 'operation_result' })
    assert.equal(resolveSharedWriteTarget(args), null)
  })

  test('oid change without a selected candidate copies structural keys from the current snapshot', async () => {
    const { buildBindingProfileCommand, normalizeDefinitionPayload } = await loadModule()
    const current = normalizeDefinitionPayload(
      { ...EDITOR, is_multi_record: 1, table_type: 'log行' },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    const command = buildBindingProfileCommand({
      currentDefinitionId: 5,
      currentDefinitionOid: 'BASE_DEF',
      editorState: { ...EDITOR, variable_name: 'TYPED_NEW_OID' },
      currentDefinitionPayload: current,
    })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.definition_operation.create_or_restore.definition.is_multi_record, 1)
    assert.equal(command.definition_operation.create_or_restore.definition.table_type, 'log行')
    assert.deepEqual(command.binding, { mode: 'operation_result' })
  })

  test('draft attach with a normalized 日期 candidate snapshot stays a pure binding', async () => {
    const { buildFieldProfileCommand, normalizeDefinitionPayload } = await loadModule()
    const candidate = normalizeDefinitionPayload(
      { variable_name: 'BASE_DEF', label: '基础字段', field_type: '日期', date_format: null },
      DATE_FORMAT_OPTIONS,
      DEFAULT_DATE_FORMATS,
    )
    assert.equal(candidate.date_format, 'yyyy-MM-dd')
    const command = buildFieldProfileCommand({
      editorState: { ...EDITOR, field_type: '日期', date_format: 'yyyy-MM-dd' },
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidate,
    })
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 7 })
    assert.equal(command.definition_operation, undefined)
  })
})

describe('field property replay builder', () => {
  const SNAPSHOT = {
    required: 1,
    label_override: null,
    default_value: 'A',
    inline_mark: 0,
    bg_color: 'FFEEDD',
    text_color: null,
    label_bold: 1,
    label_font_size: 'large',
    fd: {
      variable_name: 'X',
      label: 'Y',
      field_type: '数值',
      integer_digits: 3,
      decimal_digits: 1,
      date_format: null,
      checkbox_label: null,
      codelist_id: null,
      unit_id: null,
      is_multi_record: 1,
      table_type: 'log行',
    },
  }

  test('shared replay with definitionUpdated writes the snapshot payload', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const command = buildFieldPropReplayCommand({
      entryType: 'shared',
      writtenDefinitionId: 5,
      definitionUpdated: true,
      snapshot: SNAPSHOT,
    })
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 5)
    assert.equal(command.definition_operation.update_shared.definition.label, 'Y')
    assert.deepEqual(command.definition_operation.update_shared.definition.is_multi_record, 1)
    assert.deepEqual(command.binding, { mode: 'keep' })
    assert.equal(command.instance.upsert.bg_color, 'FFEEDD')
    assert.equal(command.instance.upsert.label_font_size, 'large')
  })

  test('shared replay without definitionUpdated is instance-only', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const command = buildFieldPropReplayCommand({
      entryType: 'shared',
      writtenDefinitionId: 5,
      definitionUpdated: false,
      snapshot: SNAPSHOT,
    })
    assert.deepEqual(command.definition_operation, { operation: 'none' })
    assert.deepEqual(command.binding, { mode: 'keep' })
    assert.equal(command.instance.mode, 'upsert')
  })

  test('rebind-undo restores the candidate payload only when definitionUpdated', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const before = { variable_name: 'CAND_DEF', label: '原标签', field_type: '文本' }
    const command = buildFieldPropReplayCommand({
      entryType: 'rebind-undo',
      writtenDefinitionId: 8,
      originalDefinitionId: 5,
      candidateBeforePayload: before,
      definitionUpdated: true,
      snapshot: SNAPSHOT,
    })
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 8)
    assert.deepEqual(command.definition_operation.update_shared.definition, {
      ...before,
      checkbox_label: null,
      integer_digits: null,
      decimal_digits: null,
      date_format: null,
      codelist_id: null,
      unit_id: null,
      is_multi_record: 0,
      table_type: '固定行',
    })
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 5 })
    assert.equal(command.instance.mode, 'upsert')

    const pure = buildFieldPropReplayCommand({
      entryType: 'rebind-undo',
      writtenDefinitionId: 8,
      originalDefinitionId: 5,
      candidateBeforePayload: before,
      definitionUpdated: false,
      snapshot: SNAPSHOT,
    })
    assert.deepEqual(pure.definition_operation, { operation: 'none' })
    assert.deepEqual(pure.binding, { mode: 'existing', target_field_definition_id: 5 })
  })

  test('rebind-redo reapplies the snapshot payload only when definitionUpdated', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const command = buildFieldPropReplayCommand({
      entryType: 'rebind-redo',
      writtenDefinitionId: 8,
      definitionUpdated: true,
      snapshot: SNAPSHOT,
    })
    assert.equal(command.definition_operation.operation, 'update_shared')
    assert.equal(command.definition_operation.update_shared.target_definition_id, 8)
    assert.equal(command.definition_operation.update_shared.definition.label, 'Y')
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 8 })

    const pure = buildFieldPropReplayCommand({
      entryType: 'rebind-redo',
      writtenDefinitionId: 8,
      definitionUpdated: false,
      snapshot: SNAPSHOT,
    })
    assert.deepEqual(pure.definition_operation, { operation: 'none' })
    assert.deepEqual(pure.binding, { mode: 'existing', target_field_definition_id: 8 })
  })

  test('omitting definitionUpdated fails closed to instance-only replay', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const command = buildFieldPropReplayCommand({
      entryType: 'rebind-undo',
      writtenDefinitionId: 8,
      originalDefinitionId: 5,
      candidateBeforePayload: { variable_name: 'CAND', label: '原标签', field_type: '文本' },
      snapshot: SNAPSHOT,
    })
    assert.deepEqual(command.definition_operation, { operation: 'none' })
    assert.deepEqual(command.binding, { mode: 'existing', target_field_definition_id: 5 })
  })

  test('fork undo/redo keep cleanup and preferred semantics', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    const undo = buildFieldPropReplayCommand({
      entryType: 'fork-undo',
      writtenDefinitionId: 99,
      originalDefinitionId: 5,
      snapshot: SNAPSHOT,
    })
    assert.deepEqual(undo.definition_operation, { operation: 'none' })
    assert.deepEqual(undo.binding, { mode: 'existing', target_field_definition_id: 5 })
    assert.equal(undo.cleanup_definition_id, 99)

    const redo = buildFieldPropReplayCommand({
      entryType: 'fork-redo',
      writtenDefinitionId: 99,
      originalDefinitionId: 5,
      originalDefinitionOid: 'BASE_DEF',
      snapshot: SNAPSHOT,
    })
    assert.equal(redo.definition_operation.operation, 'create_or_restore')
    assert.equal(redo.definition_operation.create_or_restore.preferred_definition_id, 99)
    assert.equal(redo.definition_operation.create_or_restore.definition.is_multi_record, 1)
    assert.equal(redo.definition_operation.create_or_restore.definition.table_type, 'log行')
    assert.deepEqual(redo.binding, { mode: 'operation_result' })
  })

  test('unknown entry type throws', async () => {
    const { buildFieldPropReplayCommand } = await loadModule()
    assert.throws(
      () => buildFieldPropReplayCommand({ entryType: 'nope', writtenDefinitionId: 5, snapshot: SNAPSHOT }),
      /未知的属性回放类型/,
    )
  })
})
