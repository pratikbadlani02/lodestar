// Shared symbol header for research pages. Provides a consistent context
// strip: ticker, name, sector, live price, signed change, 30d sparkline,
// and quick action chips. Always reads from SymbolContext so all research
// pages stay in sync when the user changes symbol via TopBar / WatchRail.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Plus, Gauge, Layers, Building2, Radio, Coins, Users,
  GitCompare, Bell, LineChart,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import { fmt, fmtSigned, fmtSignedPct, fmtBig } from './ui/format'
import { MiniEquityCurve, PnlCell } from './ui/charts'
import { Card } from './ui/primitives'

const RAIL_KEY = 'quant_railwatch_v1'

// Tiny in-memory + localStorage cache so navigating between research pages
// doesn't reflood the API. Keyed by symbol.
const cache = new Map()
function readCache(sym) {
  const x = cache.get(sym)
  if (x && Date.now() - x.ts < 60_000) return x
  return null
}
function writeCache(sym, payload) {
  cache.set(sym, { ts: Date.now(), ...payload })
}

export default function SymbolHeader({ activePage }) {
  const { symbol, setSymbol } = useSymbol()
  const navigate = useNavigate()
  const [snap, setSnap] = useState(null)
  const [profile, setProfile] = useState(null)
  const [spark, setSpark] = useState([])
  const [inWatchlist, setInWatchlist] = useState(false)

  // Load + poll
  useEffect(() => {
    let cancelled = false
    setSnap(null)
    const cached = readCache(symbol)
    if (cached?.profile) setProfile(cached.profile)
    if (cached?.spark) setSpark(cached.spark)

    async function tick() {
      try {
        const r = await api.getSnapshots(symbol)
        if (cancelled) return
        const s = r?.snapshots?.[symbol]
        if (!s) { setSnap(null); return }
        const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
        const prev = s.prevDailyBar?.c
        const ts = s.dailyBar?.t || s.minuteBar?.t
        setSnap({
          last, prev,
          change: last && prev ? last - prev : null,
          changePct: last && prev ? ((last - prev) / prev) * 100 : null,
          volume: s.dailyBar?.v,
          high: s.dailyBar?.h, low: s.dailyBar?.l, open: s.dailyBar?.o,
          ts,
        })
      } catch {}
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Profile + sparkline — one-shot per symbol (cached)
  useEffect(() => {
    let cancelled = false
    const cached = readCache(symbol)
    if (cached?.profile && cached?.spark) return

    Promise.all([
      api.getProfile(symbol).catch(() => null),
      api.getOhlcv(symbol, 30, '1d').catch(() => null),
    ]).then(([p, ohlcv]) => {
      if (cancelled) return
      const sparkVals = (ohlcv?.bars || []).map((b) => Number(b.c)).filter(Number.isFinite)
      setProfile(p)
      setSpark(sparkVals)
      writeCache(symbol, { profile: p, spark: sparkVals })
    })
    return () => { cancelled = true }
  }, [symbol])

  // Is the active symbol in the watchlist?
  useEffect(() => {
    function check() {
      try {
        const list = JSON.parse(localStorage.getItem(RAIL_KEY) || '[]')
        setInWatchlist(Array.isArray(list) && list.includes(symbol))
      } catch { setInWatchlist(false) }
    }
    check()
    window.addEventListener('storage', check)
    return () => window.removeEventListener('storage', check)
  }, [symbol])

  function toggleWatchlist() {
    try {
      const list = JSON.parse(localStorage.getItem(RAIL_KEY) || '[]')
      const arr = Array.isArray(list) ? list : []
      const next = arr.includes(symbol) ? arr.filter((s) => s !== symbol) : [...arr, symbol]
      localStorage.setItem(RAIL_KEY, JSON.stringify(next))
      setInWatchlist(next.includes(symbol))
      window.dispatchEvent(new StorageEvent('storage', { key: RAIL_KEY, newValue: JSON.stringify(next) }))
    } catch {}
  }

  function fireBuy()  { window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy'  } })) }
  function fireSell() { window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } })) }

  const up = (snap?.change ?? 0) >= 0
  // Research views are embedded as tabs inside the Stocks page (no deep-linking
  // to standalone routes). Each chip swaps the active tab via the URL query.
  const RESEARCH_LINKS = [
    { id: 'overview',     label: 'Overview',     icon: LineChart,   to: `/stocks?symbol=${symbol}` },
    { id: 'analysis',     label: 'Analysis',     icon: Gauge,       to: `/stocks?symbol=${symbol}&tab=analysis` },
    { id: 'fundamentals', label: 'Fundamentals', icon: Building2,   to: `/stocks?symbol=${symbol}&tab=fundamentals` },
    { id: 'options',      label: 'Options',      icon: Layers,      to: `/stocks?symbol=${symbol}&tab=options` },
    { id: 'dividends',    label: 'Dividends',    icon: Coins,       to: `/stocks?symbol=${symbol}&tab=dividends` },
    { id: 'insiders',     label: 'Insiders',     icon: Users,       to: `/stocks?symbol=${symbol}&tab=insiders` },
    { id: 'tape',         label: 'Time & Sales', icon: Radio,       to: `/stocks?symbol=${symbol}&tab=tape` },
    { id: 'compare',      label: 'Compare',      icon: GitCompare,  to: `/compare?symbols=${symbol}` },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex flex-wrap items-start gap-4">
        {/* Symbol + price */}
        <div className="min-w-0 flex-shrink-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-display font-bold tracking-tight text-ink-1">{symbol}</span>
            {profile?.longName && (
              <span className="text-sm text-ink-3 max-w-[220px] truncate" title={profile.longName}>
                {profile.longName}
              </span>
            )}
          </div>
          {profile?.sector && (
            <div className="text-2xs text-ink-4 mt-0.5 flex items-center gap-1.5">
              <span>{profile.sector}</span>
              {profile.industry && <><span className="text-ink-5">·</span><span>{profile.industry}</span></>}
            </div>
          )}
        </div>

        {/* Price + change */}
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-mono tabular font-bold text-ink-1">
            {snap?.last != null ? `$${fmt(snap.last)}` : '—'}
          </span>
          {snap?.change != null && (
            <span className={`inline-flex items-baseline gap-1 font-mono tabular text-sm font-semibold ${up ? 'text-up' : 'text-down'}`}>
              {up ? <TrendingUp size={12} className="self-center" /> : <TrendingDown size={12} className="self-center" />}
              {fmtSigned(snap.change)}
              <span className="text-xs opacity-90">({fmtSignedPct(snap.changePct)})</span>
            </span>
          )}
        </div>

        {/* Sparkline */}
        {spark.length > 1 && (
          <div className="w-32 shrink-0 self-center">
            <div className="text-2xs uppercase tracking-wider text-ink-5 mb-0.5">30d</div>
            <MiniEquityCurve values={spark} height={32} />
          </div>
        )}

        {/* Stat strip (open/high/low/vol) */}
        {snap && (
          <div className="hidden lg:flex items-center gap-4 text-2xs font-mono tabular text-ink-3 self-center pl-4 border-l border-white/[0.06]">
            <div><span className="text-ink-5">O </span>{snap.open != null ? fmt(snap.open) : '—'}</div>
            <div><span className="text-ink-5">H </span>{snap.high != null ? fmt(snap.high) : '—'}</div>
            <div><span className="text-ink-5">L </span>{snap.low != null ? fmt(snap.low) : '—'}</div>
            <div><span className="text-ink-5">V </span>{snap.volume != null ? fmtBig(snap.volume) : '—'}</div>
          </div>
        )}

        {/* Right cluster: quick actions */}
        <div className="ml-auto flex items-center gap-1.5 self-start">
          <button
            onClick={fireBuy}
            className="px-2.5 py-1.5 rounded-lg bg-up/10 hover:bg-up/20 border border-up/30 text-up text-2xs font-bold uppercase tracking-wider transition"
            title="Buy (⇧B)"
          >Buy</button>
          <button
            onClick={fireSell}
            className="px-2.5 py-1.5 rounded-lg bg-down/10 hover:bg-down/20 border border-down/30 text-down text-2xs font-bold uppercase tracking-wider transition"
            title="Sell (⇧S)"
          >Sell</button>
          <button
            onClick={toggleWatchlist}
            className={`px-2.5 py-1.5 rounded-lg border text-2xs font-medium uppercase tracking-wider transition flex items-center gap-1 ${
              inWatchlist
                ? 'bg-accent/15 border-accent/30 text-accent'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-ink-3 hover:text-ink-1'
            }`}
            title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Plus size={11} className={inWatchlist ? 'rotate-45 transition-transform' : ''} />
            {inWatchlist ? 'Watched' : 'Watch'}
          </button>
          <button
            onClick={() => navigate('/price-alerts')}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-ink-3 hover:text-warn transition"
            title="Set price alert"
          >
            <Bell size={12} />
          </button>
        </div>
      </div>

      {/* Cross-research tabs */}
      <div className="px-4 -mb-px border-t border-white/[0.04] flex items-center gap-0.5 overflow-x-auto">
        {RESEARCH_LINKS.map(({ id, label, icon: Icon, to }) => {
          const active = activePage === id
          return (
            <button
              key={id}
              onClick={() => navigate(to)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-2xs uppercase tracking-[0.14em] font-medium transition whitespace-nowrap ${
                active ? 'text-ink-1' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              <Icon size={11} className={active ? 'text-accent' : ''} />
              {label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-grad rounded-full" />}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
