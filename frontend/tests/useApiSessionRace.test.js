import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from '../src/composables/useApi.js'

// 跨栈契约 §3 第 4、5 条：响应只允许影响「发起时那个会话」。
// 请求在途中若发生登出 / 换用户 / 他标签页登录，迟到的响应既不得写回刷新令牌，
// 也不得清除新令牌或触发 crf:auth-expired；请求本身照常返回或报错。
//
// 本文件用可控（deferred）fetch promise 精确模拟「响应到达时令牌已变」。

const METHODS = ['get', 'cachedGet', 'post', 'put', 'patch', 'del']

let urlSeq = 0
function nextUrl() {
  urlSeq += 1
  return `/api/test/session-race-${urlSeq}`
}

function callMethod(method, url) {
  switch (method) {
    case 'get':
      return api.get(url)
    case 'cachedGet':
      return api.cachedGet(url)
    case 'post':
      return api.post(url, {})
    case 'put':
      return api.put(url, {})
    case 'patch':
      return api.patch(url, {})
    case 'del':
      return api.del(url)
    default:
      throw new Error(`unknown method: ${method}`)
  }
}

function installLocalStorageStub(initial = {}) {
  const store = new Map(Object.entries(initial))
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
  }
  return {
    restore: () => {
      // 原本不存在时删掉属性，避免留下 globalThis.localStorage === undefined 的残留
      if (hadOwn) globalThis.localStorage = original
      else delete globalThis.localStorage
    },
  }
}

