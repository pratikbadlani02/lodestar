// Keyboard shortcut cheat sheet. Triggered by pressing "?" (when not focused
// in an input). Groups shortcuts by area and supports searching.

import { useEffect, useMemo, useState } from 'react'
import { Keyboard, X } from 'lucide-react'

const GROUPS = [
  {
    title: 'Global',
    items: [
      { keys: ['⌘', 'K'],    label: 'Open command palette' },
      { keys: ['/'],          label: 'Focus the search input' },
      { keys: ['?'],          label: 'Show this help' },
      { keys: ['Esc'],        label: 'Close any panel or modal' },
    ],
  },
  {
    title: 'Order',
    items: [
      { keys: ['⇧', 'B'], label: 'Quick buy (open order ticket)' },
      { keys: ['⇧', 'S'], label: 'Quick sell (open order ticket)' },
    ],
  },
  {
    title: 'Tables',
    items: [
      { keys: ['J'],         label: 'Move row selection down' },
      { keys: ['K'],         label: 'Move row selection up' },
      { keys: ['↑'],         label: 'Move row selection up' },
      { keys: ['↓'],         label: 'Move row selection down' },
      { keys: ['Enter'],     label: 'Open the focused row' },
      { keys: ['Home'],      label: 'Jump to first row' },
      { keys: ['End'],       label: 'Jump to last row' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['G', 'W'], label: 'Go to Workspace' },
      { keys: ['G', 'P'], label: 'Go to Positions' },
      { keys: ['G', 'O'], label: 'Go to Orders' },
      { keys: ['G', 'S'], label: 'Go to Strategies' },
      { keys: ['G', 'A'], label: 'Go to Alerts' },
      { keys: ['G', 'R'], label: 'Go to Risk' },
      { keys: ['G', 'T'], label: 'Go to Trade' },
      { keys: ['G', 'C'], label: 'Go to Screener' },
    ],
  },
  {
    title: 'Symbol',
    items: [
      { keys: ['Click'],            label: 'Load symbol from watchlist / ticker' },
      { keys: ['Right-click'],      label: 'Open symbol context menu' },
      { keys: ['Middle-click'],     label: 'Remove symbol from watchlist row' },
    ],
  },
]

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-white/[0.05] border border-white/[0.08] rounded text-2xs font-mono text-ink-2">
      {children}
    </kbd>
  )
}

export default function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    function onOpen() { setOpen(true) }
    function onKey(e) {
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('shortcut-help:open', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('shortcut-help:open', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!q) return GROUPS
    const n = q.toLowerCase()
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => it.label.toLowerCase().includes(n) || it.keys.join(' ').toLowerCase().includes(n)),
    })).filter((g) => g.items.length)
  }, [q])

  if (!open) return null
  return (
    <>
      <div onClick={() => setOpen(false)} className="fixed inset-0 bg-surf-0/70 backdrop-blur-sm z-50" />
      <div className="fixed left-1/2 top-[14%] -translate-x-1/2 w-[560px] max-w-[92vw] z-50 card-surface overflow-hidden"
        style={{ animation: 'cmdk-in 140ms ease-out' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Keyboard size={14} className="text-accent" />
          <span className="text-2xs uppercase tracking-[0.16em] font-semibold text-ink-2">Keyboard Shortcuts</span>
          <button onClick={() => setOpen(false)}
            className="ml-auto w-7 h-7 rounded-md hover:bg-white/[0.06] text-ink-3 hover:text-ink-1 flex items-center justify-center transition">
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-white/[0.06]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter shortcuts…"
            className="w-full bg-white/[0.04] border border-white/[0.06] focus:border-accent/40 rounded-lg px-3 py-1.5 text-xs outline-none"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3 grid grid-cols-2 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-2 text-center text-ink-4 text-sm py-6">No shortcuts match "{q}"</div>
          )}
          {filtered.map((g) => (
            <div key={g.title}>
              <div className="text-2xs uppercase tracking-[0.16em] text-ink-5 font-medium mb-2 px-1">{g.title}</div>
              <div className="space-y-1">
                {g.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/[0.03]">
                    <span className="text-xs text-ink-2">{it.label}</span>
                    <span className="flex items-center gap-1">
                      {it.keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
