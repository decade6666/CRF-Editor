import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canUseClipboardWriteText,
  getDownloadFilename,
  resolveDownloadLink,
  shouldResetExportDownload,
} from '../src/composables/exportDownloadState.js'

test('shouldResetExportDownload returns true when project changes', () => {
  assert.equal(shouldResetExportDownload(1, 2), true)
  assert.equal(shouldResetExportDownload(1, null), true)
})

test('shouldResetExportDownload returns false for same project', () => {
  assert.equal(shouldResetExportDownload(3, 3), false)
})

test('canUseClipboardWriteText returns true only for secure contexts with clipboard support', () => {
  assert.equal(canUseClipboardWriteText({ writeText() {} }, true), true)
  assert.equal(canUseClipboardWriteText(undefined, true), false)
  assert.equal(canUseClipboardWriteText({}, true), false)
  assert.equal(canUseClipboardWriteText({ writeText() {} }, false), false)
})

test('resolveDownloadLink converts relative paths to absolute urls', () => {
  assert.equal(
    resolveDownloadLink('/api/export/download/token123', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/export/download/token123',
  )
})

test('resolveDownloadLink keeps absolute urls unchanged', () => {
  assert.equal(
    resolveDownloadLink('https://example.com/api/export/download/token123', 'http://127.0.0.1:8000'),
    'https://example.com/api/export/download/token123',
  )
})

test('getDownloadFilename falls back when header missing', () => {
  assert.equal(getDownloadFilename(null, 'fallback.docx'), 'fallback.docx')
})

test('getDownloadFilename extracts utf-8 filename from content-disposition', () => {
  const disposition = "attachment; filename*=UTF-8''%E5%AF%BC%E5%87%BA%E9%A1%B9%E7%9B%AE_CRF.docx"
  assert.equal(getDownloadFilename(disposition, 'fallback.docx'), '导出项目_CRF.docx')
})
