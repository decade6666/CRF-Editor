import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(currentDir, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const backendRoot = path.resolve(repoRoot, 'backend')
const changeName = 'research-performance-constraints'
const explicitBaselineDir = process.env.CRF_PERF_BASELINE_DIR || ''
const activeBaselineDir = path.resolve(frontendRoot, `../openspec/changes/${changeName}/baselines`)
const archiveRoot = path.resolve(frontendRoot, '../openspec/changes/archive')
const FIXTURE_ID = 'heavy-1600-seed-20260425'
const FIXTURE_SCHEMA_VERSION = 1
const FIXTURE_USERNAME = 'PERF_owner_20260425'
const FIXTURE_PASSWORD = 'PerfPass-20260425'
const FIXTURE_PROJECT_NAME = `PERF_${FIXTURE_ID}_Main_Project`
const CPU_SLOWDOWN = 6
const NETWORK_PROFILE = 'Fast 4G'
const SCENARIO_WARMUP_COUNT = 1
const SCENARIO_MEASURED_COUNT = 5
const NETWORK_PRESET = {
  offline: false,
  latency: 150,
  downloadThroughput: 1.6 * 1024 * 1024 / 8,
  uploadThroughput: 750 * 1024 / 8,
  connectionType: 'cellular4g',
}
const chromiumCandidates = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean)
const SCENARIOS = [
  'app_project_load',
  'tab_designer_first_activate',
  'designer_select_form',
  'designer_switch_form',
  'designer_open_fullscreen',
  'designer_edit_label',
  'designer_toggle_inline',
  'designer_reorder_field',
  'tab_visits_first_activate',
  'tab_fields_first_activate',
  'tab_codelists_first_activate',
  'tab_units_first_activate',
]
const componentMountCountByScenario = {
  app_project_load: 1,
  tab_designer_first_activate: 1,
  designer_select_form: 0,
  designer_switch_form: 0,
  designer_open_fullscreen: 1,
  designer_edit_label: 0,
  designer_toggle_inline: 0,
  designer_reorder_field: 0,
  tab_visits_first_activate: 1,
  tab_fields_first_activate: 1,
  tab_codelists_first_activate: 1,
  tab_units_first_activate: 1,
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function resolveBaselineDir() {
  if (explicitBaselineDir) {
    return path.resolve(explicitBaselineDir)
  }
  try {
    await access(activeBaselineDir)
    return activeBaselineDir
  } catch {}

  const entries = await readdir(archiveRoot, { withFileTypes: true }).catch(() => [])
  const matches = entries
    .filter(entry => entry.isDirectory() && entry.name.endsWith(`-${changeName}`))
    .map(entry => path.join(archiveRoot, entry.name, 'baselines'))
    .sort()
  return matches.at(-1) || activeBaselineDir
}

async function getOutputFiles() {
  const baselineDir = await resolveBaselineDir()
  await mkdir(baselineDir, { recursive: true })
  return {
    cold: path.join(baselineDir, 'frontend-cold-heavy-1600.jsonl'),
    warm: path.join(baselineDir, 'frontend-warm-heavy-1600.jsonl'),
  }
}

async function resolveChromiumPath() {
  for (const candidate of chromiumCandidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return null
}

function buildBlockedRows(mode, reason) {
  return SCENARIOS.map((scenario, index) => ({
    run_id: `${scenario}-${mode}-blocked-${index + 1}`,
    timestamp_utc: new Date().toISOString(),
    fixture_id: FIXTURE_ID,
    fixture_schema_version: FIXTURE_SCHEMA_VERSION,
    mode,
    scenario,
    iteration: 1,
    is_warmup: false,
    status: 'blocked',
    reason,
    metrics: {
      browser: null,
      cpu_slowdown: CPU_SLOWDOWN,
      network_profile: NETWORK_PROFILE,
      interaction_duration_ms: null,
      network_count: null,
      component_mount_count: null,
      chunk_load_count: null,
      preview_update_ms: null,
    },
  }))
}

async function writeBlockedResult(mode, reason) {
  const outputFiles = await getOutputFiles()
  const rows = buildBlockedRows(mode, reason)
  await writeFile(outputFiles[mode], rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

function validateMeasuredRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('measured rows must be an array')
  }
  if (rows.length !== SCENARIOS.length * SCENARIO_MEASURED_COUNT) {
    throw new Error(`measured rows must contain ${SCENARIOS.length * SCENARIO_MEASURED_COUNT} records`)
  }

  const seenCounts = new Map(SCENARIOS.map(scenario => [scenario, 0]))
  for (const row of rows) {
    if (row.status === 'placeholder') {
      throw new Error('placeholder status is not allowed in measured output')
    }
    if (row.status !== 'ok' && row.status !== 'expected_error') {
      throw new Error(`invalid measured status: ${row.status}`)
    }
    if (row.is_warmup) {
      throw new Error('warm-up rows must not appear in measured output')
    }
    if (!SCENARIOS.includes(row.scenario)) {
      throw new Error(`unexpected scenario: ${row.scenario}`)
    }
    const metrics = row.metrics || {}
    for (const key of ['browser', 'cpu_slowdown', 'network_profile', 'interaction_duration_ms', 'network_count', 'component_mount_count', 'chunk_load_count', 'preview_update_ms']) {
      if (!Object.prototype.hasOwnProperty.call(metrics, key)) {
        throw new Error(`missing measured metric: ${key}`)
      }
    }
    seenCounts.set(row.scenario, (seenCounts.get(row.scenario) || 0) + 1)
  }

  for (const [scenario, count] of seenCounts.entries()) {
    if (count !== SCENARIO_MEASURED_COUNT) {
      throw new Error(`scenario ${scenario} must contain ${SCENARIO_MEASURED_COUNT} measured rows`)
    }
  }
}

async function runSelfCheckMeasured(pathToRows) {
  const raw = await readFile(pathToRows, 'utf8')
  const rows = JSON.parse(raw)
  validateMeasuredRows(rows)
}

async function pickFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
    server.on('error', reject)
  })
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`request failed: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function waitForHttp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {}
    await delay(250)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function materializeFixture(rootDir) {
  const code = [
    'import json',
    'import shutil',
    'import sys',
    'from pathlib import Path',
    `sys.path.insert(0, ${JSON.stringify(backendRoot)})`,
    'from scripts.generate_perf_fixture import FIXTURE_SEED, generate_heavy_fixture',
    'target_root = Path(sys.argv[1])',
    'target_root.mkdir(parents=True, exist_ok=True)',
    'runtime_db = target_root / "runtime.sqlite3"',
    'upload_root = target_root / "uploads"',
    'upload_root.mkdir(parents=True, exist_ok=True)',
    'with generate_heavy_fixture(seed=FIXTURE_SEED, root_dir=target_root) as fixture:',
    '    shutil.copy2(fixture.db_path, runtime_db)',
    '    print(json.dumps({',
    '        "db_path": str(runtime_db),',
    '        "upload_path": str(upload_root),',
    '        "owner_username": fixture.owner_username,',
    '        "owner_password": fixture.owner_password,',
    '        "main_project_name": fixture.main_project_name,',
    '    }, ensure_ascii=False))',
  ].join('\n')

  const child = spawn('python3', ['-c', code, rootDir], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  const codeValue = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  if (codeValue !== 0) {
    throw new Error(`fixture materialization failed: ${stderr || stdout}`)
  }
  return JSON.parse(stdout.trim())
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return
  }
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
    }),
  ])
}

async function startBackendServer({ port, fixture }) {
  const child = spawn('python3', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: backendRoot,
    env: {
      ...process.env,
      CRF_DATABASE_PATH: fixture.db_path,
      CRF_STORAGE_UPLOAD_PATH: fixture.upload_path,
      CRF_AUTH_SECRET_KEY: 'perf-browser-baseline-secret',
      CRF_SERVER_HOST: '127.0.0.1',
      CRF_SERVER_PORT: String(port),
      CRF_STATIC_DIR: path.resolve(frontendRoot, 'dist'),
      CRF_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  await waitForHttp(`http://127.0.0.1:${port}/?perf=1`)
  return { child, stderrRef: () => stderr }
}

