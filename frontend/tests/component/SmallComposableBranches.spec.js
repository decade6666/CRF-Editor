import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useVisitPreviewAnnotation } from '../../src/composables/useVisitPreviewAnnotation'
import {
  createSessionWarningGuard,
  decodeJwtPayload,
  getTokenRemainingSeconds,
  useSessionTimer,
  TOKEN_STORAGE_KEY,
} from '../../src/composables/useSessionTimer'

function makeAnnotation({ projectId = 3, formId = 7, form = { id: 7, domain: '心电', annotation_positions: { f1: { y: 4 } } }, enabled = true, patch = vi.fn().mockResolvedValue({ id: 7 }) } = {}) {
  const formState = ref(form)
  const onError = vi.fn()
  const hook = useVisitPreviewAnnotation({
    apiClient: { patch },
    projectId: ref(projectId),
    formId: ref(formId),
    formState,
    isEnabled: () => enabled,
    onError,
  })
  return { hook, formState, onError, patch }
}

describe('useVisitPreviewAnnotation', () => {
  it('builds field targets only for non-label fields with names and ids', () => {
    const { hook } = makeAnnotation()
    expect(hook.getFieldAnnotationTarget({ field_definition: { field_type: '标签', variable_name: 'X' } })).toBeNull()
    expect(hook.getFieldAnnotationTarget({ field_definition: { field_type: '文本', variable_name: '  ' } })).toBeNull()
    expect(hook.getFieldAnnotationTarget({ field_definition: { field_type: '文本' } })).toBeNull()
    expect(hook.getFieldAnnotationTarget({ field_definition: { field_type: '文本', variable_name: ' F1 ' } }))
      .toEqual({ formId: 7, projectId: 3, key: 'F1' })
    const noForm = makeAnnotation({ formId: null })
    expect(noForm.hook.getFieldAnnotationTarget({ field_definition: { variable_name: 'F1' } })).toBeNull()
  })

  it('builds the form domain target and gates dragging on enablement', () => {
    const { hook } = makeAnnotation()
    expect(hook.getFormAnnotationTarget({ domain: '  ', id: 7 })).toBeNull()
    expect(hook.getFormAnnotationTarget({ domain: '肺', id: null })).toBeNull()
    expect(hook.getFormAnnotationTarget({ domain: '肺', id: 9 }))
      .toEqual({ formId: 9, projectId: 3, key: '_form' })
    expect(hook.isAnnotationDraggable({ formId: 7, key: 'f1' })).toBe(true)
    const disabled = makeAnnotation({ enabled: false })
    expect(disabled.hook.isAnnotationDraggable({ formId: 7, key: 'f1' })).toBe(false)
    expect(hook.isAnnotationDraggable({ key: 'f1' })).toBe(false)
    expect(hook.isAnnotationDraggable({ formId: 7 })).toBe(false)
  })

  it('reads and applies optimistic positions only for the matching form', () => {
    const { hook, formState } = makeAnnotation()
    expect(hook.getFormAnnotationPositions(7)).toEqual({ f1: { y: 4 } })
    expect(hook.getFormAnnotationPositions(8)).toEqual({})
    hook.applyFormAnnotationPositions(8, { f1: { y: 9 } })
    expect(formState.value.annotation_positions).toEqual({ f1: { y: 4 } })
    hook.applyFormAnnotationPositions(7, { f1: { y: 9 } })
    expect(formState.value.annotation_positions).toEqual({ f1: { y: 9 } })
    hook.applyFormAnnotationPositions(7, {})
    expect(formState.value.annotation_positions).toBeNull()
    expect(hook.hasAnnotationOverrideForTarget({ key: 'f1', formId: 7 })).toBe(false)
    hook.applyFormAnnotationPositions(7, { f1: { y: 2 } })
    expect(hook.hasAnnotationOverrideForTarget({ key: 'f1', formId: 7 })).toBe(true)
    expect(hook.hasAnnotationOverrideForTarget({ key: 'nope', formId: 7 })).toBe(false)
  })

  it('exposes the shared annotation style with the current delta', () => {
    const { hook } = makeAnnotation()
    const style = hook.getAnnotationStyle('心电', 'form', { formId: 7, key: '_form' })
    expect(style['--acrf-annotation-background']).toContain('rgba(255, 242, 242')
    expect(String(style['--acrf-annotation-top'])).toMatch(/cm$/)
  })

  it('gates pointer down, forwards resets and persists merged responses', async () => {
    const { hook, formState, onError, patch } = makeAnnotation()
    const blocked = makeAnnotation({ enabled: false })
    blocked.hook.onAnnotationPointerDown({ formId: 7, projectId: 3, key: 'f1' }, { preventDefault: vi.fn() })
    expect(blocked.patch).not.toHaveBeenCalled()
    hook.onAnnotationPointerDown({ formId: 7, projectId: 3, key: 'f1' }, {
      preventDefault: vi.fn(), clientY: 0, pointerId: null, currentTarget: null,
    })
    window.dispatchEvent(new Event('pointerup'))
    await hook.flushAnnotationPositionSave()
    hook.resetAnnotationPosition(null)
    hook.resetAnnotationPosition({ key: 'f1', formId: 7, projectId: 3, deltaY01cm: 0 })
    expect(await hook.flushAnnotationPositionSave()).toBe(true)
    hook.dispose()
    expect(onError).not.toHaveBeenCalled()
    expect(formState.value.id).toBe(7)
  })

  it('merges persisted forms only when the id still matches', () => {
    const { hook, formState } = makeAnnotation()
    const viaDrag = hook
    expect(viaDrag.getFormAnnotationPositions()).toEqual({ f1: { y: 4 } })
    hook.applyFormAnnotationPositions(7, null)
    expect(formState.value.annotation_positions).toBeNull()
  })
})

