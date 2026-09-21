/**
 * The read path into GBrain.
 *
 * One MCP client over HTTP, one credential — a DEDICATED read-only token for
 * this gateway, never Hermes' or a Claude client's — and exactly one tool in
 * use: `recall` without a query, which the installed GBrain (0.51) answers as
 * a deterministic recent-facts feed, newest first, active facts only. No
 * `synthesize`, no `remember`, no writes of any kind.
 *
 * `FactsReader` is the seam: the server takes any object with `recentFacts`,
 * so the tests hand it a fake and never touch the network.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { FactsReader } from './state.ts'

export interface GBrainConfig {
  url: string
  token: string
  transport: 'streamable' | 'sse'
}

/** The SDK's tool call, narrowed to what we use — so a fake is one function. */
export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>

export function createGBrainReader(callTool: ToolCaller): FactsReader {
  return {
    async recentFacts(limit: number): Promise<unknown> {
      const result = await callTool('recall', { limit })
      return factsFromToolResult(result)
    },
  }
}

/**
 * An MCP tool result carries either `structuredContent` or a text block with
 * the JSON inside; GBrain's recall answers `{ facts: [...], total, protocol_version }`.
 */
export function factsFromToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return []
  const r = result as { structuredContent?: unknown; content?: unknown; isError?: boolean }
  if (r.isError) throw new Error('gbrain recall returned an error')
  const payload = r.structuredContent ?? firstTextJson(r.content)
  if (payload && typeof payload === 'object' && Array.isArray((payload as { facts?: unknown }).facts)) {
    return (payload as { facts: unknown[] }).facts
  }
  return []
}

function firstTextJson(content: unknown): unknown {
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: string }).text ?? ''
      try { return JSON.parse(text) } catch { return null }
    }
  }
  return null
}

/** Connects once; the caller keeps the reader for the life of the process. */
export async function connectGBrain(config: GBrainConfig): Promise<FactsReader> {
  const headers = { Authorization: `Bearer ${config.token}` }
  const url = new URL(config.url)
  const transport = config.transport === 'sse'
    ? new SSEClientTransport(url, { requestInit: { headers } })
    : new StreamableHTTPClientTransport(url, { requestInit: { headers } })
  const client = new Client({ name: 'roma-gateway', version: '0.1.0' })
  await client.connect(transport)
  return createGBrainReader(async (name, args) => client.callTool({ name, arguments: args }))
}
