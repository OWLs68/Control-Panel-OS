/**
 * The Hermes gateway contract.
 *
 * Written before the gateway exists, on purpose. NeverMind's single biggest
 * structural win is that every model call leaves through one function, guarded
 * in CI — swapping the provider is a one-function change instead of surgery in
 * fourteen places. Roma OS starts with that property instead of earning it back
 * later.
 *
 * Nothing here invents a backend. These are the request, response and error
 * shapes the real gateway will have to speak; the stub answers them locally.
 */

import type { MemoryFact } from '../data/types.js'

/** What Crow is told about where Roman is standing when he asks something. */
export interface UiContext {
  /** Active module id, e.g. 'projects'. */
  activeModule: string
  /** Screen within the module, e.g. 'list' or 'detail'. */
  activeScreen: string
  /** Type of the thing on screen, e.g. 'blocker'. */
  activeEntity: string | null
  /** Id of that thing. */
  selectedItem: string | null
  projectId: string | null
  agentId: string | null
  /** Any filters narrowing the current view. */
  filters: Record<string, string>
  /** Short, human-readable state the user can see right now. */
  visibleState: string[]
  /** Blockers or warnings currently on screen. */
  blockers: string[]
  /** Free-form label of the current selection, for the model to quote back. */
  selection: string | null
}

export interface CrowRequest {
  /** What Roman typed or said. */
  text: string
  /** Where he was when he said it. */
  context: UiContext
  /** Recent turns, oldest first. One conversation for the whole app. */
  history: CrowTurn[]
  /** Client-side id so a reply can be matched to its request. */
  requestId: string
}

export interface CrowTurn {
  role: 'user' | 'agent'
  text: string
  ts: number
}

export interface CrowChip {
  id: string
  label: string
  /** `nav` moves modules, `chat` sends the label back as Roman's own words. */
  action: 'nav' | 'chat' | 'open'
  target?: string
  tone?: 'neutral' | 'accent' | 'danger'
}

export interface CrowReply {
  requestId: string
  text: string
  chips: CrowChip[]
  priority: 'normal' | 'urgent' | 'success'
  /** Which module the reply is about, when it is about one. */
  forModule?: string
}

export type GatewayErrorKind = 'offline' | 'unreachable' | 'unauthorized' | 'rate-limited' | 'bad-response' | 'not-configured'

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind
  constructor(kind: GatewayErrorKind, message: string) {
    super(message)
    this.name = 'GatewayError'
    this.kind = kind
  }
}

/**
 * What GET /api/v1/state carries. Only what is really live: in the first
 * slice that is memory. Keys that are absent stay demo on the phone.
 */
export interface LiveSnapshot {
  memory: MemoryFact[]
  fetchedAt: number
  /** The gateway's own name for where the facts came from, e.g. 'gbrain:recall'. */
  source: string
}

/** Every gateway — stub or real — satisfies exactly this. */
export interface HermesGateway {
  readonly mode: 'stub' | 'live'
  readonly label: string
  ask(req: CrowRequest): Promise<CrowReply>
}

/** What Roman should read when the gateway fails. No stack traces on screen. */
export function describeError(err: unknown): string {
  if (err instanceof GatewayError) {
    switch (err.kind) {
      case 'offline': return 'Немає зв’язку. Спробую ще раз, коли мережа повернеться.'
      case 'unreachable': return 'Hermes не відповідає.'
      case 'unauthorized': return 'Немає доступу до Hermes.'
      case 'rate-limited': return 'Забагато запитів поспіль. Трохи зачекай.'
      case 'bad-response': return 'Відповідь Hermes не розпізнана.'
      case 'not-configured': return 'Hermes не підключений: адресу gateway не задано в налаштуваннях.'
    }
  }
  return 'Щось пішло не так.'
}
