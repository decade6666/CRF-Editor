import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAcrfAnnotationDrag } from '../../src/composables/useAcrfAnnotationDrag'

function makeHook(overrides = {}) {
  const applyOptimisticPositions = vi.fn()
  const onPersisted = vi.fn()
  const onError = vi.fn()
  const positionsByForm = new Map()
  const hook = useAcrfAnnotationDrag({
    apiClient: { patch: vi.fn().mockResolvedValue({ id: 1 }) },
    getCurrentPositions: (formId) => positionsByForm.get(formId) || {},
    applyOptimisticPositions,
    onPersisted,
    onError,
    ...overrides,
  })
  return { hook, applyOptimisticPositions, onPersisted, onError, positionsByForm, patch: hook_patch(hook, overrides) }
}

function hook_patch(hook, overrides) {
  return overrides.apiClient ? overrides.apiClient.patch : null
}

describe('useAcrfAnnotationDrag', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('queueAnnotationPosition ignores incomplete targets and equal states', () => {
    const { hook, applyOptimisticPositions } = makeHook()
    hook.queueAnnotationPosition({})
    hook.queueAnnotationPosition({ formId: 1 })
    hook.queueAnnotationPosition({ projectId: 1 })
    hook.queueAnnotationPosition({ formId: 1, projectId: 1, key: ' ' })
    hook.queueAnnotationPosition({ formId: null, projectId: 1, key: 'f1', deltaY01cm: 5 })
    hook.queueAnnotationPosition({ formId: 1, projectId: null, key: 'f1', deltaY01cm: 5 })
    expect(applyOptimisticPositions).not.toHaveBeenCalled()
    // 相同位置不提交
    hook.queueAnnotationPosition({ formId: 1, projectId: 1, key: 'f1', deltaY01cm: 0 })
    expect(applyOptimisticPositions).not.toHaveBeenCalled()
    expect(hook.flushPending).toBeTruthy()
  })

  it('queues a drag delta, flushes through apiClient.patch and reports persistence', async () => {
    const patch = vi.fn().mockResolvedValue({ id: 9 })
    const { hook, applyOptimisticPositions, onPersisted } = makeHook({ apiClient: { patch } })
    hook.queueAnnotationPosition({ formId: 7, projectId: 3, key: 'f1', deltaY01cm: 12 })
    expect(applyOptimisticPositions).toHaveBeenCalledWith(7, { f1: { y: 12 } })
    expect(await hook.flushPending()).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
    const [url, body, options] = patch.mock.calls[0]
    expect(url).toBe('/api/forms/7')
    expect(body).toEqual({ annotation_positions: { f1: { y: 12 } } })
    expect(options.invalidate).toEqual(['/api/forms/7/fields', '/api/projects/3/forms'])
    expect(onPersisted).toHaveBeenCalledWith({ id: 9 }, expect.objectContaining({ formId: 7, key: 'f1' }))
    expect(await hook.flushPending()).toBe(true)
  })

  it('sends null positions when the queued override is a reset', async () => {
    const patch = vi.fn().mockResolvedValue({ id: 1 })
    const { hook, positionsByForm } = makeHook({ apiClient: { patch } })
    positionsByForm.set(4, { f1: { y: 5 } })
    hook.resetAnnotationPosition({ key: 'f1', formId: 4, projectId: 2 })
    hook.resetAnnotationPosition({})
    expect(await hook.flushPending()).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch.mock.calls[0][1]).toEqual({ annotation_positions: null })
  })

  it('uses the persistSnapshot adapter when provided', async () => {
    const persistSnapshot = vi.fn().mockResolvedValue({ id: 2 })
    const { hook, onPersisted } = makeHook({ persistSnapshot })
    hook.queueAnnotationPosition({ formId: 4, projectId: 2, key: '_form', deltaY01cm: -3 })
    expect(await hook.flushPending()).toBe(true)
    expect(persistSnapshot).toHaveBeenCalledWith(expect.objectContaining({ formId: 4, key: '_form' }))
    expect(onPersisted).toHaveBeenCalledWith({ id: 2 }, expect.anything())
  })

  it('stops flushing and reports the first patch failure', async () => {
    const patch = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ id: 3 })
    const { hook, onError, onPersisted } = makeHook({ apiClient: { patch } })
    hook.queueAnnotationPosition({ formId: 1, projectId: 1, key: 'a', deltaY01cm: 2 })
    hook.queueAnnotationPosition({ formId: 2, projectId: 1, key: 'b', deltaY01cm: 3 })
    expect(await hook.flushPending()).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onPersisted).not.toHaveBeenCalled()
    expect(await hook.flushPending()).toBe(true)
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it('a flush in flight is reused by concurrent callers', async () => {
    let release
    const patch = vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const { hook } = makeHook({ apiClient: { patch } })
    hook.queueAnnotationPosition({ formId: 1, projectId: 1, key: 'a', deltaY01cm: 1 })
    const first = hook.flushPending()
    const second = hook.flushPending()
    release({ id: 1 })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it('pointer down/move/up drives optimistic updates and queues the final delta', async () => {
    const patch = vi.fn().mockResolvedValue({ id: 5 })
    const { hook, applyOptimisticPositions, onPersisted } = makeHook({ apiClient: { patch } })
    const setPointerCapture = vi.fn()
    hook.onAnnotationPointerDown({ key: 'f1', formId: 7, projectId: 3 }, {
      preventDefault: vi.fn(),
      clientY: 100,
      pointerId: 1,
      currentTarget: { setPointerCapture },
    })
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 138 }))
    const lastCall = applyOptimisticPositions.mock.calls[applyOptimisticPositions.mock.calls.length - 1]
    expect(lastCall[0]).toBe(7)
    expect(lastCall[1].f1.y).toBe(101)
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 0 }))
    expect(await hook.flushPending()).toBe(true)
    expect(onPersisted).toHaveBeenCalledTimes(1)
  })

  it('pointer down rejects invalid targets and pointer capture failures are swallowed', () => {
    const { hook, applyOptimisticPositions } = makeHook()
    hook.onAnnotationPointerDown(null, { preventDefault: vi.fn() })
    hook.onAnnotationPointerDown({ key: 'f1' }, { preventDefault: vi.fn() })
    hook.onAnnotationPointerDown({ key: 'f1', formId: 1 }, { preventDefault: vi.fn() })
    expect(applyOptimisticPositions).not.toHaveBeenCalled()
    const throwingCapture = {
      preventDefault: vi.fn(),
      clientY: 0,
      pointerId: 1,
      currentTarget: { setPointerCapture: () => { throw new Error('no capture') } },
    }
    hook.onAnnotationPointerDown({ key: 'f1', formId: 1, projectId: 1 }, throwingCapture)
    expect(throwingCapture.preventDefault).toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerup'))
    hook.cancelActiveDrag()
  })

  it('cancelActiveDrag reverts to the drag-start positions', () => {
    const { hook, applyOptimisticPositions } = makeHook()
    expect(hook.cancelActiveDrag()).toBe(false)
    hook.onAnnotationPointerDown({ key: 'f1', formId: 7, projectId: 3 }, {
      preventDefault: vi.fn(),
      clientY: 100,
      pointerId: null,
      currentTarget: null,
    })
    expect(hook.cancelActiveDrag()).toBe(true)
    const revert = applyOptimisticPositions.mock.calls[applyOptimisticPositions.mock.calls.length - 1]
    expect(revert).toEqual([7, {}])
    expect(hook.cancelActiveDrag()).toBe(false)
  })

  it('dispose cancels an active drag and flushes pending snapshots with the persisted merge skipped for superseded keys', async () => {
    const patch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 0)))
      .mockResolvedValue({ id: 6 })
    const { hook, onPersisted, applyOptimisticPositions } = makeHook({ apiClient: { patch } })
    hook.queueAnnotationPosition({ formId: 8, projectId: 1, key: 'f1', deltaY01cm: 5 })
    hook.queueAnnotationPosition({ formId: 8, projectId: 1, key: 'f1', deltaY01cm: 7 })
    expect(applyOptimisticPositions).toHaveBeenLastCalledWith(8, { f1: { y: 7 } })
    expect(await hook.dispose()).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch.mock.calls[0][1].annotation_positions).toEqual({ f1: { y: 7 } })
    expect(onPersisted).toHaveBeenCalledTimes(1)
    expect(await hook.flushPending()).toBe(true)
    expect(onPersisted).toHaveBeenCalledTimes(1)
  })

  it('cancelActiveDrag can skip the revert', () => {
    const { hook, applyOptimisticPositions } = makeHook()
    hook.onAnnotationPointerDown({ key: 'f1', formId: 7, projectId: 3 }, {
      preventDefault: vi.fn(),
      clientY: 0,
      pointerId: null,
      currentTarget: null,
    })
    expect(hook.cancelActiveDrag({ revert: false })).toBe(true)
    const callsAfter = applyOptimisticPositions.mock.calls.length
    expect(callsAfter).toBe(0)
  })
})
