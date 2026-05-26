import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, RefreshCw, ArrowDownAZ, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { api } from '../lib/api'
import {
  PageShell, PageHeader, Card, IconButton, Select, Pill,
} from '../components/ui/primitives'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'

// Curated megacap-by-sector list. Edit freely — Heatmap renders whatever symbols
// have a snapshot returned by /market/snapshots.
const SECTOR_MAP = {
  Technology:              ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'INTC', 'CSCO', 'QCOM', 'TXN', 'IBM', 'NOW', 'INTU'],
  'Consumer Discretionary':['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'BKNG', 'TJX', 'CMG'],
  'Communication Services':['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'TMUS', 'VZ', 'T', 'CHTR'],
  Financials:              ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'C', 'AXP', 'SCHW', 'V', 'MA'],
  Healthcare:              ['UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY'],
  'Consumer Staples':      ['WMT', 'PG', 'KO', 'PEP', 'COST', 'MDLZ', 'PM', 'CL'],
  Energy:                  ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PSX', 'MPC'],
  Industrials:             ['CAT', 'BA', 'HON', 'GE', 'UPS', 'RTX', 'LMT', 'UNP', 'DE'],
  Utilities:               ['NEE', 'SO', 'DUK', 'AEP', 'SRE'],
  'Real Estate':           ['PLD', 'AMT', 'EQIX', 'CCI', 'O'],
  Materials:               ['LIN', 'SHW', 'APD', 'FCX', 'NEM'],
}

// Color intensity scale — real gradient driven by alpha. The previous implementation
// reused the same Tailwind class across multiple brackets, killing the gradient.
// Now: hue from up/down semantic vars, alpha from |pct| / 5.
function tileBg(pct) {
  if (pct == null || Number.isNaN(pct)) return 'rgb(var(--c-surf-2))'
  const mag = Math.min(Math.abs(pct) / 5, 1)            // saturate at ±5%
  const alpha = 0.10 + mag * 0.55                       // 0.10..0.65
  const hue = pct >= 0 ? '--c-up' : '--c-down'
  return `rgba(var(${hue}) / ${alpha.toFixed(3)})`
}
function tileText(pct) {
  if (pct == null) return 'rgb(var(--c-ink-4))'
  const mag = Math.abs(pct)
  // High-magnitude tiles: pure white text. Low-magnitude: themed up/down text.
  if (mag >= 2.5) return '#fff'
  return pct >= 0 ? 'rgb(var(--c-up))' : 'rgb(var(--c-down))'
}

const fmtPct = (v) => {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}
const fmtVol = (v) => {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}

// Auto-refresh cadence (ms). Long enough to avoid hammering the API but
// frequent enough that prices feel current.
const REFRESH_MS = 30000

// ── Legend bar — five fixed buckets with their actual colors ────────
function Legend() {
  const buckets = [-4, -2, -0.5, 0.5, 2, 4]
  return (
    <div className="flex items-center gap-2 text-2xs text-ink-4">
      <span>Day change:</span>
      {buckets.map((b, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded font-mono tabular font-semibold"
          style={{ background: tileBg(b), color: tileText(b) }}
        >
          {fmtPct(b)}
        </span>
      ))}
    </div>
  )
}

// ── Sector breadth — proportional bar of gainers/flat/losers ────────
function BreadthBar({ items }) {
  const gainers = items.filter((x) => x.pct > 0.1).length
  const losers  = items.filter((x) => x.pct < -0.1).length
  const flat    = items.length - gainers - losers
  const total   = Math.max(items.length, 1)
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-32 rounded-full overflow-hidden bg-white/[0.04]">
        <div className="bg-up"   style={{ width: `${(gainers / total) * 100}%` }} title={`${gainers} gainers`} />
        <div className="bg-ink-5 opacity-30" style={{ width: `${(flat   / total) * 100}%` }} title={`${flat} flat`} />
        <div className="bg-down" style={{ width: `${(losers  / total) * 100}%` }} title={`${losers} losers`} />
      </div>
      <span className="text-2xs font-mono tabular text-ink-4">
        <span className="text-up">{gainers}</span>·<span className="text-down">{losers}</span>
      </span>
    </div>
  )
}

