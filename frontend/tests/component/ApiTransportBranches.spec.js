import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { makeApiUrl, getApiSessionGeneration, getAuthHeaders, apiUrl, api, genFieldVarName, genCode, truncRefs, toggleSelectAll } from '../../src/composables/useApi'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
  }
}

function textResponse(text, { status = 400, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
  }
}

function deferredFetch(responsePromise) {
  return vi.fn(() => responsePromise)
}

const TOKEN = 'tok-main'

describe('makeApiUrl deployment prefix', () => {
  it('root or relative bases stay identity functions', () => {
    expect(makeApiUrl('/')('/api/x')).toBe('/api/x')
    expect(makeApiUrl('./')('/api/x')).toBe('/api/x')
    expect(makeApiUrl('')('/api/x')).toBe('/api/x')
  })

  it('a root-prefixed base wraps same-origin API paths only', () => {
    const apiUrlCrf = makeApiUrl('/crf/')
    expect(apiUrlCrf('/api/x')).toBe('/crf/api/x')
    expect(apiUrlCrf('/crf/api/x')).toBe('/crf/api/x')
    expect(apiUrlCrf('/crf')).toBe('/crf')
    expect(apiUrlCrf('https://host/api')).toBe('https://host/api')
    expect(apiUrlCrf('//host/api')).toBe('//host/api')
    expect(apiUrlCrf('relative/path')).toBe('relative/path')
    expect(apiUrlCrf(123)).toBe(123)
    expect(makeApiUrl('/crf')('/a')).toBe('/crf/a')
  })

  it('the module-level apiUrl is identity without a base path', () => {
    expect(apiUrl('/api/projects')).toBe('/api/projects')
  })
})

