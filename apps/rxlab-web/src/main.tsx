import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from '@/app/App'
import { ThemeProvider } from '@/lib/theme'
import { TooltipProvider } from '@/components/ui/tooltip'

import './index.css'

/** Root error surface: render the failure instead of a blank #root. */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error?: Error; stack?: string }> {
  override state: { error?: Error; stack?: string } = {}

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(_error: Error, info: { componentStack?: string }): void {
    this.setState({ stack: info.componentStack })
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <pre className="whitespace-pre-wrap p-6 font-mono text-sm text-red-600">
        {this.state.error.stack ?? this.state.error.message}
        {'\n\n'}
        {this.state.stack ?? ''}
      </pre>
    )
  }
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('rxlab-web: #root element is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          {/* Hash routing: frontend-static serves only real dist files, so deep
              links must stay inside the page and survive full reloads. */}
          <HashRouter>
            <App />
          </HashRouter>
        </TooltipProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
