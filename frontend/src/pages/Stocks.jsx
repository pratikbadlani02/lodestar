import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Newspaper, Briefcase, ListOrdered, Zap, Activity, Clock, RefreshCw,
  ArrowUpRight, ArrowDownRight, Search,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import ChartWidget from '../components/ChartWidget'
import SymbolHeader from '../components/SymbolHeader'
import { Card, SectionHeader } from '../components/ui/primitives'
import { PnlCell, MagBar } from '../components/ui/charts'
import EmptyState from '../components/ui/EmptyState'

// ── Formatters ──────────────────────────────────────────────────
const fmtP = (n) => n == null ? '—' : `$${Number(n).toFixed(2)}`
const fmt = (n, d = 2) => n == null ? '—' : Number(n).toFixed(d)
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

// ── Stat row inside a card ──────────────────────────────────────
function StatRow({ label, value, cls }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-2xs uppercase tracking-wider text-ink-4">{label}</span>
      <span className={`text-xs font-mono tabular font-semibold ${cls || 'text-ink-1'}`}>{value}</span>
    </div>
  )
}

// ── Quote panel — bid/ask, spread, today's candle, range ────────
function QuotePanel({ snap }) {
  if (!snap) {
    return (
      <Card className="p-6 flex items-center justify-center text-ink-4 text-sm soft-pulse">
        Loading quote…
      </Card>
    )
  }
  const { price, prevClose, change, changePct, open, high, low, volume, bid, ask } = snap
  const spread = bid != null && ask != null ? (ask - bid) : null
  const dayRange = high != null && low != null ? (high - low) : null
  // 0–100 position of price within today's range
  const rangePos = (price != null && high != null && low != null && high !== low)
    ? Math.round(((price - low) / (high - low)) * 100)
    : null

  return (
    <Card>
      <SectionHeader icon={Activity} title="Real-time Quote" />
      <div className="p-4 space-y-4">
        {/* Bid / Ask / Spread */}
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
            <div className="text-sm font-mono tabular font-bold text-ink-1 mt-1">
              {spread != null ? `$${spread.toFixed(3)}` : '—'}
            </div>
          </div>
        </div>

        {/* Today's candle */}
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
          <StatRow label="Range (H-L)" value={dayRange != null ? `$${dayRange.toFixed(2)}` : '—'} />
          <StatRow label="Volume" value={fmtVol(volume)} />
        </div>

        {/* Day range bar */}
        {rangePos != null && (
          <div>
            <div className="flex justify-between text-2xs font-mono tabular text-ink-4 mb-1">
              <span className="text-down">{fmtP(low)}</span>
              <span>day range</span>
              <span className="text-up">{fmtP(high)}</span>
            </div>
            <div className="relative h-1.5 bg-surf-2 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-down via-warn to-up rounded-full opacity-50" style={{ width: '100%' }} />
              <div
                className="absolute -top-1 w-1 h-3.5 bg-accent rounded-full shadow-glow-accent"
                style={{ left: `calc(${rangePos}% - 2px)` }}
                title={`${rangePos}% within today's range`}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Position-on-symbol card ─────────────────────────────────────
function PositionCard({ position, symbol }) {
  if (!position) {
    return (
      <Card>
        <SectionHeader icon={Briefcase} title={`Position in ${symbol}`} />
        <EmptyState
          icon={Briefcase}
          title={`Not holding ${symbol}`}
          body="Buy the symbol with the order ticket to open a position."
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
      <SectionHeader icon={Briefcase} title={`Position in ${symbol}`} />
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Side · Qty</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isLong ? 'text-up' : 'text-down'}`}>
                {isLong ? 'Long' : 'Short'}
              </span>
              <span className="text-sm font-mono tabular text-ink-1 font-semibold">{qty}</span>
            </div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Avg Entry</div>
            <div className="mt-1 text-sm font-mono tabular text-ink-1 font-semibold">{fmtP(avg)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Market Value</div>
            <div className="mt-1 text-sm font-mono tabular text-ink-1 font-semibold">
              ${(qty * last).toFixed(2)}
            </div>
          </div>
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-2xs uppercase tracking-wider text-ink-4">Unrealized P/L</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-sm font-mono tabular font-bold ${pl >= 0 ? 'text-up' : 'text-down'}`}>
                {pl >= 0 ? '+' : ''}${Math.abs(pl).toFixed(2)}
              </span>
              <PnlCell value={plPct} scale={20} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
            className="py-1.5 rounded-lg bg-up/10 hover:bg-up/20 border border-up/30 text-up text-2xs font-bold uppercase tracking-wider transition"
          >Add</button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'sell' } }))}
            className="py-1.5 rounded-lg bg-down/10 hover:bg-down/20 border border-down/30 text-down text-2xs font-bold uppercase tracking-wider transition"
          >Close</button>
        </div>
      </div>
    </Card>
  )
}

