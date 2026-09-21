/**
 * Roma gateway — the one door from the phone to GBrain.
 *
 *   iPhone (PWA on GitHub Pages) → HTTPS → Tailscale Serve → 127.0.0.1:8787 → this
 *
 * Read-only in this slice: GET /api/v1/state returns the memory snapshot;
 * POST /api/v1/crow is a 501 placeholder so the seam exists; GET /api/v1/health
 * needs no identity and carries no data. Everything else needs a Tailscale
 * login from the allowlist. Nothing here holds a browser-facing secret: the
 * GBrain token lives in the process environment and never leaves it.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { identityFrom, isAllowed, parseAllowlist } from './auth.ts'
import { corsHeaders, parseOrigins } from './cors.ts'
import { connectGBrain } from './gbrain.ts'
import { mapFacts } from './mapping.ts'
import { createStateBuilder, type FactsReader, type Snapshot } from './state.ts'

const HOST = '127.0.0.1'   // never 0.0.0.0 — Serve is the only way in
export const VERSION = '0.1.0'

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

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Pure of the network layer's setup, so the tests can drive it over a loopback socket. */
export function createHandler(config: GatewayConfig, buildState: () => Promise<Snapshot>): Handler {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`)
    const cors = corsHeaders(req.headers.origin, config.origins)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        ...cors,
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
      send(501, { error: 'not_implemented', hint: 'Crow goes through Hermes in a later slice.' })
      return
    }

    send(404, { error: 'not_found' })
  }
}

export function startServer(config: GatewayConfig, reader: FactsReader): ReturnType<typeof createServer> {
  const buildState = createStateBuilder(reader, mapFacts, config.recallLimit)
  const handler = createHandler(config, buildState)
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error('[gateway] unhandled:', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal' }))
    })
  })
  server.requestTimeout = 15_000
  server.listen(config.port, HOST, () => {
    console.log(`[gateway] listening on http://${HOST}:${config.port} · allowlist ${config.allowlist.size} login(s) · origins ${[...config.origins].join(', ') || '(none)'}`)
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
  startServer(config, reader)
}

// Only the real entry point connects; the tests import the pieces.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error('[gateway] failed to start:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
