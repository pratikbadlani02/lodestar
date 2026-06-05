import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SymbolProvider } from './lib/SymbolContext'
import { ThemeProvider } from './lib/ThemeContext'
import { DensityProvider } from './lib/DensityContext'
import { MarketProvider } from './lib/MarketContext'
import { initStoreWS } from './lib/store'

// Boot the global store + single WebSocket. Auth-gated so the WS only opens
// after a token exists; if not, Login mounts first and store boots on /.
if (sessionStorage.getItem('quant_token')) initStoreWS()

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeProvider>
      <DensityProvider>
        <MarketProvider>
          <SymbolProvider>
            <App />
          </SymbolProvider>
        </MarketProvider>
      </DensityProvider>
    </ThemeProvider>
  </BrowserRouter>
)
