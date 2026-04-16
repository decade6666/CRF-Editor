import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldUseLandscapePreview } from '../src/composables/visitPreviewLandscape.js'

test('returns true when an inline group has more than four fields', () => {
  const groups = [
    { type: 'normal', fields: [{ id: 1 }] },
    { type: 'inline', fields: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), true)
})

test('returns false when inline groups have at most four fields', () => {
  const groups = [
    { type: 'inline', fields: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), false)
})

test('returns false when there are no inline groups', () => {
  const groups = [
    { type: 'normal', fields: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] },
  ]

  assert.equal(shouldUseLandscapePreview(groups), false)
})

test('returns false for empty groups', () => {
  assert.equal(shouldUseLandscapePreview([]), false)
})
