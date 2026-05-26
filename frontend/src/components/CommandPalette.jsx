// Command palette — ⌘K / Ctrl+K opens a fuzzy finder over symbols, pages,
// and actions. Single keyboard-driven entry point for everything.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ArrowRight, TrendingUp, Gauge, Layers, Radio, Activity,
  Briefcase, ListOrdered, Bell, Settings, Sun, Moon, LogOut, Zap, Bot,
  BarChart3, Calendar, LayoutGrid, GitCompare, Building2, Users, Newspaper,
  Bitcoin, Coins, Sparkles, Filter, Shield, ShieldAlert, FlaskConical, Star,
} from 'lucide-react'
import { useSymbol } from '../lib/SymbolContext'
import { useTheme } from '../lib/ThemeContext'
import { api } from '../lib/api'

const ROUTES = [
  { label: 'Workspace',       path: '/',              icon: LayoutGrid, kw: 'home dashboard' },
  { label: 'Stocks',          path: '/stocks',        icon: TrendingUp, kw: 'quote chart' },
  { label: 'Analysis',        path: '/analysis',      icon: Gauge,      kw: 'score factor' },
  { label: 'Options Chain',   path: '/options',       icon: Layers,     kw: 'call put' },
  { label: 'Fundamentals',    path: '/fundamentals',  icon: Building2,  kw: 'financials' },
  { label: 'Earnings',        path: '/earnings',      icon: Calendar,   kw: 'eps reports' },
  { label: 'Dividends',       path: '/dividends',     icon: Coins,      kw: 'yield payout' },
  { label: 'Insiders',        path: '/insiders',      icon: Users,      kw: 'institutional holders' },
  { label: 'Compare',         path: '/compare',       icon: GitCompare, kw: 'side-by-side' },
  { label: 'Heatmap',         path: '/heatmap',       icon: LayoutGrid, kw: 'sector market' },
  { label: 'Movers',          path: '/movers',        icon: Activity,   kw: 'gainers losers' },
  { label: 'Time & Sales',    path: '/tape',          icon: Radio,      kw: 'prints tape level' },
  { label: 'Crypto',          path: '/crypto',        icon: Bitcoin,    kw: 'btc eth' },
  { label: 'Trade',           path: '/trade',         icon: Zap,        kw: 'live order' },
  { label: 'Paper Trade',     path: '/paper',         icon: FlaskConical, kw: 'sim paper' },
  { label: 'Watchlists',      path: '/watchlists',    icon: Star,       kw: 'lists' },
  { label: 'Screener',        path: '/screener',      icon: Filter,     kw: 'screen filter' },
  { label: 'Market News',     path: '/market',        icon: Newspaper,  kw: 'headlines' },
  { label: 'Strategies',      path: '/strategies',    icon: Bot,        kw: 'algo signal' },
  { label: 'Backtests',       path: '/backtests',     icon: BarChart3,  kw: 'backtest history' },
  { label: 'Optimizer',       path: '/optimizer',     icon: Sparkles,   kw: 'tune grid search' },
  { label: 'Orders',          path: '/orders',        icon: ListOrdered, kw: 'fills cancel' },
  { label: 'Positions',       path: '/positions',     icon: Briefcase,  kw: 'holdings pnl' },
  { label: 'Risk Analytics',  path: '/risk',          icon: Shield,     kw: 'drawdown var' },
  { label: 'Alerts',          path: '/alerts',        icon: Bell,       kw: 'notification' },
  { label: 'Price Alerts',    path: '/price-alerts',  icon: Bell,       kw: 'threshold' },
  { label: 'Audit Log',       path: '/audit',         icon: ShieldAlert, kw: 'history activity' },
  { label: 'Settings',        path: '/settings',      icon: Settings,   kw: 'config preferences' },
]

