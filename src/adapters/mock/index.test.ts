import { describe, expect, it } from 'vitest'
import {
  mockActivityAdapter,
  mockAgentsAdapter,
  mockBackupAdapter,
  mockConnectionsAdapter,
  mockGBrainAdapter,
  mockProjectsAdapter,
  mockSystemAdapter,
} from './index'
import { createAdapters } from '@/adapters'

describe('mock adapters', () => {
  it('stamp every response as mock so the UI can never mislabel it as live', async () => {
    const responses = await Promise.all([
      mockSystemAdapter.getSystemHealth(),
      mockProjectsAdapter.listProjects(),
      mockGBrainAdapter.recent(),
      mockAgentsAdapter.listAgents(),
      mockActivityAdapter.listEvents(),
      mockConnectionsAdapter.listConnections(),
      mockBackupAdapter.getBackupStatus(),
    ])

    for (const response of responses) {
      expect(response.origin).toBe('mock')
      expect(response.sourceOfTruth).toBeTruthy()
      expect(response.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('names GBrain as the source of truth for memory, not the panel', async () => {
    const response = await mockGBrainAdapter.recent()
    expect(response.sourceOfTruth).toBe('gbrain')
  })

  it('returns project summaries without detail-only fields', async () => {
    const { data } = await mockProjectsAdapter.listProjects()
    expect(data.length).toBeGreaterThan(0)
    for (const project of data) {
      expect(project).not.toHaveProperty('blockers')
      expect(project).not.toHaveProperty('currentState')
      expect(project.id).toBeTruthy()
    }
  })

  it('resolves a known project and returns null for an unknown id', async () => {
    const known = await mockProjectsAdapter.getProject('roman-ai-os')
    expect(known.data?.name).toContain('Roman AI OS')
    expect(known.data?.blockers.length).toBeGreaterThan(0)

    const unknown = await mockProjectsAdapter.getProject('does-not-exist')
    expect(unknown.data).toBeNull()
  })

  it('filters memory by free-text query and returns everything when empty', async () => {
    const hits = await mockGBrainAdapter.search('backup')
    expect(hits.data.length).toBeGreaterThan(0)
    for (const item of hits.data) {
      const haystack = `${item.content} ${item.entity ?? ''} ${item.topic ?? ''} ${item.provenance}`
      expect(haystack.toLowerCase()).toContain('backup')
    }

    const all = await mockGBrainAdapter.search('   ')
    expect(all.data.length).toBeGreaterThan(hits.data.length)

    const none = await mockGBrainAdapter.search('zzz-nothing-matches')
    expect(none.data).toHaveLength(0)
  })

  it('reports which memory verbs are actually wired up', () => {
    const verbs = mockGBrainAdapter.supportedVerbs()
    expect(verbs).toContain('recall')
    // Write verbs must not be advertised while the panel is read-only.
    expect(verbs).not.toContain('remember')
    expect(verbs).not.toContain('forget')
  })

  it('filters activity by kind, project and search', async () => {
    const byKind = await mockActivityAdapter.listEvents({ kinds: ['backup'] })
    expect(byKind.data.length).toBeGreaterThan(0)
    expect(byKind.data.every((e) => e.kind === 'backup')).toBe(true)

    const byProject = await mockActivityAdapter.listEvents({ projectId: 'brain-migration' })
    expect(byProject.data.every((e) => e.projectId === 'brain-migration')).toBe(true)

    const bySearch = await mockActivityAdapter.listEvents({ search: 'hermes' })
    expect(bySearch.data.length).toBeGreaterThan(0)
  })

  it('returns activity newest first', async () => {
    const { data } = await mockActivityAdapter.listEvents()
    const timestamps = data.map((e) => e.at)
    expect([...timestamps].sort((a, b) => b.localeCompare(a))).toEqual(timestamps)
  })

  it('surfaces the off-device backup gap rather than reporting a clean state', async () => {
    const { data } = await mockBackupAdapter.getBackupStatus()
    expect(data.restoreVerified).toBe(true)
    expect(data.offDeviceCopy).toBe(false)
    expect(data.level).toBe('warn')
  })
})

describe('adapter selection', () => {
  it('defaults to the mock registry', () => {
    const registry = createAdapters('mock')
    expect(registry.projects).toBe(mockProjectsAdapter)
  })

  it('refuses to start in gateway mode instead of silently serving fixtures', () => {
    expect(() => createAdapters('gateway')).toThrow(/not implemented/i)
  })
})
