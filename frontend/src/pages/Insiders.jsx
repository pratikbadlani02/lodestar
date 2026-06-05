import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Users, TrendingUp, TrendingDown, Activity, PieChart } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import SymbolHeader from '../components/SymbolHeader'
import { Card, Section } from '../components/ui/primitives'
import { Donut, PnlCell } from '../components/ui/charts'
import EmptyState from '../components/ui/EmptyState'
import { activeCurrency } from '../components/ui/format'

const fmtBig = (v) => {
  if (v == null) return '—'
  const n = Number(v); if (Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString()
}
const fmtPct = (v, d = 1) => v == null ? '—' : `${(Number(v) * 100).toFixed(d)}%`
const fmtDate = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString() } catch { return s }
}
const fmtCell = (v) => {
  if (v == null) return '—'
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e6) return fmtBig(v)
    if (v > 0 && v < 1) return `${(v * 100).toFixed(2)}%`
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v)
  return String(v)
}

// Parse the major-holders breakdown (yfinance returns it as a 2-col table)
function parseOwnership(major) {
  if (!Array.isArray(major) || major.length === 0) return null
  // Major can come as records with keys like { "Value": 0.08, "Breakdown": "% Shares ..." }
  // OR as records with the first column being the % and the second the label.
  let insiderPct = null, institutionPct = null, instCount = null
  for (const row of major) {
    const cells = Object.values(row).filter((v) => v != null)
    if (cells.length < 2) continue
    // Find a label + a numeric pair (any order)
    let label = null, num = null
    for (const c of cells) {
      if (typeof c === 'string' && label == null) label = c
      else if (typeof c === 'number' && num == null) num = c
    }
    if (label == null || num == null) continue
    const lc = label.toLowerCase()
    if (lc.includes('insider')) insiderPct = num
    else if (lc.includes('institution')) {
      if (lc.includes('number')) instCount = num
      else if (institutionPct == null || lc.includes('float')) institutionPct = num
    }
  }
  if (insiderPct == null && institutionPct == null) return null
  const insider = insiderPct != null ? insiderPct : 0
  const institutional = institutionPct != null ? institutionPct : 0
  const remaining = Math.max(0, 1 - insider - institutional)
  return {
    slices: [
      { name: 'Institutions', value: +(institutional * 100).toFixed(2), color: 'rgb(var(--c-accent))' },
      { name: 'Insiders',     value: +(insider * 100).toFixed(2),       color: 'rgb(var(--c-warn))' },
      { name: 'Retail / Other', value: +(remaining * 100).toFixed(2),   color: 'rgb(var(--c-ink-5))' },
    ].filter((s) => s.value > 0),
    insiderPct, institutionPct, instCount,
  }
}

