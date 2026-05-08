import { createGzip } from 'node:zlib'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(currentDir, '..')
const assetsDir = path.resolve(frontendRoot, 'dist/assets')
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

function classifyAsset(fileName) {
  if (fileName.startsWith('index-') && fileName.endsWith('.js')) return 'index'
  if (fileName.startsWith('vendor-vue-')) return 'vendor-vue'
  if (fileName.startsWith('vendor-ep-')) return 'vendor-ep'
  if (fileName.startsWith('vendor-misc-')) return 'vendor-misc'
  return 'async-chunks'
}

function gzipSize(filePath) {
  return new Promise((resolve, reject) => {
    let total = 0
    const gzip = createGzip()
    gzip.on('data', chunk => { total += chunk.length })
    gzip.on('end', () => resolve(total))
    gzip.on('error', reject)
    createReadStream(filePath).on('error', reject).pipe(gzip)
  })
}

async function collectBuildMetrics() {
  const entries = await readdir(assetsDir)
  const jsBuckets = new Map()
  const cssBuckets = new Map()

  for (const entry of entries) {
    const filePath = path.join(assetsDir, entry)
    const info = await stat(filePath)
    if (!info.isFile()) continue

    const rawBytes = info.size
    const gzipBytes = await gzipSize(filePath)
    const isCss = entry.endsWith('.css')
    const bucketName = isCss ? 'total-css' : classifyAsset(entry)
    const bucketMap = isCss ? cssBuckets : jsBuckets
    const current = bucketMap.get(bucketName) || { raw_bytes: 0, gzip_bytes: 0, files: [] }
    current.raw_bytes += rawBytes
    current.gzip_bytes += gzipBytes
    current.files.push(entry)
    bucketMap.set(bucketName, current)
  }

  const allJs = [...jsBuckets.values()].reduce((sum, bucket) => ({
    raw_bytes: sum.raw_bytes + bucket.raw_bytes,
    gzip_bytes: sum.gzip_bytes + bucket.gzip_bytes,
  }), { raw_bytes: 0, gzip_bytes: 0 })
  jsBuckets.set('total-js', { ...allJs, files: [] })

  const payload = {
    generated_at_utc: new Date().toISOString(),
    buckets: {
      ...Object.fromEntries(jsBuckets.entries()),
      ...Object.fromEntries(cssBuckets.entries()),
    },
  }

  const baselineDir = await resolveBaselineDir()
  await mkdir(baselineDir, { recursive: true })
  const outputPath = path.join(baselineDir, 'frontend-build-heavy-1600.json')
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

const result = await collectBuildMetrics()
console.log(JSON.stringify(result, null, 2))
