import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { clampOrdinal, moveItem, resequenceItems, useOrdinalQuickEdit } from '../../src/composables/useOrdinalQuickEdit'
import { MAX_HISTORY, useDesignerHistory } from '../../src/composables/useDesignerHistory'
import {
  designStateError,
  cloneDesignState,
  requireDesignRevision,
  projectDesignIdentity,
  assertSameProjectDesignIdentity,
  assertSameDesignTarget,
  createOwnDesignChain,
  applyOwnDesignWrite,
  advanceOwnSnapshot,
  upgradeOwnBaseline,
  isValidOwnTransition,
  recordOwnTransition,
  provenOwnCandidate,
} from '../../src/composables/designRevision'
import {
  ANNOTATION_POSITION_MIN_Y,
  ANNOTATION_POSITION_MAX_Y,
  ACRF_ANNOTATION_EMU_PER_01CM,
  CSS_PX_PER_CM,
  clampAnnotationDelta01Cm,
  normalizeAnnotationPositions,
  readAnnotationDelta01Cm,
  hasAnnotationOverride,
  buildNextAnnotationPositions,
  annotationDeltaPxTo01Cm,
  emuToCssPx,
  emuToCm,
  resolveAnnotationDefaultOffsetEmu,
  resolveAnnotationTopCm,
  estimateAnnotationWidthCm,
  buildAnnotationStyle,
} from '../../src/composables/acrfAnnotationGeometry'
import { countDistinctForms, formatFieldImpactMessage } from '../../src/composables/fieldReferenceImpact'

const HEX = 'a'.repeat(32)
const tag = (p, r) => `"crf-design-v1:p${p}:${HEX}:r${r}"`

describe('ordinal pure helpers', () => {
  it('clampOrdinal falls back to min on non-finite input and clamps into range', () => {
    expect(clampOrdinal(Number.NaN, 1, 5)).toBe(1)
    expect(clampOrdinal(0, 1, 5)).toBe(1)
    expect(clampOrdinal(9, 1, 5)).toBe(5)
    expect(clampOrdinal(3, 1, 5)).toBe(3)
  })

  it('moveItem copies before moving and resequenceItems writes 1..n', () => {
    const source = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const moved = moveItem(source, 0, 2)
    expect(source).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(moved.map((i) => i.id)).toEqual([2, 3, 1])
    expect(resequenceItems(moved, 'order_index').map((i) => i.order_index)).toEqual([1, 2, 3])
    expect(resequenceItems(moved, 'seq').map((i) => i.seq)).toEqual([1, 2, 3])
  })
})

