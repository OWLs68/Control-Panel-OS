/**
 * Roma gateway — Crow OS MP's one door on the Mac: to GBrain, to Hermes, and
 * the Event Center.
 *
 *   iPhone (PWA on GitHub Pages) → HTTPS → Tailscale Serve → 127.0.0.1:8787 → this
 *                                                                    ├─ GET  /api/v1/state  → GBrain recall (read-only) + the newest events
 *                                                                    └─ POST /api/v1/crow   → Hermes /api/ws (loopback) → one reply
 *   producer on this Mac (curl, an agent) → 127.0.0.1:8787 ────────────── POST /api/v1/events → the Event Center (events.ts)
 *
 * GET /api/v1/health needs no identity and carries no data. The phone's routes
 * need a Tailscale login from the allowlist. The events route is the other
 * way round: it is for producers on the Mac only — a request that came
 * through Serve is refused — and it needs the producer token. Nothing here
 * holds a browser-facing secret: the GBrain token, the Hermes token and the
 * producer token live in the process environment and in 600 files on the
 * Mac, and never leave it. Without HERMES_TOKEN_FILE the Crow route stays a
 * 501 seam; without ROMA_EVENTS_TOKEN_FILE the Event Center is off (501, and
 * no events in the snapshot). Memory keeps working either way.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { identityFrom, isAllowed, parseAllowlist } from './auth.ts'
import { corsHeaders, parseOrigins } from './cors.ts'
import { CROW_LIMITS, crowFailure, crowReply, parseCrowRequest, readBody } from './crow.ts'
import { bearerFrom, EVENT_LIMITS, fileEventStore, parseEventInput, tokenMatches, toSystemEvent, type EventStore } from './events.ts'
import { connectGBrain } from './gbrain.ts'
import { createHermesClient, type CrowBrain } from './hermes-client.ts'
import { mapFacts } from './mapping.ts'
import { expandHome, fileSessionStore } from './session-state.ts'
import { createStateBuilder, type FactsReader, type Snapshot } from './state.ts'
import { readSecretFile } from './token.ts'

const HOST = '127.0.0.1'   // never 0.0.0.0 — Serve is the only way in
export const VERSION = '0.3.0'

export interface GatewayConfig {
  port: number
  allowlist: Set<string>
  origins: Set<string>
  recallLimit: number
}

export function configFromEnv(env: NodeJS.ProcessEnv): GatewayConfig {
  const port = Number.parseInt(env.ROMA_GATEWAY_PORT ?? '8787', 10)
  const limit = Number.parseInt(env.GBRAIN_RECALL_LIMIT ?? '50', 10)
  return {
    port: Number.isFinite(port) && port > 0 ? port : 8787,
    allowlist: parseAllowlist(env.ROMA_ALLOWED_LOGINS),
    origins: parseOrigins(env.ROMA_ALLOWED_ORIGINS),
    recallLimit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
  }
}

export interface HermesConfig {
  wsUrl: string
  tokenFile: string
  sessionStateFile: string
  connectTimeoutMs: number
  turnTimeoutMs: number
}

export const HERMES_DEFAULTS = {
  wsUrl: 'ws://127.0.0.1:9119/api/ws',
  sessionStateFile: '~/.roma-gateway/hermes-session.json',
  connectTimeoutMs: 5_000,
  turnTimeoutMs: 120_000,
} as const

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Null when HERMES_TOKEN_FILE is not set: Crow stays a 501 seam, memory still works. */
export function hermesConfigFromEnv(env: NodeJS.ProcessEnv): HermesConfig | null {
  const tokenFile = (env.HERMES_TOKEN_FILE ?? '').trim()
  if (!tokenFile) return null
  return {
    wsUrl: (env.HERMES_WS_URL ?? '').trim() || HERMES_DEFAULTS.wsUrl,
    tokenFile,
    sessionStateFile: (env.HERMES_SESSION_STATE_FILE ?? '').trim() || HERMES_DEFAULTS.sessionStateFile,
    connectTimeoutMs: positiveInt(env.HERMES_CONNECT_TIMEOUT_MS, HERMES_DEFAULTS.connectTimeoutMs),
    turnTimeoutMs: positiveInt(env.HERMES_TURN_TIMEOUT_MS, HERMES_DEFAULTS.turnTimeoutMs),
  }
}

export interface EventsConfig {
  /** Where the Event Center keeps its file; outside the repository. */
  file: string
  /** The producer token's file (600). Its path only — never the value. */
  tokenFile: string
}

export const EVENTS_DEFAULTS = { file: '~/.roma-gateway/events.json' } as const