describe('auth headers and session generation', () => {
  beforeEach(() => {
    localStorage.clear()
    api.clearAllCache()
  })

  it('getAuthHeaders carries the Bearer token only when present', () => {
    expect(getAuthHeaders()).toEqual({})
    localStorage.setItem('crf_token', TOKEN)
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('getApiSessionGeneration bumps only when the token changes', () => {
    localStorage.setItem('crf_token', TOKEN)
    const first = getApiSessionGeneration()
    expect(getApiSessionGeneration()).toBe(first)
    localStorage.setItem('crf_token', 'tok-next')
    const second = getApiSessionGeneration()
    expect(second).toBe(first + 1)
    expect(getApiSessionGeneration()).toBe(second)
  })
})

describe('api transport over a mocked fetch', () => {
  let fetchMock

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('crf_token', TOKEN)
    api.clearAllCache()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('api.get sends auth headers and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }))
    await expect(api.get('/api/projects/1')).resolves.toEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/projects/1')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('a 401 in the current session removes the token and dispatches auth-expired', async () => {
    const expired = vi.fn()
    window.addEventListener('crf:auth-expired', expired)
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 401 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('crf_token')).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener('crf:auth-expired', expired)
  })

  it('a 401 from a stale session neither clears the new token nor dispatches', async () => {
    let resolveFetch
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const pending = api.get('/api/x')
    localStorage.setItem('crf_token', 'tok-switched')
    resolveFetch(jsonResponse({}, { status: 401 }))
    await expect(pending).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('crf_token')).toBe('tok-switched')
  })

  it('parses JSON error payloads, plain-text fallbacks and the 429 default message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: '缺少字段', code: 'FIELD_404' }, { status: 400 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 400, code: 'FIELD_404', message: '缺少字段' })
    fetchMock.mockResolvedValue(textResponse('<html>boom</html>', { status: 500 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ status: 500 })
    fetchMock.mockResolvedValue(textResponse('rate limited', { status: 429 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ message: 'rate limited' })
    fetchMock.mockResolvedValue(textResponse('', { status: 429 }))
    await expect(api.get('/api/x')).rejects.toMatchObject({ message: '操作过于频繁，请稍后重试' })
  })

  it('rejects non-JSON 2xx bodies with the safe-parse error', async () => {
    fetchMock.mockResolvedValue(textResponse('<gateway>', { status: 200 }))
    await expect(api.get('/api/x')).rejects.toThrow('服务器返回非 JSON 格式')
  })

  it('stores a refreshed token from the response header in the same session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }, { headers: { 'x-refreshed-token': 'tok-new' } }))
    await api.get('/api/x')
    expect(localStorage.getItem('crf_token')).toBe('tok-new')
    expect(getAuthHeaders().Authorization).toBe('Bearer tok-new')
  })

  it('cachedGet serves the TTL cache and dedups concurrent requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ n: 1 }, { headers: { 'X-CRF-Design-Revision': 'r1' } }))
    const first = await api.cachedGet('/api/list')
    const second = await api.cachedGet('/api/list')
    expect(first).toEqual({ n: 1 })
    expect(second).toEqual({ n: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    let resolveA
    fetchMock.mockClear()
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveA = resolve }))
    const a = api.cachedGet('/api/other')
    const b = api.cachedGet('/api/other')
    resolveA(jsonResponse({ n: 2 }))
    expect(await a).toEqual({ n: 2 })
    expect(await b).toEqual({ n: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidation while a cachedGet is in flight keeps the stale body out of the cache', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stale: true }))
    let resolveFetch
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const pending = api.cachedGet('/api/slow')
    api.invalidateCache('/api/slow')
    resolveFetch(jsonResponse({ stale: true }))
    expect(await pending).toEqual({ stale: true })
    fetchMock.mockResolvedValue(jsonResponse({ fresh: true }))
    expect(await api.cachedGet('/api/slow')).toEqual({ fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('metadata getters expose the revision tag and 428 guards missing revisions', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ body: 1 }, { headers: { 'X-CRF-Design-Revision': 'r7' } }))
    expect(await api.getWithMetadata('/api/m')).toEqual({ data: { body: 1 }, revision: 'r7' })
    expect(await api.cachedGetWithMetadata('/api/m')).toEqual({ data: { body: 1 }, revision: 'r7' })
    await expect(api.putWithMetadata('/api/w', { x: 1 })).rejects.toMatchObject({ status: 428, code: 'PRECONDITION_REQUIRED' })
    await expect(api.postWithMetadata('/api/w', {})).rejects.toMatchObject({ status: 428 })
    await expect(api.patchWithMetadata('/api/w', {})).rejects.toMatchObject({ status: 428 })
    await expect(api.delWithMetadata('/api/w')).rejects.toMatchObject({ status: 428 })
    // getWithMetadata 走实时读取；cachedGetWithMetadata 未命中再读一次；428 守卫不发请求
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('metadata mutations send If-Match, auto-invalidate caches and require the revision header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }, { headers: { 'X-CRF-Design-Revision': 'r2' } }))
    await api.cachedGet('/api/projects/9/forms')
    expect(await api.putWithMetadata('/api/projects/9/forms/3', { name: 'n' }, { revision: 'r1' }))
      .toEqual({ data: { ok: 1 }, revision: 'r2' })
    const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(init.headers['If-Match']).toBe('r1')
    fetchMock.mockResolvedValue(jsonResponse({ ok: 2 }))
    await expect(api.postWithMetadata('/api/projects/9/units', {}, { revision: 'r2' }))
      .rejects.toMatchObject({ code: 'REVISION_UNAVAILABLE', committed: true })
  })

  it('postWithTransitionMetadata returns header tags verbatim and tolerates their absence', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 5 }, {
      headers: { 'X-CRF-Design-Before-Revision': 'r1', 'X-CRF-Design-Revision': 'r2' },
    }))
    expect(await api.postWithTransitionMetadata('/api/projects/1/units', { name: 'u' }))
      .toEqual({ data: { id: 5 }, beforeRevision: 'r1', revision: 'r2' })
    fetchMock.mockResolvedValue(jsonResponse({ id: 6 }))
    expect(await api.postWithTransitionMetadata('/api/projects/1/codelists', {}))
      .toEqual({ data: { id: 6 }, beforeRevision: null, revision: null })
  })

  it('mutations auto-invalidate the project prefix and patch honours extra invalidate prefixes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }, { headers: { 'X-CRF-Design-Revision': 'rx' } }))
    await api.cachedGet('/api/projects/1/units')
    await api.cachedGet('/api/projects/2/units')
    await api.post('/api/projects/1/units', { name: 'u' })
    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ v: 1 }))
    await api.cachedGet('/api/projects/1/units')
    await api.cachedGet('/api/projects/2/units')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }, { headers: { 'X-CRF-Design-Revision': 'ry' } }))
    await api.patch('/api/form-fields/5', { x: 1 }, { invalidate: ['/api/forms/7'] })
    await api.cachedGet('/api/forms/7/fields')
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/forms/7'))).toHaveLength(1)
  })

  it('del without metadata returns undefined and still auto-invalidates', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ v: 1 }))
    await api.cachedGet('/api/projects/3/forms')
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 204 }))
    expect(await api.del('/api/projects/3/forms/8')).toBeUndefined()
    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ v: 2 }))
    await api.cachedGet('/api/projects/3/forms')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 204, headers: { 'X-CRF-Design-Revision': 'rz' } }))
    expect(await api.delWithMetadata('/api/projects/3/forms/8', { revision: 'ry' }))
      .toEqual({ data: null, revision: 'rz' })
  })
})

describe('naming and selection helpers', () => {
  it('genFieldVarName and genCode embed the prefix and timestamp shape', () => {
    expect(genFieldVarName()).toMatch(/^FIELD_\d{14}_[A-Z0-9]{6}$/)
    expect(genCode('CL')).toMatch(/^CL_\d{14}_[A-Z0-9]{6}$/)
  })

  it('truncRefs keeps short lists and summarizes long ones', () => {
    expect(truncRefs(['a', 'b'])).toBe('a\nb')
    expect(truncRefs(['1', '2', '3', '4', '5', '6'])).toBe('1\n2\n3\n4\n5\n...等共6条')
    expect(truncRefs(['a', 'b', 'c'], 2, '|')).toBe('a|b|...等共3条')
  })

  it('toggleSelectAll fills, clears and handles empty lists with string-key safety', () => {
    const list = ref([{ id: 1 }, { id: 2 }])
    const selected = ref([])
    toggleSelectAll(list, selected, (i) => i.id)
    expect(selected.value).toEqual([1, 2])
    toggleSelectAll(list, selected, (i) => i.id)
    expect(selected.value).toEqual([])
    selected.value = ['1', '2']
    toggleSelectAll(list, selected, (i) => i.id)
    expect(selected.value).toEqual([])
    selected.value = ['1']
    toggleSelectAll(list, selected, (i) => i.id)
    expect(selected.value).toEqual([1, 2])
    toggleSelectAll(ref([]), selected, (i) => i.id)
    expect(selected.value).toEqual([])
  })
})