// ── Recent orders for this symbol ───────────────────────────────
function OrdersForSymbol({ orders, symbol }) {
  const subset = orders.filter((o) => (o.symbol || '').toUpperCase() === symbol).slice(0, 6)
  return (
    <Card>
      <SectionHeader icon={ListOrdered} title={`Recent Orders · ${symbol}`}
        action={<span className="text-2xs text-ink-4">{subset.length}</span>} />
      {subset.length === 0 ? (
        <div className="p-6 text-center text-2xs text-ink-4">No recent orders for {symbol}.</div>
      ) : (
        <table className="w-full text-xs t-dense">
          <thead>
            <tr>
              <th className="text-left">Time</th>
              <th className="text-left">Side</th>
              <th className="text-right">Qty</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
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
    </Card>
  )
}

// ── News feed ───────────────────────────────────────────────────
function NewsList({ articles, loading, symbol }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={Newspaper} title="Latest News"
        action={<span className="text-2xs text-ink-4">{symbol}</span>} />
      <div className="max-h-[420px] overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-2xs text-ink-4 soft-pulse">Loading news…</div>
        )}
        {!loading && articles.length === 0 && (
          <EmptyState
            icon={Newspaper}
            title="No recent headlines"
            body={`No news available for ${symbol} in the last news pull.`}
          />
        )}
        {!loading && articles.map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
            className="group block px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition">
            <div className="text-xs text-ink-1 leading-snug group-hover:text-accent transition-colors">
              {a.headline}
            </div>
            {a.summary && (
              <div className="text-2xs text-ink-3 mt-1 line-clamp-2 leading-relaxed">{a.summary}</div>
            )}
            <div className="flex items-center gap-2 text-2xs text-ink-4 mt-1.5">
              <span className="font-medium">{a.source}</span>
              <span className="text-ink-5">·</span>
              <span><Clock size={9} className="inline -mt-0.5" /> {fmtAgo(a.published_at)}</span>
              {a.symbols && a.symbols.length > 1 && (
                <>
                  <span className="text-ink-5">·</span>
                  <span className="font-mono">{a.symbols.slice(0, 4).join(' ')}</span>
                </>
              )}
            </div>
          </a>
        ))}
      </div>
    </Card>
  )
}

// ── Main component ──────────────────────────────────────────────
export default function Stocks() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { symbol, setSymbol } = useSymbol()
  const pollRef = useRef(null)

  // Sync URL ?symbol= → SymbolContext (one-way; the context wins thereafter)
  useEffect(() => {
    const urlSym = searchParams.get('symbol')?.toUpperCase()
    if (urlSym && urlSym !== symbol) setSymbol(urlSym)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep URL in sync as the symbol changes (from TopBar / WatchRail / etc.)
  useEffect(() => {
    const urlSym = searchParams.get('symbol')?.toUpperCase()
    if (symbol && symbol !== urlSym) {
      setSearchParams({ symbol }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const [snap, setSnap] = useState(null)
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
      const changePct = change != null && prevClose ? (change / prevClose * 100) : null
      setSnap({
        price, prevClose, change, changePct,
        open: s.dailyBar?.o ?? null,
        high: s.dailyBar?.h ?? null,
        low: s.dailyBar?.l ?? null,
        volume: s.dailyBar?.v ?? null,
        bid: s.latestQuote?.bp ?? null,
        ask: s.latestQuote?.ap ?? null,
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

  // News
  useEffect(() => {
    setNewsLoading(true)
    api.getNews(symbol, 12)
      .then((r) => setNews(r.articles || []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false))
  }, [symbol])

  // Account
  useEffect(() => {
    Promise.allSettled([api.getPositions(), api.listOrders(60)]).then(([pos, ord]) => {
      if (pos.status === 'fulfilled') setPositions(pos.value || [])
      if (ord.status === 'fulfilled') setOrders(ord.value || [])
    })
  }, [symbol])

  const position = positions.find((p) => (p.symbol || '').toUpperCase() === symbol)

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto">
      <SymbolHeader activePage="stocks" />

      {/* Main grid: chart (left) + side panels (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Chart */}
        <div className="lg:col-span-8">
          <Card className="overflow-hidden">
            <SectionHeader
              icon={Activity}
              title="Price Chart"
              action={
                <button
                  onClick={() => loadSnap(symbol)}
                  className="text-ink-4 hover:text-ink-1 transition"
                  title="Refresh quote"
                >
                  <RefreshCw size={12} />
                </button>
              } />
            <ChartWidget symbol={symbol} height={460} />
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-3">
          <QuotePanel snap={snap} />
          <PositionCard position={position} symbol={symbol} />
        </div>
      </div>

      {/* Lower row: news + orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8">
          <NewsList articles={news} loading={newsLoading} symbol={symbol} />
        </div>
        <div className="lg:col-span-4">
          <OrdersForSymbol orders={orders} symbol={symbol} />
        </div>
      </div>
    </div>
  )
}
