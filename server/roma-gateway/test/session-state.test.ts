import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expandHome, fileSessionStore, memorySessionStore } from '../src/session-state.ts'
import { readTokenFile } from '../src/token.ts'
import { HermesError } from '../src/hermes-protocol.ts'

test('the stored session id survives a restart, owner-only, atomically written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-session-'))
  try {
    const path = join(dir, 'nested', 'hermes-session.json')
    const store = fileSessionStore(path)
    assert.equal(await store.read(), null)
    await store.write('key-42')
    assert.equal(await fileSessionStore(path).read(), 'key-42')
    if (process.platform !== 'win32') {
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      assert.equal((await stat(join(dir, 'nested'))).mode & 0o077, 0)
    }
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    assert.deepEqual(Object.keys(raw).sort(), ['saved_at', 'stored_session_id'])
    await store.write('key-43')
    assert.equal(await store.read(), 'key-43')
    await store.clear()
    assert.equal(await store.read(), null)
    await store.clear()   // twice is fine
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a corrupt or foreign state file reads as nothing stored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-session-'))
  try {
    const path = join(dir, 's.json')
    await writeFile(path, '{not json')
    assert.equal(await fileSessionStore(path).read(), null)
    await writeFile(path, JSON.stringify({ something: 'else' }))
    assert.equal(await fileSessionStore(path).read(), null)
    await writeFile(path, JSON.stringify({ stored_session_id: '   ' }))
    assert.equal(await fileSessionStore(path).read(), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('~ expands to the home directory, nothing else is touched', () => {
  assert.equal(expandHome('~/.hermes/x'), join(homedir(), '.hermes/x'))
  assert.equal(expandHome('~'), homedir())
  assert.equal(expandHome('/abs/path'), '/abs/path')
  assert.equal(expandHome('rel/~/x'), 'rel/~/x')
})

test('the memory store keeps the same contract', async () => {
  const store = memorySessionStore('a')
  assert.equal(await store.read(), 'a')
  await store.write('b')
  assert.equal(await store.read(), 'b')
  await store.clear()
  assert.equal(await store.read(), null)
})

test('the token is read trimmed; a missing, unreadable or empty file is «unavailable», never a value in a log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roma-token-'))
  const logs: string[] = []
  try {
    const path = join(dir, 'roma-crow-token')
    await writeFile(path, '  tok-SECRET-123  \n', { mode: 0o600 })
    assert.equal(await readTokenFile(path, (l) => logs.push(l)), 'tok-SECRET-123')
    assert.equal(logs.length, 0)

    await assert.rejects(readTokenFile(join(dir, 'missing'), (l) => logs.push(l)), (e: unknown) => e instanceof HermesError && e.kind === 'unavailable')
    await writeFile(join(dir, 'empty'), '\n')
    await assert.rejects(readTokenFile(join(dir, 'empty'), (l) => logs.push(l)), (e: unknown) => e instanceof HermesError && e.kind === 'unavailable')

    if (process.platform !== 'win32') {
      const loose = join(dir, 'loose')
      await writeFile(loose, 'tok-LOOSE-456', { mode: 0o644 })
      assert.equal(await readTokenFile(loose, (l) => logs.push(l)), 'tok-LOOSE-456')
      assert.equal(logs.length, 1)
      assert.match(logs[0] ?? '', /chmod 600/)
      assert.ok(!logs[0]?.includes('tok-LOOSE-456'))
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
