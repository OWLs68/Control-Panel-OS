/**
 * A fake Hermes for the tests: the real wire shapes (see src/hermes-protocol.ts
 * and hermes-agent `tui_gateway/`), a real WebSocket server, and knobs to
 * misbehave on purpose — reject a token, forget a session, drop every client,
 * never finish a turn, send garbage. No model, no GBrain, no secret.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'

export interface TurnScript {
  (ctx: {
    sid: string
    text: string
    emit: (type: string, payload?: Record<string, unknown>) => void
    raw: (frame: string) => void
    dropSocket: () => void
  }): void | Promise<void>
}

export interface Call { method: string; params: Record<string, unknown>; id: unknown }

interface FakeSession { key: string; runtime: string; title: string; messages: unknown[]; closeOnDisconnect: unknown; running: boolean }

/** The default turn: what a real Hermes sends around one short answer, noise included. */
export const defaultTurn: TurnScript = ({ emit }) => {
  emit('message.start')
  emit('reasoning.delta', { text: 'секретні думки' })
  emit('thinking.delta', { text: 'ще думки' })
  emit('tool.start', { name: 'mcp__gbrain__recall', tool_id: 't1', args: { limit: 5 } })
  emit('tool.complete', { name: 'mcp__gbrain__recall', tool_id: 't1', result: 'VIOLET-624 у фактах' })
  emit('message.delta', { text: 'Маркер: ' })
  emit('message.delta', { text: 'VIOLET-624' })
  emit('message.complete', { text: 'Маркер: VIOLET-624', status: 'complete', usage: { total_tokens: 12 } })
}

export class FakeHermes {
  readonly token: string
  url = ''
  calls: Call[] = []
  clientResponses: Array<Record<string, unknown>> = []
  tokensSeen: string[] = []
  connections = 0
  sessions = new Map<string, FakeSession>()
  turn: TurnScript = defaultTurn
  /** When set, session.resume answers this error instead of looking the session up. */
  resumeError: { code: number; message: string } | null = null
  createError: { code: number; message: string } | null = null
  /** A frame to push to the client right after prompt.submit is answered (a server→client request, say). */
  afterSubmit: string | null = null
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private sockets = new Set<WebSocket>()
  private counter = 0

  constructor(token = 'test-token-1234567890') { this.token = token }

  async start(): Promise<void> {
    const server = createServer((_req, res) => { res.writeHead(404); res.end() })
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const token = url.searchParams.get('token') ?? ''
      this.tokensSeen.push(token)
      if (url.pathname !== '/api/ws' || token !== this.token) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    this.url = `ws://127.0.0.1:${addr.port}/api/ws`
    this.server = server
    this.wss = wss
  }

  async stop(): Promise<void> {
    this.dropClients()
    this.wss?.close()
    await new Promise<void>((r) => { if (this.server) this.server.close(() => r()); else r() })
    this.server = null
  }

  /** Every client loses its socket — Hermes restarted, or the Mac slept. Sessions stay stored. */
  dropClients(): void {
    for (const ws of this.sockets) { try { ws.terminate() } catch { /* gone */ } }
    this.sockets.clear()
  }

  /** Hermes restarted: runtime ids are new, stored ids still resume. */
  restart(): void {
    this.dropClients()
    for (const s of this.sessions.values()) { s.runtime = `sid-${++this.counter}`; s.running = false }
  }

  /** The runtime id was reaped (idle TTL): prompt.submit on it is 4001, the stored id still resumes. */
  forgetRuntimes(): void {
    for (const s of this.sessions.values()) s.runtime = `gone-${s.runtime}`
  }

  callsTo(method: string): Call[] { return this.calls.filter((c) => c.method === method) }

  private accept(ws: WebSocket): void {
    this.connections++
    this.sockets.add(ws)
    ws.on('close', () => this.sockets.delete(ws))
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload: { skin: null, change_events: true, heartbeat: true, replay_epoch: 'e1' } } }))
    ws.on('message', (data) => {
      let obj: Record<string, unknown>
      try { obj = JSON.parse(String(data)) as Record<string, unknown> } catch {
        ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }))
        return
      }
      if (typeof obj.method !== 'string') { this.clientResponses.push(obj); return }
      const params = (obj.params && typeof obj.params === 'object' ? obj.params : {}) as Record<string, unknown>
      this.calls.push({ method: obj.method, params, id: obj.id })
      const reply = (result: unknown) => ws.send(JSON.stringify({ jsonrpc: '2.0', result, id: obj.id }))
      const fail = (code: number, message: string) => ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: obj.id }))
      const emitFor = (sid: string) => (type: string, payload?: Record<string, unknown>) => {
        if (ws.readyState !== ws.OPEN) return
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type, session_id: sid, ...(payload ? { payload } : {}) } }))
      }

      switch (obj.method) {
        case 'gateway.ping': reply({ ok: true }); return
        case 'ping': reply({ pong: true }); return
        case 'session.create': {
          if (this.createError) { fail(this.createError.code, this.createError.message); return }
          const n = ++this.counter
          const session: FakeSession = {
            key: `key-${n}`, runtime: `sid-${n}`, title: String(params.title ?? ''),
            messages: Array.isArray(params.messages) ? params.messages : [], closeOnDisconnect: params.close_on_disconnect, running: false,
          }
          this.sessions.set(session.key, session)
          reply({ session_id: session.runtime, stored_session_id: session.key, message_count: session.messages.length, messages: [], info: { model: 'fake', lazy: true } })
          return
        }
        case 'session.resume': {
          if (this.resumeError) { fail(this.resumeError.code, this.resumeError.message); return }
          const target = String(params.session_id ?? '')
          if (!target) { fail(4006, 'session_id required'); return }
          const session = this.sessions.get(target)
          if (!session) { fail(4007, 'session not found'); return }
          reply({ session_id: session.runtime, resumed: session.key, session_key: session.key, message_count: session.messages.length, messages: [], messages_omitted: true, info: {}, inflight: null, running: session.running, status: 'idle' })
          return
        }
        case 'prompt.submit': {
          const sid = String(params.session_id ?? '')
          const session = [...this.sessions.values()].find((s) => s.runtime === sid)
          if (!session) { fail(4001, 'session not found'); return }
          if (session.running) { reply({ status: 'queued' }); return }
          session.running = true
          reply({ status: 'streaming' })
          if (this.afterSubmit) ws.send(this.afterSubmit)
          const emit = emitFor(sid)
          const ctx = {
            sid, text: String(params.text ?? ''),
            emit: (type: string, payload?: Record<string, unknown>) => { if (type === 'message.complete') session.running = false; emit(type, payload) },
            raw: (frame: string) => { if (ws.readyState === ws.OPEN) ws.send(frame) },
            dropSocket: () => { session.running = false; ws.terminate() },
          }
          Promise.resolve().then(() => this.turn(ctx)).catch(() => { session.running = false })
          return
        }
        case 'session.interrupt': {
          const sid = String(params.session_id ?? '')
          const session = [...this.sessions.values()].find((s) => s.runtime === sid)
          if (!session) { fail(4001, 'session not found'); return }
          const wasRunning = session.running
          session.running = false
          reply({ status: 'interrupted' })
          if (wasRunning) emitFor(sid)('message.complete', { text: '', status: 'interrupted' })
          return
        }
        case 'session.close': {
          const sid = String(params.session_id ?? '')
          for (const [key, s] of this.sessions) if (s.runtime === sid) this.sessions.delete(key)
          reply({ closed: true })
          return
        }
        default:
          fail(-32601, `unknown method: ${obj.method}`)
      }
    })
  }
}