describe('useOrdinalQuickEdit', () => {
  const makeList = () => [
    { id: 1, label: '甲', order_index: 1 },
    { id: 2, label: '乙', order_index: 2 },
    { id: 3, label: '丙', order_index: 3 },
  ]

  function makeHook(list = makeList(), options = {}) {
    const source = ref(list)
    const saveOrder = options.saveOrder || vi.fn().mockResolvedValue(undefined)
    const reloadFn = options.reloadFn || vi.fn().mockResolvedValue(undefined)
    const hook = useOrdinalQuickEdit(source, '/reorder', {
      saveOrder,
      reloadFn,
      notifyRestore: options.notifyRestore || vi.fn(),
      notifyReloadError: options.notifyReloadError || vi.fn(),
      ...options.extra,
    })
    return { source, hook, saveOrder, reloadFn }
  }

  it('startEdit refuses filtered rows, id-less rows and unknown rows', () => {
    const { source, hook } = makeHook()
    expect(hook.startEdit({ id: 99 })).toBe(false)
    expect(hook.startEdit({})).toBe(false)
    expect(hook.editingId.value).toBeNull()
    const filtered = useOrdinalQuickEdit(source, '/x', { isFiltered: ref(true) })
    expect(filtered.startEdit({ id: 1 })).toBe(false)
    expect(hook.startEdit({ id: 2 })).toBe(true)
    expect(hook.editingId.value).toBe(2)
    expect(hook.editingValue.value).toBe(2)
    hook.cancelEdit()
    expect(hook.editingId.value).toBeNull()
    expect(hook.editingValue.value).toBe(1)
  })

  it('startEdit falls back to the row ordinal when no render list matches', () => {
    const { hook } = makeHook(makeList(), { extra: { renderList: ref([{ id: 1 }]) } })
    expect(hook.startEdit({ id: 3 })).toBe(true)
    expect(hook.editingValue.value).toBe(3)
  })

  it('commitEdit rejects missing ids, mismatched render rows and invalid ordinals', async () => {
    const { hook } = makeHook()
    expect(await hook.commitEdit()).toBe(false)
    hook.startEdit({ id: 2 })
    hook.editingValue.value = Number.NaN
    expect(await hook.commitEdit()).toBe(false)
    hook.startEdit({ id: 2 })
    hook.editingValue.value = 99
    expect(await hook.commitEdit()).toBe(false)
    hook.startEdit({ id: 2 })
    hook.editingValue.value = 2
    expect(await hook.commitEdit()).toBe(false)
    expect(hook.editingId.value).toBeNull()
  })

  it('commitEdit moves the row, saves the id order and reloads', async () => {
    const { source, hook, saveOrder, reloadFn } = makeHook()
    hook.startEdit({ id: 3 })
    hook.editingValue.value = 1
    expect(await hook.commitEdit()).toBe(true)
    expect(saveOrder).toHaveBeenCalledWith([3, 1, 2])
    expect(source.value.map((i) => i.id)).toEqual([3, 1, 2])
    expect(source.value.map((i) => i.order_index)).toEqual([1, 2, 3])
    expect(reloadFn).toHaveBeenCalledWith(2, 0)
    expect(hook.editingId.value).toBeNull()
  })

  it('commitEdit restores the snapshot, warns and suppresses reload errors on failure', async () => {
    const notifyRestore = vi.fn()
    const notifyReloadError = vi.fn()
    const reloadFn = vi.fn().mockRejectedValue(new Error('x'))
    const { source, hook, saveOrder } = makeHook(makeList(), {
      saveOrder: vi.fn().mockRejectedValue(new Error('save failed')),
      reloadFn,
      notifyRestore,
      notifyReloadError,
    })
    hook.startEdit({ id: 1 })
    hook.editingValue.value = 3
    expect(await hook.commitEdit()).toBe(false)
    expect(notifyRestore).toHaveBeenCalledWith('排序保存失败，已恢复')
    expect(notifyReloadError).not.toHaveBeenCalled()
    expect(source.value.map((i) => i.id)).toEqual([1, 2, 3])
    expect(reloadFn).toHaveBeenCalledWith(0, 2)
    expect(saveOrder).toHaveBeenCalled()
  })

  it('reload errors on the success path notify through the injected reporter', async () => {
    const notifyReloadError = vi.fn()
    const reloadFn = vi.fn().mockRejectedValue(new Error('x'))
    const { hook } = makeHook(makeList(), { reloadFn, notifyReloadError })
    hook.startEdit({ id: 1 })
    hook.editingValue.value = 2
    expect(await hook.commitEdit()).toBe(true)
    expect(notifyReloadError).toHaveBeenCalledWith('列表刷新失败，请稍后重试')
  })

  it('applies through applyList when provided and splices plain arrays otherwise', async () => {
    const applyList = vi.fn()
    const { hook } = makeHook(makeList(), { extra: { applyList } })
    hook.startEdit({ id: 1 })
    hook.editingValue.value = 2
    expect(await hook.commitEdit()).toBe(true)
    expect(applyList).toHaveBeenCalled()
    const plain = makeList()
    const plainHook = useOrdinalQuickEdit(plain, '/x', { saveOrder: vi.fn().mockResolvedValue(undefined), reloadFn: vi.fn() })
    plainHook.startEdit({ id: 1 })
    plainHook.editingValue.value = 2
    expect(await plainHook.commitEdit()).toBe(true)
    expect(plain.map((i) => i.id)).toEqual([2, 1, 3])
  })
})

