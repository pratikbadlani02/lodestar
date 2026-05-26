import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SymbolProvider } from './lib/SymbolContext'
import { ThemeProvider } from './lib/ThemeContext'
import { DensityProvider } from './lib/DensityContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeProvider>
      <DensityProvider>
        <SymbolProvider>
          <App />
        </SymbolProvider>
      </DensityProvider>
    </ThemeProvider>
  </BrowserRouter>
)
