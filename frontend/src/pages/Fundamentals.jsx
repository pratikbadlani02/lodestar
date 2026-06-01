import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Building2, TrendingUp, BarChart3, FileText } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import SymbolHeader from '../components/SymbolHeader'
import Term from '../components/Term'
import { Card, Section } from '../components/ui/primitives'
import { PnlCell } from '../components/ui/charts'
import { fmtBig as fb, fmt } from '../components/ui/format'

const fmtBig = fb

function fmtNum(v, d = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d })
}
function fmtPct(v, d = 2) {
  if (v == null) return '—'
  return `${(Number(v) * 100).toFixed(d)}%`
}
function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) } catch { return s }
}

// Tile in the key-stats grid; semantic tone optional
function StatTile({ label, value, tone, sub }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5 hover:bg-white/[0.05] transition-colors">
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">{label}</div>
      <div className={`mt-1 text-sm font-mono tabular font-semibold leading-tight ${tone || 'text-ink-1'}`}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-2xs text-ink-5 mt-0.5">{sub}</div>}
    </div>
  )
}

// Extract numeric series for the trend chart from a statement records array
function extractTrend(records) {
  if (!records || records.length === 0) return []
  // Prefer canonical keys; fall back to common variants
  const KEYS = {
    revenue: ['Total Revenue', 'TotalRevenue', 'OperatingRevenue', 'Revenue'],
    netIncome: ['Net Income', 'NetIncome', 'NetIncomeCommonStockholders'],
    grossProfit: ['Gross Profit', 'GrossProfit'],
    operatingIncome: ['Operating Income', 'OperatingIncome'],
  }
  function pick(rec, names) {
    for (const n of names) if (rec[n] != null && !Number.isNaN(Number(rec[n]))) return Number(rec[n])
    return null
  }
  return records.slice().reverse().map((r) => ({
    period: fmtDate(r.period),
    revenue: pick(r, KEYS.revenue),
    netIncome: pick(r, KEYS.netIncome),
    grossProfit: pick(r, KEYS.grossProfit),
    operatingIncome: pick(r, KEYS.operatingIncome),
  }))
}

// YoY growth between the two most recent periods of a series
function yoyGrowth(series, key) {
  if (!series || series.length < 2) return null
  const last = series[series.length - 1]?.[key]
  const prev = series[series.length - 2]?.[key]
  if (last == null || prev == null || prev === 0) return null
  return ((last - prev) / Math.abs(prev)) * 100
}