describe('useDesignerHistory', () => {
  const entry = (label = 'e', fn = vi.fn().mockResolvedValue(undefined)) => ({ label, ids: [1], undo: fn, redo: fn })

  it('records up to the limit, clears redo, and refuses busy or invalid entries', async () => {
    const h = useDesignerHistory()
    expect(h.record({})).toBe(false)
    expect(h.record({ undo: vi.fn() })).toBe(false)
    for (let i = 0; i < MAX_HISTORY + 2; i += 1) h.record(entry(`e${i}`))
    expect(h.undoStack.value).toHaveLength(MAX_HISTORY)
    expect(h.undoStack.value[0].label).toBe('e2')
    h.record(entry('redo-seed'))
    await h.undo()
    expect(h.redoStack.value).toHaveLength(1)
    h.record(entry('fresh'))
    expect(h.redoStack.value).toEqual([])
    h.busy.value = true
    expect(h.record(entry('busy'))).toBe(false)
    h.busy.value = false
    expect(h.canUndo.value).toBe(true)
    expect(h.canRedo.value).toBe(false)
  })

  it('undo/redo move entries between stacks and rethrow with ids restored on failure', async () => {
    const h = useDesignerHistory()
    const failing = entry('bad', vi.fn().mockRejectedValue(new Error('boom')))
    failing.ids = [7, 8]
    h.record(failing)
    h.record(entry('good'))
    h.busy.value = true
    await h.undo()
    h.busy.value = false
    await h.undo()
    expect(h.undoStack.value).toHaveLength(1)
    expect(h.redoStack.value).toHaveLength(1)
    await h.redo()
    expect(h.undoStack.value).toHaveLength(2)
    expect(h.redoStack.value).toHaveLength(0)
    await h.undo()
    expect(h.undoStack.value).toHaveLength(1)
    await expect(h.undo()).rejects.toThrow('boom')
    expect(failing.ids).toEqual([7, 8])
    expect(h.undoStack.value).toHaveLength(1)
    expect(h.redoStack.value).toHaveLength(1)
    expect(h.busy.value).toBe(false)
    expect(h.canRedo.value).toBe(true)
  })

  it('committed failures clear both stacks; clear invalidates in-flight replay', async () => {
    const h = useDesignerHistory()
    let releaseUndo
    const gate = new Promise((resolve) => { releaseUndo = resolve })
    h.record(entry('gated', vi.fn().mockImplementation(() => gate)))
    const pending = h.undo()
    h.clear()
    releaseUndo()
    await pending
    expect(h.undoStack.value).toHaveLength(0)
    expect(h.busy.value).toBe(false)

    const h2 = useDesignerHistory()
    const committed = entry('committed', vi.fn().mockRejectedValue(Object.assign(new Error('x'), { committed: true })))
    h2.record(entry('ok'))
    h2.record(committed)
    await expect(h2.undo()).rejects.toThrow('x')
    expect(h2.undoStack.value).toHaveLength(0)
    expect(h2.redoStack.value).toHaveLength(0)
  })

  it('remapId rewrites recorded ids on the undo stack and reaches redo after undos', async () => {
    const h = useDesignerHistory()
    h.record(entry('a'))
    h.record({ label: 'b', ids: [1], undo: vi.fn(), redo: vi.fn() })
    h.remapId(null, 2)
    h.remapId(1, null)
    h.remapId(9, 9)
    h.remapId(1, 100)
    expect(h.undoStack.value.map((e) => e.ids[0])).toEqual([100, 100])
    await h.undo()
    await h.undo()
    expect(h.redoStack.value.map((e) => e.ids[0])).toEqual([100, 100])
  })
})

