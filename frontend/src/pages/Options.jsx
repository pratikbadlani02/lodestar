import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RefreshCw, Layers, Activity, Target } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, LineChart, Line,
} from 'recharts'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import SymbolHeader from '../components/SymbolHeader'
import { Card, Section } from '../components/ui/primitives'

const fmt = (v, d = 2) =>
  v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d)
const fmtInt = (v) => (v == null ? '—' : Number(v).toLocaleString())
const fmtPct = (v, d = 2) =>
  v == null ? '—' : `${(Number(v) * 100).toFixed(d)}%`

// Max-pain: strike where total intrinsic value of OPEN INTEREST is minimised.
// At each candidate strike S:
//   call_pain = sum_over_strikes( OI_call * max(0, S - K) )
//   put_pain  = sum_over_strikes( OI_put  * max(0, K - S) )
function computeMaxPain(rows) {
  if (!rows || rows.length === 0) return null
  let bestStrike = null, bestPain = Infinity
  for (const row of rows) {
    const S = row.strike
    let pain = 0
    for (const r of rows) {
      const callOI = Number(r.call?.openInterest || 0)
      const putOI = Number(r.put?.openInterest || 0)
      const K = r.strike
      if (S > K) pain += callOI * (S - K)
      if (K > S) pain += putOI * (K - S)
    }
    if (pain < bestPain) { bestPain = pain; bestStrike = S }
  }
  return bestStrike
}