function fuzzy(needle, hay) {
  if (!needle) return 0
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  if (h === n) return 1000
  if (h.startsWith(n)) return 500
  const idx = h.indexOf(n)
  if (idx >= 0) return 200 - idx
  // Character-by-character subsequence match
  let hi = 0, score = 0
  for (let ni = 0; ni < n.length; ni++) {
    const next = h.indexOf(n[ni], hi)
    if (next === -1) return 0
    score += 10 - Math.min(10, next - hi)
    hi = next + 1
  }
  return score
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const { symbol, setSymbol, recents } = useSymbol()
  const { theme, toggle: toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [railSymbols, setRailSymbols] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Open via keyboard
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        setQ('')
        setActive(0)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      try { setRailSymbols(JSON.parse(localStorage.getItem('quant_railwatch_v1') || '[]')) } catch {}
      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Build result set
  const results = useMemo(() => {
    const sections = []
    const isTicker = /^[A-Za-z]{1,6}([.\-/][A-Za-z]{1,6})?$/.test(q.trim())

    // Symbols section
    const symPool = Array.from(new Set([...(recents || []), ...railSymbols]))
    const symMatches = symPool
      .map((s) => ({ s, score: fuzzy(q, s) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => ({ kind: 'symbol', value: x.s, label: x.s }))
    // If literal ticker not in pool, add it as a "Go to" entry
    if (isTicker && !symPool.includes(q.trim().toUpperCase())) {
      symMatches.unshift({ kind: 'symbol', value: q.trim().toUpperCase(), label: q.trim().toUpperCase(), hint: 'open analysis' })
    }
    if (symMatches.length) sections.push({ title: 'Symbols', items: symMatches })

    // Pages section
    const pageMatches = ROUTES
      .map((r) => ({ r, score: Math.max(fuzzy(q, r.label), fuzzy(q, r.kw) - 50, fuzzy(q, r.path) - 80) }))
      .filter((x) => !q || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? 8 : 12)
      .map((x) => ({ kind: 'page', value: x.r.path, label: x.r.label, icon: x.r.icon }))
    if (pageMatches.length) sections.push({ title: 'Pages', items: pageMatches })

    // Actions section
    const actionList = [
      { id: 'buy',  label: `Buy ${symbol}`,  icon: TrendingUp },
      { id: 'sell', label: `Sell ${symbol}`, icon: TrendingUp },
      { id: 'theme', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? Sun : Moon },
      { id: 'logout', label: 'Log out', icon: LogOut },
    ]
    const actionMatches = actionList
      .map((a) => ({ a, score: q ? fuzzy(q, a.label) : 1 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, q ? 4 : 4)
      .map((x) => ({ kind: 'action', value: x.a.id, label: x.a.label, icon: x.a.icon }))
    if (actionMatches.length) sections.push({ title: 'Actions', items: actionMatches })

    return sections
  }, [q, recents, railSymbols, symbol, theme])

  // Flat list for keyboard navigation
  const flat = useMemo(() => results.flatMap((s) => s.items), [results])
  useEffect(() => { setActive(0) }, [q])

  function commit(item) {
    if (!item) return
    setOpen(false)
    if (item.kind === 'symbol') {
      setSymbol(item.value)
      navigate(`/analysis/${item.value}`)
    } else if (item.kind === 'page') {
      navigate(item.value)
    } else if (item.kind === 'action') {
      if (item.value === 'buy')    window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))
      else if (item.value === 'sell') window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } }))
      else if (item.value === 'theme') toggleTheme()
      else if (item.value === 'logout') { api.logout(); navigate('/login') }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); commit(flat[active]) }
  }

  // Scroll active into view
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  let cursor = 0
  return (
    <>
      <div onClick={() => setOpen(false)} className="fixed inset-0 bg-surf-0/70 backdrop-blur-sm z-50" />
      <div
        className="fixed left-1/2 top-[18%] -translate-x-1/2 w-[640px] max-w-[92vw] z-50 card-surface overflow-hidden"
        style={{ animation: 'cmdk-in 140ms ease-out' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search size={16} className="text-ink-4" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search symbols, pages, actions…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-5"
          />
          <kbd className="text-2xs text-ink-4 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 font-mono">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <div className="text-center text-ink-4 text-sm py-10">
              No matches for <span className="font-mono text-ink-2">"{q}"</span>
            </div>
          )}
          {results.map((section) => (
            <div key={section.title} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-2xs uppercase tracking-[0.16em] text-ink-5 font-medium">{section.title}</div>
              {section.items.map((it) => {
                const idx = cursor++
                const sel = idx === active
                const Icon = it.icon
                return (
                  <button
                    key={`${it.kind}-${it.value}`}
                    data-idx={idx}
                    onClick={() => commit(it)}
                    onMouseEnter={() => setActive(idx)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition ${
                      sel ? 'bg-accent/[0.10] text-ink-1' : 'text-ink-2 hover:bg-white/[0.03]'
                    }`}
                  >
                    {it.kind === 'symbol' && (
                      <span className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center text-2xs font-mono font-bold">$</span>
                    )}
                    {Icon && it.kind !== 'symbol' && <Icon size={14} className={sel ? 'text-accent' : 'text-ink-4'} />}
                    <span className={it.kind === 'symbol' ? 'font-mono font-semibold' : ''}>{it.label}</span>
                    {it.hint && <span className="text-2xs text-ink-4 ml-1">{it.hint}</span>}
                    {sel && <ArrowRight size={12} className="ml-auto text-accent" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-white/[0.06] text-2xs text-ink-4">
          <span><kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">↵</kbd> select</span>
          <span className="ml-auto"><kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">⌘K</kbd> toggle</span>
        </div>
      </div>
      <style>{`@keyframes cmdk-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </>
  )
}