/** Null when ROMA_EVENTS_TOKEN_FILE is not set: the Event Center is off, the phone keeps the demo feed. */
export function eventsConfigFromEnv(env: NodeJS.ProcessEnv): EventsConfig | null {
  const tokenFile = (env.ROMA_EVENTS_TOKEN_FILE ?? '').trim()
  if (!tokenFile) return null
  return { file: (env.ROMA_EVENTS_FILE ?? '').trim() || EVENTS_DEFAULTS.file, tokenFile }
}

/** The Event Center as the handler sees it: the store, and who may write to it. */
export interface EventCenter {
  store: EventStore
  /** Reads the producer token (fresh, so a rotation needs no restart) and compares. Throws when it cannot be read. */
  authorize(token: string | null): Promise<boolean>
}

export function createEventCenter(config: EventsConfig): EventCenter {
  return {
    store: fileEventStore(config.file),
    async authorize(token) {
      return tokenMatches(token, await readSecretFile(config.tokenFile, 'events'))
    },
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Pure of the network layer's setup, so the tests can drive it over a loopback socket. */
export function createHandler(
  config: GatewayConfig,
  buildState: () => Promise<Snapshot>,
  crow: CrowBrain | null = null,
  events: EventCenter | null = null,
): Handler {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`)
    const cors = corsHeaders(req.headers.origin, config.origins)
    const send = (status: number, body: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, {
        ...cors,
        ...extra,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(Object.keys(cors).length ? 204 : 403, cors)
      res.end()
      return
    }

    if (url.pathname === '/api/v1/health' && req.method === 'GET') {
      send(200, { ok: true, version: VERSION })
      return
    }

    // Producers on this Mac write events; the phone never does. This route is
    // answered before the Tailscale check because a local producer has no
    // Tailscale identity — and a request that carries one came through Serve,
    // from the tailnet, and is refused. The producer token is what lets a write in.
    if (url.pathname === '/api/v1/events') {
      if (identityFrom(req.headers) !== null) { send(403, { error: 'forbidden' }); return }
      if (!events) {
        send(501, { error: 'not_implemented', hint: 'ROMA_EVENTS_TOKEN_FILE is not set on the gateway.' })
        return
      }
      if (req.method !== 'POST') { send(405, { error: 'method_not_allowed' }, { Allow: 'POST' }); return }
      let allowed: boolean
      try {
        allowed = await events.authorize(bearerFrom(req.headers))
      } catch (err) {
        console.error(`[gateway] events: producer token unavailable — ${err instanceof Error ? err.message : 'unreadable'}`)
        send(503, { error: 'events_unavailable' })
        return
      }
      if (!allowed) { send(401, { error: 'unauthorized' }); return }
      const body = await readBody(req, EVENT_LIMITS.bodyBytes)
      if (!body.ok) { send(body.status, { error: body.error }); return }
      const receivedAt = Date.now()
      const parsed = parseEventInput(body.text, receivedAt)
      if (!parsed.ok) { send(400, parsed.error === 'invalid_event' ? { error: parsed.error, field: parsed.field } : { error: parsed.error }); return }
      try {
        const { event, duplicate } = await events.store.append(toSystemEvent(parsed.input, receivedAt))
        send(duplicate ? 200 : 201, { id: event.id, duplicate })
      } catch (err) {
        console.error(`[gateway] events: write failed — ${err instanceof Error ? err.message : String(err)}`)
        send(500, { error: 'store_failed' })
      }
      return
    }

    const login = identityFrom(req.headers)
    if (!isAllowed(login, config.allowlist)) {
      send(403, { error: 'forbidden' })
      return
    }

    if (url.pathname === '/api/v1/state' && req.method === 'GET') {
      try {
        const snapshot = await buildState()
        send(200, snapshot)
      } catch (err) {
        console.error('[gateway] state failed:', err instanceof Error ? err.message : err)
        send(502, { error: 'gbrain_unavailable' })
      }
      return
    }

    if (url.pathname === '/api/v1/crow') {
      if (req.method !== 'POST') {
        send(405, { error: 'method_not_allowed' }, { Allow: 'POST' })
        return
      }
      if (!crow) {
        send(501, { error: 'not_implemented', hint: 'HERMES_TOKEN_FILE is not set on the gateway.' })
        return
      }
      const body = await readBody(req, CROW_LIMITS.bodyBytes)
      if (!body.ok) { send(body.status, { error: body.error }); return }
      const parsed = parseCrowRequest(body.text)
      if (!parsed.ok) { send(parsed.status, { error: parsed.error }); return }
      if (crow.busy) { send(409, { error: 'busy' }); return }

      // The phone that gives up mid-turn takes its turn with it (session.interrupt).
      const controller = new AbortController()
      res.on('close', () => { if (!res.writableFinished) controller.abort() })
      try {
        const { text } = await crow.ask(parsed.turn, controller.signal)
        send(200, crowReply(parsed.turn, text))
      } catch (err) {
        if (controller.signal.aborted) {
          console.warn('[gateway] crow: the phone went away mid-turn')
          return
        }
        const failure = crowFailure(err)
        console.error(`[gateway] crow failed: ${failure.error}${err instanceof Error ? ` — ${err.message}` : ''}`)
        send(failure.status, { error: failure.error })
      }
      return
    }

    send(404, { error: 'not_found' })
  }
}

export function startServer(
  config: GatewayConfig,
  reader: FactsReader,
  crow: CrowBrain | null = null,
  events: EventCenter | null = null,
): ReturnType<typeof createServer> {
  const buildState = createStateBuilder(reader, mapFacts, config.recallLimit, Date.now,
    events ? { reader: events.store, limit: EVENT_LIMITS.inSnapshot } : null)
  const handler = createHandler(config, buildState, crow, events)
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error('[gateway] unhandled:', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal' }))
    })
  })
  // Receiving a request has 15 s; the reply may take as long as a Hermes turn — that clock
  // stops once the body is in (checked on Node 22: a 1 s requestTimeout still lets a 2.5 s reply through).
  server.requestTimeout = 15_000
  server.listen(config.port, HOST, () => {
    console.log(`[gateway] listening on http://${HOST}:${config.port} · allowlist ${config.allowlist.size} login(s) · origins ${[...config.origins].join(', ') || '(none)'} · crow ${crow ? 'via Hermes' : '501 (HERMES_TOKEN_FILE unset)'} · events ${events ? 'on' : 'off (ROMA_EVENTS_TOKEN_FILE unset)'}`)
  })
  return server
}

