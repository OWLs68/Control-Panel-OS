/**
 * The stub gateway.
 *
 * It does not pretend to be a backend. It reads the UI context envelope and the
 * local stores, and answers from what is actually on screen — which is enough
 * to prove the envelope carries the right things. When the real gateway lands,
 * this file is replaced, not extended.
 */
import { generateUUID } from '../core/uuid.js'
import { count, plural } from '../core/plural.js'
import { blockerStore, projectStore, agentStore, attentionStore } from '../data/stores.js'
import type { CrowChip, CrowReply, CrowRequest, HermesGateway } from './contract.js'

const THINK_MS = 420

export const stubGateway: HermesGateway = {
  mode: 'stub',
  label: 'заглушка',
  async ask(req: CrowRequest): Promise<CrowReply> {
    await new Promise((r) => setTimeout(r, THINK_MS))
    return answer(req)
  },
}

function answer(req: CrowRequest): CrowReply {
  const { context: ctx, text } = req
  const asked = text.toLowerCase()

  // The control case for the whole envelope: Roman is looking at one blocker
  // and asks "and why is this blocked?" without naming it.
  if (ctx.activeEntity === 'blocker' && ctx.selectedItem) {
    const blocker = blockerStore.get(ctx.selectedItem)
    if (blocker) {
      const project = projectStore.get(blocker.projectId)
      return reply(req, {
        text: `«${blocker.title}» у проєкті ${project?.name ?? 'без проєкту'}.\n\n${blocker.detail}\n\nЧекає на: ${blocker.waitingOn}.`,
        priority: blocker.severity === 'critical' ? 'urgent' : 'normal',
        chips: [
          { id: generateUUID(), label: 'Що мені зробити?', action: 'chat', tone: 'accent' },
          { id: generateUUID(), label: 'Покажи проєкт', action: 'nav', target: 'projects' },
        ],
        forModule: 'projects',
      })
    }
  }

  if (ctx.activeEntity === 'project' && ctx.selectedItem) {
    const project = projectStore.get(ctx.selectedItem)
    if (project) {
      const open = blockerStore.all().filter((b) => b.projectId === project.id)
      const owner = project.ownerAgentId ? agentStore.get(project.ownerAgentId) : undefined
      return reply(req, {
        text: open.length
          ? `${project.name}: ${project.progress}%, ${count(open.length, 'блокер', 'блокери', 'блокерів')}. Веде ${owner?.name ?? 'ніхто'}.`
          : `${project.name}: ${project.progress}%, блокерів немає. Веде ${owner?.name ?? 'ніхто'}.`,
        priority: open.length ? 'urgent' : 'normal',
        chips: open.slice(0, 2).map((b) => ({ id: generateUUID(), label: b.title, action: 'open' as const, target: b.id })),
        forModule: 'projects',
      })
    }
  }

  if (/блок|застря|стоп|чому.*не/.test(asked)) {
    const items = attentionStore.all()
    return reply(req, {
      text: items.length
        ? `Зараз тебе ${plural(items.length, 'чекає', 'чекають', 'чекає')} ${items.length}. Найгостріше — «${items[0]?.title}».`
        : 'Нічого не заблоковано.',
      priority: items.length ? 'urgent' : 'success',
      chips: [{ id: generateUUID(), label: 'Покажи все', action: 'nav', target: 'control', tone: 'accent' }],
    })
  }

  if (/агент|crow|claude|codex/.test(asked)) {
    const online = agentStore.all().filter((a) => a.status === 'online')
    return reply(req, {
      text: `Онлайн ${online.length} з ${agentStore.all().length}: ${online.map((a) => a.name).join(', ') || '—'}.`,
      priority: 'normal',
      chips: [{ id: generateUUID(), label: 'Відкрий агентів', action: 'nav', target: 'agents' }],
      forModule: 'agents',
    })
  }

  // Default: say plainly what is known, including where Roman is standing, so
  // it is obvious at a glance whether the envelope arrived.
  const where = ctx.selection ? ` Ти дивишся на «${ctx.selection}».` : ''
  return reply(req, {
    text: `Записав.${where}\n\nСправжнього Hermes ще немає — я відповідаю із заглушки, але контекст екрана бачу.`,
    priority: 'normal',
    chips: [
      { id: generateUUID(), label: 'Що потребує мене?', action: 'chat', tone: 'accent' },
      { id: generateUUID(), label: 'Стан системи', action: 'nav', target: 'control' },
    ],
  })
}

function reply(req: CrowRequest, body: Omit<CrowReply, 'requestId'> & { chips: CrowChip[] }): CrowReply {
  return { requestId: req.requestId, ...body }
}

