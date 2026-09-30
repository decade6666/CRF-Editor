import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

async function loadModule() {
  return import('../src/composables/clipboardCopy.js')
}

function makeDocument({ execCommandResult = true, execCommandThrows = false } = {}) {
  const created = []
  const document = {
    created,
    execCommandCalls: [],
    body: {
      appended: [],
      removed: [],
      appendChild(el) {
        this.appended.push(el)
        el.parentNode = this
      },
      removeChild(el) {
        this.removed.push(el)
        el.parentNode = null
      },
    },
    createElement(tag) {
      const el = { tag, value: '', attrs: {}, style: {}, selected: false, parentNode: null }
      el.setAttribute = (name, val) => {
        el.attrs[name] = val
      }
      el.select = () => {
        el.selected = true
      }
      created.push(el)
      return el
    },
    execCommand(...args) {
      document.execCommandCalls.push(args)
      if (execCommandThrows) throw new Error('execCommand failed')
      return execCommandResult
    },
  }
  return document
}

function makeNavigator({ reject = false, missing = false } = {}) {
  const writeTextCalls = []
  const navigator = {
    clipboard: missing
      ? undefined
      : {
          writeText: async (text) => {
            writeTextCalls.push(text)
            if (reject) throw new Error('writeText rejected')
          },
        },
  }
  return { navigator, writeTextCalls }
}

describe('copyTextToClipboard', () => {
  test('secure context writes through navigator.clipboard without touching the DOM', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator, writeTextCalls } = makeNavigator()
    const document = makeDocument()
    const ok = await copyTextToClipboard('AGE', { navigator, document, isSecureContext: true })
    assert.equal(ok, true)
    assert.deepEqual(writeTextCalls, ['AGE'])
    assert.equal(document.created.length, 0)
    assert.equal(document.execCommandCalls.length, 0)
  })

  test('non-secure context falls back to a readonly textarea and removes it', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator, writeTextCalls } = makeNavigator()
    const document = makeDocument()
    const ok = await copyTextToClipboard('血常规', { navigator, document, isSecureContext: false })
    assert.equal(ok, true)
    assert.equal(writeTextCalls.length, 0)
    assert.equal(document.created.length, 1)
    const textarea = document.created[0]
    assert.equal(textarea.tag, 'textarea')
    assert.equal(textarea.value, '血常规')
    assert.equal(textarea.attrs.readonly, '')
    assert.equal(textarea.selected, true)
    assert.deepEqual(document.execCommandCalls, [['copy']])
    assert.deepEqual(document.body.removed, [textarea])
  })

  test('missing navigator.clipboard in a secure context falls back too', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator } = makeNavigator({ missing: true })
    const document = makeDocument()
    const ok = await copyTextToClipboard('AGE', { navigator, document, isSecureContext: true })
    assert.equal(ok, true)
    assert.equal(document.execCommandCalls.length, 1)
  })

  test('rejected writeText falls back to execCommand and reports its result', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator } = makeNavigator({ reject: true })
    const document = makeDocument({ execCommandResult: true })
    const ok = await copyTextToClipboard('AGE', { navigator, document, isSecureContext: true })
    assert.equal(ok, true)
    assert.equal(document.execCommandCalls.length, 1)
    assert.equal(document.body.removed.length, 1)
  })

  test('fallback failure returns false and still removes the textarea', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator } = makeNavigator({ missing: true })
    const document = makeDocument({ execCommandResult: false })
    const ok = await copyTextToClipboard('AGE', { navigator, document, isSecureContext: false })
    assert.equal(ok, false)
    assert.equal(document.body.removed.length, 1)
  })

  test('fallback exception returns false and still removes the textarea', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator } = makeNavigator({ missing: true })
    const document = makeDocument({ execCommandThrows: true })
    const ok = await copyTextToClipboard('AGE', { navigator, document, isSecureContext: false })
    assert.equal(ok, false)
    assert.equal(document.body.removed.length, 1)
  })

  test('empty text returns false without side effects', async () => {
    const { copyTextToClipboard } = await loadModule()
    const { navigator, writeTextCalls } = makeNavigator()
    const document = makeDocument()
    assert.equal(await copyTextToClipboard('', { navigator, document, isSecureContext: true }), false)
    assert.equal(await copyTextToClipboard(null, { navigator, document, isSecureContext: false }), false)
    assert.equal(writeTextCalls.length, 0)
    assert.equal(document.created.length, 0)
    assert.equal(document.execCommandCalls.length, 0)
  })
})
