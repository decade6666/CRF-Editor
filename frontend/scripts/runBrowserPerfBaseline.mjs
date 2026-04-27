import { spawn } from 'node:child_process'
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(currentDir, '..')
const changeName = 'research-performance-constraints'
const activeBaselineDir = path.resolve(frontendRoot, `../openspec/changes/${changeName}/baselines`)
const archiveRoot = path.resolve(frontendRoot, '../openspec/changes/archive')

async function resolveBaselineDir() {
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

async function resolveChromiumPath() {
  for (const candidate of chromiumCandidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return null
}

async function writeBlockedResult(mode, reason) {
  const outputFiles = await getOutputFiles()
  const rows = SCENARIOS.map((scenario, index) => ({
    run_id: `${scenario}-${mode}-blocked-${index + 1}`,
    timestamp_utc: new Date().toISOString(),
    fixture_id: 'heavy-1600-seed-20260425',
    fixture_schema_version: 1,
    mode,
    scenario,
    iteration: 1,
    is_warmup: false,
    status: 'blocked',
    reason,
    metrics: {
      browser: null,
      cpu_slowdown: 6,
      network_profile: 'Fast 4G',
      interaction_duration_ms: null,
      network_count: null,
      component_mount_count: null,
      chunk_load_count: null,
      preview_update_ms: null,
    },
  }))
  await writeFile(outputFiles[mode], rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

async function main() {
  const args = new Map()
  for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i], process.argv[i + 1])
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

  const child = spawn(chromiumPath, ['--version'])
  let versionOutput = ''
  child.stdout.on('data', chunk => { versionOutput += chunk.toString('utf8') })
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`chromium exited with ${code}`)))
  })

  const rows = SCENARIOS.flatMap(scenario => Array.from({ length: 6 }, (_, index) => ({
    run_id: `${scenario}-${mode}-${index + 1}`,
    timestamp_utc: new Date().toISOString(),
    fixture_id: 'heavy-1600-seed-20260425',
    fixture_schema_version: 1,
    mode,
    scenario,
    iteration: index + 1,
    is_warmup: index === 0,
    status: 'placeholder',
    metrics: {
      browser: versionOutput.trim(),
      cpu_slowdown: 6,
      network_profile: 'Fast 4G',
      interaction_duration_ms: null,
      network_count: null,
      component_mount_count: null,
      chunk_load_count: null,
      preview_update_ms: null,
    },
  })))

  await writeFile(outputFiles[mode], rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
  console.log(outputFiles[mode])
}

await main()
