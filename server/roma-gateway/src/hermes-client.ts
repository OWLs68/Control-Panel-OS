/**
 * The Hermes client — one WebSocket, one session, one turn at a time.
 *
 *   POST /api/v1/crow → ask() → prompt.submit → message.delta… → message.complete → one reply
 *
 * What it holds to (Roman, 21.09):
 *   - the token comes from a file and goes into the `?token=` of the upgrade
 *     URL, nowhere else — not a log line, not an error, not a response;
 *   - one Hermes session for the one Crow chat: `session.create` the first
 *     time, `session.resume` with the stored id after every reconnect or
 *     restart; a stored id Hermes no longer knows gets ONE `session.create`
 *     fallback, never a loop;
 *   - the connection is made when it is needed and dropped when it dies; there
 *     is no reconnect loop in the background (a sleeping Mac is offline, and
 *     says so);
 *   - a second question while one is running is refused as busy, so
 *     `prompt.submit` is never sent twice into the same turn;
 *   - only `message.delta` and `message.complete` shape the reply; reasoning,
 *     thinking and tool events are read and dropped;
 *   - the phone that asked and went away gets its turn interrupted.
 *
 * The transport is Node's own WebSocket (22.4+); the tests hand in a socket
 * factory and a store, and drive a fake Hermes over a real socket.
 */
import {
  HERMES_CODES, HERMES_EVENTS, HERMES_METHODS, HermesError, HermesRpcError,
  buildPrompt, errorResponseFrame, finalText, parseFrame, requestFrame, seedMessages, turnStatus,
  type CrowTurnInput, type HermesFrame, type RpcEventFrame,
} from './hermes-protocol.ts'
import type { SessionStateStore } from './session-state.ts'
import { readTokenFile } from './token.ts'

export interface HermesClientConfig {
  /** ws://127.0.0.1:9119/api/ws — loopback on the Mac; the phone never learns it. */
  wsUrl: string
  tokenFile: string
  /** Short: the socket must open and `gateway.ready` must arrive within this. */
  connectTimeoutMs: number
  /** Long enough for a turn with tools: prompt.submit → message.complete. */
  turnTimeoutMs: number
  heartbeatIntervalMs?: number
  heartbeatDeadlineMs?: number
  sessionTitle?: string
}

/** The slice of a WebSocket the client uses — Node's global satisfies it; the tests may hand in their own. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: { code: number; reason: string }) => void): void
  addEventListener(type: 'error', listener: () => void): void
}

export interface HermesClientDeps {
  store: SessionStateStore
  readToken?: (path: string, log: (line: string) => void) => Promise<string>
  createSocket?: (url: string) => SocketLike
  log?: (line: string) => void
}

/** What the HTTP layer talks to. `busy` is read before a request is accepted. */
export interface CrowBrain {
  readonly busy: boolean
  ask(turn: CrowTurnInput, signal?: AbortSignal): Promise<{ text: string }>
  /** Drop the socket, keep the session (close_on_disconnect is false). */
  close(): Promise<void>
}

const SESSION_RPC_TIMEOUT_MS = 30_000     // Hermes' own agent-wait ceiling on session RPCs
const INTERRUPT_TIMEOUT_MS = 10_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000   // what Hermes' own clients do
const DEFAULT_HEARTBEAT_DEADLINE_MS = 45_000
const DEFAULT_TITLE = 'Roma OS · Crow'
const WS_OPEN = 1

