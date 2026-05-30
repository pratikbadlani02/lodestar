// Right-click context menu primitive + helper hook for symbol-row menus.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Gauge, TrendingUp, TrendingDown, Bell, Copy, X, Layers, Radio,
} from 'lucide-react'
import { useSymbol } from '../../lib/SymbolContext'

export function ContextMenu({ open, x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function keyHandler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open, onClose])

  if (!open) return null

  // Clamp to viewport so the menu doesn't overflow
  const W = 200, H = items.length * 30 + 12
  const clampedX = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - W - 8)
  const clampedY = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - H - 8)

  return (
    <div
      ref={ref}
      className="fixed z-50 card-surface py-1 min-w-[200px]"
      style={{ left: clampedX, top: clampedY, animation: 'cmdk-in 100ms ease-out' }}
    >
      {items.map((it, i) => {
        if (it.divider) return <div key={`div-${i}`} className="my-1 border-t border-white/[0.06]" />
        const Icon = it.icon
        return (
          <button
            key={it.label}
            onClick={() => { it.onClick?.(); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition hover:bg-accent/[0.10] ${
              it.danger ? 'text-down' : 'text-ink-2 hover:text-ink-1'
            }`}
          >
            {Icon && <Icon size={12} className={it.danger ? 'text-down' : 'text-ink-4'} />}
            <span className="flex-1">{it.label}</span>
            {it.kbd && <span className="text-2xs text-ink-5 font-mono">{it.kbd}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Standard symbol context menu — works the same in every list/table.
export function useSymbolContextMenu({ onRemove } = {}) {
  const navigate = useNavigate()
  const { setSymbol } = useSymbol()
  const [state, setState] = useState({ open: false, x: 0, y: 0, symbol: null })

  const onContextMenu = useCallback((e, symbol) => {
    e.preventDefault()
    setState({ open: true, x: e.clientX, y: e.clientY, symbol })
  }, [])

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])

  const items = state.symbol ? [
    { label: 'Open Analysis', icon: Gauge, onClick: () => { setSymbol(state.symbol); navigate(`/analysis/${state.symbol}`) } },
    { label: 'Options Chain', icon: Layers, onClick: () => { setSymbol(state.symbol); navigate(`/options/${state.symbol}`) } },
    { label: 'Time & Sales', icon: Radio, onClick: () => { setSymbol(state.symbol); navigate(`/tape/${state.symbol}`) } },
    { label: 'View in Stocks', icon: BarChart3, onClick: () => { setSymbol(state.symbol); navigate(`/stocks?symbol=${state.symbol}`) } },
    { divider: true },
    { label: 'Buy', icon: TrendingUp, kbd: '⇧B',
      onClick: () => { setSymbol(state.symbol); window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } })) } },
    { label: 'Sell', icon: TrendingDown, kbd: '⇧S',
      onClick: () => { setSymbol(state.symbol); window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } })) } },
    { label: 'Set Price Alert', icon: Bell,
      onClick: () => { setSymbol(state.symbol); navigate('/price-alerts') } },
    { divider: true },
    { label: 'Copy Symbol', icon: Copy,
      onClick: () => { try { navigator.clipboard?.writeText(state.symbol) } catch {} } },
    onRemove && { label: 'Remove from Watchlist', icon: X, danger: true,
      onClick: () => onRemove(state.symbol) },
  ].filter(Boolean) : []

  const menu = (
    <ContextMenu open={state.open} x={state.x} y={state.y} items={items} onClose={close} />
  )

  return { onContextMenu, menu }
}
