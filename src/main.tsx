import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AdapterProvider } from '@/ui/hooks/AdapterProvider'
import { createAdapters } from '@/adapters'
import './styles/global.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AdapterProvider value={createAdapters()}>
        <App />
      </AdapterProvider>
    </BrowserRouter>
  </StrictMode>,
)
