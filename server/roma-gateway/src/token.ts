/**
 * The Hermes session token: read from a file, used once per connection, never
 * seen again — not in a log line, not in an error, not in a response.
 *
 * Roman keeps it in `~/.hermes/roma-crow-token` with mode 600. The gateway
 * reads it fresh on every connect, so a rotated token is picked up without a
 * restart, and warns once if the file is readable by anyone else.
 */
import { readFile, stat } from 'node:fs/promises'
import { expandHome } from './session-state.ts'
import { HermesError } from './hermes-protocol.ts'

let warnedLoose = false

export async function readTokenFile(rawPath: string, log: (line: string) => void = console.warn): Promise<string> {
  const path = expandHome(rawPath)
  try {
    const info = await stat(path)
    if (process.platform !== 'win32' && (info.mode & 0o077) !== 0 && !warnedLoose) {
      warnedLoose = true
      log(`[gateway] hermes: the token file is readable by others — chmod 600 it (${path})`)
    }
  } catch {
    throw new HermesError('unavailable', `token file not found (${path})`)
  }
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch { throw new HermesError('unavailable', `token file not readable (${path})`) }
  const token = raw.trim()
  if (!token) throw new HermesError('unavailable', `token file is empty (${path})`)
  return token
}