interface Pending {
  method: string
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface ActiveTurn {
  sid: string | null
  streamed: string[]
  readonly settled: boolean
  readonly promise: Promise<Record<string, unknown> | null>
  complete(payload: Record<string, unknown> | null): void
  fail(err: Error): void
}

type SeedMessage = ReturnType<typeof seedMessages>[number]

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function stringField(r: unknown, key: string): string | null {
  if (!isRecord(r)) return null
  const v = r[key]
  return typeof v === 'string' && v ? v : null
}

function createTurn(): ActiveTurn {
  let settled = false
  let resolve!: (p: Record<string, unknown> | null) => void
  let reject!: (e: Error) => void
  const promise = new Promise<Record<string, unknown> | null>((res, rej) => { resolve = res; reject = rej })
  // A failure can land before ask() gets to await (an abort during the
  // handshake); without a handler attached now, Node would treat it as unhandled.
  promise.catch(() => {})
  return {
    sid: null,
    streamed: [],
    get settled() { return settled },
    promise,
    complete(payload) { if (settled) return; settled = true; resolve(payload) },
    fail(err) { if (settled) return; settled = true; reject(err) },
  }
}

export function createHermesClient(config: HermesClientConfig, deps: HermesClientDeps): CrowBrain {
  const log = deps.log ?? ((line: string) => console.log(line))
  const readToken = deps.readToken ?? readTokenFile
  const createSocket = deps.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike)
  const heartbeatEvery = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  const heartbeatDeadline = config.heartbeatDeadlineMs ?? DEFAULT_HEARTBEAT_DEADLINE_MS
  const title = config.sessionTitle ?? DEFAULT_TITLE

  let socket: SocketLike | null = null
  let ready = false
  let runtimeSid: string | null = null
  let connecting: Promise<void> | null = null
  let nextId = 1
  const pending = new Map<number, Pending>()
  let turn: ActiveTurn | null = null
  let heartbeat: NodeJS.Timeout | null = null
  let lastInbound = 0
  let malformed = 0

  /* ── Socket ─────────────────────────────────────────────────────── */

  function safeUrl(): string {
    try { const u = new URL(config.wsUrl); return `${u.origin}${u.pathname}` } catch { return '(invalid HERMES_WS_URL)' }
  }

