import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ScopeProvider } from './app/ScopeContext'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root element not found')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ScopeProvider>
      <App />
    </ScopeProvider>
  </React.StrictMode>,
)