// Build monthly net buy/sell from insider_transactions
function buildFlow(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return []
  const byMonth = new Map()
  for (const t of transactions) {
    const dateStr = t['Start Date'] || t.Date || t.startDate || t.date
    if (!dateStr) continue
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let shares = Number(t.Shares ?? t.shares ?? 0)
    let value = Number(t.Value ?? t.value ?? 0)
    if (Number.isNaN(shares)) shares = 0
    if (Number.isNaN(value)) value = 0
    const text = String(t.Transaction ?? t.Text ?? '').toLowerCase()
    const isSell = text.includes('sale') || text.includes('sell') || text.includes('disposition') || shares < 0
    const slot = byMonth.get(key) || { month: key, buyShares: 0, sellShares: 0, buyValue: 0, sellValue: 0 }
    if (isSell) { slot.sellShares -= Math.abs(shares); slot.sellValue -= Math.abs(value) }
    else        { slot.buyShares  += Math.abs(shares); slot.buyValue  += Math.abs(value) }
    byMonth.set(key, slot)
  }
  // Last 12 months only
  return Array.from(byMonth.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
}

function DataTable({ records, fallback = 'No data' }) {
  if (!records || records.length === 0) {
    return <div className="text-ink-4 text-sm p-8 text-center">{fallback}</div>
  }
  const cols = Object.keys(records[0]).filter((c) => c !== 'index')
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs t-dense">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="font-mono text-ink-2 whitespace-nowrap">
                  {fmtCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Insiders({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const [symbol] = useSymbolPage(routeSym)
  const [tab, setTab] = useState('institutional')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!symbol) return
      setLoading(true); setError('')
      try {
        const r = await api.getHolders(symbol)
        if (!cancelled) setData(r)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [symbol])

  const ownership = useMemo(() => parseOwnership(data?.major), [data])
  const flow = useMemo(() => buildFlow(data?.insider_transactions), [data])

  // Net flow summary
  const flowSummary = useMemo(() => {
    if (flow.length === 0) return null
    let buyShares = 0, sellShares = 0, buyValue = 0, sellValue = 0, buyCount = 0, sellCount = 0
    for (const m of flow) {
      buyShares += m.buyShares; sellShares += m.sellShares
      buyValue += m.buyValue; sellValue += m.sellValue
      if (m.buyShares > 0) buyCount++
      if (m.sellShares < 0) sellCount++
    }
    const netShares = buyShares + sellShares
    const netValue = buyValue + sellValue
    const verdict =
      netValue > 0 ? { label: 'NET BUYING', tone: 'text-up', bg: 'bg-up/10 border-up/30' } :
      netValue < 0 ? { label: 'NET SELLING', tone: 'text-down', bg: 'bg-down/10 border-down/30' } :
                     { label: 'NEUTRAL', tone: 'text-ink-2', bg: 'bg-white/[0.04] border-white/[0.08]' }
    return { buyShares, sellShares, buyValue, sellValue, netShares, netValue, verdict, buyMonths: buyCount, sellMonths: sellCount }
  }, [flow])

  const current =
    tab === 'institutional' ? data?.institutional :
    tab === 'mutual' ? data?.mutual_fund :
    tab === 'insider' ? data?.insider_transactions :
    data?.major

  return (
    <div className={embedded ? 'space-y-3 md:space-y-4' : 'p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto'}>
      {!embedded && <SymbolHeader activePage="insiders" />}

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {loading && <div className="text-xs text-ink-4 soft-pulse">Loading insider data…</div>}

      {/* Ownership donut + net flow chart side by side */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Ownership composition */}
          <Card className="lg:col-span-5">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <PieChart size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Ownership Composition</h3>
            </div>
            <div className="p-4">
              {ownership ? (
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <Donut
                    data={ownership.slices}
                    size={170}
                    thickness={22}
                    centerValue={ownership.institutionPct != null ? `${(ownership.institutionPct * 100).toFixed(0)}%` : '—'}
                    centerLabel="institutional"
                  />
                  <div className="flex-1 space-y-2 w-full">
                    {ownership.slices.map((s) => (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-ink-2 flex-1">{s.name}</span>
                        <span className="font-mono tabular text-ink-1 font-semibold">{s.value.toFixed(1)}%</span>
                      </div>
                    ))}
                    {ownership.instCount != null && (
                      <div className="text-2xs text-ink-4 font-mono pt-2 border-t border-white/[0.06]">
                        {Number(ownership.instCount).toLocaleString()} institutional holders
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={PieChart}
                  title="No ownership breakdown"
                  body="The summary holders data isn't available for this ticker."
                />
              )}
            </div>
          </Card>

          {/* Net insider flow chart + summary */}
          <Card className="lg:col-span-7">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
                <Activity size={11} />
              </span>
              <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Insider Flow — last 12 months</h3>
              {flowSummary && (
                <span className={`ml-auto px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wider border ${flowSummary.verdict.bg} ${flowSummary.verdict.tone}`}>
                  {flowSummary.verdict.label}
                </span>
              )}
            </div>
            <div className="p-3">
              {flow.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={flow} stackOffset="sign" barCategoryGap={6}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
                      <XAxis dataKey="month" stroke="rgb(var(--c-ink-4))" fontSize={10} />
                      <YAxis stroke="rgb(var(--c-ink-4))" fontSize={10}
                        tickFormatter={(v) => fmtBig(Math.abs(v))} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgb(var(--c-surf-1))',
                          border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
                          borderRadius: 8, fontSize: 12,
                          color: 'rgb(var(--c-ink-1))',
                        }}
                        formatter={(v, name) => [fmtBig(Math.abs(Number(v))), name === 'buyShares' ? 'Buys' : 'Sells']}
                      />
                      <ReferenceLine y={0} stroke="rgba(var(--c-border-rgb) / 0.4)" />
                      <Bar dataKey="buyShares"  fill="rgba(var(--c-up) / 0.8)" name="Buys" />
                      <Bar dataKey="sellShares" fill="rgba(var(--c-down) / 0.8)" name="Sells" />
                    </BarChart>
                  </ResponsiveContainer>
                  {flowSummary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-2xs">
                      <FlowStat label="Buys" tone="text-up"
                        value={fmtBig(flowSummary.buyShares)}
                        sub={`${activeCurrency()}${fmtBig(flowSummary.buyValue)}`} />
                      <FlowStat label="Sells" tone="text-down"
                        value={fmtBig(Math.abs(flowSummary.sellShares))}
                        sub={`${activeCurrency()}${fmtBig(Math.abs(flowSummary.sellValue))}`} />
                      <FlowStat label="Net Shares"
                        tone={flowSummary.netShares >= 0 ? 'text-up' : 'text-down'}
                        value={`${flowSummary.netShares >= 0 ? '+' : ''}${fmtBig(flowSummary.netShares)}`} />
                      <FlowStat label="Net $"
                        tone={flowSummary.netValue >= 0 ? 'text-up' : 'text-down'}
                        value={`${flowSummary.netValue >= 0 ? '+' : ''}${activeCurrency()}${fmtBig(Math.abs(flowSummary.netValue))}`} />
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No recent insider transactions"
                  body="No reportable insider buys or sells in the last year."
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Detail tables */}
      {data && (
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] flex">
            {[
              ['institutional', 'Institutional', TrendingUp],
              ['mutual', 'Mutual Funds', Users],
              ['insider', 'Insider Transactions', Activity],
              ['major', 'Summary', PieChart],
            ].map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`relative px-4 py-2.5 text-2xs uppercase tracking-[0.14em] font-medium flex items-center gap-1.5 transition ${
                  tab === k ? 'text-ink-1' : 'text-ink-4 hover:text-ink-2'
                }`}
              >
                <Icon size={11} className={tab === k ? 'text-accent' : ''} />
                {label}
                {tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-grad rounded-full" />}
              </button>
            ))}
          </div>
          <DataTable
            records={current}
            fallback={`No ${tab === 'institutional' ? 'institutional holders' : tab === 'mutual' ? 'mutual fund holders' : tab === 'insider' ? 'insider transactions' : 'summary data'} available.`}
          />
        </Card>
      )}
    </div>
  )
}

function FlowStat({ label, value, sub, tone }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">{label}</div>
      <div className={`text-sm font-mono tabular font-bold ${tone || 'text-ink-1'} mt-0.5 leading-tight`}>{value}</div>
      {sub && <div className="text-2xs text-ink-5 font-mono mt-0.5">{sub}</div>}
    </div>
  )
}