  function connect(): Promise<void> {
    if (socket && ready) return Promise.resolve()
    if (connecting) return connecting
    connecting = (async () => {
      const token = await readToken(config.tokenFile, log)
      let url: URL
      try { url = new URL(config.wsUrl) } catch { throw new HermesError('unavailable', 'HERMES_WS_URL is not a URL') }
      url.searchParams.set('token', token)
      const where = safeUrl()
      log(`[gateway] hermes: connecting to ${where}`)
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const s = createSocket(url.href)
        socket = s
        ready = false
        const finish = (err: Error | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (err) {
            if (socket === s) { socket = null; ready = false }
            try { s.close() } catch { /* already gone */ }
            reject(err)
          } else {
            resolve()
          }
        }
        const timer = setTimeout(() => {
          finish(new HermesError('unavailable', `no gateway.ready within ${config.connectTimeoutMs} ms (${where})`))
        }, config.connectTimeoutMs)
        s.addEventListener('open', () => { /* the handshake ends with gateway.ready, not with open */ })
        s.addEventListener('error', () => {
          if (!ready) finish(new HermesError('unavailable', `connection refused or rejected (${where}) — is Hermes running, and does the token file match?`))
        })
        s.addEventListener('close', (ev) => {
          if (!ready) finish(new HermesError('unavailable', `closed during the handshake, code ${ev.code} (${where}) — does the token file match?`))
          teardown(s, `closed, code ${ev.code}${ev.reason ? ` ${ev.reason}` : ''}`)
        })
        s.addEventListener('message', (ev) => {
          if (socket !== s) return
          lastInbound = Date.now()
          const frame = parseFrame(ev.data)
          if (!frame) {
            malformed++
            if (malformed <= 3 || malformed % 100 === 0) log(`[gateway] hermes: malformed frame ignored (${malformed} so far)`)
            return
          }
          dispatch(s, frame, () => { ready = true; log('[gateway] hermes: ready'); startHeartbeat(); finish(null) })
        })
      })
    })().finally(() => { connecting = null })
    return connecting
  }

  function teardown(s: SocketLike, why: string): void {
    if (socket !== s) return
    socket = null
    ready = false
    runtimeSid = null     // a new socket must session.resume to be attached to the session's events
    stopHeartbeat()
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new HermesError('unavailable', `${p.method}: socket ${why}`))
    }
    pending.clear()
    turn?.fail(new HermesError('unavailable', `socket ${why} mid-turn`))
    log(`[gateway] hermes: disconnected — ${why}`)
  }

  function send(s: SocketLike, frame: string): boolean {
    try { s.send(frame); return true } catch { return false }
  }

  function dispatch(s: SocketLike, frame: HermesFrame, onReady: () => void): void {
    switch (frame.kind) {
      case 'response': {
        const p = typeof frame.id === 'number' ? pending.get(frame.id) : undefined
        if (!p) return
        pending.delete(frame.id as number)
        clearTimeout(p.timer)
        if (frame.error) p.reject(new HermesRpcError(p.method, frame.error.code, frame.error.message))
        else p.resolve(frame.result)
        return
      }
      case 'server-request':
        // approval / clarify / sudo…: Crow has nowhere to show a question, so the agent must not wait.
        send(s, errorResponseFrame(frame.id, HERMES_CODES.methodNotFound, 'roma-gateway does not answer server requests'))
        return
      case 'event':
        onEvent(frame, onReady)
    }
  }

  function onEvent(ev: RpcEventFrame, onReady: () => void): void {
    if (ev.type === HERMES_EVENTS.ready) { onReady(); return }
    const t = turn
    if (!t || !t.sid || ev.sessionId !== t.sid) return
    switch (ev.type) {
      case HERMES_EVENTS.delta: {
        const text = ev.payload?.text
        if (typeof text === 'string' && text) t.streamed.push(text)
        return
      }
      case HERMES_EVENTS.complete:
        t.complete(ev.payload)
        return
      case HERMES_EVENTS.error: {
        const m = ev.payload?.message
        t.fail(new HermesError('failed', `hermes reported an error during the turn: ${typeof m === 'string' ? m : 'unknown'}`))
        return
      }
      default:
        // reasoning.delta, thinking.delta, tool.*, status.update, … — not for the user.
        return
    }
  }

  /* ── JSON-RPC ───────────────────────────────────────────────────── */

  function request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const s = socket
    if (!s || !ready || s.readyState !== WS_OPEN) {
      return Promise.reject(new HermesError('unavailable', `${method}: not connected`))
    }
    const id = nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new HermesError('timeout', `${method}: no answer within ${timeoutMs} ms`))
      }, timeoutMs)
      pending.set(id, { method, resolve, reject, timer })
      if (!send(s, requestFrame(id, method, params))) {
        pending.delete(id)
        clearTimeout(timer)
        reject(new HermesError('unavailable', `${method}: send failed`))
      }
    })
  }

  /* ── Heartbeat — gateway.ping every 15 s, drop the socket after 45 s of silence ── */

  function startHeartbeat(): void {
    stopHeartbeat()
    lastInbound = Date.now()
    heartbeat = setInterval(() => {
      const s = socket
      if (!s || !ready) return
      if (Date.now() - lastInbound > heartbeatDeadline) {
        try { s.close(4000, 'heartbeat deadline') } catch { /* already gone */ }
        teardown(s, 'silent past the heartbeat deadline')
        return
      }
      request(HERMES_METHODS.ping, {}, heartbeatDeadline).catch(() => { /* the deadline above is the verdict */ })
    }, heartbeatEvery)
    heartbeat.unref?.()
  }

  function stopHeartbeat(): void {
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
  }

  /* ── Session ────────────────────────────────────────────────────── */

  async function ensureSession(seed: SeedMessage[]): Promise<string> {
    await connect()
    if (runtimeSid) return runtimeSid
    const stored = await deps.store.read()
    if (stored) {
      try {
        const r = await request(HERMES_METHODS.resume, { session_id: stored, omit_messages: true }, SESSION_RPC_TIMEOUT_MS)
        const sid = stringField(r, 'session_id')
        if (sid) {
          runtimeSid = sid
          log('[gateway] hermes: session resumed')
          return sid
        }
        log('[gateway] hermes: session.resume answered without a session_id — starting a new session')
      } catch (err) {
        // Only Hermes SAYING no is a reason to start over; a dead socket or a
        // timeout is not, or a wobble would fork the one conversation.
        if (!(err instanceof HermesRpcError)) throw err
        log(`[gateway] hermes: stored session not accepted (code ${err.code}) — starting a new session`)
      }
      await deps.store.clear()
    }
    const params: Record<string, unknown> = { close_on_disconnect: false, title }
    if (seed.length) params.messages = seed
    const r = await request(HERMES_METHODS.create, params, SESSION_RPC_TIMEOUT_MS)
    const sid = stringField(r, 'session_id')
    const key = stringField(r, 'stored_session_id')
    if (!sid || !key) throw new HermesError('protocol', 'session.create answered without session ids')
    runtimeSid = sid
    await deps.store.write(key)
    log(`[gateway] hermes: session created${seed.length ? ` (seeded with ${seed.length} earlier turns)` : ''}`)
    return sid
  }

  /** 'streaming' when the turn is ours; 'stale' when the runtime id is gone; anything else is Hermes' busy policy. */
  async function submit(sid: string, prompt: string): Promise<string> {
    try {
      const r = await request(HERMES_METHODS.submit, { session_id: sid, text: prompt }, SESSION_RPC_TIMEOUT_MS)
      return stringField(r, 'status') ?? 'streaming'
    } catch (err) {
      if (err instanceof HermesRpcError && err.code === HERMES_CODES.staleRuntime) return 'stale'
      throw err
    }
  }

  async function interrupt(sid: string): Promise<void> {
    try {
      await request(HERMES_METHODS.interrupt, { session_id: sid }, INTERRUPT_TIMEOUT_MS)
      log('[gateway] hermes: turn interrupted')
    } catch {
      /* the socket is gone or Hermes refused: nothing left to stop */
    }
  }

  function toHermesError(err: unknown): HermesError {
    if (err instanceof HermesError) return err
    if (err instanceof HermesRpcError) return new HermesError('unavailable', err.message)
    return new HermesError('unavailable', err instanceof Error ? err.message : 'unknown failure')
  }

  /* ── The one public verb ────────────────────────────────────────── */

  async function ask(input: CrowTurnInput, signal?: AbortSignal): Promise<{ text: string }> {
    if (turn) throw new HermesError('busy', 'a turn is already running')
    if (signal?.aborted) throw new HermesError('failed', 'aborted before the turn started')
    const active = createTurn()
    turn = active
    const onAbort = () => active.fail(new HermesError('failed', 'aborted by the client'))
    signal?.addEventListener('abort', onAbort, { once: true })
    let stopOnExit = false
    try {
      const seed = seedMessages(input.history, input.text)
      const prompt = buildPrompt(input)
      let sid = await ensureSession(seed)
      if (active.settled) await active.promise   // aborted or torn down meanwhile: throws
      active.sid = sid
      let status = await submit(sid, prompt)
      if (status === 'stale') {
        // The runtime id died (reaped, restarted); the stored id is what survives.
        runtimeSid = null
        sid = await ensureSession(seed)
        if (active.settled) await active.promise
        active.sid = sid
        status = await submit(sid, prompt)
        if (status === 'stale') throw new HermesError('unavailable', 'the session was lost twice in one turn')
      }
      if (status !== 'streaming') {
        // Hermes queued or steered it into a turn we did not start: stop that turn, refuse this one.
        await interrupt(sid)
        throw new HermesError('busy', `hermes answered "${status}" instead of streaming`)
      }
      stopOnExit = true
      const timer = setTimeout(() => {
        active.fail(new HermesError('timeout', `no message.complete within ${config.turnTimeoutMs} ms`))
      }, config.turnTimeoutMs)
      let payload: Record<string, unknown> | null
      try { payload = await active.promise } finally { clearTimeout(timer) }
      stopOnExit = false
      const status2 = turnStatus(payload)
      if (status2 !== 'complete') {
        const detail = typeof payload?.error === 'string' ? `: ${payload.error}` : ''
        throw new HermesError('failed', `the turn ended as ${status2}${detail}`)
      }
      return { text: finalText(payload, active.streamed.join('')) }
    } catch (err) {
      if (stopOnExit && active.sid) void interrupt(active.sid)
      throw toHermesError(err)
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (turn === active) turn = null
    }
  }

  async function close(): Promise<void> {
    stopHeartbeat()
    const s = socket
    if (!s) return
    teardown(s, 'closed by the gateway')
    try { s.close(1000, 'gateway shutdown') } catch { /* already gone */ }
  }

  return {
    get busy() { return turn !== null },
    ask,
    close,
  }
}
