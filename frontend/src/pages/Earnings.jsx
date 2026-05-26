import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, RefreshCw, Filter as FilterIcon } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'

const DEFAULT_SYMBOLS = 'AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,NFLX,AMD,AVGO,JPM,XOM,WMT,UNH,V'

const fmtDate = (s) => {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return s }
}
const fmtNum = (v, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d)
const fmtBig = (v) => {
  if (v == null) return '—'
  const n = Number(v); if (Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

// Days from today (midnight) to the given date string
function daysFromToday(s) {
  if (!s) return null
  try {
    const target = new Date(s)
    target.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((target - today) / (24 * 60 * 60 * 1000))
  } catch { return null }
}

function relativeHint(days) {
  if (days == null) return null
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return `in ${days}d`
  if (days <= 14) return `in ${days}d`
  return `in ${days}d`
}

// Filter tag based on days-from-today
function bucket(days) {
  if (days == null) return 'tbd'
  if (days < 0) return 'past'
  if (days <= 7) return 'this_week'
  if (days <= 14) return 'next_2w'
  if (days <= 31) return 'this_month'
  return 'later'
}

const FILTERS = [
  ['all', 'All'],
  ['this_week', 'This Week'],
  ['next_2w', 'Next 2 Weeks'],
  ['this_month', 'This Month'],
]

export default function Earnings() {
  const navigate = useNavigate()
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOLS)
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [watchlists, setWatchlists] = useState([])
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('all')
  const ctx = useSymbolContextMenu()

  useEffect(() => {
    api.listWatchlists().then(setWatchlists).catch(() => setWatchlists([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!symbols) return
      setLoading(true); setError('')
      try {
        const r = await api.getEarningsCalendar(symbols)
        if (!cancelled) setRows(r.results || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load calendar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [symbols])

  async function loadWatchlist(id) {
    setSelected(id)
    if (!id) return
    try {
      const q = await api.getWatchlistQuotes(id)
      const syms = (q.items || q.symbols || q.results || []).map((x) => x.symbol || x).filter(Boolean)
      if (syms.length) {
        const j = syms.join(',')
        setSymbolsInput(j); setSymbols(j)
      }
    } catch (e) {
      setError(`Could not load watchlist: ${e.message}`)
    }
  }

  function submit(e) {
    e.preventDefault()
    setSymbols(symbolsInput.toUpperCase().replace(/\s+/g, ''))
  }

  // Annotate each row with days + bucket
  const enriched = useMemo(() => rows.map((r) => {
    const d = daysFromToday(r.earnings_date)
    return { ...r, _days: d, _bucket: bucket(d) }
  }), [rows])

  // Counts for filter chips
  const counts = useMemo(() => ({
    all: enriched.length,
    this_week: enriched.filter((r) => r._bucket === 'this_week').length,
    next_2w: enriched.filter((r) => ['this_week', 'next_2w'].includes(r._bucket)).length,
    this_month: enriched.filter((r) => ['this_week', 'next_2w', 'this_month'].includes(r._bucket)).length,
  }), [enriched])

  const filtered = useMemo(() => {
    if (filter === 'all') return enriched
    if (filter === 'this_week') return enriched.filter((r) => r._bucket === 'this_week')
    if (filter === 'next_2w') return enriched.filter((r) => ['this_week', 'next_2w'].includes(r._bucket))
    if (filter === 'this_month') return enriched.filter((r) => ['this_week', 'next_2w', 'this_month'].includes(r._bucket))
    return enriched
  }, [enriched, filter])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of filtered) {
      const key = r.earnings_date ? new Date(r.earnings_date).toISOString().slice(0, 10) : 'TBD'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calendar size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-display font-semibold tracking-tight">Earnings Calendar</h1>
          <p className="text-2xs text-ink-4 uppercase tracking-wider">
            {enriched.length} reports across {symbols.split(',').length} symbols
          </p>
        </div>
        <button onClick={() => setSymbols((s) => s)}
          className="ml-auto w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-ink-3 hover:text-ink-1 transition">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={submit} className="flex items-center gap-2 flex-1 min-w-[300px]">
          <input
            value={symbolsInput}
            onChange={(e) => setSymbolsInput(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] focus:border-accent/40 rounded-lg px-3 py-1.5 text-sm font-mono uppercase flex-1 outline-none transition"
            placeholder="AAPL,MSFT,GOOGL…"
          />
          <button type="submit" className="bg-up-grad shadow-glow-up text-[#fff] font-medium text-sm rounded-lg px-3 py-1.5 hover:brightness-110 transition">
            Load
          </button>
        </form>

        <select
          value={selected}
          onChange={(e) => loadWatchlist(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">— From watchlist —</option>
          {watchlists.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterIcon size={12} className="text-ink-4" />
        {FILTERS.map(([k, label]) => {
          const active = filter === k
          const c = counts[k] ?? 0
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-lg text-2xs font-medium uppercase tracking-wider transition border ${
                active
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-white/[0.03] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.06]'
              }`}
            >
              {label} <span className="ml-1 opacity-70 font-mono">{c}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Calendar groups */}
      <div className="space-y-3">
        {!loading && grouped.length === 0 && (
          <Card>
            <EmptyState
              icon={Calendar}
              title="No upcoming earnings"
              body="No reports found for the selected symbols and time window. Try widening the filter or loading a different watchlist."
            />
          </Card>
        )}

        {grouped.map(([dateKey, items]) => {
          const days = daysFromToday(dateKey)
          const hint = relativeHint(days)
          const isThisWeek = days != null && days >= 0 && days <= 7
          const isToday = days === 0
          return (
            <Card key={dateKey} className={`overflow-hidden ${isThisWeek ? 'ring-1 ring-accent/30' : ''}`}>
              <div className={`px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.06] ${isToday ? 'bg-accent/[0.10]' : isThisWeek ? 'bg-accent/[0.04]' : ''}`}>
                <span className={`text-sm font-display font-semibold ${isToday ? 'text-accent' : 'text-ink-1'}`}>
                  {dateKey === 'TBD' ? 'Date TBD' : fmtDate(dateKey)}
                </span>
                {hint && (
                  <span className={`text-2xs px-1.5 py-0.5 rounded uppercase tracking-wider font-medium ${
                    isToday ? 'bg-accent text-[#fff]' :
                    isThisWeek ? 'bg-accent/20 text-accent' : 'bg-white/[0.05] text-ink-3'
                  }`}>
                    {hint}
                  </span>
                )}
                <span className="ml-auto text-2xs text-ink-4">{items.length} report{items.length === 1 ? '' : 's'}</span>
              </div>
              <table className="w-full text-sm t-dense">
                <thead>
                  <tr>
                    <th className="text-left">Symbol</th>
                    <th className="text-right">EPS Est</th>
                    <th className="text-right">EPS Low</th>
                    <th className="text-right">EPS High</th>
                    <th className="text-right">Revenue Est</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.symbol}
                      onClick={() => navigate(`/analysis/${r.symbol}`)}
                      onContextMenu={(e) => ctx.onContextMenu(e, r.symbol)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="font-mono font-semibold text-accent">{r.symbol}</td>
                      <td className="text-right font-mono tabular text-ink-1 font-semibold">{fmtNum(r.eps_estimate)}</td>
                      <td className="text-right font-mono tabular text-ink-4">{fmtNum(r.eps_low)}</td>
                      <td className="text-right font-mono tabular text-ink-4">{fmtNum(r.eps_high)}</td>
                      <td className="text-right font-mono tabular text-ink-2">{fmtBig(r.revenue_estimate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        })}
      </div>
      {ctx.menu}
    </div>
  )
}
