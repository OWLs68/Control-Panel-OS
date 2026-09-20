/**
 * The version badge and the deploy-info sheet — NeverMind's `#deploy-version`
 * badge and `showDeployInfo` (`nav.js:1373–1440`), so Roman can tell on the
 * phone which build he is looking at.
 *
 * The badge reads `v19` over `21.09 00:58` — the deploy number, then the day
 * and the time the build was made (Kyiv); the donor writes the same inline.
 * build.js stamps them, with the commit and the branch, into dist/index.html;
 * a local build says `vdev`.
 * Tapping it opens the donor's rows — version, commit, branch — plus one
 * button the donor does not have: «Оновити застосунок», which drops the
 * service worker and every cache and reloads, for the day the phone insists
 * on an old build.
 */
import { reg } from '../core/delegation.js'
import { $, escapeHtml } from '../core/dom.js'
import { openSheet } from './sheet.js'

const REPO = 'https://github.com/OWLs68/Control-Panel-OS'
const SHEET_ID = 'deploy-info'

export function setupDeployInfo(): void {
  reg('show-deploy-info', () => {
    const badge = $('#deploy-version')
    if (!badge) return
    const version = $('.deploy-badge-num', badge)?.textContent?.trim() || 'vdev'
    const commit = badge.dataset.commit || 'local'
    const branch = badge.dataset.branch || 'dev'
    const built = badge.dataset.built || ''

    const commitCell = commit !== 'local'
      ? `<a href="${REPO}/commit/${escapeHtml(commit)}" target="_blank" rel="noopener">${escapeHtml(commit)}</a>`
      : escapeHtml(commit)

    openSheet({
      id: SHEET_ID,
      title: 'Інфо про деплой',
      subtitle: 'Що зараз на телефоні',
      body: `
        <div class="deploy-rows">
          ${row('Версія', escapeHtml(built && version !== 'vdev' ? `${version} · ${built}` : version))}
          ${row('Коміт', commitCell)}
          ${row('Гілка', escapeHtml(branch))}
        </div>
        <div class="deploy-hint">Якщо номер не змінився після деплою — CI ще не доробив або
          телефон тримає стару збірку. Закрий застосунок повністю і відкрий знову,
          або натисни кнопку нижче.</div>
        <div class="deploy-actions">
          <button class="btn btn-dark btn-block" data-action="hard-refresh">Оновити застосунок</button>
        </div>`,
    })
  })

  // Drop the worker and every cache, then load the page from the network.
  reg('hard-refresh', () => { void hardRefresh() })
}

function row(label: string, value: string): string {
  return `<div class="deploy-row"><span class="deploy-row-label">${label}</span><span class="deploy-row-value">${value}</span></div>`
}

async function hardRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    // A query string the worker never saw: the network, not the HTTP cache.
    location.replace(`${location.pathname}?fresh=${Date.now()}`)
  }
}
