import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Coins, Scissors, Leaf, TrendingUp } from 'lucide-react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid,
} from 'recharts'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import SymbolHeader from '../components/SymbolHeader'
import { Card } from '../components/ui/primitives'
import { PnlCell, MiniEquityCurve } from '../components/ui/charts'
import EmptyState from '../components/ui/EmptyState'
import { activeCurrency } from '../components/ui/format'

const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d))
const fmtPct = (v, d = 2) =>
  v == null || Number.isNaN(v) ? '—' : `${(Number(v) * 100).toFixed(d)}%`
const fmtDate = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString() } catch { return s }
}

// 5y compound annual dividend growth rate from history
function growthRate(history) {
  if (!history || history.length < 6) return null
  // history is newest-first; reverse for chronological
  const chrono = history.slice().reverse()
  // Take ~5y ago vs latest (assume 4 dividends/year ≈ 20 entries back)
  const latest = Number(chrono[chrono.length - 1]?.amount)
  const past = Number(chrono[Math.max(0, chrono.length - 21)]?.amount)
  if (!latest || !past || past === 0) return null
  // CAGR over the period: (latest / past)^(1/years) - 1
  const years = 5
  return (Math.pow(latest / past, 1 / years) - 1) * 100
}

// Annualized dividend per share for each year (sum of trailing 4 quarters)
function annualSeries(history) {
  if (!history || history.length === 0) return []
  const byYear = new Map()
  for (const r of history) {
    if (!r?.date) continue
    const y = String(r.date).slice(0, 4)
    byYear.set(y, (byYear.get(y) || 0) + Number(r.amount || 0))
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([year, total]) => ({ year, total: Number(total.toFixed(4)) }))
}

