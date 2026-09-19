import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/ui/components/AppShell'
import { UpdatePrompt } from '@/ui/components/UpdatePrompt'
import { Dashboard } from '@/screens/Dashboard'
import { Projects } from '@/screens/Projects'
import { ProjectDetailScreen } from '@/screens/ProjectDetail'
import { Memory } from '@/screens/Memory'
import { Agents } from '@/screens/Agents'
import { Activity } from '@/screens/Activity'
import { Settings } from '@/screens/Settings'
import { NotFound } from '@/screens/NotFound'
import { resolveDataSourceMode } from '@/adapters'

export function App() {
  // Today `mock` is the only implemented mode, so origin is derived from the
  // configured data source. When a real adapter lands this moves to a per-call
  // value carried on each `Sourced<T>`.
  const origin = resolveDataSourceMode() === 'mock' ? 'mock' : 'live'

  return (
    <AppShell origin={origin}>
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetailScreen />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
