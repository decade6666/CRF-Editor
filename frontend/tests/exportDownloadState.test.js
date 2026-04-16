import test from 'node:test'
import assert from 'node:assert/strict'

import { getDownloadFilename } from '../src/composables/exportDownloadState.js'

test('getDownloadFilename falls back when header missing', () => {
  assert.equal(getDownloadFilename(null, 'fallback.docx'), 'fallback.docx')
})

test('getDownloadFilename extracts utf-8 filename from content-disposition', () => {
  const disposition = "attachment; filename*=UTF-8''%E5%AF%BC%E5%87%BA%E9%A1%B9%E7%9B%AE_CRF.docx"
  assert.equal(getDownloadFilename(disposition, 'fallback.docx'), '导出项目_CRF.docx')
})
