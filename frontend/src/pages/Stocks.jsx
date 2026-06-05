import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity, Newspaper, Briefcase, ListOrdered, Clock, RefreshCw, Plus, X,
  BarChart3, Info,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import ChartWidget from '../components/ChartWidget'
import SymbolHeader from '../components/SymbolHeader'
import { Card, SectionHeader, Sparkline } from '../components/ui/primitives'
import { PnlCell } from '../components/ui/charts'
import { fmt, fmtBig, fmtNum, fmtPct, fmtSignedPct, activeCurrency } from '../components/ui/format'
import EmptyState from '../components/ui/EmptyState'

// Research views embedded as tabs (lazy so they don't bloat the Stocks chunk).
const Analysis     = lazy(() => import('./Analysis'))
const Fundamentals = lazy(() => import('./Fundamentals'))
const Options      = lazy(() => import('./Options'))
const Dividends    = lazy(() => import('./Dividends'))
const Insiders     = lazy(() => import('./Insiders'))
const Tape         = lazy(() => import('./Tape'))

const RESEARCH_TABS = {
  analysis: Analysis, fundamentals: Fundamentals, options: Options,
  dividends: Dividends, insiders: Insiders, tape: Tape,
}

// ── Local formatters ────────────────────────────────────────────
const fmtP = (n) => (n == null ? '—' : `${activeCurrency()}${Number(n).toFixed(2)}`)
const fmtVol = (v) => {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}
const fmtAgo = (ts) => {
  if (!ts) return '—'
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Shared with the global WatchRail so both stay in sync.
const STORAGE_KEY = 'quant_railwatch_v1'
const DEFAULT_LIST = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ']
function loadSymbols() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (Array.isArray(s) && s.length) return s
  } catch {}
  return DEFAULT_LIST
}
function persistSymbols(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) } catch {}
}