export default function Heatmap() {
  const navigate = useNavigate()
  const ctx = useSymbolContextMenu()
  const [snapshots, setSnapshots] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [sortMode, setSortMode] = useState('change_desc')  // change_desc | change_asc | volume | alpha
  const [sizeMode, setSizeMode] = useState('uniform')      // uniform | volume
  const [activeSector, setActiveSector] = useState(null)   // null = all
  const [collapsed, setCollapsed] = useState({})           // { sector: bool }
  const intervalRef = useRef(null)

  const allSymbols = useMemo(
    () => Array.from(new Set(Object.values(SECTOR_MAP).flat())),
    []
  )

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.getSnapshots(allSymbols.join(','))
      setSnapshots(r.snapshots || {})
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e.message || 'Failed to fetch snapshots')
    } finally {
      setLoading(false)
    }
  }

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Stat extractors from a snapshot record
  function snapStats(sym) {
    const s = snapshots[sym]
    if (!s) return null
    const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
    const prev = s.prevDailyBar?.c
    const open = s.dailyBar?.o
    const high = s.dailyBar?.h
    const low  = s.dailyBar?.l
    const vol  = s.dailyBar?.v
    const pct  = (last != null && prev != null) ? ((last - prev) / prev) * 100 : null
    return { sym, last, prev, open, high, low, vol, pct }
  }

  // Build per-sector items, filtered/sorted by current settings.
  const sectorData = useMemo(() => {
    const result = []
    for (const [sector, syms] of Object.entries(SECTOR_MAP)) {
      if (activeSector && sector !== activeSector) continue
      const items = syms
        .map(snapStats)
        .filter((x) => x && x.pct != null)
      if (items.length === 0) continue

      // Sort
      if (sortMode === 'change_desc') items.sort((a, b) => (b.pct || 0) - (a.pct || 0))
      else if (sortMode === 'change_asc') items.sort((a, b) => (a.pct || 0) - (b.pct || 0))
      else if (sortMode === 'volume')   items.sort((a, b) => (b.vol || 0) - (a.vol || 0))
      else if (sortMode === 'alpha')    items.sort((a, b) => a.sym.localeCompare(b.sym))

      const avg = items.reduce((s, x) => s + (x.pct || 0), 0) / items.length
      const totalVol = items.reduce((s, x) => s + (x.vol || 0), 0)
      const maxVol = Math.max(1, ...items.map((x) => x.vol || 0))
      result.push({ sector, items, avg, totalVol, maxVol })
    }
    return result
  }, [snapshots, sortMode, activeSector])

  // Overall market breadth across all visible items
  const allItems = sectorData.flatMap((s) => s.items)
  const marketAvg = allItems.length ? allItems.reduce((s, x) => s + (x.pct || 0), 0) / allItems.length : 0

  function toggleSector(name) {
    setCollapsed((c) => ({ ...c, [name]: !c[name] }))
  }

  return (
    <PageShell>
      <PageHeader
        icon={LayoutGrid}
        title="Market Heatmap"
        subtitle={
          updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString()} · auto-refresh ${REFRESH_MS / 1000}s`
            : 'Loading…'
        }
        badge={
          allItems.length ? (
            <Pill variant={marketAvg >= 0 ? 'up' : 'down'} className="font-mono">
              MKT {fmtPct(marketAvg)}
            </Pill>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2">
            <Select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="min-w-[150px]">
              <option value="change_desc">Best → Worst</option>
              <option value="change_asc">Worst → Best</option>
              <option value="volume">Volume</option>
              <option value="alpha">A → Z</option>
            </Select>
            <Select value={sizeMode} onChange={(e) => setSizeMode(e.target.value)} className="min-w-[130px]">
              <option value="uniform">Uniform tiles</option>
              <option value="volume">Sized by volume</option>
            </Select>
            <IconButton icon={RefreshCw} label="Refresh" onClick={load} className={loading ? 'animate-spin' : ''} />
          </div>
        }
      />

      {/* Sector filter chips + legend */}
      <Card className="px-4 py-3 mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveSector(null)}
            className={`text-2xs px-2.5 py-1 rounded-md transition border ${
              activeSector === null
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.08]'
            }`}
          >
            All sectors
          </button>
          {Object.keys(SECTOR_MAP).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSector((v) => v === s ? null : s)}
              className={`text-2xs px-2.5 py-1 rounded-md transition border ${
                activeSector === s
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.08]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto"><Legend /></div>
      </Card>

      {error && (
        <Card className="px-3 py-2 mb-3 border-down/30 bg-down/[0.06] text-down text-sm">
          {error}
        </Card>
      )}

      {sectorData.length === 0 && !loading && !error && (
        <Card className="p-10 text-center text-ink-4 text-sm">
          No data for the selected filter.
        </Card>
      )}

      {/* Sectors */}
      <div className="space-y-3">
        {sectorData.map(({ sector, items, avg, totalVol, maxVol }) => (
          <Card key={sector} className="overflow-hidden">
            <button
              onClick={() => toggleSector(sector)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="font-display font-semibold text-sm text-ink-1 truncate">{sector}</h3>
                <span className="text-2xs font-mono tabular text-ink-5">{items.length}</span>
              </div>
              <BreadthBar items={items} />
              <div className="flex items-center gap-3 text-2xs font-mono tabular shrink-0">
                <span className="text-ink-4 hidden md:inline">vol {fmtVol(totalVol)}</span>
                <Pill variant={avg >= 0 ? 'up' : 'down'} className="font-mono tabular">
                  avg {fmtPct(avg)}
                </Pill>
              </div>
            </button>

            {!collapsed[sector] && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1 p-2 border-t border-white/[0.06]">
                {items.map((it) => {
                  // Sized-by-volume mode: scale tile height by relative volume.
                  // Min 1, max 2 cells tall (via row-span) so the grid stays sane.
                  const sized = sizeMode === 'volume'
                  const rel = (it.vol || 0) / maxVol
                  const rowSpan = sized && rel > 0.5 ? 2 : 1
                  const isHero = sized && rel > 0.5
                  return (
                    <Tile
                      key={it.sym}
                      data={it}
                      rowSpan={rowSpan}
                      hero={isHero}
                      onClick={() => navigate(`/analysis/${it.sym}`)}
                      onContextMenu={(e) => ctx.onContextMenu(e, it.sym)}
                    />
                  )
                })}
              </div>
            )}
          </Card>
        ))}
      </div>
      {ctx.menu}
    </PageShell>
  )
}

