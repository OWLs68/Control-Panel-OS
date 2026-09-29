/**
 * Does Hermes answer? — the fact behind Crow's status on the agents screen.
 *
 * The Crow client only holds a socket while a turn needs it, and its heartbeat
 * runs only on an open socket, so «is Hermes up» has no answer between chats.
 * This asks the same loopback address the client uses, over plain HTTP: any
 * answer — even a 401 or a 404 — means the process is there; a refused
 * connection or a silence past the timeout means it is not. Nothing is sent
 * but a GET for the root, and the token is never part of it.
 *
 * The verdict is remembered for a few seconds, so a phone that refreshes
 * often does not turn into a stream of probes.
 */
export type Probe = () => Promise<boolean>

export const HERMES_PROBE_TIMEOUT_MS = 1_500
export const HERMES_PROBE_CACHE_MS = 10_000

/** `ws://127.0.0.1:9119/api/ws?token=…` → `http://127.0.0.1:9119/`; the path and the query stay out of it. */
export function probeUrlFor(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl)
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}/`
  } catch {
    return null
  }
}

export function createHermesProbe(
  wsUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
  timeoutMs: number = HERMES_PROBE_TIMEOUT_MS,
): Probe | null {
  const url = probeUrlFor(wsUrl)
  if (!url) return null
  let cached: { at: number; alive: boolean } | null = null
  let inFlight: Promise<boolean> | null = null

  return function probe() {
    if (cached && now() - cached.at < HERMES_PROBE_CACHE_MS) return Promise.resolve(cached.alive)
    if (inFlight) return inFlight
    inFlight = (async () => {
      let alive: boolean
      try {
        const res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
        void res.body?.cancel().catch(() => undefined)
        alive = true
      } catch {
        alive = false
      }
      cached = { at: now(), alive }
      inFlight = null
      return alive
    })()
    return inFlight
  }
}
