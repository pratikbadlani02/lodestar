import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GitCompare, X, Radar } from 'lucide-react'
import { api } from '../lib/api'
import { Card, SectionHeader, PageShell, PageHeader } from '../components/ui/primitives'
import { RadarCompare } from '../components/ui/charts'

// Palette for radar polygons — one per symbol slot, looping if more
const SERIES_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185']

// Normalize each fundamental to 0–100 scale for the radar
function radarAxes(profile) {
  if (!profile) return null
  const p = profile
  // Each axis: (raw value → normalized 0–100, with clamp)
  const clamp = (x) => Math.max(0, Math.min(100, x))
  const pe = Number(p.trailingPE)
  return {
    'Profit Margin':  clamp((Number(p.profitMargins) || 0) * 100 / 30 * 100),
    'ROE':            clamp((Number(p.returnOnEquity) || 0) * 100 / 40 * 100),
    'Revenue Growth': clamp((Number(p.revenueGrowth) || 0) * 100 / 30 * 100),
    'Value (1/PE)':   clamp(pe > 0 ? (30 / pe) * 100 : 0),
    'Div Yield':      clamp((Number(p.dividendYield) || 0) * 100 / 5 * 100),
    'Stability':      clamp(p.beta != null ? (1 / Math.max(0.3, Math.abs(Number(p.beta)))) * 60 : 50),
  }
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
const fmt = (v, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d)
const fmtPct = (v, d = 2) =>
  v == null ? '—' : `${(Number(v) * 100).toFixed(d)}%`

const ROWS = [
  ['Name',              (p) => p?.longName || p?.shortName, 'text'],
  ['Sector',            (p) => p?.sector, 'text'],
  ['Industry',          (p) => p?.industry, 'text'],
  ['Market Cap',        (p) => fmtBig(p?.marketCap)],
  ['Enterprise Value',  (p) => fmtBig(p?.enterpriseValue)],
  ['P/E (TTM)',         (p) => fmt(p?.trailingPE)],
  ['P/E (Fwd)',         (p) => fmt(p?.forwardPE)],
  ['EPS (TTM)',         (p) => fmt(p?.trailingEps)],
  ['P/B',               (p) => fmt(p?.priceToBook)],
  ['P/S',               (p) => fmt(p?.priceToSalesTrailing12Months)],
  ['PEG',               (p) => fmt(p?.pegRatio)],
  ['Beta',              (p) => fmt(p?.beta)],
  ['Dividend Yield',    (p) => fmtPct(p?.dividendYield)],
  ['Payout Ratio',      (p) => fmtPct(p?.payoutRatio)],
  ['Profit Margin',     (p) => fmtPct(p?.profitMargins)],
  ['Gross Margin',      (p) => fmtPct(p?.grossMargins)],
  ['Operating Margin',  (p) => fmtPct(p?.operatingMargins)],
  ['ROA',               (p) => fmtPct(p?.returnOnAssets)],
  ['ROE',               (p) => fmtPct(p?.returnOnEquity)],
  ['Revenue (TTM)',     (p) => fmtBig(p?.totalRevenue)],
  ['Revenue Growth',    (p) => fmtPct(p?.revenueGrowth)],
  ['Earnings Growth',   (p) => fmtPct(p?.earningsGrowth)],
  ['EBITDA',            (p) => fmtBig(p?.ebitda)],
  ['Total Cash',        (p) => fmtBig(p?.totalCash)],
  ['Total Debt',        (p) => fmtBig(p?.totalDebt)],
  ['Debt / Equity',     (p) => fmt(p?.debtToEquity)],
  ['Current Ratio',     (p) => fmt(p?.currentRatio)],
  ['Quick Ratio',       (p) => fmt(p?.quickRatio)],
  ['52w High',          (p) => fmt(p?.fiftyTwoWeekHigh)],
  ['52w Low',           (p) => fmt(p?.fiftyTwoWeekLow)],
  ['50d Avg',           (p) => fmt(p?.fiftyDayAverage)],
  ['200d Avg',          (p) => fmt(p?.twoHundredDayAverage)],
  ['Shares Out',        (p) => fmtBig(p?.sharesOutstanding)],
  ['Avg Volume',        (p) => fmtBig(p?.averageVolume)],
]

export default function Compare() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const initial = (params.get('symbols') || 'AAPL,MSFT,GOOGL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const [symbols, setSymbols] = useState(initial)
  const [profiles, setProfiles] = useState({})
  const [addInput, setAddInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const results = await Promise.all(
          symbols.map((s) => api.getProfile(s).catch((e) => ({ _error: e.message, symbol: s })))
        )
        if (cancelled) return
        const map = {}
        for (const r of results) map[r.symbol] = r
        setProfiles(map)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (symbols.length) load()
    setParams({ symbols: symbols.join(',') }, { replace: true })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(symbols)])

  function add(e) {
    e.preventDefault()
    const s = addInput.trim().toUpperCase()
    if (!s || symbols.includes(s) || symbols.length >= 6) return
    setSymbols([...symbols, s])
    setAddInput('')
  }
  function remove(s) {
    setSymbols(symbols.filter((x) => x !== s))
  }

  // For each row, identify the best/worst value to highlight (numeric rows only)
  function classifyRow(rowIdx, getter, kind) {
    if (kind === 'text') return {}
    const vals = symbols.map((s) => Number(getter(profiles[s])))
    const usable = vals.filter((v) => !Number.isNaN(v) && Number.isFinite(v))
    if (usable.length < 2) return {}
    const min = Math.min(...usable)
    const max = Math.max(...usable)
    const cls = {}
    symbols.forEach((s, i) => {
      const v = vals[i]
      if (Number.isNaN(v) || !Number.isFinite(v)) return
      if (v === max && v !== min) cls[s] = 'text-up'
      else if (v === min && v !== max) cls[s] = 'text-down'
    })
    return cls
  }

  return (
    <PageShell>
      <PageHeader
        icon={GitCompare}
        title="Compare Symbols"
        subtitle="Side-by-side fundamentals and ratios for up to 6 tickers"
        badge={loading ? <span className="text-2xs text-ink-4 font-mono">Loading…</span> : null}
      />

      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s) => (
          <span key={s} className="bg-surf-2 border border-surf-3 rounded-full pl-3 pr-1 py-1 text-sm flex items-center gap-1">
            <span className="font-mono font-semibold">{s}</span>
            <button onClick={() => remove(s)} className="text-ink-3 hover:text-down rounded-full p-0.5">
              <X size={14} />
            </button>
          </span>
        ))}
        <form onSubmit={add} className="flex items-center gap-2">
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder={symbols.length >= 6 ? 'Max 6 symbols' : 'Add symbol…'}
            disabled={symbols.length >= 6}
            className="bg-surf-1 border border-surf-3 rounded-lg px-3 py-1.5 text-sm font-mono uppercase w-32 disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={symbols.length >= 6}
            className="bg-up hover:bg-up text-[#fff] text-sm rounded-lg px-3 py-1.5 disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Radar overlay — fundamentals at a glance */}
      {symbols.length >= 2 && Object.keys(profiles).length >= 2 && (
        <Card>
          <SectionHeader
            icon={Radar}
            title="Fundamental Radar"
            action={<span className="text-2xs text-ink-4">all axes normalized 0-100, higher = better</span>}
          />
          <div className="p-3">
            <RadarCompare
              axes={['Profit Margin', 'ROE', 'Revenue Growth', 'Value (1/PE)', 'Div Yield', 'Stability']}
              series={symbols
                .filter((s) => profiles[s] && !profiles[s]._error)
                .map((s, i) => ({
                  name: s,
                  color: SERIES_COLORS[i % SERIES_COLORS.length],
                  values: radarAxes(profiles[s]) || {},
                }))}
              height={300}
            />
          </div>
        </Card>
      )}

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-4 bg-surf-0/40">
                <th className="px-3 py-2 text-left sticky left-0 bg-surf-0/40 z-10">Metric</th>
                {symbols.map((s) => (
                  <th
                    key={s}
                    className="px-3 py-2 text-right whitespace-nowrap font-mono font-semibold text-ink-1 cursor-pointer hover:text-up"
                    onClick={() => navigate(`/stocks?symbol=${s}`)}
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, getter, kind], i) => {
                const colors = classifyRow(i, getter, kind)
                return (
                  <tr key={label} className="border-t border-surf-2/60 hover:bg-surf-2/20">
                    <td className="px-3 py-1.5 text-ink-3 sticky left-0 bg-surf-1 whitespace-nowrap">{label}</td>
                    {symbols.map((s) => {
                      const v = profiles[s]?._error ? '—' : getter(profiles[s])
                      const cls = colors[s] || 'text-ink-2'
                      return (
                        <td key={s} className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${cls}`}>
                          {v ?? '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-ink-4">
        Best value in each numeric row is shown in green, worst in red. Click a symbol header to open its detail page.
      </div>
    </PageShell>
  )
}
