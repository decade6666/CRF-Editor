import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from '../src/composables/useApi.js'

// Node 环境无 localStorage 时提供最小桩，避免 _getAuthHeaders 抛错
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installFetchStub(handler) {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls += 1
    return handler(url, options, calls)
  }
  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

test('in-flight cachedGet invalidated before resolve does not re-seed the 30s TTL cache', async () => {
  let releaseFirst
  const first = new Promise((r) => {
    releaseFirst = r
  })
  const stub = installFetchStub((_url, _options, calls) => {
    if (calls === 1) return first.then(() => jsonResponse({ stale: true }))
    return Promise.resolve(jsonResponse({ fresh: true }))
  })
  try {
    const p1 = api.cachedGet('/api/test/generation')
    // 并发去重：第二次调用复用同一在途请求
    const p2 = api.cachedGet('/api/test/generation')
    assert.equal(stub.calls(), 1)

    // 写操作在请求返回前失效缓存
    api.invalidateCache('/api/test/generation')
    releaseFirst(jsonResponse({ stale: true }))

    // 调用方仍拿到本次响应的数据
    const data1 = await p1
    const data2 = await p2
    assert.deepEqual(data1, { stale: true })
    assert.equal(data2, data1)

    // 但缓存未被写回：下一次 cachedGet 必须重新请求
    const data3 = await api.cachedGet('/api/test/generation')
    assert.equal(stub.calls(), 2)
    assert.deepEqual(data3, { fresh: true })
  } finally {
    stub.restore()
  }
})

test('clearAllCache also blocks in-flight cachedGet write-back', async () => {
  let releaseFirst
  const first = new Promise((r) => {
    releaseFirst = r
  })
  const stub = installFetchStub((_url, _options, calls) => {
    if (calls === 1) return first.then(() => jsonResponse({ stale: true }))
    return Promise.resolve(jsonResponse({ fresh: true }))
  })
  try {
    const p1 = api.cachedGet('/api/test/clear-generation')
    api.clearAllCache()
    releaseFirst(jsonResponse({ stale: true }))
    assert.deepEqual(await p1, { stale: true })
    const data = await api.cachedGet('/api/test/clear-generation')
    assert.equal(stub.calls(), 2)
    assert.deepEqual(data, { fresh: true })
  } finally {
    stub.restore()
  }
})

test('cachedGet without intervening invalidation still serves from cache', async () => {
  const stub = installFetchStub(() => Promise.resolve(jsonResponse({ value: 1 })))
  try {
    const first = await api.cachedGet('/api/test/ttl-hit')
    assert.equal(stub.calls(), 1)
    const second = await api.cachedGet('/api/test/ttl-hit')
    assert.equal(stub.calls(), 1)
    assert.deepEqual(second, first)
  } finally {
    stub.restore()
  }
})

test('write operations invalidate so the next read refetches instead of reusing stale cache', async () => {
  let serve = { value: 'old' }
  const stub = installFetchStub(async (url, options) => {
    if (options?.method === 'POST') return jsonResponse({ ok: true })
    return jsonResponse(serve)
  })
  try {
    const before = await api.cachedGet('/api/test/write-invalidate')
    assert.deepEqual(before, { value: 'old' })
    serve = { value: 'new' }
    // 写操作触发 _autoInvalidate → invalidateCache('/api/test') + invalidateCache(完整 URL)
    await api.post('/api/test/write-invalidate', {})
    const after = await api.cachedGet('/api/test/write-invalidate')
    assert.deepEqual(after, { value: 'new' })
  } finally {
    stub.restore()
  }
})

// 访视元数据 PUT 的缓存控制（10-15-visit-flow-refresh）：项目级 PUT 的 _autoInvalidate 本就
// 会同时失效 visits 与 visit-form-matrix 两条缓存 —— 缺的是跨实例刷新通知，不是缓存失效。
// 本控制用真实 cachedGet/put、仅 stub fetch，在同 TTL 内证明两条 GET 都会重新发起请求。
test('project visit PUT evicts visits and matrix entries so both refetch within the same TTL', async () => {
  api.clearAllCache()
  const serverVisit = { id: 5, name: '访视一', code: 'V1', sequence: 1 }
  let getCalls = 0
  const stub = installFetchStub(async (url, options = {}) => {
    const method = options.method || 'GET'
    if (method === 'GET' && url === '/api/projects/77/visits') {
      getCalls += 1
      return jsonResponse([{ ...serverVisit }])
    }
    if (method === 'GET' && url === '/api/projects/77/visit-form-matrix') {
      getCalls += 1
      return jsonResponse({ visits: [{ ...serverVisit }], forms: [], matrix: { 5: {} } })
    }
    if (method === 'PUT' && url === '/api/projects/77/visits/5') {
      const body = JSON.parse(options.body)
      serverVisit.name = body.name
      serverVisit.code = body.code
      return jsonResponse({ ok: true })
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  })
  try {
    // 预热两条缓存（不推进时间，保持在同一 30s TTL 窗口内）
    await api.cachedGet('/api/projects/77/visits')
    await api.cachedGet('/api/projects/77/visit-form-matrix')
    assert.equal(getCalls, 2)

    await api.put('/api/projects/77/visits/5', { name: '随访晚期', code: 'V9' })

    const visits = await api.cachedGet('/api/projects/77/visits')
    assert.equal(getCalls, 3, 'visits 列表应在同 TTL 内重新发起 GET')
    assert.equal(visits[0].name, '随访晚期')

    const matrix = await api.cachedGet('/api/projects/77/visit-form-matrix')
    assert.equal(getCalls, 4, '矩阵应在同 TTL 内重新发起 GET')
    assert.equal(matrix.visits[0].name, '随访晚期')
    assert.equal(matrix.visits[0].code, 'V9')
  } finally {
    stub.restore()
    api.clearAllCache()
  }
})