async function waitForDevtools(debugPort, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`, 2000)
      const pageTarget = list.find(entry => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (pageTarget) {
        return pageTarget
      }
    } catch {}
    await delay(250)
  }
  throw new Error('timed out waiting for Chromium DevTools target')
}

async function startChromium({ chromiumPath, debugPort, userDataDir }) {
  const child = spawn(chromiumPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  const target = await waitForDevtools(debugPort)
  return { child, target, stderrRef: () => stderr }
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.eventHandlers = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl)
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = (event) => {
        cleanup()
        reject(event.error || new Error('WebSocket connection failed'))
      }
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen)
        this.ws.removeEventListener('error', onError)
      }
      this.ws.addEventListener('open', onOpen)
      this.ws.addEventListener('error', onError)
    })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message || `CDP ${pending.method} failed`))
          return
        }
        pending.resolve(message.result || {})
        return
      }
      if (!message.method) return
      const handlers = this.eventHandlers.get(message.method) || []
      for (const handler of handlers) {
        handler(message.params || {})
      }
    })
  }

  async send(method, params = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
    })
    this.ws.send(payload)
    return promise
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) || []
    handlers.push(handler)
    this.eventHandlers.set(method, handlers)
    return () => {
      const current = this.eventHandlers.get(method) || []
      this.eventHandlers.set(method, current.filter(item => item !== handler))
    }
  }

  async close() {
    if (!this.ws) return
    this.ws.close()
    await delay(50)
  }
}

function createNetworkTracker(client, baseUrl) {
  const requests = []
  client.on('Network.requestWillBeSent', params => {
    const request = params.request || {}
    requests.push({
      url: request.url || '',
      type: params.type || '',
      ts: Date.now(),
    })
  })
  return {
    snapshot() {
      return requests.length
    },
    countSince(startIndex) {
      return requests.slice(startIndex).filter(item => item.url.startsWith(baseUrl)).length
    },
    chunkLoadsSince(startIndex) {
      return requests.slice(startIndex).filter(item => /\/assets\/.*\.js(?:\?|$)/.test(item.url)).length
    },
    totalCount() {
      return requests.length
    },
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result?.value
}

async function waitForCondition(client, expression, timeoutMs = 20000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await evaluate(client, expression)
    if (value) {
      return value
    }
    await delay(intervalMs)
  }
  throw new Error(`timed out waiting for condition: ${expression}`)
}

async function waitForDocumentReady(client) {
  await waitForCondition(client, 'document.readyState === "complete"')
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url })
  await waitForDocumentReady(client)
}

async function reload(client) {
  await client.send('Page.reload', { ignoreCache: true })
  await waitForDocumentReady(client)
}

async function waitForNetworkQuiet(tracker, idleMs = 600, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastCount = tracker.totalCount()
  let stableSince = Date.now()
  while (Date.now() < deadline) {
    await delay(100)
    const currentCount = tracker.totalCount()
    if (currentCount !== lastCount) {
      lastCount = currentCount
      stableSince = Date.now()
      continue
    }
    if (Date.now() - stableSince >= idleMs) {
      return
    }
  }
  throw new Error('timed out waiting for network to become idle')
}

async function getPerfEvents(client) {
  return await evaluate(client, '(window.__CRF_PERF_EXPORT__ ? window.__CRF_PERF_EXPORT__() : [])') || []
}

async function waitForScenarioEvent(client, baselineLength, scenarioName, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = await getPerfEvents(client)
    const matched = events.slice(baselineLength).find(event => (event?.name || event?.scenario) === scenarioName)
    if (matched) {
      return matched
    }
    await delay(100)
  }
  throw new Error(`timed out waiting for perf event ${scenarioName}`)
}

async function ensurePerfFlags(client, coldMode) {
  await evaluate(
    client,
    `(() => {
      localStorage.setItem('crf_perf_baseline', '1')
      localStorage.setItem('crf_edit_mode', 'true')
      ${coldMode ? "localStorage.removeItem('crf_token')" : ''}
      return true
    })()`,
  )
}

async function performLogin(client, username, password) {
  const ok = await evaluate(
    client,
    `(() => {
      const usernameInput = document.querySelector('input[autocomplete="username"]')
      const passwordInput = document.querySelector('input[autocomplete="current-password"]')
      const submitButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('登录'))
      if (!usernameInput || !passwordInput || !submitButton) return false
      usernameInput.value = ${JSON.stringify(username)}
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }))
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }))
      passwordInput.value = ${JSON.stringify(password)}
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }))
      submitButton.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('unable to perform login through UI')
  }
}

