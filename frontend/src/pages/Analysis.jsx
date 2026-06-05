import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Gauge, TrendingUp, TrendingDown, Activity, Shield,
  Target, Calendar, AlertTriangle, Newspaper, RefreshCw,
  Layers, Users, Zap, BookmarkPlus, History, Trash2,
} from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import { chartColors, tooltipStyle } from '../lib/themeColors'
import Term from '../components/Term'
import { activeCurrency } from '../components/ui/format'

// ── Formatters ────────────────────────────────────────────────────
const fmtNum = (v, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d })
const fmt = (v, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d)
const fmtPct = (v, d = 2) => v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(d)}%`
const fmtSignedPct = (v, d = 2) => {
  if (v == null || Number.isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`
}
const fmtBig = (v) => {
  if (v == null) return '—'
  const n = Number(v); if (Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toFixed(2)
}
const colorForPct = (v) => v == null ? 'text-ink-3' : v >= 0 ? 'text-up' : 'text-down'

// ── Small building blocks ────────────────────────────────────────
function Stat({ label, value, sub, cls = 'text-ink-1', big = false }) {
  return (
    <div className="bg-surf-1 border border-surf-2 rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-4">{label}</div>
      <div className={`mt-1 font-mono ${big ? 'text-lg' : 'text-sm'} ${cls}`}>{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-ink-4 mt-0.5">{sub}</div>}
    </div>
  )
}

function ScoreBar({ label, value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const color =
    v >= 70 ? 'bg-up' :
    v >= 55 ? 'bg-up' :
    v >= 45 ? 'bg-warn' :
    v >= 30 ? 'bg-down' : 'bg-down'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono text-ink-1">{v.toFixed(1)}</span>
      </div>
      <div className="h-2 bg-surf-2 rounded-full overflow-hidden">
        <div className={`${color} h-full transition-all`} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

// ── Snapshot helpers (localStorage) ──────────────────────────────
const SNAP_KEY = 'quant_analysis_snapshots_v1'
function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') } catch { return {} }
}
function persistSnapshots(map) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(map)) } catch {}
}

// ── Peer ranking panel ──────────────────────────────────────────
function PercentileBar({ pct }) {
  if (pct == null) return <span className="text-ink-4 text-xs">—</span>
  const v = Math.max(0, Math.min(100, pct))
  const color =
    v >= 75 ? 'bg-up' :
    v >= 50 ? 'bg-up' :
    v >= 25 ? 'bg-warn' : 'bg-down'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-surf-2 rounded-full overflow-hidden">
        <div className={`${color} h-full`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[11px] font-mono text-ink-2 w-9 text-right">{v.toFixed(0)}</span>
    </div>
  )
}