export default function Options({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const navigate = useNavigate()
  const [symbol] = useSymbolPage(routeSym)
  const [expirations, setExpirations] = useState([])
  const [expiry, setExpiry] = useState('')
  const [chain, setChain] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setChain(null)
    async function load() {
      setError('')
      try {
        const r = await api.getOptionExpirations(symbol)
        if (cancelled) return
        setExpirations(r.expirations || [])
        setExpiry((prev) => prev && r.expirations?.includes(prev) ? prev : (r.expirations?.[0] || ''))
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load expirations')
      }
    }
    if (symbol) load()
    return () => { cancelled = true }
  }, [symbol])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!symbol || !expiry) return
      setLoading(true); setError('')
      try {
        const r = await api.getOptionChain(symbol, expiry)
        if (!cancelled) setChain(r)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load chain')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [symbol, expiry])

  const rows = useMemo(() => {
    if (!chain) return []
    const byStrike = new Map()
    for (const c of chain.calls || []) {
      const k = Number(c.strike)
      byStrike.set(k, { strike: k, call: c, put: null })
    }
    for (const p of chain.puts || []) {
      const k = Number(p.strike)
      const r = byStrike.get(k) || { strike: k, call: null, put: null }
      r.put = p
      byStrike.set(k, r)
    }
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike)
  }, [chain])

  const underlying = chain?.underlying

  // Aggregate stats
  const totals = useMemo(() => {
    let callVol = 0, putVol = 0, callOI = 0, putOI = 0
    for (const r of rows) {
      callVol += Number(r.call?.volume || 0)
      putVol += Number(r.put?.volume || 0)
      callOI += Number(r.call?.openInterest || 0)
      putOI += Number(r.put?.openInterest || 0)
    }
    return {
      callVol, putVol, callOI, putOI,
      pcVol: callVol > 0 ? putVol / callVol : null,
      pcOI: callOI > 0 ? putOI / callOI : null,
    }
  }, [rows])

  // OI distribution data — calls (positive Y), puts (negative Y) for mirrored bars
  const oiChart = useMemo(() => rows.map((r) => ({
    strike: r.strike,
    callOI: Number(r.call?.openInterest || 0),
    putOI: -Number(r.put?.openInterest || 0),  // negative for mirror
    callIV: r.call?.impliedVolatility != null ? Number(r.call.impliedVolatility) * 100 : null,
    putIV: r.put?.impliedVolatility != null ? Number(r.put.impliedVolatility) * 100 : null,
  })), [rows])

  // IV skew (averaged across calls + puts when both present)
  const ivChart = useMemo(() => rows.map((r) => {
    const civ = r.call?.impliedVolatility
    const piv = r.put?.impliedVolatility
    const avg = (civ != null && piv != null) ? (Number(civ) + Number(piv)) / 2 * 100 :
                civ != null ? Number(civ) * 100 :
                piv != null ? Number(piv) * 100 : null
    return { strike: r.strike, iv: avg }
  }).filter((x) => x.iv != null), [rows])

  const maxPain = useMemo(() => computeMaxPain(rows), [rows])

  // Calculate days to expiry for context
  const daysToExpiry = useMemo(() => {
    if (!expiry) return null
    const exp = new Date(expiry + 'T16:00:00Z').getTime()
    const now = Date.now()
    return Math.max(0, Math.round((exp - now) / (24 * 60 * 60 * 1000)))
  }, [expiry])

  const pcVolTone = totals.pcVol == null ? 'text-ink-1' : totals.pcVol > 1.0 ? 'text-down' : totals.pcVol < 0.7 ? 'text-up' : 'text-ink-1'
  const pcOITone  = totals.pcOI  == null ? 'text-ink-1' : totals.pcOI  > 1.0 ? 'text-down' : totals.pcOI  < 0.7 ? 'text-up' : 'text-ink-1'

  return (
    <div className={embedded ? 'space-y-3 md:space-y-4' : 'p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto'}>
      {!embedded && <SymbolHeader activePage="options" />}

      {/* Expiry picker + key chip stats */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Expiry</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="bg-surf-1 border border-white/[0.08] focus:border-accent/40 rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
            disabled={!expirations.length}
          >
            {expirations.length === 0 && <option value="">None</option>}
            {expirations.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          {daysToExpiry != null && (
            <span className="text-2xs text-ink-4 font-mono ml-1">{daysToExpiry}d to exp</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Chip label="Underlying" value={underlying != null ? `$${fmt(underlying)}` : '—'} />
          <Chip label="Max Pain" value={maxPain != null ? `$${fmt(maxPain)}` : '—'}
            tone={maxPain != null && underlying != null
              ? (maxPain > underlying ? 'text-up' : 'text-down')
              : ''} />
          <Chip label="P/C Vol" value={totals.pcVol != null ? totals.pcVol.toFixed(2) : '—'} tone={pcVolTone} />
          <Chip label="P/C OI" value={totals.pcOI != null ? totals.pcOI.toFixed(2) : '—'} tone={pcOITone} />
          <Chip label="Total Vol" value={fmtInt(totals.callVol + totals.putVol)} />
          <Chip label="Total OI" value={fmtInt(totals.callOI + totals.putOI)} />
        </div>

        <button
          onClick={() => setExpiry((e) => e)}
          className="ml-auto w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-ink-3 hover:text-ink-1 transition"
          title="Force refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Charts grid */}
      {oiChart.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* OI mirrored bars */}
          <Card className="lg:col-span-2">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <Activity size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Open Interest by Strike</h3>
              <span className="ml-auto text-2xs text-ink-4">
                <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-sm bg-up" />Calls</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-down" />Puts</span>
              </span>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={oiChart} stackOffset="sign" barCategoryGap={1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
                  <XAxis dataKey="strike" stroke="rgb(var(--c-ink-4))" fontSize={10} />
                  <YAxis stroke="rgb(var(--c-ink-4))" fontSize={10}
                    tickFormatter={(v) => Math.abs(v).toLocaleString()} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(var(--c-surf-1))',
                      border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
                      borderRadius: 8, fontSize: 12,
                      color: 'rgb(var(--c-ink-1))',
                    }}
                    formatter={(v, name) => [Math.abs(Number(v)).toLocaleString(), name === 'callOI' ? 'Call OI' : 'Put OI']}
                    labelFormatter={(v) => `Strike $${v}`}
                  />
                  {underlying != null && (
                    <ReferenceLine x={underlying} stroke="rgb(var(--c-accent))" strokeDasharray="4 4"
                      label={{ value: 'Underlying', position: 'top', fill: 'rgb(var(--c-accent))', fontSize: 10 }} />
                  )}
                  {maxPain != null && maxPain !== underlying && (
                    <ReferenceLine x={maxPain} stroke="rgb(var(--c-warn))" strokeDasharray="4 4"
                      label={{ value: 'Max Pain', position: 'insideTop', fill: 'rgb(var(--c-warn))', fontSize: 10 }} />
                  )}
                  <Bar dataKey="callOI" fill="rgba(var(--c-up) / 0.85)" />
                  <Bar dataKey="putOI"  fill="rgba(var(--c-down) / 0.85)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* IV skew */}
          <Card>
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <Target size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">IV Skew</h3>
            </div>
            <div className="p-3">
              {ivChart.length > 1 ? (
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={ivChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
                    <XAxis dataKey="strike" stroke="rgb(var(--c-ink-4))" fontSize={10} />
                    <YAxis stroke="rgb(var(--c-ink-4))" fontSize={10} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(var(--c-surf-1))',
                        border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
                        borderRadius: 8, fontSize: 12,
                        color: 'rgb(var(--c-ink-1))',
                      }}
                      formatter={(v) => `${Number(v).toFixed(1)}%`}
                      labelFormatter={(v) => `Strike $${v}`}
                    />
                    {underlying != null && (
                      <ReferenceLine x={underlying} stroke="rgb(var(--c-accent))" strokeDasharray="4 4" />
                    )}
                    <Line type="monotone" dataKey="iv" stroke="rgb(var(--c-accent2))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-2xs text-ink-4 py-12 text-center">Not enough IV data.</div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Chain table — visually richer with OI bars */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 border-b border-white/[0.06]">
          <div className="px-4 py-2 text-center text-2xs uppercase tracking-[0.16em] text-up font-semibold border-r border-white/[0.06] bg-up/[0.04]">
            Calls
          </div>
          <div className="px-4 py-2 text-center text-2xs uppercase tracking-[0.16em] text-down font-semibold bg-down/[0.04]">
            Puts
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-2xs text-ink-4 bg-surf-2/40">
                <th className="px-2 py-2 text-right">Bid</th>
                <th className="px-2 py-2 text-right">Ask</th>
                <th className="px-2 py-2 text-right">Last</th>
                <th className="px-2 py-2 text-right">Vol</th>
                <th className="px-2 py-2 text-right">OI</th>
                <th className="px-2 py-2 text-right">IV</th>
                <th className="px-3 py-2 text-center bg-surf-3/60 text-ink-2 font-semibold">Strike</th>
                <th className="px-2 py-2 text-right">IV</th>
                <th className="px-2 py-2 text-right">OI</th>
                <th className="px-2 py-2 text-right">Vol</th>
                <th className="px-2 py-2 text-right">Last</th>
                <th className="px-2 py-2 text-right">Ask</th>
                <th className="px-2 py-2 text-right">Bid</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-ink-4 soft-pulse">Loading chain…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-ink-4">No data</td></tr>
              )}
              {rows.map((r) => {
                const callItm = r.call?.inTheMoney
                const putItm  = r.put?.inTheMoney
                const isUnderlyingNeighbour = underlying != null && Math.abs(r.strike - underlying) < (underlying * 0.005)
                const isMaxPain = maxPain != null && r.strike === maxPain
                return (
                  <tr key={r.strike}
                    className={`border-t border-white/[0.04] hover:bg-white/[0.03] ${isUnderlyingNeighbour ? 'bg-accent/[0.06]' : ''}`}>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmt(r.call?.bid)}</td>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmt(r.call?.ask)}</td>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmt(r.call?.lastPrice)}</td>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmtInt(r.call?.volume)}</td>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmtInt(r.call?.openInterest)}</td>
                    <td className={`px-2 py-1.5 text-right ${callItm ? 'bg-up/[0.10]' : ''}`}>{fmtPct(r.call?.impliedVolatility)}</td>
                    <td className={`px-3 py-1.5 text-center font-bold ${isMaxPain ? 'bg-warn/15 text-warn' : isUnderlyingNeighbour ? 'bg-accent/15 text-accent' : 'bg-surf-3/40 text-ink-1'}`}>
                      {fmt(r.strike)}
                      {isMaxPain && <span className="ml-1 text-2xs uppercase tracking-wider">MP</span>}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmtPct(r.put?.impliedVolatility)}</td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmtInt(r.put?.openInterest)}</td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmtInt(r.put?.volume)}</td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmt(r.put?.lastPrice)}</td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmt(r.put?.ask)}</td>
                    <td className={`px-2 py-1.5 text-right ${putItm ? 'bg-down/[0.10]' : ''}`}>{fmt(r.put?.bid)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-2xs text-ink-4 leading-relaxed px-1">
        <span className="text-ink-2">Legend:</span> ITM rows are tinted ·
        <span className="text-accent ml-1">Strike at underlying</span> highlighted ·
        <span className="text-warn ml-1">MP = Max Pain</span> (strike that minimises total option-holder intrinsic value).
        IV shown as annualised %.
      </div>
    </div>
  )
}

function Chip({ label, value, tone }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-2xs">
      <span className="text-ink-5 uppercase tracking-wider">{label}</span>
      <span className={`font-mono tabular font-semibold ${tone || 'text-ink-1'}`}>{value}</span>
    </span>
  )
}