function installWindowStub() {
  const events = []
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'window')
  const original = globalThis.window
  globalThis.window = {
    dispatchEvent: (event) => {
      events.push(event)
      return true
    },
  }
  return {
    events,
    restore: () => {
      // 原本不存在时删掉属性，避免留下 globalThis.window === undefined 的残留
      if (hadOwn) globalThis.window = original
      else delete globalThis.window
    },
  }
}

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function installFetchStub(handler) {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = (url, options) => {
    requests.push({ url, options })
    return handler(url, options, requests.length)
  }
  return {
    requests,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function okResponse(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ detail: '未授权' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authExpiredEvents(win) {
  return win.events.filter((event) => event.type === 'crf:auth-expired')
}

test('late 401 from a superseded session keeps the newer token and shell untouched', async (t) => {
  for (const method of METHODS) {
    await t.test(method, async () => {
      const ls = installLocalStorageStub({ crf_token: 'token-A' })
      const win = installWindowStub()
      const pending = deferred()
      const stub = installFetchStub(() => pending.promise)
      try {
        const request = callMethod(method, nextUrl())
        assert.equal(stub.requests.length, 1)
        // 请求发出时用的正是捕获的令牌
        assert.equal(stub.requests[0].options.headers.Authorization, 'Bearer token-A')

        // 请求在途中：用户 A 登出、用户 B 登录（或另一标签页完成登录）
        localStorage.setItem('crf_token', 'token-B')
        pending.resolve(unauthorizedResponse())

        // 请求本身照常报错
        await assert.rejects(request, (err) => {
          assert.equal(err.status, 401)
          return true
        })
        // 但新会话不受影响
        assert.equal(localStorage.getItem('crf_token'), 'token-B')
        assert.equal(authExpiredEvents(win).length, 0)
      } finally {
        stub.restore()
        win.restore()
        ls.restore()
      }
    })
  }
})

test('late success from a superseded session does not store its refreshed token', async (t) => {
  for (const method of METHODS) {
    await t.test(method, async () => {
      const ls = installLocalStorageStub({ crf_token: 'token-A' })
      const pending = deferred()
      const stub = installFetchStub(() => pending.promise)
      try {
        const request = callMethod(method, nextUrl())
        localStorage.setItem('crf_token', 'token-B')
        pending.resolve(okResponse({ value: 'stale' }, { 'x-refreshed-token': 'token-A-refreshed' }))

        await request
        assert.equal(localStorage.getItem('crf_token'), 'token-B')
      } finally {
        stub.restore()
        ls.restore()
      }
    })
  }
})

test('late success after logout never resurrects the session', async (t) => {
  for (const method of METHODS) {
    await t.test(method, async () => {
      const ls = installLocalStorageStub({ crf_token: 'token-A' })
      const pending = deferred()
      const stub = installFetchStub(() => pending.promise)
      try {
        const request = callMethod(method, nextUrl())
        assert.equal(stub.requests[0].options.headers.Authorization, 'Bearer token-A')

        // 请求在途中用户登出（令牌被移除 → 当前值为 null）
        localStorage.removeItem('crf_token')
        pending.resolve(okResponse({ value: 'stale' }, { 'x-refreshed-token': 'token-A-refreshed' }))

        await request
        assert.equal(localStorage.getItem('crf_token'), null)
      } finally {
        stub.restore()
        ls.restore()
      }
    })
  }
})

test('late 401 after logout neither clears the token again nor re-dispatches crf:auth-expired', async (t) => {
  for (const method of METHODS) {
    await t.test(method, async () => {
      const ls = installLocalStorageStub({ crf_token: 'token-A' })
      const win = installWindowStub()
      const pending = deferred()
      const stub = installFetchStub(() => pending.promise)
      try {
        const request = callMethod(method, nextUrl())
        // 请求在途中用户登出（登出本身已触发过一次登出流程）
        localStorage.removeItem('crf_token')
        pending.resolve(unauthorizedResponse())

        await assert.rejects(request, (err) => {
          assert.equal(err.status, 401)
          return true
        })
        assert.equal(localStorage.getItem('crf_token'), null)
        assert.equal(authExpiredEvents(win).length, 0)
      } finally {
        stub.restore()
        win.restore()
        ls.restore()
      }
    })
  }
})

test('a request sent without a token never touches a session that appeared later', async (t) => {
  await t.test('late 401', async () => {
    const ls = installLocalStorageStub({})
    const win = installWindowStub()
    const pending = deferred()
    const stub = installFetchStub(() => pending.promise)
    try {
      const request = api.get(nextUrl())
      // 发出时未登录（捕获值为 null），随后用户登录
      assert.equal(stub.requests[0].options.headers.Authorization, undefined)
      localStorage.setItem('crf_token', 'token-B')
      pending.resolve(unauthorizedResponse())
      await assert.rejects(request, (err) => {
        assert.equal(err.status, 401)
        return true
      })
      assert.equal(localStorage.getItem('crf_token'), 'token-B')
      assert.equal(authExpiredEvents(win).length, 0)
    } finally {
      stub.restore()
      win.restore()
      ls.restore()
    }
  })

  await t.test('late refreshed token', async () => {
    const ls = installLocalStorageStub({})
    const pending = deferred()
    const stub = installFetchStub(() => pending.promise)
    try {
      const request = api.get(nextUrl())
      localStorage.setItem('crf_token', 'token-B')
      pending.resolve(okResponse({ value: 'stale' }, { 'x-refreshed-token': 'token-B-other' }))
      await request
      assert.equal(localStorage.getItem('crf_token'), 'token-B')
    } finally {
      stub.restore()
      ls.restore()
    }
  })
})

test('same-session success still stores the refreshed token', async () => {
  const ls = installLocalStorageStub({ crf_token: 'token-A' })
  const stub = installFetchStub(() =>
    Promise.resolve(okResponse({ ok: true }, { 'x-refreshed-token': 'token-A-refreshed' })),
  )
  try {
    const data = await api.get(nextUrl())
    assert.deepEqual(data, { ok: true })
    assert.equal(localStorage.getItem('crf_token'), 'token-A-refreshed')
  } finally {
    stub.restore()
    ls.restore()
  }
})

test('same-session 401 still clears the token and dispatches crf:auth-expired', async () => {
  const ls = installLocalStorageStub({ crf_token: 'token-A' })
  const win = installWindowStub()
  const stub = installFetchStub(() => Promise.resolve(unauthorizedResponse()))
  try {
    await assert.rejects(
      api.get(nextUrl()),
      (err) => err.status === 401 && err.message === '登录已过期，请重新登录',
    )
    assert.equal(localStorage.getItem('crf_token'), null)
    assert.equal(authExpiredEvents(win).length, 1)
  } finally {
    stub.restore()
    win.restore()
    ls.restore()
  }
})

test('a token-less 401 still dispatches crf:auth-expired when no session appeared', async () => {
  // 捕获值 null 与当前值 null 相等 → 行为与改动前完全一致
  const ls = installLocalStorageStub({})
  const win = installWindowStub()
  const stub = installFetchStub(() => Promise.resolve(unauthorizedResponse()))
  try {
    await assert.rejects(api.get(nextUrl()), (err) => {
      assert.equal(err.status, 401)
      return true
    })
    assert.equal(localStorage.getItem('crf_token'), null)
    assert.equal(authExpiredEvents(win).length, 1)
  } finally {
    stub.restore()
    win.restore()
    ls.restore()
  }
})
