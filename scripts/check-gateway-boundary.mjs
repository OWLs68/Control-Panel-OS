#!/usr/bin/env node
// Guards the single gateway boundary.
//
// Exactly one module may reach a network endpoint for Crow: src/hermes/gateway.ts.
// If a screen ever calls fetch() at a model or gateway URL directly, swapping
// Hermes in stops being a one-line change — so this fails the build instead.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const ALLOWED = new Set(['src/hermes/gateway.ts'])

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry.endsWith('.ts')) files.push(full)
  }
}
walk(SRC)

const offenders = []
for (const file of files) {
  const rel = relative(ROOT, file)
  if (ALLOWED.has(rel)) continue
  const body = readFileSync(file, 'utf8')
  if (/\bfetch\s*\(/.test(body) || /https?:\/\/[^\s'"]*(api|gateway|hermes)/i.test(body)) {
    offenders.push(rel)
  }
}

if (offenders.length) {
  console.error('❌ gateway boundary: these files talk to the network directly:')
  for (const f of offenders) console.error(`   ${f}`)
  console.error('   Route it through askCrow() in src/hermes/gateway.ts instead.')
  process.exit(1)
}

console.log(`✓ gateway boundary: ${files.length} modules checked, only src/hermes/gateway.ts may call out`)
