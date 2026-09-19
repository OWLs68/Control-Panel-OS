/**
 * THE boundary to Crow's brain.
 *
 * Every request to the agent in this app goes through `askCrow`, and nothing
 * else may talk to a gateway directly. `scripts/check-gateway-boundary.mjs`
 * enforces it in CI, the same way NeverMind guards `openaiFetch`.
 *
 * Replacing the stub with the real Hermes is `setGateway(liveGateway)` — one
 * line, one file, no screen touched.
 */
import { type CrowReply, type CrowRequest, type HermesGateway, GatewayError } from './contract.js'
import { stubGateway } from './stub.js'

let gateway: HermesGateway = stubGateway

export function getGateway(): HermesGateway {
  return gateway
}

export function setGateway(next: HermesGateway): void {
  gateway = next
}

export async function askCrow(req: CrowRequest): Promise<CrowReply> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new GatewayError('offline', 'navigator reports offline')
  }
  const reply = await gateway.ask(req)
  return { ...reply, text: safeReply(reply.text) }
}

/**
 * Never show a raw JSON body as if Crow said it.
 *
 * Ported from NeverMind's `safeAgentReply`: when a model returns its internal
 * envelope instead of prose, the user sees a short confirmation, not a wall of
 * braces.
 */
export function safeReply(text: string): string {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return 'Готово.'
  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  if (!looksLikeJson) return trimmed
  try {
    JSON.parse(trimmed)
    return 'Зроблено ✓'
  } catch {
    return trimmed // not valid JSON after all — it was just prose in braces
  }
}
