import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconActivity,
  IconAgents,
  IconDashboard,
  IconMemory,
  IconProjects,
  IconSettings,
} from './Icons'
import { OriginBadge } from './Badges'
import type { DataOrigin } from '@/domain/types'

export interface NavItem {
  to: string
  label: string
  /** Shorter label for the mobile tab bar. */
  short: string
  Icon: (props: { className?: string }) => ReactNode
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Огляд', short: 'Огляд', Icon: IconDashboard },
  { to: '/projects', label: 'Проєкти', short: 'Проєкти', Icon: IconProjects },
  { to: '/memory', label: 'Памʼять', short: 'Памʼять', Icon: IconMemory },
  { to: '/agents', label: 'Агенти', short: 'Агенти', Icon: IconAgents },
  { to: '/activity', label: 'Події', short: 'Події', Icon: IconActivity },
  { to: '/settings', label: 'Налаштування', short: 'Налашт.', Icon: IconSettings },
]

export function AppShell({ origin, children }: { origin: DataOrigin; children: ReactNode }) {
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Основна навігація">
        <div className="sidebar__brand">
          <div className="topbar__eyebrow">Roman AI OS</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>Control Panel</div>
        </div>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="sidebar__item">
            <Icon />
            {label}
          </NavLink>
        ))}
        <div data-testid="shell-origin" style={{ marginTop: 'auto', padding: 'var(--space-3)' }}>
          <OriginBadge origin={origin} />
        </div>
      </nav>

      <div className="app__main">
        <header className="topbar">
          <div className="topbar__titles">
            <span className="topbar__eyebrow">Roman AI OS</span>
            <span className="topbar__title">Control Panel</span>
          </div>
          <span data-testid="shell-origin">
            <OriginBadge origin={origin} />
          </span>
        </header>

        <main className="content" id="main">
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label="Розділи">
        {NAV_ITEMS.map(({ to, short, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tabbar__item">
            <Icon />
            <span className="tabbar__label">{short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