// ── In-page watchlist panel ─────────────────────────────────────
function Watchlist({ active, onSelect }) {
  const [symbols, setSymbols] = useState(loadSymbols)
  const [quotes, setQuotes] = useState({})
  const [sparks, setSparks] = useState({})
  const [adding, setAdding] = useState(false)
  const [newSym, setNewSym] = useState('')
  const ctx = useSymbolContextMenu({ onRemove: (s) => removeSymbol(s) })

  // Poll snapshots
  useEffect(() => {
    let cancelled = false, timer
    async function poll() {
      if (!symbols.length) return
      try {
        const r = await api.getSnapshots(symbols.join(','))
        if (!cancelled) setQuotes(r?.snapshots || {})
      } catch {}
    }
    poll(); timer = setInterval(poll, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [symbols])

  // Sparklines once per symbol set
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const updates = {}
      await Promise.all(symbols.map(async (s) => {
        if (sparks[s]) return
        try {
          const r = await api.getOhlcv(s, 30, '1d')
          if (!cancelled) updates[s] = (r?.bars || []).map((b) => Number(b.c)).filter(Number.isFinite)
        } catch {}
      }))
      if (!cancelled && Object.keys(updates).length) setSparks((p) => ({ ...p, ...updates }))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')])

  function quoteFor(sym) {
    const s = quotes[sym]
    if (!s) return null
    const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
    const prev = s.prevDailyBar?.c
    return { last, changePct: last && prev ? ((last - prev) / prev) * 100 : null }
  }
  function addSymbol() {
    const s = newSym.trim().toUpperCase()
    setAdding(false); setNewSym('')
    if (!s || symbols.includes(s)) { if (s) onSelect(s); return }
    const next = [...symbols, s]
    setSymbols(next); persistSymbols(next); onSelect(s)
  }
  function removeSymbol(s) {
    const next = symbols.filter((x) => x !== s)
    setSymbols(next); persistSymbols(next)
  }

  return (
    <Card className="w-full lg:w-60 lg:shrink-0 flex flex-col lg:max-h-[calc(100vh-7rem)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-2xs uppercase tracking-[0.16em] font-semibold text-ink-3">Watchlist</span>
        <button
          onClick={() => setAdding((v) => !v)}
          title="Add symbol"
          className="w-6 h-6 rounded hover:bg-accent/15 text-ink-4 hover:text-accent flex items-center justify-center transition"
        >
          <Plus size={13} />
        </button>
      </div>

      {adding && (
        <div className="p-2 border-b border-white/[0.06] flex gap-1">
          <input
            autoFocus
            value={newSym}
            onChange={(e) => setNewSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSymbol()
              if (e.key === 'Escape') { setAdding(false); setNewSym('') }
            }}
            placeholder="TICKER"
            className="flex-1 min-w-0 bg-accent/[0.06] border border-accent/40 rounded-md px-2 py-1 text-xs font-mono uppercase outline-none"
          />
          <button onClick={addSymbol} className="bg-accent text-[#fff] text-xs font-medium rounded-md px-2">Add</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1 grid grid-cols-2 lg:grid-cols-1 gap-x-1">
        {symbols.map((s) => {
          const q = quoteFor(s)
          const up = (q?.changePct ?? 0) >= 0
          const isActive = s === active
          const spark = sparks[s]
          return (
            <div
              key={s}
              onClick={() => onSelect(s)}
              onContextMenu={(e) => ctx.onContextMenu(e, s)}
              className={`group relative cursor-pointer transition-colors border-l-2 px-2.5 py-2 ${
                isActive ? 'border-l-accent bg-accent/[0.08]' : 'border-l-transparent hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono font-semibold text-xs ${isActive ? 'text-accent' : 'text-ink-1'}`}>{s}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSymbol(s) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-5 hover:text-down transition"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono tabular text-2xs text-ink-2">{q?.last != null ? fmt(q.last) : '—'}</span>
                <span className={`font-mono tabular text-2xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
                  {q?.changePct != null ? fmtSignedPct(q.changePct, 2) : '—'}
                </span>
              </div>
              {spark && spark.length > 1 && (
                <div className="mt-1 hidden lg:block"><Sparkline values={spark} width={200} height={20} /></div>
              )}
            </div>
          )
        })}
        {symbols.length === 0 && (
          <div className="text-2xs text-ink-4 px-3 py-6 text-center col-span-2">Empty. Click + to add.</div>
        )}
      </div>
      {ctx.menu}
    </Card>
  )
}

// ── Stat row ────────────────────────────────────────────────────
function StatRow({ label, value, cls }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-2xs uppercase tracking-wider text-ink-4">{label}</span>
      <span className={`text-xs font-mono tabular font-semibold ${cls || 'text-ink-1'}`}>{value}</span>
    </div>
  )
}

// ── Quote panel ─────────────────────────────────────────────────
function QuotePanel({ snap }) {
  if (!snap) {
    return <Card className="p-6 flex items-center justify-center text-ink-4 text-sm soft-pulse">Loading quote…</Card>
  }
  const { price, prevClose, change, changePct, open, high, low, volume, bid, ask } = snap
  const spread = bid != null && ask != null ? ask - bid : null
  const dayRange = high != null && low != null ? high - low : null
  const rangePos = (price != null && high != null && low != null && high !== low)
    ? Math.round(((price - low) / (high - low)) * 100) : null
  return (
    <Card>
      <SectionHeader icon={Activity} title="Real-time Quote" />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/[0.025] border border-up/15 rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Bid</div>
            <div className="text-sm font-mono tabular font-bold text-up mt-1">{fmtP(bid)}</div>
          </div>
          <div className="bg-white/[0.025] border border-down/15 rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Ask</div>
            <div className="text-sm font-mono tabular font-bold text-down mt-1">{fmtP(ask)}</div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Spread</div>
            <div className="text-sm font-mono tabular font-bold text-ink-1 mt-1">{spread != null ? `${activeCurrency()}${spread.toFixed(3)}` : '—'}</div>
          </div>
        </div>
        <div className="bg-surf-2/40 rounded-lg px-3 py-2">
          <div className="text-2xs uppercase tracking-wider text-ink-4 mb-1">Today's Candle</div>
          <StatRow label="Open" value={fmtP(open)} />
          <StatRow label="High" value={fmtP(high)} cls="text-up" />
          <StatRow label="Low" value={fmtP(low)} cls="text-down" />
          <StatRow label="Last" value={fmtP(price)} />
          <StatRow label="Prev Close" value={fmtP(prevClose)} />
          <StatRow
            label="Change"
            value={change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct?.toFixed(2)}%)` : '—'}
            cls={change != null ? (change >= 0 ? 'text-up' : 'text-down') : ''}
          />
          <StatRow label="Range (H-L)" value={dayRange != null ? `${activeCurrency()}${dayRange.toFixed(2)}` : '—'} />
          <StatRow label="Volume" value={fmtVol(volume)} />
        </div>
        {rangePos != null && (
          <div>
            <div className="flex justify-between text-2xs font-mono tabular text-ink-4 mb-1">
              <span className="text-down">{fmtP(low)}</span><span>day range</span><span className="text-up">{fmtP(high)}</span>
            </div>
            <div className="relative h-1.5 bg-surf-2 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-down via-warn to-up rounded-full opacity-50" style={{ width: '100%' }} />
              <div className="absolute -top-1 w-1 h-3.5 bg-accent rounded-full shadow-glow-accent" style={{ left: `calc(${rangePos}% - 2px)` }} title={`${rangePos}% of range`} />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Key statistics (from yfinance profile) ──────────────────────
function KeyStats({ profile, last }) {
  if (!profile) {
    return (
      <Card>
        <SectionHeader icon={Info} title="Key Statistics" />
        <div className="p-6 text-center text-2xs text-ink-4">No fundamentals for this symbol.</div>
      </Card>
    )
  }
  const hi = profile.fiftyTwoWeekHigh, lo = profile.fiftyTwoWeekLow
  const pos = (last != null && hi != null && lo != null && hi !== lo)
    ? Math.max(0, Math.min(100, Math.round(((last - lo) / (hi - lo)) * 100))) : null
  const stats = [
    ['Mkt Cap', fmtBig(profile.marketCap)],
    ['P/E TTM', fmtNum(profile.trailingPE)],
    ['Fwd P/E', fmtNum(profile.forwardPE)],
    ['EPS TTM', fmtNum(profile.trailingEps)],
    ['Beta', fmtNum(profile.beta)],
    ['Div Yield', profile.dividendYield != null ? fmtPct(profile.dividendYield) : '—'],
    ['52W High', fmtP(hi)],
    ['52W Low', fmtP(lo)],
    ['Shares', fmtBig(profile.sharesOutstanding)],
    ['50D Avg', fmtP(profile.fiftyDayAverage)],
  ]
  return (
    <Card>
      <SectionHeader icon={Info} title="Key Statistics" />
      <div className="p-4">
        {(profile.sector || profile.industry) && (
          <div className="mb-3 text-2xs text-ink-3">
            <span className="text-ink-1 font-medium">{profile.sector || '—'}</span>
            {profile.industry && <span className="text-ink-4"> · {profile.industry}</span>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4">
          {stats.map(([label, value]) => (
            <StatRow key={label} label={label} value={value} />
          ))}
        </div>
        {pos != null && (
          <div className="mt-3">
            <div className="flex justify-between text-2xs font-mono tabular text-ink-4 mb-1">
              <span>{fmtP(lo)}</span><span>52-week range</span><span>{fmtP(hi)}</span>
            </div>
            <div className="relative h-1.5 bg-surf-2 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-down via-warn to-up rounded-full opacity-40" style={{ width: '100%' }} />
              <div className="absolute -top-1 w-1 h-3.5 bg-accent rounded-full" style={{ left: `calc(${pos}% - 2px)` }} title={`${pos}% of 52-week range`} />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Position card ───────────────────────────────────────────────
function PositionCard({ position, symbol }) {
  if (!position) {
    return (
      <Card>
        <SectionHeader icon={Briefcase} title={`Position · ${symbol}`} />
        <EmptyState
          icon={Briefcase}
          title={`Not holding ${symbol}`}
          body="Buy with the order ticket to open a position."
          action={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
          actionLabel={`Buy ${symbol}`}
        />
      </Card>
    )
  }
  const qty = Number(position.qty)
  const avg = Number(position.avg_entry_price)
  const last = Number(position.current_price)
  const pl = Number(position.unrealized_pl)
  const plPct = Number(position.unrealized_plpc) * 100
  const isLong = (position.side || '').toLowerCase() === 'long' || qty > 0
  return (
    <Card>
      <SectionHeader icon={Briefcase} title={`Position · ${symbol}`} />
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Side · Qty</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isLong ? 'text-up' : 'text-down'}`}>{isLong ? 'Long' : 'Short'}</span>
              <span className="text-sm font-mono tabular text-ink-1 font-semibold">{qty}</span>
            </div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Avg Entry</div>
            <div className="mt-1 text-sm font-mono tabular text-ink-1 font-semibold">{fmtP(avg)}</div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Market Value</div>
            <div className="mt-1 text-sm font-mono tabular text-ink-1 font-semibold">{activeCurrency()}{(qty * last).toFixed(2)}</div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Unrealized P/L</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-sm font-mono tabular font-bold ${pl >= 0 ? 'text-up' : 'text-down'}`}>{pl >= 0 ? '+' : ''}${Math.abs(pl).toFixed(2)}</span>
              <PnlCell value={plPct} scale={20} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
            className="py-1.5 rounded-lg bg-up/10 hover:bg-up/20 border border-up/30 text-up text-2xs font-bold uppercase tracking-wider transition">Add</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } }))}
            className="py-1.5 rounded-lg bg-down/10 hover:bg-down/20 border border-down/30 text-down text-2xs font-bold uppercase tracking-wider transition">Close</button>
        </div>
      </div>
    </Card>
  )
}

// ── Lower tabbed section: News / Orders ─────────────────────────
function LowerSection({ symbol, news, newsLoading, orders }) {
  const [tab, setTab] = useState('news')
  const subset = orders.filter((o) => (o.symbol || '').toUpperCase() === symbol).slice(0, 8)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-2">
        {[['news', 'News', Newspaper], ['orders', `Orders (${subset.length})`, ListOrdered]].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative px-3 py-2.5 text-xs flex items-center gap-1.5 transition ${tab === k ? 'text-ink-1' : 'text-ink-4 hover:text-ink-2'}`}
          >
            <Icon size={12} /> {label}
            {tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-grad rounded-full" />}
          </button>
        ))}
      </div>

      {tab === 'news' ? (
        <div className="max-h-[420px] overflow-y-auto">
          {newsLoading && <div className="p-6 text-center text-2xs text-ink-4 soft-pulse">Loading news…</div>}
          {!newsLoading && news.length === 0 && (
            <EmptyState icon={Newspaper} title="No recent headlines" body={`No news available for ${symbol}.`} />
          )}
          {!newsLoading && news.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
              className="group block px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition">
              <div className="text-xs text-ink-1 leading-snug group-hover:text-accent transition-colors">{a.headline}</div>
              {a.summary && <div className="text-2xs text-ink-3 mt-1 line-clamp-2 leading-relaxed">{a.summary}</div>}
              <div className="flex items-center gap-2 text-2xs text-ink-4 mt-1.5">
                <span className="font-medium">{a.source}</span>
                <span className="text-ink-5">·</span>
                <span><Clock size={9} className="inline -mt-0.5" /> {fmtAgo(a.published_at)}</span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {subset.length === 0 ? (
            <div className="p-6 text-center text-2xs text-ink-4">No recent orders for {symbol}.</div>
          ) : (
            <table className="w-full text-xs t-dense">
              <thead><tr><th className="text-left">Time</th><th className="text-left">Side</th><th className="text-right">Qty</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {subset.map((o) => {
                  const side = (o.side || '').toLowerCase()
                  return (
                    <tr key={o.id}>
                      <td className="font-mono text-2xs text-ink-3">{o.submitted_at ? fmtAgo(o.submitted_at) : '—'}</td>
                      <td className={`font-mono text-2xs font-bold uppercase ${side === 'buy' ? 'text-up' : 'text-down'}`}>{side}</td>
                      <td className="text-right font-mono tabular text-ink-2">{o.qty}</td>
                      <td className="text-2xs text-ink-3 capitalize">{o.status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Main SPA ────────────────────────────────────────────────────
export default function Stocks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { symbol, setSymbol } = useSymbol()
  const pollRef = useRef(null)

  // Active research tab is the source-of-truth in the URL (?tab=). The chips in
  // SymbolHeader navigate here with the right query, which updates this value.
  const tab = searchParams.get('tab') || 'overview'

  // URL ?symbol= → context (once), then keep URL in sync as symbol changes
  // (preserving the active tab).
  useEffect(() => {
    const urlSym = searchParams.get('symbol')?.toUpperCase()
    if (urlSym && urlSym !== symbol) setSymbol(urlSym)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const urlSym = searchParams.get('symbol')?.toUpperCase()
    if (symbol && symbol !== urlSym) {
      const p = { symbol }
      const t = searchParams.get('tab')
      if (t) p.tab = t
      setSearchParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const [snap, setSnap] = useState(null)
  const [profile, setProfile] = useState(null)
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)

  const loadSnap = useCallback(async (sym) => {
    try {
      const res = await api.getSnapshots(sym)
      const s = res?.snapshots?.[sym]
      if (!s) { setSnap(null); return }
      const price = s.latestTrade?.p ?? s.dailyBar?.c ?? null
      const prevClose = s.prevDailyBar?.c ?? null
      const change = price != null && prevClose ? price - prevClose : null
      const changePct = change != null && prevClose ? (change / prevClose) * 100 : null
      setSnap({
        price, prevClose, change, changePct,
        open: s.dailyBar?.o ?? null, high: s.dailyBar?.h ?? null, low: s.dailyBar?.l ?? null,
        volume: s.dailyBar?.v ?? null, bid: s.latestQuote?.bp ?? null, ask: s.latestQuote?.ap ?? null,
      })
    } catch {}
  }, [])

  // Snapshot polling
  useEffect(() => {
    setSnap(null)
    loadSnap(symbol)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => loadSnap(symbol), 10_000)
    return () => clearInterval(pollRef.current)
  }, [symbol, loadSnap])

  // Profile (key stats)
  useEffect(() => {
    setProfile(null)
    api.getProfile(symbol).then((p) => setProfile(p || null)).catch(() => setProfile(null))
  }, [symbol])

  // News
  useEffect(() => {
    setNewsLoading(true)
    api.getNews(symbol, 14).then((r) => setNews(r.articles || [])).catch(() => setNews([])).finally(() => setNewsLoading(false))
  }, [symbol])

  // Account (positions + orders)
  useEffect(() => {
    Promise.allSettled([api.getPositions(), api.listOrders(60)]).then(([pos, ord]) => {
      if (pos.status === 'fulfilled') setPositions(pos.value || [])
      if (ord.status === 'fulfilled') setOrders(ord.value || [])
    })
  }, [symbol])

  const position = positions.find((p) => (p.symbol || '').toUpperCase() === symbol)
  const TabComponent = RESEARCH_TABS[tab]

  return (
    <div className="p-3 sm:p-4 md:p-5 max-w-[1700px] mx-auto">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Watchlist */}
        <Watchlist active={symbol} onSelect={setSymbol} />

        {/* Research area — SymbolHeader's chips switch the active tab below */}
        <div className="flex-1 min-w-0 space-y-3">
          <SymbolHeader activePage={tab} />

          {tab === 'overview' ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              {/* Center: chart + lower tabs */}
              <div className="xl:col-span-2 space-y-3">
                <Card className="overflow-hidden">
                  <SectionHeader
                    icon={BarChart3}
                    title="Price Chart"
                    action={
                      <button onClick={() => loadSnap(symbol)} className="text-ink-4 hover:text-ink-1 transition" title="Refresh quote">
                        <RefreshCw size={12} />
                      </button>
                    }
                  />
                  <ChartWidget symbol={symbol} height={440} />
                </Card>
                <LowerSection symbol={symbol} news={news} newsLoading={newsLoading} orders={orders} />
              </div>

              {/* Right: quote + key stats + position */}
              <div className="space-y-3">
                <QuotePanel snap={snap} />
                <KeyStats profile={profile} last={snap?.price} />
                <PositionCard position={position} symbol={symbol} />
              </div>
            </div>
          ) : TabComponent ? (
            <Suspense fallback={<div className="py-16 text-center text-sm text-ink-4 soft-pulse">Loading…</div>}>
              <TabComponent embedded />
            </Suspense>
          ) : (
            <div className="py-16 text-center text-sm text-ink-4">Unknown view.</div>
          )}
        </div>
      </div>
    </div>
  )
}