// ── Tile — single-symbol cell with hover preview ─────────────────────
function Tile({ data, rowSpan = 1, hero = false, onClick, onContextMenu }) {
  const { sym, pct, last, open, high, low, vol } = data
  const style = {
    background: tileBg(pct),
    color: tileText(pct),
    gridRow: rowSpan > 1 ? `span ${rowSpan} / span ${rowSpan}` : undefined,
  }
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={style}
      className="group relative rounded-md p-2 transition hover:ring-2 hover:ring-white/30 hover:z-10 text-left focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden"
    >
      <div className={`font-mono font-bold ${hero ? 'text-sm' : 'text-xs'}`}>{sym}</div>
      <div className={`font-mono tabular ${hero ? 'text-xs' : 'text-2xs'} opacity-95`}>{fmtPct(pct)}</div>
      {hero && (
        <div className="text-2xs font-mono tabular opacity-80 mt-0.5">
          ${last?.toFixed(2) ?? '—'}
        </div>
      )}

      {/* Rich hover popover — sits absolutely so it doesn't reflow the grid */}
      <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 z-20 hidden group-hover:block pointer-events-none">
        <div className="card-surface px-3 py-2 text-2xs font-mono tabular whitespace-nowrap text-ink-1 shadow-2xl">
          <div className="font-display font-semibold text-sm text-ink-1 mb-1">{sym}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-ink-4">Last</span><span>${last?.toFixed(2) ?? '—'}</span>
            <span className="text-ink-4">Open</span><span>${open?.toFixed(2) ?? '—'}</span>
            <span className="text-ink-4">High</span><span>${high?.toFixed(2) ?? '—'}</span>
            <span className="text-ink-4">Low</span><span>${low?.toFixed(2) ?? '—'}</span>
            <span className="text-ink-4">Vol</span><span>{fmtVol(vol)}</span>
            <span className="text-ink-4">Δ</span>
            <span className={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