function PeerRankPanel({ data }) {
  if (!data || !data.rankings?.length) {
    return <div className="text-ink-4 text-sm">No peer data for this sector.</div>
  }
  return (
    <div>
      <div className="text-xs text-ink-3 mb-3">
        Ranked vs {data.peer_count} peers in <span className="text-ink-2">{data.sector}</span>.
        Higher percentile = better (direction adjusted per metric).
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-4 bg-surf-0/40">
              <th className="px-3 py-2 text-left">Metric</th>
              <th className="px-3 py-2 text-right">This Stock</th>
              <th className="px-3 py-2 text-right">Peer Median</th>
              <th className="px-3 py-2 text-right">Range</th>
              <th className="px-3 py-2 text-left">Percentile</th>
            </tr>
          </thead>
          <tbody>
            {data.rankings.map((r) => (
              <tr key={r.key} className="border-t border-surf-2/60">
                <td className="px-3 py-1.5 text-ink-2">{r.metric}</td>
                <td className="px-3 py-1.5 font-mono text-right text-ink-1">{fmt(r.value, 3)}</td>
                <td className="px-3 py-1.5 font-mono text-right text-ink-3">{fmt(r.peer_median, 3)}</td>
                <td className="px-3 py-1.5 font-mono text-right text-ink-4 text-xs whitespace-nowrap">
                  {fmt(r.peer_min, 2)} – {fmt(r.peer_max, 2)}
                </td>
                <td className="px-3 py-1.5"><PercentileBar pct={r.percentile} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Post-earnings drift panel ───────────────────────────────────
function DriftPanel({ data }) {
  if (!data || !data.events) {
    return <div className="text-ink-4 text-sm">Not enough earnings history to study drift.</div>
  }
  const chart = [
    { window: 'T+1',  beat: data.beat?.avg_t1_pct,  miss: data.miss?.avg_t1_pct },
    { window: 'T+5',  beat: data.beat?.avg_t5_pct,  miss: data.miss?.avg_t5_pct },
    { window: 'T+20', beat: data.beat?.avg_t20_pct, miss: data.miss?.avg_t20_pct },
  ]
  return (
    <div>
      <div className="text-xs text-ink-3 mb-3">
        Average return after past earnings — {data.beat?.samples ?? 0} beats vs {data.miss?.samples ?? 0} misses observed.
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid()} />
          <XAxis dataKey="window" stroke={chartColors.axis()} fontSize={11} />
          <YAxis stroke={chartColors.axis()} fontSize={11} unit="%" />
          <Tooltip
            contentStyle={tooltipStyle()}
            formatter={(v) => v == null ? '—' : `${Number(v).toFixed(2)}%`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="beat" name="After beat" fill="#10b981" />
          <Bar dataKey="miss" name="After miss" fill="#f43f5e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Options-implied move panel ──────────────────────────────────
function ImpliedMovePanel({ data, last }) {
  if (!data || data.implied_move_pct == null) {
    return <div className="text-ink-4 text-sm">No tradeable options found.</div>
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Stat label="Expected Move" value={`±${fmt(data.implied_move_pct)}%`}
        sub={`±${activeCurrency()}${fmt(data.implied_move_usd)}`} cls="text-up" big />
      <Stat label="Expiry" value={data.expiry || '—'}
        sub={data.next_earnings ? `Earnings ${new Date(data.next_earnings).toLocaleDateString()}` : 'No earnings nearby'} />
      <Stat label="ATM Strike" value={`${activeCurrency()}${fmt(data.atm_strike)}`} />
      <Stat label="Low Band" value={`${activeCurrency()}${fmt(data.expected_low)}`} cls="text-down" />
      <Stat label="High Band" value={`${activeCurrency()}${fmt(data.expected_high)}`} cls="text-up" />
    </div>
  )
}

// ── Insider flow panel ──────────────────────────────────────────
function InsiderFlowPanel({ data }) {
  if (!data || data.verdict === 'no_activity' || data.verdict === 'unknown') {
    return <div className="text-ink-4 text-sm">No insider activity in the last 12 months.</div>
  }
  const verdictColor =
    data.verdict === 'net_buying' ? 'text-up' :
    data.verdict === 'net_selling' ? 'text-down' : 'text-ink-2'
  const w6 = data.window_6m || {}
  const w12 = data.window_1y || {}
  return (
    <div className="space-y-3">
      <div className={`text-sm ${verdictColor}`}>
        Verdict: <span className="font-semibold uppercase tracking-wide">{(data.verdict || '').replace('_', ' ')}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Buys (6m)" value={w6.buys ?? 0} cls="text-up" />
        <Stat label="Sells (6m)" value={w6.sells ?? 0} cls="text-down" />
        <Stat label="Net Shares (6m)" value={fmtBig(w6.net_shares)}
          cls={(w6.net_shares ?? 0) >= 0 ? 'text-up' : 'text-down'} />
        <Stat label="Net Value (6m)" value={`${activeCurrency()}${fmtBig(w6.net_value)}`}
          cls={(w6.net_value ?? 0) >= 0 ? 'text-up' : 'text-down'} />
        <Stat label="Buys (1y)" value={w12.buys ?? 0} />
        <Stat label="Sells (1y)" value={w12.sells ?? 0} />
        <Stat label="Net Shares (1y)" value={fmtBig(w12.net_shares)}
          cls={(w12.net_shares ?? 0) >= 0 ? 'text-up' : 'text-down'} />
        <Stat label="Net Value (1y)" value={`${activeCurrency()}${fmtBig(w12.net_value)}`}
          cls={(w12.net_value ?? 0) >= 0 ? 'text-up' : 'text-down'} />
      </div>
    </div>
  )
}

// ── Snapshot history panel ──────────────────────────────────────
function SnapshotPanel({ symbol, currentScore, currentPrice, snapshots, onSave, onDelete }) {
  const series = (snapshots || []).map((s) => ({
    ts: new Date(s.ts).toLocaleDateString(),
    overall: s.score?.overall,
    value: s.score?.value,
    growth: s.score?.growth,
    quality: s.score?.quality,
    momentum: s.score?.momentum,
    stability: s.score?.stability,
    price: s.price,
  }))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-ink-3">
          {snapshots.length === 0 ? 'No snapshots yet for ' + symbol : `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'} stored locally for ${symbol}.`}
        </div>
        <button onClick={onSave}
          className="flex items-center gap-1 text-xs bg-up hover:bg-up text-[#fff] rounded-lg px-3 py-1.5">
          <BookmarkPlus size={12} /> Save current
        </button>
      </div>

      {series.length > 1 && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid()} />
            <XAxis dataKey="ts" stroke={chartColors.axis()} fontSize={11} />
            <YAxis domain={[0, 100]} stroke={chartColors.axis()} fontSize={11} />
            <Tooltip contentStyle={tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="overall"   stroke="#10b981" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="value"     stroke="#22d3ee" dot={false} />
            <Line type="monotone" dataKey="growth"    stroke="#a78bfa" dot={false} />
            <Line type="monotone" dataKey="quality"   stroke="#f59e0b" dot={false} />
            <Line type="monotone" dataKey="momentum"  stroke="#ec4899" dot={false} />
            <Line type="monotone" dataKey="stability" stroke={chartColors.axis()} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {snapshots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-4 bg-surf-0/40">
                <th className="px-3 py-2 text-left">Saved</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Overall</th>
                <th className="px-3 py-2 text-right">V</th>
                <th className="px-3 py-2 text-right">G</th>
                <th className="px-3 py-2 text-right">Q</th>
                <th className="px-3 py-2 text-right">M</th>
                <th className="px-3 py-2 text-right">S</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.ts} className="border-t border-surf-2/60 font-mono">
                  <td className="px-3 py-1 text-ink-2">{new Date(s.ts).toLocaleString()}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.price)}</td>
                  <td className="px-3 py-1 text-right text-up font-semibold">{fmt(s.score?.overall, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.score?.value, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.score?.growth, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.score?.quality, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.score?.momentum, 1)}</td>
                  <td className="px-3 py-1 text-right text-ink-2">{fmt(s.score?.stability, 1)}</td>
                  <td className="px-3 py-1 text-right">
                    <button onClick={() => onDelete(s.ts)} className="text-ink-4 hover:text-down">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, children, action }) {
  return (
    <div className="bg-surf-1 border border-surf-2 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-surf-0/40 border-b border-surf-2">
        {Icon && <Icon size={14} className="text-up" />}
        <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── Returns table ────────────────────────────────────────────────
const HORIZONS = [
  ['1d', '1 Day'], ['5d', '5 Days'], ['1m', '1 Month'], ['3m', '3 Months'],
  ['6m', '6 Months'], ['ytd', 'YTD'], ['1y', '1 Year'], ['3y', '3 Years'],
  ['5y', '5 Years'], ['max', 'Max'],
]

function ReturnsTable({ returns = {}, bench = {}, benchSym = 'SPY' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-4 bg-surf-0/40">
            <th className="px-3 py-2 text-left">Horizon</th>
            <th className="px-3 py-2 text-right">Stock</th>
            <th className="px-3 py-2 text-right">{benchSym}</th>
            <th className="px-3 py-2 text-right">vs {benchSym}</th>
          </tr>
        </thead>
        <tbody>
          {HORIZONS.map(([k, label]) => {
            const s = returns[k]
            const b = bench[k]
            const diff = s != null && b != null ? s - b : null
            return (
              <tr key={k} className="border-t border-surf-2/60">
                <td className="px-3 py-1.5 text-ink-2">{label}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${colorForPct(s)}`}>{fmtSignedPct(s)}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${colorForPct(b)}`}>{fmtSignedPct(b)}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${colorForPct(diff)}`}>{fmtSignedPct(diff)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Analyst target range bar ─────────────────────────────────────
function TargetBar({ low, mean, high, current }) {
  if (low == null || high == null || current == null || high === low) {
    return <div className="text-ink-4 text-sm">No analyst targets available.</div>
  }
  const min = Math.min(low, current)
  const max = Math.max(high, current)
  const range = max - min
  const pos = (v) => `${((v - min) / range) * 100}%`
  return (
    <div className="space-y-3">
      <div className="relative h-10">
        <div className="absolute inset-y-4 left-0 right-0 bg-surf-2 rounded-full" />
        <div
          className="absolute inset-y-4 bg-gradient-to-r from-down via-warn to-up rounded-full"
          style={{ left: pos(low), width: `${((high - low) / range) * 100}%` }}
        />
        {mean != null && (
          <div
            className="absolute -top-1 w-0.5 h-12 bg-surf-3"
            style={{ left: pos(mean) }}
            title={`Mean target ${activeCurrency()}${mean.toFixed(2)}`}
          />
        )}
        <div
          className="absolute -top-2 w-2 h-14 bg-up rounded -ml-1 ring-2 ring-up"
          style={{ left: pos(current) }}
          title={`Current ${activeCurrency()}${current.toFixed(2)}`}
        />
      </div>
      <div className="flex justify-between text-xs font-mono text-ink-3">
        <span>Low ${fmt(low)}</span>
        <span className="text-up">Current ${fmt(current)}</span>
        <span>High ${fmt(high)}</span>
      </div>
    </div>
  )
}

// ── Seasonality heatmap (12 months) ──────────────────────────────
function SeasonalityHeatmap({ months = [] }) {
  if (!months.length) return <div className="text-ink-4 text-sm">No seasonality data.</div>
  const colorFor = (v) => {
    if (v == null) return 'bg-surf-2 text-ink-4'
    if (v >= 4) return 'bg-up text-[#fff]'
    if (v >= 2) return 'bg-up text-up'
    if (v >= 0.5) return 'bg-up text-up'
    if (v > -0.5) return 'bg-surf-3 text-ink-2'
    if (v > -2) return 'bg-down text-down'
    if (v > -4) return 'bg-down text-down'
    return 'bg-down text-[#fff]'
  }
  return (
    <div>
      <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
        {months.map((m) => (
          <div
            key={m.month}
            className={`${colorFor(m.avg_return_pct)} rounded p-2 text-center`}
            title={`${m.name}: avg ${fmtSignedPct(m.avg_return_pct)} · hit ${fmt(m.hit_rate_pct, 0)}% (${m.samples} yrs)`}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-80">{m.name}</div>
            <div className="text-xs font-mono mt-1">{fmtSignedPct(m.avg_return_pct)}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{fmt(m.hit_rate_pct, 0)}% up</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-ink-4 mt-2">
        Average monthly return + hit rate (% of months positive), 5-year lookback.
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function Analysis({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const navigate = useNavigate()
  const [symbol, setSymbol] = useSymbolPage(routeSym)
  const [symInput, setSymInput] = useState(symbol)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [snapshotMap, setSnapshotMap] = useState(() => loadSnapshots())

  const snapshotsForSymbol = useMemo(
    () => (snapshotMap[symbol] || []).slice().sort((a, b) => a.ts - b.ts),
    [snapshotMap, symbol]
  )

  function saveSnapshot() {
    if (!data?.score) return
    const entry = {
      ts: Date.now(),
      price: data.last_price,
      score: data.score,
    }
    const next = { ...snapshotMap, [symbol]: [...(snapshotMap[symbol] || []), entry] }
    setSnapshotMap(next); persistSnapshots(next)
  }
  function deleteSnapshot(ts) {
    const arr = (snapshotMap[symbol] || []).filter((s) => s.ts !== ts)
    const next = { ...snapshotMap, [symbol]: arr }
    setSnapshotMap(next); persistSnapshots(next)
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.getAnalysis(symbol)
      setData(r)
    } catch (e) {
      setError(e.message || 'Failed to load analysis')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (symbol) load() }, [symbol])

  function submit(e) {
    e.preventDefault()
    const s = symInput.trim().toUpperCase()
    if (!s) return
    setSymbol(s); setData(null)
    navigate(`/analysis/${s}`, { replace: true })
  }

  const surpriseChart = useMemo(() => {
    const h = data?.earnings_surprise?.history || []
    return h.map((r) => ({
      quarter: typeof r.quarter === 'string' ? r.quarter.slice(0, 10) : `Q${r.quarter ?? ''}`,
      surprise_pct: r.surprise_pct != null ? Number(r.surprise_pct) * 100 : null,
      actual: r.actual,
      estimate: r.estimate,
    }))
  }, [data])

  const profile = data?.profile || {}
  const score = data?.score || {}
  const ret = data?.returns || {}
  const bench = data?.benchmark_returns || {}
  const tech = data?.technicals || {}
  const risk = data?.risk || {}
  const seasonality = data?.seasonality?.months || []
  const targets = data?.analyst_targets || {}
  const surprise = data?.earnings_surprise
  const short = data?.short_interest
  const news = data?.news || []
  const peer = data?.peer_ranking
  const drift = data?.post_earnings_drift
  const implied = data?.implied_move
  const insider = data?.insider_flow

  const dayChange = ret['1d']
  // Verdict ring/glow styles by score tier
  const verdictTone =
    score.overall >= 70 ? { ring: 'ring-up/40',     glow: 'shadow-glow-up',     color: 'text-up'   } :
    score.overall >= 55 ? { ring: 'ring-up/30',     glow: 'shadow-glow-up',     color: 'text-up'   } :
    score.overall >= 45 ? { ring: 'ring-warn/30',   glow: 'shadow-none',        color: 'text-warn' } :
    score.overall >= 30 ? { ring: 'ring-down/30',   glow: 'shadow-glow-down',   color: 'text-down' } :
                          { ring: 'ring-down/40',   glow: 'shadow-glow-down',   color: 'text-down' }

  // SVG progress ring around the overall score
  const ringSize = 180
  const ringStroke = 14
  const ringRadius = (ringSize - ringStroke) / 2
  const ringCircum = 2 * Math.PI * ringRadius
  const ringProgress = ringCircum * (1 - (Math.max(0, Math.min(100, score.overall || 0)) / 100))

  return (
    <div className={embedded ? 'space-y-3 md:space-y-4' : 'p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto'}>
      {/* Page header */}
      {!embedded && (
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-ink-3 hover:text-ink-1 transition">
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-accent" />
            <h1 className="text-lg font-display font-semibold tracking-tight">Stock Analysis</h1>
          </div>
          <form onSubmit={submit} className="ml-4 flex items-center gap-2">
            <input
              value={symInput}
              onChange={(e) => setSymInput(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.06] focus:border-accent/40 rounded-lg px-3 py-1.5 text-xs font-mono uppercase w-28 placeholder:text-ink-5 outline-none transition"
              placeholder="Symbol"
            />
            <button type="submit"
              className="text-xs font-medium bg-brand-grad text-[#fff] rounded-lg px-3 py-1.5 shadow-glow-accent hover:brightness-110 transition">
              Analyze
            </button>
            {loading && <span className="text-2xs text-ink-4 soft-pulse">Crunching…</span>}
          </form>
          <button onClick={load}
            className="ml-auto w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-ink-3 hover:text-ink-1 transition">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {error && (
        <div className="card-surface px-4 py-3 text-sm text-down border-down/30 bg-down/[0.06]">{error}</div>
      )}
      {data?.error && (
        <div className="card-surface px-4 py-3 text-sm text-warn border-warn/30 bg-warn/[0.06]">{data.error}</div>
      )}

      {/* Hero header — gradient background, large price, glowing verdict */}
      {data && !data.error && (
        <div className="card-surface relative overflow-hidden p-6">
          {/* Decorative gradient blob */}
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-grad opacity-[0.07] blur-3xl pointer-events-none" />
          <div className="relative flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-3xl font-display font-bold tracking-tight">{data.symbol}</h2>
                <span className="text-ink-2 text-base">{profile.longName || profile.shortName}</span>
              </div>
              {profile.sector && (
                <div className="text-xs text-ink-4 mt-1 flex items-center gap-2">
                  <span>{profile.sector}</span>
                  <span className="text-ink-5">•</span>
                  <span>{profile.industry}</span>
                  <span className="text-ink-5">•</span>
                  <span>As of {data.as_of ? new Date(data.as_of).toLocaleDateString() : '—'}</span>
                </div>
              )}
              <div className="flex items-baseline gap-4 mt-4">
                <span className="text-4xl font-mono tabular font-bold text-ink-1">{activeCurrency()}{fmt(data.last_price)}</span>
                <span className={`font-mono tabular text-lg ${colorForPct(dayChange)}`}>
                  {dayChange == null ? '' : `${dayChange >= 0 ? '+' : ''}${fmt(dayChange)}%`}
                  <span className="text-xs text-ink-4 ml-2">today</span>
                </span>
              </div>
            </div>

            {/* Verdict ring */}
            {score.verdict && (
              <div className="ml-auto flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xs uppercase tracking-[0.18em] text-ink-4">Verdict</div>
                  <div className={`text-base font-display font-semibold ${verdictTone.color} mt-1`}>{score.verdict}</div>
                  <div className="text-2xs text-ink-4 mt-0.5">Composite Score</div>
                </div>
                <div className={`relative rounded-full ${verdictTone.glow}`}>
                  <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                    <defs>
                      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="50%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                      stroke="rgba(148,163,184,0.08)" strokeWidth={ringStroke} fill="none" />
                    <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                      stroke="url(#scoreGrad)" strokeWidth={ringStroke} fill="none"
                      strokeDasharray={ringCircum} strokeDashoffset={ringProgress}
                      strokeLinecap="round" className="transition-all duration-700" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-display font-bold tabular text-ink-1 leading-none">
                      {fmt(score.overall, 0)}
                    </span>
                    <span className="text-2xs uppercase tracking-widest text-ink-4 mt-2">/ 100</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Score breakdown */}
          <Section icon={Gauge} title="Composite Score Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                ['Value',     score.value],
                ['Growth',    score.growth],
                ['Quality',   score.quality],
                ['Momentum',  score.momentum],
                ['Stability', score.stability],
              ].map(([label, v]) => {
                const val = Math.max(0, Math.min(100, Number(v) || 0))
                const tone =
                  val >= 70 ? 'text-up'     :
                  val >= 55 ? 'text-up'     :
                  val >= 45 ? 'text-warn'   :
                  val >= 30 ? 'text-down'   : 'text-down'
                const bar =
                  val >= 70 ? 'bg-up'        :
                  val >= 55 ? 'bg-up/70'     :
                  val >= 45 ? 'bg-warn'      :
                  val >= 30 ? 'bg-down/70'   : 'bg-down'
                return (
                  <div key={label} className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-medium">{label}</div>
                    <div className={`text-3xl font-display font-bold tabular ${tone} mt-2 leading-none`}>{val.toFixed(0)}</div>
                    <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className={`${bar} h-full rounded-full transition-all duration-700`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="text-2xs text-ink-4 mt-4 leading-relaxed">
              Each factor ranks the stock against typical ranges. <span className="text-up">≥70 strong</span> ·
              <span className="text-warn"> 45-55 average</span> ·
              <span className="text-down"> &lt;30 weak</span>.
            </div>
          </Section>

          {/* Peer ranking */}
          <Section icon={Users} title="Peer Ranking">
            <PeerRankPanel data={peer} />
          </Section>

          {/* Returns vs SPY */}
          <Section icon={TrendingUp} title={`Returns vs ${data.benchmark_symbol || 'SPY'}`}>
            <ReturnsTable returns={ret} bench={bench} benchSym={data.benchmark_symbol || 'SPY'} />
          </Section>

          {/* Technicals */}
          <Section icon={Activity} title="Technical Indicators">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <Stat label={<Term id="trend">Trend</Term>} value={(tech.trend || '—').toUpperCase()}
                cls={tech.trend === 'bullish' ? 'text-up' : tech.trend === 'bearish' ? 'text-down' : 'text-ink-2'} />
              <Stat label={<Term id="rsi">RSI (14)</Term>} value={fmt(tech.rsi14, 1)}
                sub={tech.rsi_signal}
                cls={tech.rsi_signal === 'overbought' ? 'text-down' : tech.rsi_signal === 'oversold' ? 'text-up' : 'text-ink-1'} />
              <Stat label={<Term id="macd">MACD</Term>} value={fmt(tech.macd, 3)}
                sub={tech.macd_hist != null ? `hist ${fmt(tech.macd_hist, 3)}` : ''}
                cls={tech.macd != null && tech.macd_signal != null
                  ? (tech.macd > tech.macd_signal ? 'text-up' : 'text-down') : 'text-ink-1'} />
              <Stat label={<Term id="bollinger">Bollinger Pos</Term>} value={fmtPct(tech.bb_position_pct, 0)}
                sub={tech.bb_position_pct != null
                  ? (tech.bb_position_pct > 80 ? 'near upper' : tech.bb_position_pct < 20 ? 'near lower' : 'mid-band')
                  : ''} />
              <Stat label={<Term id="ma">SMA 20</Term>} value={fmt(tech.sma20)} />
              <Stat label={<Term id="ma">SMA 50</Term>} value={fmt(tech.sma50)} />
              <Stat label={<Term id="ma">SMA 200</Term>} value={fmt(tech.sma200)} />
              <Stat label="Above SMA50" value={tech.above_sma50 == null ? '—' : tech.above_sma50 ? 'Yes' : 'No'}
                cls={tech.above_sma50 ? 'text-up' : 'text-down'} />
              <Stat label="Above SMA200" value={tech.above_sma200 == null ? '—' : tech.above_sma200 ? 'Yes' : 'No'}
                cls={tech.above_sma200 ? 'text-up' : 'text-down'} />
              <Stat label="Avg Vol (20d)" value={fmtBig(tech.avg_volume_20d)} />
              <Stat label="Rel Volume" value={fmt(tech.relative_volume)}
                sub={tech.relative_volume != null && tech.relative_volume > 1.5 ? 'unusual' : ''} />
            </div>
          </Section>

          {/* Risk */}
          <Section icon={Shield} title="Risk & Volatility">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              <Stat label={<Term id="volatility">Vol (annualized)</Term>} value={fmtPct(risk.annualized_volatility_pct, 1)} />
              <Stat label={<Term id="sharpe">Sharpe</Term>} value={fmt(risk.sharpe)}
                cls={risk.sharpe >= 1 ? 'text-up' : risk.sharpe < 0 ? 'text-down' : 'text-ink-1'} />
              <Stat label="Sortino" value={fmt(risk.sortino)} />
              <Stat label={<Term id="maxdrawdown">Max Drawdown</Term>} value={fmtSignedPct(risk.max_drawdown_pct, 1)}
                cls="text-down" />
              <Stat label={<Term id="beta">Beta vs SPY</Term>} value={fmt(risk.beta_vs_spy)}
                sub={risk.beta_vs_spy != null
                  ? (risk.beta_vs_spy > 1.2 ? 'aggressive' : risk.beta_vs_spy < 0.8 ? 'defensive' : 'in-line')
                  : ''} />
              <Stat label="Correlation SPY" value={fmt(risk.correlation_vs_spy)} />
              <Stat label="VaR 95% (1d)" value={fmtSignedPct(risk.var_95_daily_pct, 2)} />
              <Stat label="Best Day" value={fmtSignedPct(risk.best_day_pct, 2)} cls="text-up" />
              <Stat label="Worst Day" value={fmtSignedPct(risk.worst_day_pct, 2)} cls="text-down" />
              <Stat label="Positive Days" value={fmtPct(risk.positive_days_pct, 1)} />
            </div>
          </Section>

          {/* Analyst targets */}
          <Section icon={Target} title="Analyst Price Targets">
            <TargetBar
              low={targets.target_low}
              mean={targets.target_mean}
              high={targets.target_high}
              current={data.last_price}
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
              <Stat label="Mean Target" value={`${activeCurrency()}${fmt(targets.target_mean)}`}
                sub={targets.target_mean_upside_pct != null ? fmtSignedPct(targets.target_mean_upside_pct) : ''}
                cls={colorForPct(targets.target_mean_upside_pct)} />
              <Stat label="High Target" value={`${activeCurrency()}${fmt(targets.target_high)}`}
                sub={targets.target_high_upside_pct != null ? fmtSignedPct(targets.target_high_upside_pct) : ''} />
              <Stat label="Low Target" value={`${activeCurrency()}${fmt(targets.target_low)}`}
                sub={targets.target_low_upside_pct != null ? fmtSignedPct(targets.target_low_upside_pct) : ''} />
              <Stat label="Rating" value={(targets.recommendation_key || '—').toUpperCase()}
                cls={['strong_buy', 'buy'].includes(targets.recommendation_key) ? 'text-up'
                  : ['sell', 'strong_sell'].includes(targets.recommendation_key) ? 'text-down' : 'text-ink-1'} />
              <Stat label="# Analysts" value={targets.number_of_analysts ?? '—'} />
            </div>
          </Section>

          {/* Options-implied move */}
          <Section icon={Zap} title="Options-Implied Move (next expiration)">
            <ImpliedMovePanel data={implied} last={data.last_price} />
          </Section>

          {/* Earnings surprise */}
          {surprise && (
            <Section icon={Calendar} title="Earnings Surprise Track Record"
              action={
                <span className="text-xs text-ink-3">
                  <span className="text-up">{surprise.beat_count}</span> beats ·{' '}
                  <span className="text-down">{surprise.miss_count}</span> misses
                </span>
              }>
              {surpriseChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={surpriseChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid()} />
                    <XAxis dataKey="quarter" stroke={chartColors.axis()} fontSize={11} />
                    <YAxis stroke={chartColors.axis()} fontSize={11} unit="%" />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v) => v == null ? '—' : `${Number(v).toFixed(2)}%`}
                    />
                    <Bar dataKey="surprise_pct">
                      {surpriseChart.map((d, i) => (
                        <Cell key={i} fill={(d.surprise_pct ?? 0) >= 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-ink-4 text-sm">No earnings history.</div>
              )}
            </Section>
          )}

          {/* Post-earnings drift study */}
          <Section icon={Activity} title="Post-Earnings Drift (historical)">
            <DriftPanel data={drift} />
          </Section>

          {/* Short interest */}
          {short && (
            <Section icon={AlertTriangle} title="Short Interest">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                <Stat label="Short Ratio" value={fmt(short.shortRatio)}
                  sub={short.shortRatio > 5 ? 'elevated' : 'normal'} />
                <Stat label="Days to Cover" value={fmt(short.shortRatio)} />
                <Stat label="% of Float" value={short.shortPercentOfFloat != null ? fmtPct(short.shortPercentOfFloat * 100, 2) : '—'} />
                <Stat label="Shares Short" value={fmtBig(short.sharesShort)} />
                <Stat label="Prior Month" value={fmtBig(short.sharesShortPriorMonth)} />
                <Stat label="MoM Change" value={short.change_pct_vs_prior_month != null ? fmtSignedPct(short.change_pct_vs_prior_month, 1) : '—'}
                  cls={colorForPct(-(short.change_pct_vs_prior_month || 0))} />
              </div>
            </Section>
          )}

          {/* Insider flow */}
          <Section icon={Layers} title="Insider Transaction Flow">
            <InsiderFlowPanel data={insider} />
          </Section>

          {/* Seasonality */}
          {seasonality.length > 0 && (
            <Section icon={Calendar} title="Monthly Seasonality (5-year)">
              <SeasonalityHeatmap months={seasonality} />
            </Section>
          )}

          {/* News */}
          {news.length > 0 && (
            <Section icon={Newspaper} title="Recent Headlines">
              <div className="space-y-2">
                {news.slice(0, 8).map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                    className="block p-2 rounded hover:bg-surf-2/40 border border-transparent hover:border-surf-3">
                    <div className="text-sm text-ink-2 line-clamp-2">{a.headline}</div>
                    <div className="text-[11px] text-ink-4 mt-0.5">
                      {a.source} · {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
                    </div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Snapshot history */}
          <Section icon={History} title="Score History (snapshots)">
            <SnapshotPanel
              symbol={data.symbol}
              currentScore={score}
              currentPrice={data.last_price}
              snapshots={snapshotsForSymbol}
              onSave={saveSnapshot}
              onDelete={deleteSnapshot}
            />
          </Section>
        </>
      )}
    </div>
  )
}
