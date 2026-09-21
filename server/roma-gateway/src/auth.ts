/**
 * Who is asking.
 *
 * The gateway never sees the internet: it listens on 127.0.0.1 and Tailscale
 * Serve is the only way in. Serve adds `Tailscale-User-Login` to every request
 * it proxies from inside the tailnet, so identity is the network's, not a
 * token in JavaScript. The allowlist comes from the environment — no login is
 * written into the repo — and an empty allowlist admits nobody.
 */
import type { IncomingHttpHeaders } from 'node:http'

export const IDENTITY_HEADER = 'tailscale-user-login'

/** Parses ROMA_ALLOWED_LOGINS: comma-separated, trimmed, case-insensitive. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  )
}

/** The login Serve attached, or null when the request did not come through it. */
export function identityFrom(headers: IncomingHttpHeaders): string | null {
  const raw = headers[IDENTITY_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  const login = (value ?? '').trim().toLowerCase()
  return login.length > 0 ? login : null
}

export function isAllowed(login: string | null, allowlist: Set<string>): boolean {
  if (!login || allowlist.size === 0) return false
  return allowlist.has(login)
}
