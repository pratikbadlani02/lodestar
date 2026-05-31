import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Clock, ArrowUpRight, ArrowDownRight, Sun, Moon, Rows3, Rows2, Rows4, Menu } from 'lucide-react'
import { useSymbol } from '../lib/SymbolContext'
import { useTheme } from '../lib/ThemeContext'
import { useDensity } from '../lib/DensityContext'
import { api } from '../lib/api'
import { fmt, fmtSigned, fmtSignedPct } from './ui/format'
import { searchSymbols, nameFor, typeLabel } from '../lib/symbolDirectory'

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOutside])
}

export default function TopBar({ onMenuOpen }) {
  const navigate = useNavigate()
  const { symbol, setSymbol, recents, removeRecent } = useSymbol()
  const { theme, toggle: toggleTheme } = useTheme()
  const { density, cycle: cycleDensity } = useDensity()
  const [input, setInput] = useState('')
  const [snap, setSnap] = useState(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)   // highlighted suggestion index
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false))

  // Live suggestions: directory search (ticker OR company name) when typing,
  // boosted by recents; recents list when the box is empty.
  const suggestions = useMemo(() => {
    if (input.trim()) {
      return searchSymbols(input, 8, recents).map((d) => ({ s: d.s, n: d.n, t: d.t }))
    }
    return (recents || []).slice(0, 8).map((s) => ({ s, n: nameFor(s) || '', t: null }))
  }, [input, recents])

  useEffect(() => { setHi(0) }, [input])

  useEffect(() => {
    let cancelled = false
    let timer = null
    async function poll() {
      try {
        const r = await api.getSnapshots(symbol)
        if (cancelled) return
        const s = r?.snapshots?.[symbol]
        if (!s) { setSnap(null); return }
        const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
        const prev = s.prevDailyBar?.c
        setSnap({
          last,
          prev,
          change: last && prev ? last - prev : null,
          changePct: last && prev ? ((last - prev) / prev) * 100 : null,
        })
      } catch {
        if (!cancelled) setSnap(null)
      }
    }
    poll()
    timer = setInterval(poll, 15000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [symbol])

  function commit(s) {
    const next = String(s || input).toUpperCase().trim()
    if (!next) return
    setSymbol(next)
    setInput('')
    setOpen(false)
    const pathName = window.location.pathname
    const prefixes = ['/analysis', '/options', '/fundamentals',
                      '/tape', '/dividends', '/insiders', '/workspace']
    const matched = prefixes.find((p) => pathName === p || pathName.startsWith(`${p}/`))
    if (matched) {
      navigate(`${matched}/${next}`)
    } else if (pathName === '/stocks' || pathName.startsWith('/stocks')) {
      // Stocks is a single-screen SPA driven by SymbolContext — keep the user
      // on the page and just reflect the new symbol in the URL.
      navigate(`/stocks?symbol=${next}`)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    // Prefer the highlighted suggestion; otherwise commit the raw input.
    commit(suggestions[hi]?.s || input)
  }

  function onSearchKeyDown(e) {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)) }
  }

  const up = (snap?.change ?? 0) >= 0

  return (
    <div className="h-14 glass flex items-center gap-2 md:gap-3 px-2 md:px-4 shrink-0 sticky top-0 z-30">
      {/* Hamburger — mobile only */}
      {onMenuOpen && (
        <button
          onClick={onMenuOpen}
          aria-label="Open navigation"
          className="md:hidden w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-ink-2 flex items-center justify-center shrink-0"
        >
          <Menu size={16} />
        </button>
      )}
      {/* Symbol search */}
      <div ref={wrapRef} className="relative">
        <form onSubmit={onSubmit}
          className="group flex items-center bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] focus-within:border-accent/50 focus-within:bg-white/[0.06] rounded-lg pl-2.5 pr-3 py-1.5 gap-2 transition-all">
          <Search size={13} className="text-ink-4 group-focus-within:text-accent transition-colors" />
          <input
            value={input}
            onFocus={() => setOpen(true)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search symbol or company…"
            className="bg-transparent outline-none text-xs font-mono uppercase w-20 sm:w-40 placeholder:text-ink-5 placeholder:normal-case placeholder:font-sans tracking-wide"
          />
          <kbd className="hidden sm:inline-block text-[10px] text-ink-5 bg-white/[0.04] border border-white/[0.06] rounded px-1 py-0.5 font-mono">⏎</kbd>
        </form>
        {open && suggestions.length > 0 && (
          <div className="absolute top-full mt-2 left-0 w-80 max-w-[88vw] card-surface shadow-2xl z-40 max-h-96 overflow-y-auto p-1">
            {!input.trim() && (
              <div className="px-2 py-1.5 text-2xs uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
                <Clock size={10} /> Recent
              </div>
            )}
            {suggestions.map((it, i) => {
              const isRecent = !input.trim()
              return (
                <div
                  key={it.s}
                  onMouseEnter={() => setHi(i)}
                  className={`group flex items-center rounded-md transition-colors ${i === hi ? 'bg-accent/10' : 'hover:bg-white/[0.04]'}`}
                >
                  <button onClick={() => commit(it.s)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left px-2.5 py-1.5">
                    <span className="font-mono font-semibold text-xs text-ink-1 shrink-0 w-16 truncate">{it.s}</span>
                    {it.n && <span className="text-2xs text-ink-3 truncate flex-1">{it.n}</span>}
                    {it.t && <span className="text-[10px] text-ink-5 uppercase tracking-wider shrink-0">{typeLabel(it.t)}</span>}
                  </button>
                  {isRecent && (
                    <button
                      onClick={() => removeRecent(it.s)}
                      className="px-2 opacity-0 group-hover:opacity-100 text-ink-4 hover:text-down transition"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
            {input.trim() && (
              <div className="px-2.5 py-1.5 mt-0.5 border-t border-white/[0.06] text-2xs text-ink-5">
                Press <kbd className="font-mono text-ink-4">⏎</kbd> to open {suggestions[hi]?.s || input.toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active symbol chip + price — visually grouped */}
      <button
        onClick={() => navigate(`/analysis/${symbol}`)}
        className="group hidden sm:flex items-baseline gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition"
        title="Open analysis"
      >
        <span className="font-display font-semibold text-sm text-ink-1 group-hover:text-brand transition-colors">{symbol}</span>
        {snap?.last != null && (
          <>
            <span className="font-mono tabular text-sm font-semibold text-ink-1">${fmt(snap.last)}</span>
            {snap.change != null && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-mono tabular ${up ? 'text-up' : 'text-down'}`}>
                {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {fmtSignedPct(snap.changePct)}
              </span>
            )}
          </>
        )}
      </button>

      {/* Quick jump links */}
      <div className="ml-auto hidden md:flex items-center gap-0.5 bg-white/[0.025] border border-white/[0.06] rounded-lg p-0.5">
        {[
          ['Analysis', `/analysis/${symbol}`],
          ['Options',  `/options/${symbol}`],
          ['Tape',     `/tape/${symbol}`],
          ['Stocks',   `/stocks`],
          ['Earnings', `/earnings`],
        ].map(([label, to]) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="text-2xs uppercase tracking-[0.12em] font-medium text-ink-3 hover:text-ink-1 hover:bg-white/[0.06] px-2.5 py-1 rounded-md transition"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Buy / Sell quick-trigger */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
          title="Buy (⇧B)"
          className="h-9 px-3 rounded-lg bg-up/10 border border-up/30 hover:bg-up/20 text-up text-xs font-bold uppercase tracking-wider transition"
        >
          Buy
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } }))}
          title="Sell (⇧S)"
          className="h-9 px-3 rounded-lg bg-down/10 border border-down/30 hover:bg-down/20 text-down text-xs font-bold uppercase tracking-wider transition"
        >
          Sell
        </button>
      </div>

      {/* Density toggle — cycle compact / cozy / comfortable */}
      <button
        onClick={cycleDensity}
        title={`Density: ${density} (click to cycle)`}
        className="ml-auto md:ml-0 w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-accent/15 border border-white/[0.06] hover:border-accent/30 text-ink-3 hover:text-accent flex items-center justify-center transition shrink-0"
      >
        {density === 'compact'
          ? <Rows4 size={14} />
          : density === 'comfortable'
            ? <Rows2 size={14} />
            : <Rows3 size={14} />}
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-accent/15 border border-white/[0.06] hover:border-accent/30 text-ink-3 hover:text-accent flex items-center justify-center transition"
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </div>
  )
}