describe('session timer helpers', () => {
  const NOW = 1_000_000_000_000
  const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

  it('decodeJwtPayload and getTokenRemainingSeconds parse tokens defensively', () => {
    expect(decodeJwtPayload(null)).toBeNull()
    expect(decodeJwtPayload('garbage')).toBeNull()
    expect(decodeJwtPayload('h.%%%broken.s')).toBeNull()
    expect(decodeJwtPayload(jwt({ exp: 1000 }))).toEqual({ exp: 1000 })
    expect(getTokenRemainingSeconds(null, NOW)).toBeNull()
    expect(getTokenRemainingSeconds(jwt({ x: 1 }), NOW)).toBeNull()
    expect(getTokenRemainingSeconds(jwt({ exp: NOW / 1000 + 90 }), NOW)).toBe(90)
  })

  it('createSessionWarningGuard warns once per window and resets above the threshold', () => {
    const guard = createSessionWarningGuard(300)
    expect(guard(400)).toBe(false)
    expect(guard(200)).toBe(true)
    expect(guard(150)).toBe(false)
    expect(guard(400)).toBe(false)
    expect(guard(250)).toBe(true)
    expect(guard(0)).toBe(false)
    expect(guard(-5)).toBe(false)
  })

  function makeTimer({ token, now = NOW, apiGet = vi.fn().mockResolvedValue({}) } = {}) {
    const storage = { getItem: vi.fn(() => token) }
    const message = { warning: vi.fn(), success: vi.fn(), error: vi.fn() }
    const intervalIds = []
    const hook = useSessionTimer({
      apiGet,
      now: () => now,
      message,
      tokenStorage: storage,
      setIntervalFn: vi.fn((fn) => { intervalIds.push(fn); return intervalIds.length }),
      clearIntervalFn: vi.fn(),
    })
    return { hook, message, storage, intervalIds }
  }

  it('computes display text and status from the token expiry', () => {
    const soon = makeTimer({ token: jwt({ exp: NOW / 1000 + 100 }) })
    expect(soon.hook.displayText.value).toBe('100(s)')
    expect(soon.hook.status.value).toBe('warning')
    expect(soon.message.warning).toHaveBeenCalledTimes(1)
    soon.hook.recalculateRemainingTime()
    expect(soon.message.warning).toHaveBeenCalledTimes(1)
    soon.hook.recalculateRemainingTime({ notify: true })
    expect(soon.message.warning).toHaveBeenCalledTimes(1)

    const expired = makeTimer({ token: jwt({ exp: NOW / 1000 - 5 }) })
    expect(expired.hook.displayText.value).toBe('已过期')
    expect(expired.hook.status.value).toBe('danger')

    const healthy = makeTimer({ token: jwt({ exp: NOW / 1000 + 3600 }) })
    expect(healthy.hook.status.value).toBe('normal')
    expect(healthy.message.warning).not.toHaveBeenCalled()

    const noToken = makeTimer({})
    expect(noToken.hook.displayText.value).toBe('')
    expect(noToken.hook.status.value).toBe('normal')
    expect(TOKEN_STORAGE_KEY).toBe('crf_token')
  })

  it('refreshSession renews, stays silent on 401 and reports other errors', async () => {
    const apiGet = vi.fn().mockResolvedValue({})
    const { hook, message } = makeTimer({ token: jwt({ exp: NOW / 1000 + 100 }), apiGet })
    await hook.refreshSession()
    expect(apiGet).toHaveBeenCalledWith('/api/auth/me')
    expect(message.success).toHaveBeenCalledWith('会话已续期')

    const unauthorized = makeTimer({ token: jwt({ exp: NOW / 1000 + 100 }), apiGet: vi.fn().mockRejectedValue({ status: 401 }) })
    await unauthorized.hook.refreshSession()
    expect(unauthorized.message.error).not.toHaveBeenCalled()

    const failing = makeTimer({ token: jwt({ exp: NOW / 1000 + 100 }), apiGet: vi.fn().mockRejectedValue({ message: '网络断开' }) })
    await failing.hook.refreshSession()
    expect(failing.message.error).toHaveBeenCalledWith('网络断开')

    const opaque = makeTimer({ token: jwt({ exp: NOW / 1000 + 100 }), apiGet: vi.fn().mockRejectedValue({ status: 500 }) })
    await opaque.hook.refreshSession()
    expect(opaque.message.error).toHaveBeenCalledWith('会话续期失败，请稍后重试')
  })

  it('deduplicates concurrent refreshes and stop clears the injected interval', async () => {
    let release
    const apiGet = vi.fn().mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const storage = { getItem: vi.fn(() => jwt({ exp: NOW / 1000 + 100 })) }
    const message = { warning: vi.fn(), success: vi.fn(), error: vi.fn() }
    const clearIntervalFn = vi.fn()
    let intervalFn = null
    const hook = useSessionTimer({
      apiGet, message, tokenStorage: storage, clearIntervalFn,
      now: () => NOW,
      setIntervalFn: (fn) => { intervalFn = fn; return 42 },
    })
    const first = hook.refreshSession()
    const second = hook.refreshSession()
    release({})
    await first
    await second
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(message.success).toHaveBeenCalledTimes(1)
    expect(intervalFn).toBeTruthy()
    hook.stop()
    expect(clearIntervalFn).toHaveBeenCalledWith(42)
    hook.stop()
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    intervalFn()
    expect(hook.remainingSeconds.value).toBe(100)
  })
})
