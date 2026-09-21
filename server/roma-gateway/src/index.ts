/**
 * Roma gateway — the one door from the phone to GBrain and to Hermes.
 *
 *   iPhone (PWA on GitHub Pages) → HTTPS → Tailscale Serve → 127.0.0.1:8787 → this
 *                                                                    ├─ GET  /api/v1/state → GBrain recall (read-only)
 *                                                                    └─ POST /api/v1/crow  → Hermes /api/ws (loopback) → one reply
 *
 * GET /api/v1/health needs no identity and carries no data. Everything else
 * needs a Tailscale login from the allowlist. Nothing here holds a
 * browser-facing secret: the GBrain token and the Hermes token live in the
 * process environment and in a 600 file on the Mac, and never leave it.
 * Without HERMES_TOKEN_FILE the Crow route stays a 501 seam and memory keeps
 * working.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { identityFrom, isAllowed, parseAllowlist } from './auth.ts'
import { corsHeaders, parseOrigins } from './cors.ts'
import { CROW_LIMITS, crowFailure, crowReply, parseCrowRequest, readBody } from './crow.ts'
import { connectGBrain } from './gbrain.ts'
import { createHermesClient, type CrowBrain } from './hermes-client.ts'
import { mapFacts } from './mapping.ts'
import { expandHome, fileSessionStore } from './session-state.ts'
import { createStateBuilder, type FactsReader, type Snapshot } from './state.ts'

const HOST = '127.0.0.1'   // never 0.0.0.0 — Serve is the only way in
export const VERSION = '0.2.0'

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

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Pure of the network layer's setup, so the tests can drive it over a loopback socket. */
export function createHandler(config: GatewayConfig, buildState: () => Promise<Snapshot>, crow: CrowBrain | null = null): Handler {
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

export function startServer(config: GatewayConfig, reader: FactsReader, crow: CrowBrain | null = null): ReturnType<typeof createServer> {
  const buildState = createStateBuilder(reader, mapFacts, config.recallLimit)
  const handler = createHandler(config, buildState, crow)
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
    console.log(`[gateway] listening on http://${HOST}:${config.port} · allowlist ${config.allowlist.size} login(s) · origins ${[...config.origins].join(', ') || '(none)'} · crow ${crow ? 'via Hermes' : '501 (HERMES_TOKEN_FILE unset)'}`)
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

  const server = startServer(config, reader, crow)
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
