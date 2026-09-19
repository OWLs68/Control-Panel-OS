// Roma OS build.
//
// One bundler for everything: esbuild reads TypeScript directly, so the OS code
// is typed without a second toolchain in the way. The bundle is IIFE, like
// NeverMind's, because the app ships as a single <script> in one HTML file and
// iOS treats that far better than a module graph over the network.
//
//   node build.js          → dist/ (the deployable PWA)
//   node build.js --tests  → .tmp/tests/ (unit tests, run by `node --test`)
import { build } from 'esbuild'
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const TESTS_ONLY = process.argv.includes('--tests')

/** Every asset the service worker should pre-cache, relative to the app root. */
function precacheList(distDir) {
  const out = []
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(dir, entry.name), rel)
      else if (!/\.map$/.test(rel)) out.push(rel)
    }
  }
  walk(distDir, '')
  return out.sort()
}

async function buildTests() {
  const dir = join(ROOT, '.tmp/tests')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const testDir = join(ROOT, 'tests/unit')
  const entries = readdirSync(testDir)
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => join(testDir, f))
  await build({
    entryPoints: entries,
    outdir: dir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    external: ['node:*'],
  })
  console.log(`✓ tests → .tmp/tests (${entries.length} files)`)
}

async function buildApp() {
  const dist = join(ROOT, 'dist')
  rmSync(dist, { recursive: true, force: true })
  mkdirSync(dist, { recursive: true })

  await build({
    entryPoints: [join(ROOT, 'src/app.ts')],
    outfile: join(dist, 'bundle.js'),
    bundle: true,
    format: 'iife',
    target: ['es2022', 'safari16'],
    minify: true,
    sourcemap: true,
    legalComments: 'none',
  })

  // Static shell + assets. Crow's images live next to the app so the service
  // worker can cache them; the originals were 2 MB each, these are ~25-33 KB.
  cpSync(join(ROOT, 'public'), dist, { recursive: true })
  cpSync(join(ROOT, 'index.html'), join(dist, 'index.html'))
  cpSync(join(ROOT, 'style.css'), join(dist, 'style.css'))
  mkdirSync(join(dist, 'assets'), { recursive: true })
  for (const img of ['crow-front.webp', 'crow-idle.webp', 'crow-talk.webp']) {
    cpSync(join(ROOT, 'docs/roma-os/assets', img), join(dist, 'assets', img))
  }

  // The service worker is plain JS, but its precache list and cache version are
  // generated here: a hand-maintained list goes stale the first time someone
  // adds a file, and a stale iOS cache is the bug that eats an afternoon.
  const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8')
  const assets = precacheList(dist)
  const version = `roma-os-${Date.now().toString(36)}`
  writeFileSync(
    join(dist, 'sw.js'),
    swSrc
      .replace('__CACHE_VERSION__', version)
      .replace('"__PRECACHE__"', JSON.stringify(['./', ...assets], null, 2)),
  )

  const bytes = readFileSync(join(dist, 'bundle.js')).length
  console.log(`✓ dist (bundle ${(bytes / 1024).toFixed(1)} KB, ${assets.length} assets, ${version})`)
}

if (TESTS_ONLY) await buildTests()
else {
  if (!existsSync(join(ROOT, 'src/app.ts'))) throw new Error('src/app.ts is missing')
  await buildApp()
}
