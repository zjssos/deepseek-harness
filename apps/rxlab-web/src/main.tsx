import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/app/App'
import { ThemeProvider } from '@/lib/theme'

import './index.css'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('rxlab-web: #root element is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
