import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ScopeProvider } from './app/ScopeContext'
import { ThemeProvider } from './app/ThemeContext'
import { applyPreviewFixture } from './app/previewBootstrap'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root element not found')

const root = ReactDOM.createRoot(rootEl)

function render() {
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <ScopeProvider>
          <App />
        </ScopeProvider>
      </ThemeProvider>
    </React.StrictMode>,
  )
}

// applyPreviewFixture resolves the /email/forwarded feed into the adapter
// before the first render (live when VITE_BACKEND_API_URL is set, else the
// bundled sample, else a no-op). Render either way — success or failure.
void applyPreviewFixture().then(render, render)
