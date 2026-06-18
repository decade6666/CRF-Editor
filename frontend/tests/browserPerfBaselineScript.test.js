import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.resolve(currentDir, '../scripts/runBrowserPerfBaseline.mjs')
const expectedScenarios = [
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

async function runNode(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: path.resolve(currentDir, '..'),
    env: { ...process.env, ...env },
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
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

test('browser baseline writes one blocked row per scenario when Chromium is missing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'browser-perf-baseline-'))
  const baselineDir = path.join(tempRoot, 'baselines')
  const result = await runNode([scriptPath, '--fixture', 'heavy-1600', '--mode', 'cold'], {
    CRF_PERF_BASELINE_DIR: baselineDir,
    PATH: '/nonexistent',
  })

  assert.equal(result.code, 0, result.stderr)
  const outputPath = result.stdout
  const rows = (await readFile(outputPath, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))

  assert.equal(rows.length, expectedScenarios.length)
  assert.deepEqual(rows.map(row => row.scenario), expectedScenarios)
  assert.ok(rows.every(row => row.status === 'blocked'))
  assert.ok(rows.every(row => row.reason === 'missing-chromium-120-plus'))
  assert.ok(rows.every(row => row.is_warmup === false))
  assert.ok(rows.every(row => row.iteration === 1))
})

test('browser baseline validates measured rows and rejects placeholder statuses', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'browser-perf-validate-'))
  const measuredRows = expectedScenarios.flatMap(scenario =>
    Array.from({ length: 5 }, (_, index) => ({
      run_id: `${scenario}-warm-${index + 1}`,
      timestamp_utc: new Date('2026-04-26T00:00:00.000Z').toISOString(),
      fixture_id: 'heavy-1600-seed-20260425',
      fixture_schema_version: 1,
      mode: 'warm',
      scenario,
      iteration: index + 2,
      is_warmup: false,
      status: 'ok',
      metrics: {
        browser: 'Chromium 123.0.0.0',
        cpu_slowdown: 6,
        network_profile: 'Fast 4G',
        interaction_duration_ms: 12 + index,
        network_count: 1,
        component_mount_count: 1,
        chunk_load_count: 1,
        preview_update_ms: 4,
      },
    }))
  )

  const measuredPath = path.join(tempRoot, 'measured.json')
  await writeFile(measuredPath, JSON.stringify(measuredRows), 'utf8')

  const success = await runNode([scriptPath, '--self-check-measured', measuredPath], {})
  assert.equal(success.code, 0, success.stderr)

  const placeholderRows = structuredClone(measuredRows)
  placeholderRows[0].status = 'placeholder'
  const placeholderPath = path.join(tempRoot, 'placeholder.json')
  await writeFile(placeholderPath, JSON.stringify(placeholderRows), 'utf8')

  const failure = await runNode([scriptPath, '--self-check-measured', placeholderPath], {})
  assert.notEqual(failure.code, 0)
  assert.match(failure.stderr || failure.stdout, /placeholder/i)
})