async function main(): Promise<void> {
  const env = process.env
  const config = configFromEnv(env)
  if (config.allowlist.size === 0) console.warn('[gateway] ROMA_ALLOWED_LOGINS is empty — every request will be refused')
  if (config.origins.size === 0) console.warn('[gateway] ROMA_ALLOWED_ORIGINS is empty — the PWA will not be able to read')
  const url = env.GBRAIN_MCP_URL ?? ''
  const token = env.GBRAIN_TOKEN ?? ''
  if (!url || !token) {
    console.error('[gateway] GBRAIN_MCP_URL and GBRAIN_TOKEN are required (see .env.example)')
    process.exit(1)
  }
  const reader = await connectGBrain({
    url, token,
    transport: env.GBRAIN_MCP_TRANSPORT === 'sse' ? 'sse' : 'streamable',
  })

  const hermes = hermesConfigFromEnv(env)
  let crow: CrowBrain | null = null
  if (hermes) {
    crow = createHermesClient(
      { wsUrl: hermes.wsUrl, tokenFile: hermes.tokenFile, connectTimeoutMs: hermes.connectTimeoutMs, turnTimeoutMs: hermes.turnTimeoutMs },
      { store: fileSessionStore(hermes.sessionStateFile) },
    )
    // The address without its query; the token file by path only.
    console.log(`[gateway] hermes: ${hermes.wsUrl.split('?')[0]} · token file ${expandHome(hermes.tokenFile)} · session state ${expandHome(hermes.sessionStateFile)} · connect ${hermes.connectTimeoutMs} ms · turn ${hermes.turnTimeoutMs} ms`)
  } else {
    console.warn('[gateway] HERMES_TOKEN_FILE is empty — POST /api/v1/crow answers 501; memory still works')
  }

  const eventsConfig = eventsConfigFromEnv(env)
  const events = eventsConfig ? createEventCenter(eventsConfig) : null
  if (eventsConfig) {
    // Paths only; the token's value is never read here, let alone logged.
    console.log(`[gateway] events: store ${expandHome(eventsConfig.file)} · token file ${expandHome(eventsConfig.tokenFile)}`)
  } else {
    console.warn('[gateway] ROMA_EVENTS_TOKEN_FILE is empty — POST /api/v1/events answers 501; the phone keeps its demo feed')
  }

  const server = startServer(config, reader, crow, events)
  const shutdown = (signal: string) => {
    console.log(`[gateway] ${signal}: shutting down`)
    server.close()
    void (crow ? crow.close() : Promise.resolve()).finally(() => process.exit(0))
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

// Only the real entry point connects; the tests import the pieces.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error('[gateway] failed to start:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
