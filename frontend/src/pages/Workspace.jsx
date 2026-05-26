import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListPlus, Send, RefreshCw, ChevronDown, Activity, Newspaper,
  Gauge, Layers, Radio, Star,
} from 'lucide-react'
import ChartWidget from '../components/ChartWidget'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useSymbol } from '../lib/SymbolContext'
import { fmt, fmtSigned, fmtSignedPct, fmtBig, signClass } from '../components/ui/format'
import { Card, SectionHeader, Pill } from '../components/ui/primitives'

const DEFAULT_WATCH = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ']

// ── Watchlist column ─────────────────────────────────────────────
function WatchlistColumn() {
  const { symbol, setSymbol } = useSymbol()
  const [lists, setLists] = useState([])
  const [activeListId, setActiveListId] = useState(null)
  const [symbols, setSymbols] = useState(DEFAULT_WATCH)
  const [quotes, setQuotes] = useState({})
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [newSym, setNewSym] = useState('')

  useEffect(() => {
    api.listWatchlists().then((rs) => {
      setLists(rs || [])
      if (rs?.length) {
        setActiveListId(rs[0].id)
        setSymbols(rs[0].symbols || DEFAULT_WATCH)
      }
    }).catch(() => setLists([]))
  }, [])

  useEffect(() => {
    if (!activeListId) return
    const w = lists.find((l) => l.id === activeListId)
    setSymbols(w?.symbols || DEFAULT_WATCH)
  }, [activeListId, lists])

  // Poll snapshots
  useEffect(() => {
    let cancelled = false
    let tick
    async function poll() {
      if (!symbols.length) return
      try {
        const r = await api.getSnapshots(symbols.join(','))
        if (cancelled) return
        setQuotes(r?.snapshots || {})
      } catch {}
    }
    poll(); tick = setInterval(poll, 10000)
    return () => { cancelled = true; if (tick) clearInterval(tick) }
  }, [symbols])

  function quoteFor(sym) {
    const s = quotes[sym]
    if (!s) return null
    const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
    const prev = s.prevDailyBar?.c
    return {
      last,
      prev,
      change: last && prev ? last - prev : null,
      changePct: last && prev ? ((last - prev) / prev) * 100 : null,
    }
  }

  async function addSymbol() {
    const s = newSym.trim().toUpperCase()
    if (!s || symbols.includes(s)) { setAdding(false); setNewSym(''); return }
    const next = [...symbols, s]
    setSymbols(next); setAdding(false); setNewSym('')
    if (activeListId) {
      const w = lists.find((l) => l.id === activeListId)
      try {
        await api.updateWatchlist(activeListId, { name: w?.name || 'Workspace', symbols: next })
      } catch {}
    }
  }
  async function removeSymbol(s) {
    const next = symbols.filter((x) => x !== s)
    setSymbols(next)
    if (activeListId) {
      const w = lists.find((l) => l.id === activeListId)
      try {
        await api.updateWatchlist(activeListId, { name: w?.name || 'Workspace', symbols: next })
      } catch {}
    }
  }

  const filtered = symbols.filter((s) => !filter || s.includes(filter.toUpperCase()))

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <SectionHeader
        icon={Star}
        title="Watchlist"
        action={
          lists.length > 1 ? (
            <select
              value={activeListId ?? ''}
              onChange={(e) => setActiveListId(Number(e.target.value))}
              className="bg-surf-2 border border-surf-3 rounded text-2xs px-1 py-0.5"
            >
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null
        }
      />
      <div className="p-2.5 border-b border-white/[0.06] flex gap-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="flex-1 bg-white/[0.04] border border-white/[0.06] focus:border-accent/40 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase outline-none transition"
        />
        <button
          onClick={() => setAdding(true)}
          className="bg-white/[0.04] hover:bg-accent/15 hover:text-accent border border-white/[0.06] rounded-lg px-2.5 text-ink-3 transition"
          title="Add symbol"
        >
          <ListPlus size={13} />
        </button>
      </div>
      {adding && (
        <div className="p-2.5 border-b border-white/[0.06] flex gap-1.5">
          <input
            autoFocus
            value={newSym}
            onChange={(e) => setNewSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && addSymbol()}
            placeholder="TICKER"
            className="flex-1 bg-accent/[0.06] border border-accent/40 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase outline-none"
          />
          <button onClick={addSymbol}
            className="bg-brand-grad text-[#fff] text-xs font-medium rounded-lg px-3 shadow-glow-accent">Add</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surf-1/95 backdrop-blur z-10 border-b border-white/[0.06]">
            <tr className="text-ink-5 text-2xs">
              <th className="px-3 py-2 text-left font-medium tracking-wider">Symbol</th>
              <th className="px-3 py-2 text-right font-medium tracking-wider">Last</th>
              <th className="px-3 py-2 text-right font-medium tracking-wider">% Δ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const q = quoteFor(s)
              const up = (q?.changePct ?? 0) >= 0
              const active = s === symbol
              return (
                <tr
                  key={s}
                  onClick={() => setSymbol(s)}
                  onAuxClick={(e) => { if (e.button === 1) removeSymbol(s) }}
                  className={`group relative cursor-pointer transition-colors border-l-2 ${
                    active
                      ? 'border-l-accent bg-accent/[0.06]'
                      : 'border-l-transparent hover:bg-white/[0.03]'
                  }`}
                  title="Click to load · Middle-click to remove"
                >
                  <td className={`px-3 py-1.5 font-mono font-semibold ${active ? 'text-accent' : 'text-ink-1'}`}>{s}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular text-ink-2">
                    {q?.last != null ? fmt(q.last) : '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular ${up ? 'text-up' : 'text-down'}`}>
                    {q?.changePct != null ? fmtSignedPct(q.changePct, 2) : '—'}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-2 py-10 text-center text-ink-4 text-xs">No symbols</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Order ticket column ──────────────────────────────────────────
function OrderTicket() {
  const { symbol } = useSymbol()
  const [side, setSide] = useState('buy')
  const [orderType, setOrderType] = useState('market')
  const [qty, setQty] = useState('')
  const [tif, setTif] = useState('day')
  const [limit, setLimit] = useState('')
  const [stop, setStop] = useState('')
  const [extHours, setExtHours] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [snap, setSnap] = useState(null)
  const [account, setAccount] = useState(null)
  const [position, setPosition] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [s, acct, positions] = await Promise.all([
          api.getSnapshots(symbol),
          api.getAccount().catch(() => null),
          api.getPositions().catch(() => []),
        ])
        if (cancelled) return
        const snapData = s?.snapshots?.[symbol]
        if (snapData) {
          const last = snapData.latestTrade?.p ?? snapData.minuteBar?.c ?? snapData.dailyBar?.c
          const prev = snapData.prevDailyBar?.c
          setSnap({ last, prev, bid: snapData.latestQuote?.bp, ask: snapData.latestQuote?.ap,
            change: last && prev ? last - prev : null,
            changePct: last && prev ? ((last - prev) / prev) * 100 : null,
          })
        } else { setSnap(null) }
        setAccount(acct)
        setPosition((positions || []).find((p) => p.symbol === symbol) || null)
      } catch {}
    }
    load()
    const t = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(t) }
  }, [symbol])

  async function submit(e) {
    e.preventDefault()
    setErr(null); setOk(null)
    if (!qty || Number(qty) <= 0) { setErr('Enter quantity'); return }
    setSubmitting(true)
    try {
      const payload = {
        symbol,
        side,
        qty: Number(qty),
        order_type: orderType,
        time_in_force: tif,
        extended_hours: extHours,
      }
      if ((orderType === 'limit' || orderType === 'stop_limit') && limit) payload.limit_price = Number(limit)
      if ((orderType === 'stop' || orderType === 'stop_limit') && stop) payload.stop_price = Number(stop)
      await api.submitOrder(payload)
      toast.success(`${side.toUpperCase()} ${qty} ${symbol} placed`, {
        description: `${orderType} · ${tif.toUpperCase()}`,
      })
      setQty(''); setLimit(''); setStop('')
    } catch (e2) {
      const msg = e2.detail?.detail?.reason || e2.detail?.detail || e2.message || 'Order failed'
      setErr(typeof msg === 'string' ? msg : JSON.stringify(msg))
      toast.apiError(e2, 'Order rejected')
    } finally {
      setSubmitting(false)
    }
  }

  const needsLimit = orderType === 'limit' || orderType === 'stop_limit'
  const needsStop = orderType === 'stop' || orderType === 'stop_limit'
  const estCost = Number(qty || 0) * Number(limit || snap?.last || 0)

  return (
    <Card className="h-full flex flex-col">
      <SectionHeader icon={Send} title="Order Ticket" />
      <div className="p-3 space-y-2.5">
        {/* Quote line */}
        <div className="bg-surf-2 rounded p-2 space-y-0.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono font-semibold text-ink-1">{symbol}</span>
            <span className="font-mono tabular text-base text-ink-1">
              {snap?.last != null ? `$${fmt(snap.last)}` : '—'}
            </span>
          </div>
          {snap?.change != null && (
            <div className="flex justify-end">
              <span className={`text-xs font-mono tabular ${signClass(snap.change)}`}>
                {fmtSigned(snap.change)} ({fmtSignedPct(snap.changePct)})
              </span>
            </div>
          )}
          <div className="flex justify-between text-2xs text-ink-4 font-mono pt-1">
            <span>Bid {snap?.bid != null ? `$${fmt(snap.bid)}` : '—'}</span>
            <span>Ask {snap?.ask != null ? `$${fmt(snap.ask)}` : '—'}</span>
          </div>
        </div>

        {/* Side toggle — gradient + glow on selected */}
        <div className="grid grid-cols-2 gap-1.5">
          {['buy', 'sell'].map((s) => {
            const isSel = side === s
            const isBuy = s === 'buy'
            return (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                  isSel
                    ? (isBuy ? 'bg-up-grad text-[#fff] shadow-glow-up' : 'bg-down-grad text-[#fff] shadow-glow-down')
                    : 'bg-white/[0.04] border border-white/[0.06] text-[#fff] hover:text-ink-1 hover:bg-white/[0.08]'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* Order type */}
        <div>
          <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            className="w-full bg-surf-2 border border-surf-3 rounded px-2 py-1.5 text-xs"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
            <option value="stop_limit">Stop Limit</option>
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Quantity</label>
          <input
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full bg-surf-2 border border-surf-3 rounded px-2 py-1.5 text-sm font-mono tabular"
          />
          <div className="flex gap-1 mt-1">
            {[10, 25, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setQty(String(n))}
                className="flex-1 bg-surf-2 hover:bg-surf-3 border border-surf-3 rounded py-0.5 text-2xs font-mono"
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {needsLimit && (
          <div>
            <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Limit Price</label>
            <input
              type="number"
              step="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-full bg-surf-2 border border-surf-3 rounded px-2 py-1.5 text-sm font-mono tabular"
            />
          </div>
        )}
        {needsStop && (
          <div>
            <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Stop Price</label>
            <input
              type="number"
              step="0.01"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
              className="w-full bg-surf-2 border border-surf-3 rounded px-2 py-1.5 text-sm font-mono tabular"
            />
          </div>
        )}

        {/* TIF */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">TIF</label>
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value)}
              className="w-full bg-surf-2 border border-surf-3 rounded px-2 py-1.5 text-xs"
            >
              <option value="day">Day</option>
              <option value="gtc">GTC</option>
              <option value="opg">OPG</option>
              <option value="cls">CLS</option>
              <option value="ioc">IOC</option>
              <option value="fok">FOK</option>
            </select>
          </div>
          <label className="flex items-end gap-1 text-2xs text-ink-3">
            <input
              type="checkbox"
              checked={extHours}
              onChange={(e) => setExtHours(e.target.checked)}
            />
            Ext. hours
          </label>
        </div>

        <div className="bg-surf-2/60 border border-surf-3 rounded px-2 py-1.5 text-2xs font-mono tabular text-ink-2 flex justify-between">
          <span>Est. notional</span>
          <span>${fmt(estCost)}</span>
        </div>

        {err && <div className="bg-down/15 border border-down/30 text-down text-2xs rounded px-2 py-1">{err}</div>}
        {ok && <div className="bg-up/15 border border-up/30 text-up text-2xs rounded px-2 py-1">{ok}</div>}

        <button
          onClick={submit}
          disabled={submitting}
          className={`w-full py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition-all ${
            side === 'buy'
              ? 'bg-up-grad shadow-glow-up hover:brightness-110'
              : 'bg-down-grad shadow-glow-down hover:brightness-110'
          } text-[#fff] disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting ? 'Submitting…' : `${side.toUpperCase()} ${symbol}`}
        </button>

        {position && (
          <div className="border-t border-surf-3 pt-2 mt-1 space-y-1 text-2xs font-mono tabular">
            <div className="flex justify-between text-ink-3">
              <span>Position</span><span className="text-ink-2">{position.qty} sh</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Avg cost</span><span className="text-ink-2">${fmt(position.avg_entry_price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">P&L</span>
              <span className={signClass(position.unrealized_pl)}>${fmt(position.unrealized_pl)}</span>
            </div>
          </div>
        )}

        {account && (
          <div className="border-t border-surf-3 pt-2 mt-1 space-y-1 text-2xs font-mono tabular text-ink-3">
            <div className="flex justify-between"><span>Buying power</span><span className="text-ink-2">${fmtBig(account.buying_power)}</span></div>
            <div className="flex justify-between"><span>Cash</span><span>${fmtBig(account.cash)}</span></div>
            <div className="flex justify-between"><span>Equity</span><span>${fmtBig(account.equity)}</span></div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Center column: chart + tabs ──────────────────────────────────
function CenterColumn() {
  const navigate = useNavigate()
  const { symbol } = useSymbol()
  const [snap, setSnap] = useState(null)
  const [news, setNews] = useState([])
  const [tab, setTab] = useState('news')

  useEffect(() => {
    let cancelled = false
    api.getSnapshots(symbol).then((r) => {
      if (cancelled) return
      const s = r?.snapshots?.[symbol]
      if (!s) { setSnap(null); return }
      const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
      const prev = s.prevDailyBar?.c
      setSnap({
        last, prev,
        change: last && prev ? last - prev : null,
        changePct: last && prev ? ((last - prev) / prev) * 100 : null,
        bid: s.latestQuote?.bp, ask: s.latestQuote?.ap,
        volume: s.dailyBar?.v,
        high: s.dailyBar?.h, low: s.dailyBar?.l, open: s.dailyBar?.o,
      })
    }).catch(() => setSnap(null))
    return () => { cancelled = true }
  }, [symbol])

  useEffect(() => {
    if (tab !== 'news') return
    api.getNews(symbol, 15).then((r) => setNews(r?.articles || [])).catch(() => setNews([]))
  }, [symbol, tab])

  const up = (snap?.change ?? 0) >= 0
  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Quote header */}
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-baseline gap-4 flex-wrap">
        <span className="font-display font-bold text-lg text-ink-1">{symbol}</span>
        <span className="text-2xl font-mono tabular font-bold text-ink-1">
          {snap?.last != null ? `$${fmt(snap.last)}` : '—'}
        </span>
        {snap?.change != null && (
          <span className={`inline-flex items-baseline gap-1 font-mono tabular text-sm font-semibold ${up ? 'text-up' : 'text-down'}`}>
            {fmtSigned(snap.change)}
            <span className="text-xs opacity-90">({fmtSignedPct(snap.changePct)})</span>
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => navigate(`/analysis/${symbol}`)}
            className="text-2xs uppercase tracking-[0.14em] font-medium text-ink-3 hover:text-accent px-2.5 py-1 rounded-md hover:bg-accent/10 transition"
          >Full Analysis →</button>
        </div>
      </div>

      {/* Chart */}
      <div className="border-b border-white/[0.06]">
        <ChartWidget symbol={symbol} height={360} />
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-white/[0.04] border-b border-white/[0.06] text-2xs font-mono tabular">
        {[
          ['Open', snap?.open],
          ['High', snap?.high],
          ['Low',  snap?.low],
          ['Volume', snap?.volume != null ? fmtBig(snap.volume) : null],
          ['Bid', snap?.bid],
          ['Ask', snap?.ask],
        ].map(([label, v]) => (
          <div key={label} className="bg-surf-1 px-4 py-2.5">
            <div className="text-2xs text-ink-5 uppercase tracking-wider font-medium">{label}</div>
            <div className="text-ink-1 font-semibold mt-0.5">{v != null ? (typeof v === 'string' ? v : fmt(v)) : '—'}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06] flex px-2">
        {[
          ['news', 'News', Newspaper],
          ['quick-actions', 'Actions', Activity],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative px-3 py-2.5 text-2xs uppercase tracking-[0.14em] font-medium flex items-center gap-1.5 transition ${
              tab === k ? 'text-ink-1' : 'text-ink-4 hover:text-ink-2'
            }`}
          >
            <Icon size={12} /> {label}
            {tab === k && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-grad rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'news' && (
          <div className="space-y-2">
            {news.length === 0 && <div className="text-ink-4 text-xs">No headlines.</div>}
            {news.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                className="block p-3 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition group">
                <div className="text-xs text-ink-1 leading-snug group-hover:text-accent transition-colors">{a.headline}</div>
                <div className="text-2xs text-ink-4 mt-1">
                  {a.source} · {a.published_at ? new Date(a.published_at).toLocaleString() : ''}
                </div>
              </a>
            ))}
          </div>
        )}
        {tab === 'quick-actions' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              ['Analysis', Gauge, `/analysis/${symbol}`],
              ['Options', Layers, `/options/${symbol}`],
              ['Tape', Radio, `/tape/${symbol}`],
              ['Fundamentals', Activity, `/fundamentals/${symbol}`],
              ['Dividends', Activity, `/dividends/${symbol}`],
              ['Insiders', Activity, `/insiders/${symbol}`],
            ].map(([label, Icon, to]) => (
              <button
                key={label}
                onClick={() => navigate(to)}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.03] hover:bg-accent/10 hover:border-accent/30 border border-white/[0.06] rounded-lg text-xs text-ink-2 hover:text-ink-1 transition"
              >
                <Icon size={14} className="text-accent" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export default function Workspace() {
  return (
    <div className="h-full flex gap-2 p-2">
      <div className="w-56 shrink-0">
        <WatchlistColumn />
      </div>
      <div className="flex-1 min-w-0">
        <CenterColumn />
      </div>
      <div className="w-72 shrink-0">
        <OrderTicket />
      </div>
    </div>
  )
}
