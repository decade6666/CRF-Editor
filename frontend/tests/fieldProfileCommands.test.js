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

  test('draft attach diff ignores reserved is_multi_record/table_type but preserves them on update', async () => {
    const { buildFieldProfileCommand, buildDefinitionPayload } = await loadModule()
    const candidatePayload = { ...buildDefinitionPayload(EDITOR), is_multi_record: 1, table_type: 'log行' }
    const sameCommand = buildFieldProfileCommand({
      editorState: EDITOR,
      selectedDefinitionId: 7,
      candidateOid: 'BASE_DEF',
      candidateDefinitionPayload: candidatePayload,
    })
    assert.equal(sameCommand.definition_operation, undefined, '保留结构键不参与差异判断')
    const changedCommand = buildFieldProfileCommand({
      editorState: { ...EDITOR, label: '改了标签' },
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

  test('draft fork: candidate selected but oid edited creates a new definition', async () => {
    const { buildFieldProfileCommand } = await loadModule()
    const command = buildFieldProfileCommand({
      editorState: { ...EDITOR, variable_name: 'TYPED_OID' },
      selectedDefinitionId: 7,
      candidateOid: 'CAND_OID',
    })
    assert.equal(command.definition_operation.operation, 'create_or_restore')
    assert.equal(command.definition_operation.create_or_restore.definition.variable_name, 'TYPED_OID')
    assert.equal(command.binding.mode, 'operation_result')
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
      fd: { variable_name: 'X', label: 'Y', field_type: '数值', integer_digits: 3, decimal_digits: 1 },
    })
    assert.equal(state.variable_name, 'X')
    assert.equal(state.field_type, '数值')
    assert.equal(state.required, 1)
    assert.equal(state.label_override, '覆盖')
    assert.equal(state.default_value, 'A')
    assert.equal(state.inline_mark, 0)
  })
})