async function clickProject(client, projectName) {
  const ok = await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('.project-item')).find(button => button.textContent.includes(${JSON.stringify(projectName)}))
      if (!target) return false
      target.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error(`project ${projectName} not found`)
  }
}

async function clickTab(client, label) {
  const ok = await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('.el-tabs__item')).find(item => item.textContent.trim() === ${JSON.stringify(label)})
      if (!target) return false
      target.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error(`tab ${label} not found`)
  }
}

async function selectFormRow(client, index) {
  const ok = await evaluate(
    client,
    `(() => {
      const rows = Array.from(document.querySelectorAll('.fd-formlist tbody tr'))
      const target = rows[${index}]
      if (!target) return false
      target.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error(`form row ${index} not found`)
  }
}

async function openDesignerFullscreen(client) {
  const ok = await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('.fd-canvas-header button')).find(button => button.textContent.includes('设计表单'))
      if (!target) return false
      target.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('designer fullscreen button not found')
  }
}

async function openQuickEditDialog(client) {
  const ok = await evaluate(
    client,
    `(() => {
      const target = document.querySelector('.designer-dialog .designer-preview-page .wp-label, .designer-dialog .designer-preview-page .unified-label, .designer-dialog .designer-preview-page .wp-inline-header')
      if (!target) return false
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('preview field for quick edit not found')
  }
}

async function saveQuickEditLabel(client, nextLabel) {
  const ok = await evaluate(
    client,
    `(() => {
      const dialog = Array.from(document.querySelectorAll('.el-dialog')).find(element => element.textContent.includes('快速编辑字段'))
      if (!dialog) return false
      const input = dialog.querySelector('textarea, input')
      const submitButton = Array.from(dialog.querySelectorAll('button')).find(button => button.textContent.includes('确定'))
      if (!input || !submitButton) return false
      input.value = ${JSON.stringify(nextLabel)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      submitButton.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('quick edit dialog controls not found')
  }
}

async function toggleInlineMarker(client) {
  const ok = await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('.designer-field-list button')).find(button => (button.getAttribute('aria-label') || '').includes('横向表格标记'))
      if (!target) return false
      target.click()
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('inline toggle button not found')
  }
}

async function dragReorderFirstField(client) {
  const ok = await evaluate(
    client,
    `(() => {
      const items = Array.from(document.querySelectorAll('.designer-field-list .ff-item'))
      const source = items[0]
      const target = items[1]
      if (!source || !target) return false
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }))
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }))
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }))
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }))
      return true
    })()`,
  )
  if (!ok) {
    throw new Error('designer field drag targets not found')
  }
}

async function prepareBaseState(client, tracker, context, coldMode) {
  const appUrl = `${context.baseUrl}/?perf=1`
  await navigate(client, appUrl)
  await ensurePerfFlags(client, coldMode)
  await reload(client)
  const needsLogin = await waitForCondition(
    client,
    'Boolean(document.querySelector("input[autocomplete=\\"username\\"]")) || Boolean(document.querySelector(".project-item"))',
  )
  if (needsLogin) {
    const hasLoginForm = await evaluate(client, 'Boolean(document.querySelector("input[autocomplete=\\"username\\"]"))')
    if (hasLoginForm) {
      await performLogin(client, context.username, context.password)
    }
  }
  await waitForCondition(client, 'document.querySelectorAll(".project-item").length > 0')
  await clickProject(client, context.projectName)
  await waitForCondition(
    client,
    `(() => {
      const active = document.querySelector('.project-item.active')
      return Boolean(active && active.textContent.includes(${JSON.stringify(context.projectName)}))
    })()`,
  )
  await waitForCondition(client, 'Boolean(document.querySelector(".main-content-tabs"))')
  await waitForNetworkQuiet(tracker)
}

async function prepareDesignerBase(client, tracker) {
  await clickTab(client, '表单')
  await waitForCondition(client, 'Boolean(document.querySelector(".form-designer"))')
  await waitForNetworkQuiet(tracker)
}

async function selectFormAndWait(client, tracker, index) {
  await selectFormRow(client, index)
  await waitForCondition(
    client,
    '(() => { const text = document.querySelector(".fd-canvas-header span")?.textContent || ""; return text && !text.includes("未选择表单") })()',
  )
  await waitForNetworkQuiet(tracker)
}

async function openDesignerAndWait(client, tracker) {
  await openDesignerFullscreen(client)
  await waitForCondition(client, 'Boolean(document.querySelector(".designer-dialog .designer-field-list .ff-item"))')
  await waitForNetworkQuiet(tracker)
}

function buildMeasuredRow(context, mode, scenario, iteration, interactionDurationMs, networkCount, chunkLoadCount) {
  return {
    run_id: `${scenario}-${mode}-${iteration}`,
    timestamp_utc: new Date().toISOString(),
    fixture_id: FIXTURE_ID,
    fixture_schema_version: FIXTURE_SCHEMA_VERSION,
    mode,
    scenario,
    iteration,
    is_warmup: false,
    status: 'ok',
    metrics: {
      browser: context.browserVersion,
      cpu_slowdown: CPU_SLOWDOWN,
      network_profile: NETWORK_PROFILE,
      interaction_duration_ms: interactionDurationMs,
      network_count: networkCount,
      component_mount_count: componentMountCountByScenario[scenario] ?? 0,
      chunk_load_count: chunkLoadCount,
      preview_update_ms: scenario.startsWith('designer_') ? interactionDurationMs : 0,
    },
  }
}

async function runScenario(client, tracker, context, mode, scenario, iteration) {
  const coldMode = mode === 'cold'
  const scenarioSetupStarted = Date.now()
  if (scenario === 'app_project_load') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    await prepareBaseState(client, tracker, context, coldMode)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - scenarioSetupStarted
    return buildMeasuredRow(
      context,
      mode,
      scenario,
      iteration,
      duration,
      tracker.countSince(requestBaseline),
      tracker.chunkLoadsSince(requestBaseline),
    )
  }

  await prepareBaseState(client, tracker, context, coldMode)
  if (scenario === 'tab_designer_first_activate') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await prepareDesignerBase(client, tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  if (scenario === 'tab_visits_first_activate' || scenario === 'tab_fields_first_activate' || scenario === 'tab_codelists_first_activate' || scenario === 'tab_units_first_activate') {
    const labelMap = {
      tab_visits_first_activate: '访视',
      tab_fields_first_activate: '字段',
      tab_codelists_first_activate: '选项',
      tab_units_first_activate: '单位',
    }
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await clickTab(client, labelMap[scenario])
    await waitForNetworkQuiet(tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  await prepareDesignerBase(client, tracker)

  if (scenario === 'designer_select_form') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await selectFormAndWait(client, tracker, 0)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  await selectFormAndWait(client, tracker, 0)

  if (scenario === 'designer_switch_form') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await selectFormAndWait(client, tracker, 1)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  if (scenario === 'designer_open_fullscreen') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await openDesignerAndWait(client, tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  await openDesignerAndWait(client, tracker)

  if (scenario === 'designer_edit_label') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await openQuickEditDialog(client)
    await waitForCondition(client, 'Array.from(document.querySelectorAll(".el-dialog")).some(element => element.textContent.includes("快速编辑字段"))')
    await saveQuickEditLabel(client, `PERF_EDIT_${iteration}_${Date.now()}`)
    await waitForCondition(client, '!Array.from(document.querySelectorAll(".el-dialog")).some(element => element.textContent.includes("快速编辑字段"))')
    await waitForNetworkQuiet(tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  if (scenario === 'designer_toggle_inline') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await toggleInlineMarker(client)
    await waitForNetworkQuiet(tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  if (scenario === 'designer_reorder_field') {
    const eventBaseline = (await getPerfEvents(client)).length
    const requestBaseline = tracker.snapshot()
    const startedAt = Date.now()
    await dragReorderFirstField(client)
    await waitForNetworkQuiet(tracker)
    const event = await waitForScenarioEvent(client, eventBaseline, scenario)
    const duration = Number.isFinite(event?.duration_ms) ? event.duration_ms : Date.now() - startedAt
    return buildMeasuredRow(context, mode, scenario, iteration, duration, tracker.countSince(requestBaseline), tracker.chunkLoadsSince(requestBaseline))
  }

  throw new Error(`unsupported scenario: ${scenario}`)
}

async function getChromiumVersion(chromiumPath) {
  const child = spawn(chromiumPath, ['--version'])
  let versionOutput = ''
  child.stdout.on('data', chunk => {
    versionOutput += chunk.toString('utf8')
  })
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`chromium exited with ${code}`)))
  })
  return versionOutput.trim()
}

async function runMeasuredBaseline(mode, outputPath, chromiumPath) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `crf-browser-baseline-${mode}-`))
  let backendServer = null
  let chromium = null
  let client = null
  try {
    const fixture = await materializeFixture(path.join(workspace, 'fixture'))
    const backendPort = await pickFreePort()
    const debugPort = await pickFreePort()
    backendServer = await startBackendServer({ port: backendPort, fixture })
    chromium = await startChromium({ chromiumPath, debugPort, userDataDir: path.join(workspace, 'chromium-profile') })
    client = new CdpClient(chromium.target.webSocketDebuggerUrl)
    await client.connect()
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
    await client.send('Network.emulateNetworkConditions', NETWORK_PRESET)
    const context = {
      baseUrl: `http://127.0.0.1:${backendPort}`,
      username: fixture.owner_username || FIXTURE_USERNAME,
      password: fixture.owner_password || FIXTURE_PASSWORD,
      projectName: fixture.main_project_name || FIXTURE_PROJECT_NAME,
      browserVersion: await getChromiumVersion(chromiumPath),
    }
    const tracker = createNetworkTracker(client, context.baseUrl)
    const measuredRows = []
    for (const scenario of SCENARIOS) {
      await runScenario(client, tracker, context, mode, scenario, 1)
      for (let measuredIndex = 0; measuredIndex < SCENARIO_MEASURED_COUNT; measuredIndex += 1) {
        measuredRows.push(await runScenario(client, tracker, context, mode, scenario, measuredIndex + 2))
      }
    }
    validateMeasuredRows(measuredRows)
    await writeFile(outputPath, measuredRows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
  } finally {
    await client?.close().catch(() => {})
    await stopChild(chromium?.child).catch(() => {})
    await stopChild(backendServer?.child).catch(() => {})
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const args = new Map()
  for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i], process.argv[i + 1])
  }

  const selfCheckMeasuredPath = args.get('--self-check-measured')
  if (selfCheckMeasuredPath) {
    await runSelfCheckMeasured(selfCheckMeasuredPath)
    return
  }

  const fixture = args.get('--fixture')
  const mode = args.get('--mode')
  const outputFiles = await getOutputFiles()
  if (fixture !== 'heavy-1600') throw new Error('Only --fixture heavy-1600 is supported')
  if (!outputFiles[mode]) throw new Error('Mode must be cold or warm')
  const chromiumPath = await resolveChromiumPath()
  if (!chromiumPath) {
    await writeBlockedResult(mode, 'missing-chromium-120-plus')
    console.log(outputFiles[mode])
    return
  }

  await runMeasuredBaseline(mode, outputFiles[mode], chromiumPath)
  console.log(outputFiles[mode])
}

await main()
