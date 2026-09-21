/**
 * CORS for a PWA on GitHub Pages talking to a Mac.
 *
 * The page's origin is fixed and public; the gateway answers only to the
 * origins named in the environment, never `*`, and never with credentials —
 * identity is Tailscale's, not a cookie. GET /state is a simple request;
 * POST /crow (later) carries JSON and needs the preflight answered.
 */

export const CORS_METHODS = 'GET, POST, OPTIONS'
export const CORS_HEADERS = 'Content-Type'
export const CORS_MAX_AGE = '600'

export function parseOrigins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== '*'),
  )
}

/** Headers to add for this request, or none if the origin is not ours. */
export function corsHeaders(origin: string | undefined, allowed: Set<string>): Record<string, string> {
  if (!origin || !allowed.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age': CORS_MAX_AGE,
    Vary: 'Origin',
  }
}
