import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from '@/app/App'
import { ThemeProvider } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/tooltip'

import './index.css'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('rxlab-web: #root element is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        {/* Hash routing: frontend-static serves only real dist files, so deep
            links must stay inside the page and survive full reloads. */}
        <HashRouter>
          <App />
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
