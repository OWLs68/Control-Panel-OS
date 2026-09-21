/**
 * Where the Hermes session id lives between restarts.
 *
 * One Crow chat, one Hermes session (Roman, 21.09): `session.create` once,
 * `session.resume` ever after. The `stored_session_id` Hermes hands back is
 * the only thing kept, in a small JSON file OUTSIDE the repository, written
 * atomically (temp file + rename) with owner-only permissions. It is an
 * identifier, not a secret — but it is nobody else's business either.
 *
 * A file that cannot be read or does not parse reads as "nothing stored": the
 * client then creates a new session, once, and overwrites it.
 */
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface SessionStateStore {
  read(): Promise<string | null>
  write(storedSessionId: string): Promise<void>
  clear(): Promise<void>
}

/** `~/x` → `/Users/roman/x`; Node does not expand it and the .env is where it is typed. */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

export function fileSessionStore(rawPath: string): SessionStateStore {
  const path = expandHome(rawPath)
  return {
    async read(): Promise<string | null> {
      let raw: string
      try { raw = await readFile(path, 'utf8') } catch { return null }
      try {
        const parsed: unknown = JSON.parse(raw)
        const id = parsed && typeof parsed === 'object' ? (parsed as { stored_session_id?: unknown }).stored_session_id : null
        return typeof id === 'string' && id.trim() ? id.trim() : null
      } catch {
        return null
      }
    },
    async write(storedSessionId: string): Promise<void> {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`
      const body = JSON.stringify({ stored_session_id: storedSessionId, saved_at: new Date().toISOString() }, null, 2)
      await writeFile(tmp, `${body}\n`, { encoding: 'utf8', mode: 0o600 })
      await chmod(tmp, 0o600)   // writeFile's mode is masked by the umask; this is not
      await rename(tmp, path)
    },
    async clear(): Promise<void> {
      await rm(path, { force: true })
    },
  }
}

/** For the tests: the same contract, nothing on disk. */
export function memorySessionStore(initial: string | null = null): SessionStateStore & { value: string | null } {
  const store = {
    value: initial,
    async read() { return store.value },
    async write(id: string) { store.value = id },
    async clear() { store.value = null },
  }
  return store
}
