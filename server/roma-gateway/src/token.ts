/**
 * Tokens the gateway keeps in files: read fresh on every use, never seen again —
 * not in a log line, not in an error, not in a response.
 *
 * Two of them today. Hermes' session token lives in `~/.hermes/roma-crow-token`
 * with mode 600 and is read on every connect. The Event Center's producer token
 * (ROMA_EVENTS_TOKEN_FILE) is read on every write. A rotated token is picked up
 * without a restart, and each file warns once if anyone else can read it.
 */
import { readFile, stat } from 'node:fs/promises'
import { expandHome } from './session-state.ts'
import { HermesError } from './hermes-protocol.ts'

/** The file is missing, unreadable or empty. The message names the file, never its contents. */
export class SecretFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretFileError'
  }
}

/** One warning per kind of token (hermes, events) for the life of the process, as before. */
const warnedLoose = new Set<string>()

/** `label` only shapes the log line («hermes», «events») — the value is never logged. */
export async function readSecretFile(rawPath: string, label: string, log: (line: string) => void = console.warn): Promise<string> {
  const path = expandHome(rawPath)
  try {
    const info = await stat(path)
    if (process.platform !== 'win32' && (info.mode & 0o077) !== 0 && !warnedLoose.has(label)) {
      warnedLoose.add(label)
      log(`[gateway] ${label}: the token file is readable by others — chmod 600 it (${path})`)
    }
  } catch {
    throw new SecretFileError(`token file not found (${path})`)
  }
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch { throw new SecretFileError(`token file not readable (${path})`) }
  const token = raw.trim()
  if (!token) throw new SecretFileError(`token file is empty (${path})`)
  return token
}

/** Hermes' token: the same read, failures named as Hermes being unavailable. */
export async function readTokenFile(rawPath: string, log: (line: string) => void = console.warn): Promise<string> {
  try {
    return await readSecretFile(rawPath, 'hermes', log)
  } catch (err) {
    throw new HermesError('unavailable', err instanceof Error ? err.message : 'token file not readable')
  }
}