describe('designRevision pure contracts', () => {
  it('designStateError, cloneDesignState and requireDesignRevision behave as specified', () => {
    const err = designStateError('CODE_X', 'msg', { committed: true })
    expect(err.code).toBe('CODE_X')
    expect(err.committed).toBe(true)
    expect(cloneDesignState(null)).toBeNull()
    const source = { a: { b: 1 } }
    const clone = cloneDesignState(source)
    clone.a.b = 2
    expect(source.a.b).toBe(1)
    expect(requireDesignRevision('r1')).toBe('r1')
    expect(() => requireDesignRevision('')).toThrow('未收到设计版本')
    expect(() => requireDesignRevision(7)).toThrow()
  })

  it('projectDesignIdentity extracts the identity only from well-formed tags', () => {
    expect(projectDesignIdentity(tag(7, 12))).toBe(`crf-design-v1:p7:${HEX}`)
    expect(projectDesignIdentity(`crf-design-v1:p7:${HEX}:r12`)).toBeNull()
    expect(projectDesignIdentity(tag(0, 1))).toBeNull()
    expect(projectDesignIdentity(123)).toBeNull()
    expect(assertSameProjectDesignIdentity(tag(7, 1), tag(7, 9))).toBeUndefined()
    expect(() => assertSameProjectDesignIdentity(tag(7, 1), tag(8, 9))).toThrow('不能覆盖或重放旧命令')
    expect(() => assertSameProjectDesignIdentity('broken', tag(8, 9))).toThrow()
  })

  it('assertSameDesignTarget guards id, project, binding and oid identity', () => {
    const base = { id: 1, project_id: 5, form_id: 2, field_definition_id: 3, code: 'A' }
    expect(assertSameDesignTarget(base, { ...base })).toBeUndefined()
    expect(() => assertSameDesignTarget(base, { ...base, id: 2 })).toThrow('TARGET_CHANGED' && '不能覆盖或自动重建')
    expect(() => assertSameDesignTarget(base, { ...base, project_id: 6 })).toThrow()
    expect(() => assertSameDesignTarget(base, null)).toThrow()
    expect(assertSameDesignTarget(base, { ...base }, { binding: true, oidKey: 'code' })).toBeUndefined()
    expect(() => assertSameDesignTarget(base, { ...base, form_id: 9 }, { binding: true })).toThrow()
    expect(() => assertSameDesignTarget(base, { ...base, field_definition_id: 9 }, { binding: true })).toThrow()
    expect(() => assertSameDesignTarget(base, { ...base, code: 'B' }, { oidKey: 'code' })).toThrow()
    expect(assertSameDesignTarget({ ...base, project_id: null }, { ...base, project_id: null }, { binding: true })).toBeUndefined()
  })

  it('createOwnDesignChain records bounded edges and answers reachability', () => {
    const chain = createOwnDesignChain(2)
    chain.record(null, 'b')
    chain.record('a', 'a')
    chain.record('a', 'b')
    chain.record('b', 'c')
    chain.record('c', 'd')
    expect(chain.reaches('a', 'b')).toBe(false)
    expect(chain.reaches('b', 'd')).toBe(true)
    expect(chain.reaches('x', 'd')).toBe(false)
    chain.reset()
    expect(chain.reaches('b', 'd')).toBe(false)
    const unbounded = createOwnDesignChain()
    for (let i = 0; i < 300; i += 1) unbounded.record(`k${i}`, `k${i + 1}`)
    expect(unbounded.reaches('k299', 'k300')).toBe(true)
  })

  it('applyOwnDesignWrite maps only exactly derivable host writes', () => {
    const data = { projectId: 1, formId: 7, forms: [{ id: 7, name: '旧', order_index: 1 }, { id: 8, order_index: 2 }], fields: [{ id: 1, order_index: 1 }, { id: 2, order_index: 2 }] }
    expect(applyOwnDesignWrite(null, {})).toBeNull()
    const put = applyOwnDesignWrite(data, { method: 'put', url: '/api/forms/7', result: { id: 7, name: '新' } })
    expect(put.forms[0]).toEqual({ id: 7, name: '新', order_index: 1 })
    expect(applyOwnDesignWrite(data, { method: 'put', url: '/api/forms/7', result: { id: 9 } })).toBeNull()
    expect(applyOwnDesignWrite(data, { method: 'del', url: '/api/forms/7' })).toBeNull()
    const delOther = applyOwnDesignWrite(data, { method: 'del', url: '/api/forms/8' })
    expect(delOther.forms.map((f) => f.id)).toEqual([7])
    expect(delOther.forms[0].order_index).toBe(1)
    const reorder = applyOwnDesignWrite(data, { method: 'post', url: '/api/projects/1/forms/reorder', body: [8, 7] })
    expect(reorder.forms.map((f) => [f.id, f.order_index])).toEqual([[8, 1], [7, 2]])
    expect(applyOwnDesignWrite(data, { method: 'post', url: '/api/projects/1/forms/reorder', body: [8] })).toBeNull()
    const batch = applyOwnDesignWrite(data, { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [8] }, result: { deleted: 1 } })
    expect(batch.forms.map((f) => f.id)).toEqual([7])
    expect(batch.forms[0].order_index).toBe(1)
    expect(applyOwnDesignWrite(data, { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [8, 9] }, result: { deleted: 1 } })).toBeNull()
    expect(applyOwnDesignWrite(data, { method: 'post', url: '/api/projects/1/forms/batch-delete', body: { ids: [7] }, result: { deleted: 1 } })).toBeNull()
    const fieldsReorder = applyOwnDesignWrite(data, { method: 'post', url: '/api/forms/7/fields/reorder', body: { ordered_ids: [2, 1] } })
    expect(fieldsReorder.fields.map((f) => [f.id, f.order_index])).toEqual([[2, 1], [1, 2]])
    expect(applyOwnDesignWrite(data, { method: 'post', url: '/api/forms/8/fields/reorder', body: { ordered_ids: [2, 1] } })).toBeNull()
    const definitions = { projectId: 1, definitions: [{ id: 1, order_index: 2 }, { id: 2, order_index: 1 }] }
    const defsReorder = applyOwnDesignWrite(definitions, { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [2, 1] })
    expect(defsReorder.definitions.map((d) => [d.id, d.order_index])).toEqual([[2, 1], [1, 2]])
    expect(applyOwnDesignWrite({ ...definitions, fields: [{}] }, { method: 'post', url: '/api/projects/1/field-definitions/reorder', body: [2, 1] })).toBeNull()
    const fieldless = { projectId: 1, formId: 7, forms: [] }
    const fieldCommand = applyOwnDesignWrite(fieldless, { method: 'put', url: '/api/form-fields/9' })
    expect(fieldCommand).toEqual(fieldless)
    expect(applyOwnDesignWrite(data, { method: 'put', url: '/api/form-fields/9' })).toBeNull()
    expect(applyOwnDesignWrite(data, { method: 'get', url: '/api/whatever' })).toBeNull()
  })

  it('advanceOwnSnapshot and upgradeOwnBaseline advance only along the chain', () => {
    const data = { projectId: 1, formId: 7, forms: [{ id: 7, name: '旧', order_index: 1 }] }
    const snapshot = { revision: tag(1, 1), data }
    const accepted = { revision: tag(1, 2), baselineRevision: tag(1, 1), data: { id: 7, name: '新' } }
    const command = { method: 'put', url: '/api/forms/7' }
    expect(advanceOwnSnapshot(snapshot, { revision: tag(1, 3), baselineRevision: tag(1, 1) }, command)).toBe(snapshot)
    const advanced = advanceOwnSnapshot(snapshot, accepted, command)
    expect(advanced.revision).toBe(tag(1, 2))
    expect(advanced.data.forms[0].name).toBe('新')

    const chain = createOwnDesignChain()
    chain.record(tag(1, 1), tag(1, 2))
    const candidate = { revision: tag(1, 2), data: { projectId: 1, formId: 7, forms: [] } }
    expect(upgradeOwnBaseline({ revision: null }, [candidate], chain).revision).toBeNull()
    expect(upgradeOwnBaseline({ revision: tag(1, 1), data }, [], chain)).toEqual({ revision: tag(1, 1), data })
    expect(upgradeOwnBaseline({ revision: tag(1, 1), data }, [{ revision: tag(1, 5), data: { projectId: 9 } }], chain)).toEqual({ revision: tag(1, 1), data })
    const upgraded = upgradeOwnBaseline({ revision: tag(1, 1), data }, [candidate], chain)
    expect(upgraded).toEqual(candidate)
    expect(upgraded).not.toBe(candidate)
    const same = upgradeOwnBaseline({ revision: tag(1, 2), data: { projectId: 1, formId: 7 } }, [candidate], chain)
    expect(same.revision).toBe(tag(1, 2))
  })

  it('transition evidence and candidate gating are strict', () => {
    expect(isValidOwnTransition(7, { beforeRevision: tag(7, 1), revision: tag(7, 2) })).toBe(true)
    expect(isValidOwnTransition(7, { beforeRevision: tag(7, 1), revision: tag(8, 2) })).toBe(false)
    expect(isValidOwnTransition(7, { beforeRevision: tag(7, 2), revision: tag(7, 2) })).toBe(false)
    expect(isValidOwnTransition(7, { beforeRevision: 'x', revision: tag(7, 2) })).toBe(false)
    expect(isValidOwnTransition(8, { beforeRevision: tag(7, 1), revision: tag(7, 2) })).toBe(false)
    const chain = createOwnDesignChain()
    expect(recordOwnTransition(chain, 7, { beforeRevision: tag(7, 1), revision: tag(7, 2) })).toBe(true)
    expect(chain.reaches(tag(7, 1), tag(7, 2))).toBe(true)
    expect(recordOwnTransition(chain, 7, { beforeRevision: tag(7, 2), revision: tag(7, 2) })).toBe(false)
    expect(provenOwnCandidate(chain, { fromRevision: tag(7, 2), candidateRevision: null })).toBe(false)
    expect(provenOwnCandidate(chain, { fromRevision: tag(7, 2), candidateRevision: tag(7, 2) })).toBe(true)
    expect(provenOwnCandidate(chain, { fromRevision: null, candidateRevision: tag(7, 2) })).toBe(false)
    expect(provenOwnCandidate(chain, { fromRevision: tag(7, 2), candidateRevision: tag(7, 3) })).toBe(false)
    chain.record(tag(7, 2), tag(7, 3))
    expect(provenOwnCandidate(chain, { fromRevision: tag(7, 2), candidateRevision: tag(7, 3) })).toBe(true)
  })
})

