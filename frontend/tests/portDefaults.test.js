import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const viteConfigSource = readFileSync(path.resolve(currentDir, '../vite.config.js'), 'utf8')
const readmeZhSource = readFileSync(path.resolve(currentDir, '../../README.md'), 'utf8')
const readmeEnSource = readFileSync(path.resolve(currentDir, '../../README.en.md'), 'utf8')
const apiSource = readFileSync(path.resolve(currentDir, '../src/composables/useApi.js'), 'utf8')

test('vite dev server keeps port 5173 and proxies api to backend 8888', () => {
  assert.match(viteConfigSource, /port:\s*5173/)
  assert.match(viteConfigSource, /target:\s*'http:\/\/127\.0\.0\.1:8888'/)
})

test('api composable does not hardcode localhost 8888 base urls', () => {
  assert.equal(apiSource.includes('127.0.0.1:8888'), false)
  assert.equal(apiSource.includes('localhost:8888'), false)
})

test('README.md port-related defaults are unified to 8888', () => {
  assert.match(readmeZhSource, /port:\s*8888/)
  assert.match(readmeZhSource, /http:\/\/localhost:8888/)
  assert.match(readmeZhSource, /http:\/\/localhost:8888\/docs/)
  assert.equal(readmeZhSource.includes('8000'), false)
})

test('README.en.md port-related defaults are unified to 8888', () => {
  assert.match(readmeEnSource, /port:\s*8888/)
  assert.match(readmeEnSource, /http:\/\/localhost:8888/)
  assert.match(readmeEnSource, /http:\/\/localhost:8888\/docs/)
  assert.equal(readmeEnSource.includes('8000'), false)
})