function StatTile({ label, value, sub, tone }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-3">
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">{label}</div>
      <div className={`mt-1 text-sm font-mono tabular font-semibold ${tone || 'text-ink-1'}`}>{value ?? '—'}</div>
      {sub && <div className="text-2xs text-ink-5 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Dividends({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const [symbol] = useSymbolPage(routeSym)
  const [data, setData] = useState(null)
  const [splits, setSplits] = useState(null)
  const [esg, setEsg] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!symbol) return
      setError('')
      try {
        const [d, sp, e] = await Promise.all([
          api.getDividends(symbol),
          api.getSplits(symbol),
          api.getSustainability(symbol).catch(() => ({ scores: null })),
        ])
        if (cancelled) return
        setData(d); setSplits(sp); setEsg(e)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load')
      }
    }
    load()
    return () => { cancelled = true }
  }, [symbol])

  const annualBars = useMemo(() => annualSeries(data?.history), [data])
  const growth5y = useMemo(() => growthRate(data?.history), [data])
  const sparkValues = useMemo(() => annualBars.map((b) => b.total), [annualBars])

  // Yield vs 5y average
  const yieldCur = data?.dividend_yield != null ? Number(data.dividend_yield) * 100 : null
  const yield5y = data?.five_year_avg_yield != null ? Number(data.five_year_avg_yield) : null
  const yieldVsAvg = (yieldCur != null && yield5y != null) ? yieldCur - yield5y : null

  return (
    <div className={embedded ? 'space-y-3 md:space-y-4' : 'p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto'}>
      {!embedded && <SymbolHeader activePage="dividends" />}

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Key stats grid */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile
            label="Yield"
            value={fmtPct(data.dividend_yield)}
            tone={(data.dividend_yield ?? 0) > 0.04 ? 'text-up' : 'text-ink-1'}
            sub={yieldVsAvg != null
              ? `${yieldVsAvg >= 0 ? '+' : ''}${yieldVsAvg.toFixed(2)}pp vs 5y avg`
              : null} />
          <StatTile label="Annual Rate" value={`${activeCurrency()}${fmt(data.dividend_rate)}`} />
          <StatTile
            label="Payout Ratio"
            value={fmtPct(data.payout_ratio)}
            tone={(data.payout_ratio ?? 0) > 0.8 ? 'text-down' : (data.payout_ratio ?? 0) > 0.5 ? 'text-warn' : 'text-up'} />
          <StatTile
            label="5y Avg Yield"
            value={data.five_year_avg_yield ? `${Number(data.five_year_avg_yield).toFixed(2)}%` : '—'} />
          <StatTile
            label="5y Growth (CAGR)"
            value={growth5y != null ? `${growth5y >= 0 ? '+' : ''}${growth5y.toFixed(2)}%` : '—'}
            tone={growth5y != null ? (growth5y > 5 ? 'text-up' : growth5y < 0 ? 'text-down' : 'text-ink-1') : 'text-ink-4'} />
          <StatTile label="Last Paid"
            value={fmtDate(data.last_dividend_date)}
            sub={data.last_dividend_value ? `${activeCurrency()}${fmt(data.last_dividend_value, 4)}/sh` : null} />
        </div>
      )}

      {/* Per-payment history chart + annualised sparkline */}
      {(data?.history?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <Coins size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Dividend History (per payment)</h3>
              <span className="ml-auto text-2xs text-ink-4">{data.history.length} payments</span>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.history.slice().reverse().map((r) => ({
                  date: r.date?.slice(0, 7),
                  amount: Number(r.amount),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
                  <XAxis dataKey="date" stroke="rgb(var(--c-ink-4))" fontSize={10} />
                  <YAxis stroke="rgb(var(--c-ink-4))" fontSize={10} tickFormatter={(v) => `${activeCurrency()}${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(var(--c-surf-1))',
                      border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
                      borderRadius: 8, fontSize: 12,
                      color: 'rgb(var(--c-ink-1))',
                    }}
                    formatter={(v) => `${activeCurrency()}${Number(v).toFixed(4)}`}
                  />
                  <Bar dataKey="amount" fill="rgb(var(--c-up))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <TrendingUp size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Annual Totals</h3>
            </div>
            <div className="p-4">
              {sparkValues.length > 1 && (
                <div className="mb-3">
                  <MiniEquityCurve values={sparkValues} height={56} />
                </div>
              )}
              <table className="w-full text-xs t-dense">
                <thead>
                  <tr>
                    <th className="text-left">Year</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {annualBars.slice().reverse().map((b, i, arr) => {
                    const prev = arr[i + 1]?.total
                    const yoy = prev > 0 ? ((b.total - prev) / prev) * 100 : null
                    return (
                      <tr key={b.year}>
                        <td className="font-mono text-ink-2">{b.year}</td>
                        <td className="text-right font-mono tabular text-ink-1 font-semibold">{activeCurrency()}{b.total.toFixed(4)}</td>
                        <td className="text-right">{yoy != null && <PnlCell value={yoy} scale={20} />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {data && (data.history?.length ?? 0) === 0 && (
        <Card>
          <EmptyState
            icon={Coins}
            title="No dividend history"
            body="This company has not paid dividends in the recorded history."
          />
        </Card>
      )}

      {/* Splits */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
            <Scissors size={11} />
          </span>
          <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Stock Splits</h3>
          {(splits?.history?.length ?? 0) > 0 && (
            <span className="ml-auto text-2xs text-ink-4">{splits.history.length} events</span>
          )}
        </div>
        {(splits?.history?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-ink-4 text-sm">No split events on record.</div>
        ) : (
          <table className="w-full text-sm t-dense">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-right">Ratio</th>
                <th className="text-left text-ink-5 font-normal">Direction</th>
              </tr>
            </thead>
            <tbody>
              {splits.history.map((r, i) => {
                const ratio = Number(r.ratio)
                const isForward = ratio > 1
                return (
                  <tr key={i}>
                    <td className="font-mono text-ink-2">{fmtDate(r.date)}</td>
                    <td className="text-right font-mono tabular text-accent font-semibold">{fmt(ratio, 3)} : 1</td>
                    <td>
                      <span className={`text-2xs uppercase tracking-wider font-medium ${isForward ? 'text-up' : 'text-down'}`}>
                        {isForward ? 'Forward Split' : 'Reverse Split'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* ESG */}
      {esg?.scores && Object.keys(esg.scores).length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Leaf size={14} className="text-up" />
            <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Sustainability (ESG)</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {Object.entries(esg.scores).slice(0, 18).map(([k, v]) => (
              <StatTile key={k} label={k} value={typeof v === 'number' ? fmt(v) : String(v ?? '—')} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