describe('acrfAnnotationGeometry', () => {
  it('clamps, normalizes and reads annotation deltas', () => {
    expect(clampAnnotationDelta01Cm('abc')).toBe(0)
    expect(clampAnnotationDelta01Cm(1.4)).toBe(1)
    expect(clampAnnotationDelta01Cm(999)).toBe(ANNOTATION_POSITION_MAX_Y)
    expect(clampAnnotationDelta01Cm(-999)).toBe(ANNOTATION_POSITION_MIN_Y)
    expect(normalizeAnnotationPositions(null)).toEqual({})
    expect(normalizeAnnotationPositions([1])).toEqual({})
    expect(normalizeAnnotationPositions({ ' x ': { y: 5 }, '': { y: 1 }, zero: { y: 0 }, bad: { y: 'x' } }))
      .toEqual({ x: { y: 5 } })
    expect(readAnnotationDelta01Cm({ a: { y: 3 } }, ' a ')).toBe(3)
    expect(readAnnotationDelta01Cm(null, 'a')).toBe(0)
    expect(readAnnotationDelta01Cm({ a: { y: 3 } }, '')).toBe(0)
    expect(readAnnotationDelta01Cm({ a: { y: 5000 } }, 'a')).toBe(ANNOTATION_POSITION_MAX_Y)
    expect(hasAnnotationOverride({ a: { y: 1 } }, 'a')).toBe(true)
    expect(hasAnnotationOverride({ a: { y: 0 } }, 'a')).toBe(false)
    expect(hasAnnotationOverride(null, 'a')).toBe(false)
    expect(hasAnnotationOverride({ a: { y: 1 } }, ' ')).toBe(false)
  })

  it('buildNextAnnotationPositions sets and clears keys', () => {
    const base = { a: { y: 4 } }
    expect(buildNextAnnotationPositions(base, 'b', 2)).toEqual({ a: { y: 4 }, b: { y: 2 } })
    expect(buildNextAnnotationPositions(base, 'a', 0)).toEqual({})
    expect(buildNextAnnotationPositions(base, ' ', 9)).toEqual(base)
    expect(base).toEqual({ a: { y: 4 } })
  })

  it('converts units and resolves defaults per kind', () => {
    expect(annotationDeltaPxTo01Cm(CSS_PX_PER_CM)).toBeCloseTo(100, 5)
    expect(annotationDeltaPxTo01Cm(CSS_PX_PER_CM / 2)).toBeCloseTo(50, 5)
    expect(emuToCssPx(914400)).toBe(96)
    expect(emuToCm(360000)).toBeCloseTo(1, 5)
    expect(emuToCm(3600000)).toBeCloseTo(10, 5)
    const fallback = resolveAnnotationDefaultOffsetEmu('unknown-kind')
    expect(fallback).toBe(resolveAnnotationDefaultOffsetEmu())
    expect(resolveAnnotationTopCm('field', 0)).toBeCloseTo(emuToCm(resolveAnnotationDefaultOffsetEmu('field')), 6)
    expect(resolveAnnotationTopCm('field', 100)).toBeCloseTo(emuToCm(resolveAnnotationDefaultOffsetEmu('field') + 100 * ACRF_ANNOTATION_EMU_PER_01CM), 6)
  })

  it('estimates widths and builds the shared annotation style object', () => {
    expect(estimateAnnotationWidthCm('')).toBeCloseTo(0.9, 5)
    expect(estimateAnnotationWidthCm('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(4.6)
    expect(estimateAnnotationWidthCm('甲')).toBeCloseTo(0.9, 5)
    expect(estimateAnnotationWidthCm('甲乙')).toBeCloseTo(1.25, 5)
    const style = buildAnnotationStyle({ text: '甲', kind: 'form', deltaY01cm: 3 })
    expect(style['--acrf-annotation-background']).toBe('rgba(255, 242, 242, 0.25)')
    expect(style['--acrf-annotation-height']).toBe('0.7cm')
    expect(String(style['--acrf-annotation-top'])).toMatch(/cm$/)
  })
})

describe('fieldReferenceImpact', () => {
  it('counts distinct forms by name+code identity and ignores identity-less refs', () => {
    const refs = [
      { form_name: '表A', form_code: 'F1', field_label: '甲' },
      { form_name: '表A', form_code: 'F1', field_label: '乙' },
      { form_name: '表A', form_code: 'F2', field_label: '丙' },
      { form_name: null, form_code: null },
      null,
    ]
    expect(countDistinctForms(refs)).toBe(2)
    expect(countDistinctForms([])).toBe(0)
    expect(countDistinctForms(null)).toBe(0)
  })

  it('formats impact messages with truncation', () => {
    const refs = [
      { form_name: '表A', form_code: 'F1' },
      { form_name: '表B', form_code: 'F2' },
      { form_name: '表C', form_code: 'F3' },
      { form_name: '表D', form_code: 'F4' },
      { form_name: '表E', form_code: 'F5' },
      { form_name: '表F', form_code: 'F6' },
    ]
    expect(formatFieldImpactMessage(refs)).toBe('表A(F1)、表B(F2)、表C(F3)、表D(F4)、表E(F5)、...等共6条')
    expect(formatFieldImpactMessage(refs.slice(0, 2))).toBe('表A(F1)、表B(F2)')
    expect(formatFieldImpactMessage(refs, { max: 2, sep: '|' })).toBe('表A(F1)|表B(F2)|...等共6条')
  })
})