function StatementTable({ records }) {
  if (!records || records.length === 0) {
    return <div className="text-ink-4 text-sm p-8 text-center">No statement data available.</div>
  }
  const periods = records.map((r) => r.period)
  const lineItems = Array.from(
    new Set(records.flatMap((r) => Object.keys(r).filter((k) => k !== 'period')))
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-2xs text-ink-4 bg-surf-2/40">
            <th className="px-3 py-2 text-left sticky left-0 bg-surf-2/60 backdrop-blur z-10 font-medium tracking-wider uppercase">Line Item</th>
            {periods.map((p) => (
              <th key={p} className="px-3 py-2 text-right whitespace-nowrap font-medium tracking-wider uppercase">
                {fmtDate(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
              <td className="px-3 py-1.5 text-ink-2 sticky left-0 bg-surf-1">{item}</td>
              {records.map((rec) => (
                <td key={rec.period} className="px-3 py-1.5 text-right text-ink-1 tabular whitespace-nowrap">
                  {fmtBig(rec[item])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Fundamentals({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const [symbol] = useSymbolPage(routeSym)
  const [period, setPeriod] = useState('annual')
  const [tab, setTab] = useState('income')
  const [profile, setProfile] = useState(null)
  const [stmts, setStmts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!symbol) return
      setLoading(true); setError('')
      try {
        const [p, s] = await Promise.all([
          api.getProfile(symbol),
          api.getFundamentals(symbol, period),
        ])
        if (cancelled) return
        setProfile(p); setStmts(s)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [symbol, period])

  const currentRecords = useMemo(() => {
    if (!stmts) return []
    if (tab === 'income') return stmts.income_statement
    if (tab === 'balance') return stmts.balance_sheet
    return stmts.cash_flow
  }, [stmts, tab])

  // Income trend for chart (always pulled from income_statement, regardless of selected tab)
  const incomeTrend = useMemo(() => extractTrend(stmts?.income_statement), [stmts])
  const cashTrend = useMemo(() => extractTrend(stmts?.cash_flow), [stmts])

  // YoY growths
  const revGrowth = yoyGrowth(incomeTrend, 'revenue')
  const niGrowth = yoyGrowth(incomeTrend, 'netIncome')

  return (
    <div className={embedded ? 'space-y-3 md:space-y-4' : 'p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto'}>
      {!embedded && <SymbolHeader activePage="fundamentals" />}

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Business summary */}
      {profile?.longBusinessSummary && (
        <Card className="p-4">
          <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium mb-2">About</div>
          <p className="text-sm text-ink-2 leading-relaxed line-clamp-3">{profile.longBusinessSummary}</p>
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noreferrer"
              className="text-2xs text-accent hover:underline mt-2 inline-block">
              {profile.website}
            </a>
          )}
        </Card>
      )}

      {/* Revenue / Net income trend */}
      {incomeTrend.length > 1 && (
        <Card>
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] text-accent">
              <TrendingUp size={11} />
            </span>
            <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">Revenue & Earnings Trend</h3>
            <span className="ml-auto flex items-center gap-3 text-2xs">
              {revGrowth != null && (
                <span className="flex items-center gap-1">
                  <span className="text-ink-4">Rev YoY:</span>
                  <PnlCell value={revGrowth} scale={30} />
                </span>
              )}
              {niGrowth != null && (
                <span className="flex items-center gap-1">
                  <span className="text-ink-4">NI YoY:</span>
                  <PnlCell value={niGrowth} scale={50} />
                </span>
              )}
            </span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={incomeTrend} barCategoryGap={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
                <XAxis dataKey="period" stroke="rgb(var(--c-ink-4))" fontSize={11} />
                <YAxis stroke="rgb(var(--c-ink-4))" fontSize={11} tickFormatter={(v) => fmtBig(v)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgb(var(--c-surf-1))',
                    border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
                    borderRadius: 8, fontSize: 12,
                    color: 'rgb(var(--c-ink-1))',
                  }}
                  formatter={(v) => fmtBig(v)}
                />
                <Bar dataKey="revenue" fill="rgb(var(--c-accent))" name="Revenue" radius={[3, 3, 0, 0]} />
                <Bar dataKey="grossProfit" fill="rgb(var(--c-accent2))" name="Gross Profit" radius={[3, 3, 0, 0]} />
                <Bar dataKey="operatingIncome" fill="rgb(var(--c-warn))" name="Op Income" radius={[3, 3, 0, 0]} />
                <Bar dataKey="netIncome" fill="rgb(var(--c-up))" name="Net Income" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-2xs font-mono justify-center">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent2" />Gross</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warn" />Op Income</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-up" />Net Income</span>
            </div>
          </div>
        </Card>
      )}

      {/* Key ratios — grouped into themed buckets */}
      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {/* Valuation */}
          <Section title="Valuation" icon={BarChart3} padded={false}>
            <div className="grid grid-cols-2 gap-2 p-3">
              <StatTile label={<Term id="marketcap">Market Cap</Term>} value={fmtBig(profile.marketCap)} />
              <StatTile label="Enterprise" value={fmtBig(profile.enterpriseValue)} />
              <StatTile label={<Term id="pe">P/E TTM</Term>} value={fmtNum(profile.trailingPE)} />
              <StatTile label="P/E Fwd" value={fmtNum(profile.forwardPE)} />
              <StatTile label="P/B" value={fmtNum(profile.priceToBook)} />
              <StatTile label="P/S" value={fmtNum(profile.priceToSalesTrailing12Months)} />
              <StatTile label="PEG" value={fmtNum(profile.pegRatio)} />
              <StatTile label="EV/EBITDA" value={fmtNum(profile.enterpriseToEbitda)} />
            </div>
          </Section>

          {/* Profitability */}
          <Section title="Profitability" icon={TrendingUp} padded={false}>
            <div className="grid grid-cols-2 gap-2 p-3">
              <StatTile label={<Term id="margin">Profit Margin</Term>} value={fmtPct(profile.profitMargins)}
                tone={(profile.profitMargins ?? 0) > 0.15 ? 'text-up' : (profile.profitMargins ?? 0) < 0 ? 'text-down' : 'text-ink-1'} />
              <StatTile label="Gross Margin" value={fmtPct(profile.grossMargins)} />
              <StatTile label="Op Margin" value={fmtPct(profile.operatingMargins)} />
              <StatTile label={<Term id="roe">ROE</Term>} value={fmtPct(profile.returnOnEquity)}
                tone={(profile.returnOnEquity ?? 0) > 0.15 ? 'text-up' : 'text-ink-1'} />
              <StatTile label="ROA" value={fmtPct(profile.returnOnAssets)} />
              <StatTile label={<Term id="eps">EPS TTM</Term>} value={fmtNum(profile.trailingEps)} />
              <StatTile label="EPS Fwd" value={fmtNum(profile.forwardEps)} />
              <StatTile label="EBITDA" value={fmtBig(profile.ebitda)} />
            </div>
          </Section>

          {/* Health */}
          <Section title="Financial Health" icon={FileText} padded={false}>
            <div className="grid grid-cols-2 gap-2 p-3">
              <StatTile label="D/E" value={fmtNum(profile.debtToEquity)}
                tone={(profile.debtToEquity ?? 0) > 200 ? 'text-down' : (profile.debtToEquity ?? 0) < 50 ? 'text-up' : 'text-ink-1'} />
              <StatTile label="Current Ratio" value={fmtNum(profile.currentRatio)}
                tone={(profile.currentRatio ?? 0) > 2 ? 'text-up' : (profile.currentRatio ?? 0) < 1 ? 'text-down' : 'text-ink-1'} />
              <StatTile label="Quick Ratio" value={fmtNum(profile.quickRatio)} />
              <StatTile label="Total Cash" value={fmtBig(profile.totalCash)} />
              <StatTile label="Total Debt" value={fmtBig(profile.totalDebt)} />
              <StatTile label="Cash/Share" value={fmtNum(profile.totalCashPerShare)} />
              <StatTile label="Book Value" value={fmtNum(profile.bookValue)} />
              <StatTile label={<Term id="fcf">FCF</Term>} value={fmtBig(profile.freeCashflow)} />
            </div>
          </Section>

          {/* Dividends + Other */}
          <Section title="Distribution & Risk" icon={Building2} padded={false}>
            <div className="grid grid-cols-2 gap-2 p-3">
              <StatTile label={<Term id="dividend">Div Yield</Term>} value={fmtPct(profile.dividendYield)}
                tone={(profile.dividendYield ?? 0) > 0.03 ? 'text-up' : 'text-ink-1'} />
              <StatTile label="Payout" value={fmtPct(profile.payoutRatio)} />
              <StatTile label={<Term id="beta">Beta</Term>} value={fmtNum(profile.beta)}
                tone={(profile.beta ?? 1) > 1.2 ? 'text-down' : (profile.beta ?? 1) < 0.8 ? 'text-up' : 'text-ink-1'} />
              <StatTile label="52w High" value={fmtNum(profile.fiftyTwoWeekHigh)} />
              <StatTile label="52w Low" value={fmtNum(profile.fiftyTwoWeekLow)} />
              <StatTile label="50d Avg" value={fmtNum(profile.fiftyDayAverage)} />
              <StatTile label="200d Avg" value={fmtNum(profile.twoHundredDayAverage)} />
              <StatTile label="Shares Out" value={fmtBig(profile.sharesOutstanding)} />
            </div>
          </Section>
        </div>
      )}

      {/* Statement selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="bg-surf-1 border border-white/[0.06] rounded-lg p-0.5 flex">
          {[
            ['income', 'Income'],
            ['balance', 'Balance Sheet'],
            ['cash', 'Cash Flow'],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition ${
                tab === k ? 'bg-accent/15 text-accent' : 'text-ink-3 hover:text-ink-1'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-surf-1 border border-white/[0.06] rounded-lg p-0.5 flex">
          {['annual', 'quarterly'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium capitalize transition ${
                period === p ? 'bg-accent/15 text-accent' : 'text-ink-3 hover:text-ink-1'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {loading && <span className="text-2xs text-ink-4 soft-pulse">Loading…</span>}
      </div>

      <Card className="overflow-hidden">
        <StatementTable records={currentRecords} />
      </Card>
    </div>
  )
}
