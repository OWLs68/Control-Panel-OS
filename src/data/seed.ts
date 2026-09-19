/**
 * Demo fixtures.
 *
 * Seeded once into the real stores rather than held in a parallel array, so the
 * screens exercise the same read path they will use against a live gateway.
 * Ids are fixed strings, not generated, because the whole point of the seed is
 * that one object shows up in several places under one id: an attention item
 * points at a blocker, the blocker points at a project, the project points at
 * the agent that owns it. No copies.
 */
import { agentStore, attentionStore, blockerStore, eventStore, memoryStore, projectStore } from './stores.js'
import type { Agent, Attention, Blocker, MemoryFact, Project, SystemEvent } from './types.js'

const SEED_KEY = 'roma_seed_version'
const SEED_VERSION = '1'

const AGENT = {
  crow: 'agent-crow',
  claude: 'agent-claude-code',
  codex: 'agent-codex',
} as const

const PROJECT = {
  gbrain: 'project-gbrain',
  romaOs: 'project-roma-os',
  migration: 'project-migration',
  neverMind: 'project-nevermind',
} as const

const BLOCKER = {
  keys: 'blocker-client-keys',
  gateway: 'blocker-gateway',
  decision: 'blocker-crow-decision',
} as const

const minutes = (n: number) => Date.now() - n * 60_000
const hours = (n: number) => Date.now() - n * 3_600_000

type New<T> = Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'hlc'> & { id: string }

const AGENTS: New<Agent>[] = [
  { id: AGENT.crow, name: 'Crow', role: 'Оркестратор', model: 'DeepSeek v4-flash', status: 'online', risk: 'L1', task: 'індексує факти' },
  { id: AGENT.claude, name: 'Claude Code', role: 'Кодинг', model: 'локально на Mac', status: 'online', risk: 'L1', task: 'Roma OS, етап 1' },
  { id: AGENT.codex, name: 'Codex', role: 'Кодинг', model: 'не підключений', status: 'offline', risk: 'L0', task: null },
]

const PROJECTS: New<Project>[] = [
  { id: PROJECT.gbrain, name: 'Roman AI OS / GBrain', summary: 'Ядро системи: памʼять, агенти, Hermes', status: 'active', progress: 62, ownerAgentId: AGENT.crow },
  { id: PROJECT.romaOs, name: 'Roma OS', summary: 'Інтерфейс-оболонка, етап 1', status: 'active', progress: 34, ownerAgentId: AGENT.claude },
  { id: PROJECT.migration, name: 'Міграція памʼяті', summary: 'Перенос фактів у GBrain', status: 'paused', progress: 18, ownerAgentId: AGENT.crow },
  { id: PROJECT.neverMind, name: 'NeverMind', summary: 'Донор механік, працює окремо', status: 'active', progress: 91, ownerAgentId: null },
]

const BLOCKERS: New<Blocker>[] = [
  {
    id: BLOCKER.keys, projectId: PROJECT.gbrain,
    title: 'Окремі ключі для клієнтів',
    detail: 'Hermes і Claude ділять один токен. Поки він один — не видно, хто саме що робив, і відкликати доступ можна тільки в обох одразу.',
    severity: 'critical', waitingOn: 'Роман',
  },
  {
    id: BLOCKER.gateway, projectId: PROJECT.romaOs,
    title: 'Зовнішній доступ до Hermes',
    detail: 'З телефона немає способу достукатись до Hermes. Потрібне рішення, перш ніж інтерфейс піде далі заглушки.',
    severity: 'warning', waitingOn: 'Роман',
  },
  {
    id: BLOCKER.decision, projectId: PROJECT.migration,
    title: 'Crow чекає рішення',
    detail: 'Які саме факти переносити у GBrain, а які лишити локально.',
    severity: 'warning', waitingOn: 'Роман',
  },
]

const ATTENTION: New<Attention>[] = [
  { id: 'attn-keys', title: 'Окремі ключі для клієнтів', detail: 'Hermes і Claude ділять токен', risk: 'L3', severity: 'critical', moduleId: 'projects', entityId: BLOCKER.keys },
  { id: 'attn-gateway', title: 'Зовнішній доступ до Hermes', detail: 'Немає способу достукатись з телефона', risk: 'L2', severity: 'warning', moduleId: 'projects', entityId: BLOCKER.gateway },
  { id: 'attn-decision', title: 'Crow чекає рішення', detail: 'Що переносити у GBrain', risk: 'L1', severity: 'warning', moduleId: 'projects', entityId: BLOCKER.decision },
]

const EVENTS: New<SystemEvent>[] = [
  { id: 'event-stage0', ts: minutes(24), kind: 'note', title: 'Roma OS: етап 0 завершено', detail: 'Мокап, палітра і handoff зафіксовані в репо', source: 'Claude Code' },
  { id: 'event-index', ts: minutes(96), kind: 'index', title: 'Crow проіндексував 34 факти', detail: 'Нові факти з Inbox рознесені по категоріях', source: 'Crow' },
  { id: 'event-backup', ts: hours(9), kind: 'backup', title: 'Нічний бекап GBrain', detail: 'Знімок бази виконано, 1.2 ГБ', source: 'Hermes' },
  { id: 'event-deploy', ts: hours(14), kind: 'deploy', title: 'Control Panel → Roma OS', detail: 'Стара версія лишилась у гілці legacy/control-panel-v1', source: 'GitHub Actions' },
  { id: 'event-agent', ts: hours(20), kind: 'agent', title: 'Claude Code підключений', detail: 'Локальний агент на Mac, рівень ризику L1', source: 'Hermes' },
]

const MEMORY: New<MemoryFact>[] = [
  { id: 'fact-palette', text: 'Палітра Roma OS — Graphite Amber. Фіолетового немає взагалі.', category: 'preference', ts: hours(26) },
  { id: 'fact-crow', text: 'Crow — обличчя агента в інтерфейсі. Hermes — назва runtime під капотом.', category: 'system', ts: hours(27) },
  { id: 'fact-control', text: 'Control — домашня вкладка. Сховати її не можна.', category: 'system', ts: hours(27) },
  { id: 'fact-nevermind', text: 'NeverMind — донор механік. Правити його не можна.', category: 'project', ts: hours(28) },
]

/** Idempotent: re-runs on every boot but only writes when the version moves. */
export function seedFixtures(force = false): boolean {
  if (!force && localStorage.getItem(SEED_KEY) === SEED_VERSION) return false

  agentStore.replaceAll(AGENTS)
  projectStore.replaceAll(PROJECTS)
  blockerStore.replaceAll(BLOCKERS)
  attentionStore.replaceAll(ATTENTION)
  eventStore.replaceAll(EVENTS)
  memoryStore.replaceAll(MEMORY)

  try { localStorage.setItem(SEED_KEY, SEED_VERSION) } catch { /* private mode */ }
  return true
}
