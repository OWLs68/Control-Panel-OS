/**
 * Navigation request, as an event rather than a direct call.
 *
 * A screen asking to open another screen must not import the navigator, or the
 * registry ends up importing the modules that import the registry. The event
 * keeps the graph one-directional: modules emit, the drum listens.
 */
export const NAVIGATE = 'roma-navigate'

export interface NavigateRequest {
  moduleId: string
  /** Optional thing to select once the module is on screen. */
  select?: { entity: string; id: string; label: string; projectId?: string; agentId?: string }
}

export function navigate(req: NavigateRequest): void {
  window.dispatchEvent(new CustomEvent<NavigateRequest>(NAVIGATE, { detail: req }))
}
