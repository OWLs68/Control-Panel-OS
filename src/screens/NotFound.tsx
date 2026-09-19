import { Link } from 'react-router-dom'
import { EmptyState } from '@/ui/components/States'

export function NotFound() {
  return (
    <div className="stack">
      <EmptyState title="Сторінку не знайдено" hint="Такого розділу в панелі немає." />
      <Link to="/" className="btn" style={{ alignSelf: 'center' }}>
        До огляду
      </Link>
    </div>
  )
}
