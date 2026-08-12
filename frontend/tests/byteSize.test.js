import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBytes } from '../src/composables/byteSize.js'

test('formatBytes formats byte values with 1024 base', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1024 * 1024), '1.0 MB')
  assert.equal(formatBytes(1024 * 1024 * 1.5), '1.5 MB')
})

test('formatBytes handles invalid input defensively', () => {
  assert.equal(formatBytes(-1), '-')
  assert.equal(formatBytes(undefined), '-')
  assert.equal(formatBytes(null), '-')
  assert.equal(formatBytes(Number.NaN), '-')
})
