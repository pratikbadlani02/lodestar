import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, RefreshCw, Grid2x2, Map } from 'lucide-react'
import { api } from '../lib/api'
import {
  PageShell, PageHeader, Card, IconButton, Select, Pill,
} from '../components/ui/primitives'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import { useMarket } from '../lib/MarketContext'

// Curated megacap-by-sector list. Edit freely — Heatmap renders whatever symbols
// have a snapshot returned by /market/snapshots. One map per market.
const SECTOR_MAP_US = {
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

// India (NSE) sector map — symbols carry the .NS suffix.
const SECTOR_MAP_IN = {
  'IT Services':       ['TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TECHM.NS', 'LTIM.NS'],
  Financials:          ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'KOTAKBANK.NS', 'AXISBANK.NS', 'INDUSINDBK.NS', 'BAJFINANCE.NS', 'BAJAJFINSV.NS', 'SBILIFE.NS', 'HDFCLIFE.NS'],
  Energy:              ['RELIANCE.NS', 'ONGC.NS', 'BPCL.NS', 'COALINDIA.NS', 'NTPC.NS', 'POWERGRID.NS'],
  Auto:                ['MARUTI.NS', 'TATAMOTORS.NS', 'M&M.NS', 'EICHERMOT.NS', 'HEROMOTOCO.NS', 'BAJAJ-AUTO.NS'],
  'FMCG / Consumer':   ['HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS', 'BRITANNIA.NS', 'TATACONSUM.NS', 'DMART.NS', 'TITAN.NS'],
  Pharma:              ['SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS', 'APOLLOHOSP.NS'],
  Materials:           ['ULTRACEMCO.NS', 'GRASIM.NS', 'ASIANPAINT.NS', 'TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS'],
  'Infra / Conglom.':  ['LT.NS', 'ADANIENT.NS', 'ADANIPORTS.NS'],
  Telecom:             ['BHARTIARTL.NS'],
}

// Color intensity scale — real gradient driven by alpha. Hue from up/down
// semantic vars, alpha from |pct| / 5 (saturating at ±5%).
function tileBg(pct) {
  if (pct == null || Number.isNaN(pct)) return 'rgb(var(--c-surf-2))'
  const mag = Math.min(Math.abs(pct) / 5, 1)
  const alpha = 0.12 + mag * 0.58
  const hue = pct >= 0 ? '--c-up' : '--c-down'
  return `rgba(var(${hue}) / ${alpha.toFixed(3)})`
}
function tileText(pct) {
  if (pct == null) return 'rgb(var(--c-ink-4))'
  if (Math.abs(pct) >= 2.5) return '#fff'
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

// Auto-refresh cadence (ms).
const REFRESH_MS = 30000

// Weight that drives tile area. Dollar-volume (price × volume) is the default —
// snapshots don't carry market cap, and dollar-volume is the best "importance"
// proxy we have. Volume and Equal are the alternatives.
function weightOf(it, mode) {
  if (mode === 'equal')  return 1
  if (mode === 'volume') return Math.max(it.vol || 0, 1)
  return Math.max((it.vol || 0) * (it.last || 0), 1)   // dollar volume
}

// ── Squarified treemap (Bruls, Huizing & van Wijk) ──────────────────
// Returns each input item with absolute {x, y, w, h} added. Items must carry
// a positive `value`; they're laid out to fill the given rect by area.
function worstRatio(areas, side) {
  const sum = areas.reduce((s, a) => s + a, 0)
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  const s2 = sum * sum
  const w2 = side * side
  return Math.max((w2 * max) / s2, s2 / (w2 * min))
}
function layoutRow(row, x, y, w, h, out) {
  const rowArea = row.reduce((s, r) => s + r.area, 0)
  if (w >= h) {
    const rowW = rowArea / h
    let cy = y
    for (const r of row) {
      const rh = r.area / rowW
      out.push({ ...r, x, y: cy, w: rowW, h: rh })
      cy += rh
    }
    return { x: x + rowW, y, w: w - rowW, h }
  }
  const rowH = rowArea / w
  let cx = x
  for (const r of row) {
    const rw = r.area / rowH
    out.push({ ...r, x: cx, y, w: rw, h: rowH })
    cx += rw
  }
  return { x, y: y + rowH, w, h: h - rowH }
}
function squarify(data, rect) {
  let { x, y, w, h } = rect
  if (w <= 0 || h <= 0 || !data.length) return []
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const scale = (w * h) / total
  const items = data.map((d) => ({ ...d, area: d.value * scale }))
  const out = []
  let row = []
  let i = 0
  while (i < items.length) {
    const next = items[i]
    const side = Math.min(w, h)
    const candidate = [...row, next].map((r) => r.area)
    if (row.length === 0 || worstRatio(candidate, side) <= worstRatio(row.map((r) => r.area), side)) {
      row.push(next)
      i++
    } else {
      ;({ x, y, w, h } = layoutRow(row, x, y, w, h, out))
      row = []
    }
  }
  if (row.length) layoutRow(row, x, y, w, h, out)
  return out
}

// ── Legend bar — fixed buckets with their actual colors ─────────────
function Legend() {
  const buckets = [-4, -2, -0.5, 0.5, 2, 4]
  return (
    <div className="flex items-center gap-2 text-2xs text-ink-4">
      <span className="hidden sm:inline">Day change:</span>
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
  const { market } = useMarket()
  const SECTOR_MAP = market === 'in' ? SECTOR_MAP_IN : SECTOR_MAP_US
  const [snapshots, setSnapshots] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [viewMode, setViewMode] = useState('treemap')      // treemap | grid
  const [sizeMode, setSizeMode] = useState('dollarvol')    // dollarvol | volume | equal
  const [sortMode, setSortMode] = useState('change_desc')  // grid view sort
  const [activeSector, setActiveSector] = useState(null)   // null = all
  const [collapsed, setCollapsed] = useState({})           // grid view collapse
  const [hover, setHover] = useState(null)                 // { it, x, y }
  const intervalRef = useRef(null)
  const mapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const allSymbols = useMemo(
    () => Array.from(new Set(Object.values(SECTOR_MAP).flat())),
    [SECTOR_MAP]
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

  // Initial load + auto-refresh every 30s; reloads when the market switches
  // (allSymbols changes with the active market's sector map).
  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [allSymbols])

  const allSymbolsLoaded = Object.keys(snapshots).length > 0

  // Measure the treemap container so the layout can fill it. The container is
  // conditionally rendered (only once data arrives), so re-run when the treemap
  // first becomes visible — not just on view toggle.
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode, allSymbolsLoaded])

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

  // Sectors with resolved items + aggregates — shared by both views.
  const sectors = useMemo(() => {
    const out = []
    for (const [sector, syms] of Object.entries(SECTOR_MAP)) {
      const items = syms
        .map(snapStats)
        .filter((x) => x && x.pct != null)
        .map((it) => ({ ...it, weight: weightOf(it, sizeMode) }))
      if (!items.length) continue
      const avg = items.reduce((s, x) => s + x.pct, 0) / items.length
      const weight = items.reduce((s, x) => s + x.weight, 0)
      const totalVol = items.reduce((s, x) => s + (x.vol || 0), 0)
      out.push({ sector, items, avg, weight, totalVol })
    }
    return out
  }, [snapshots, sizeMode])

  const visibleSectors = useMemo(
    () => (activeSector ? sectors.filter((s) => s.sector === activeSector) : sectors),
    [sectors, activeSector]
  )

  const allItems = visibleSectors.flatMap((s) => s.items)
  const marketAvg = allItems.length ? allItems.reduce((s, x) => s + x.pct, 0) / allItems.length : 0

  // ── Treemap geometry ──────────────────────────────────────────────
  const HEADER_H = 17
  const GAP = 2
  const treemap = useMemo(() => {
    if (viewMode !== 'treemap' || !size.w || !size.h || !visibleSectors.length) {
      return { tiles: [], labels: [] }
    }
    const tiles = []
    const labels = []

    if (visibleSectors.length === 1) {
      const s = visibleSectors[0]
      const data = [...s.items].sort((a, b) => b.weight - a.weight).map((it) => ({ ...it, value: it.weight }))
      tiles.push(...squarify(data, { x: 0, y: HEADER_H, w: size.w, h: Math.max(size.h - HEADER_H, 1) }))
      labels.push({ sector: s.sector, avg: s.avg, x: 0, y: 0, w: size.w, h: HEADER_H })
      return { tiles, labels }
    }

    const sectorRects = squarify(
      [...visibleSectors].sort((a, b) => b.weight - a.weight).map((s) => ({ ...s, value: s.weight })),
      { x: 0, y: 0, w: size.w, h: size.h }
    )
    for (const sr of sectorRects) {
      labels.push({ sector: sr.sector, avg: sr.avg, x: sr.x, y: sr.y, w: sr.w, h: HEADER_H })
      const inner = {
        x: sr.x + GAP,
        y: sr.y + HEADER_H,
        w: Math.max(sr.w - GAP * 2, 1),
        h: Math.max(sr.h - HEADER_H - GAP, 1),
      }
      const data = [...sr.items].sort((a, b) => b.weight - a.weight).map((it) => ({ ...it, value: it.weight }))
      tiles.push(...squarify(data, inner))
    }
    return { tiles, labels }
  }, [viewMode, size, visibleSectors])

  // ── Grid view data (sorted within sector) ─────────────────────────
  const gridData = useMemo(() => {
    return visibleSectors.map((s) => {
      const items = [...s.items]
      if (sortMode === 'change_desc') items.sort((a, b) => (b.pct || 0) - (a.pct || 0))
      else if (sortMode === 'change_asc') items.sort((a, b) => (a.pct || 0) - (b.pct || 0))
      else if (sortMode === 'volume')   items.sort((a, b) => (b.vol || 0) - (a.vol || 0))
      else if (sortMode === 'alpha')    items.sort((a, b) => a.sym.localeCompare(b.sym))
      return { ...s, items }
    })
  }, [visibleSectors, sortMode])

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
            {/* View toggle */}
            <div className="flex items-center rounded-md border border-white/[0.08] overflow-hidden">
              <button
                onClick={() => setViewMode('treemap')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-2xs transition ${
                  viewMode === 'treemap' ? 'bg-accent/15 text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-white/[0.06]'
                }`}
              >
                <Map size={12} /> Treemap
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-2xs transition border-l border-white/[0.08] ${
                  viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-white/[0.06]'
                }`}
              >
                <Grid2x2 size={12} /> Grid
              </button>
            </div>
            <Select value={sizeMode} onChange={(e) => setSizeMode(e.target.value)} className="min-w-[140px]" title="Tile size weight">
              <option value="dollarvol">Size: $ volume</option>
              <option value="volume">Size: volume</option>
              <option value="equal">Size: equal</option>
            </Select>
            {viewMode === 'grid' && (
              <Select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="min-w-[140px]">
                <option value="change_desc">Best → Worst</option>
                <option value="change_asc">Worst → Best</option>
                <option value="volume">Volume</option>
                <option value="alpha">A → Z</option>
              </Select>
            )}
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

      {visibleSectors.length === 0 && !loading && !error && (
        <Card className="p-10 text-center text-ink-4 text-sm">
          No data for the selected filter.
        </Card>
      )}

      {/* ── Treemap view ─────────────────────────────────────────── */}
      {viewMode === 'treemap' && visibleSectors.length > 0 && (
        <Card className="p-1.5">
          <div
            ref={mapRef}
            className="relative w-full h-[74vh] min-h-[520px]"
            onMouseLeave={() => setHover(null)}
          >
            {/* Sector labels */}
            {treemap.labels.map((l) => (
              <div
                key={l.sector}
                className="absolute flex items-center gap-1.5 px-1.5 overflow-hidden pointer-events-none"
                style={{ left: l.x, top: l.y, width: l.w, height: l.h }}
              >
                <span className="text-2xs font-display font-semibold text-ink-2 truncate uppercase tracking-wide">
                  {l.sector}
                </span>
                <span className={`text-2xs font-mono tabular ${l.avg >= 0 ? 'text-up' : 'text-down'}`}>
                  {fmtPct(l.avg)}
                </span>
              </div>
            ))}

            {/* Stock tiles */}
            {treemap.tiles.map((t) => {
              const w = Math.max(t.w - 1, 0)
              const h = Math.max(t.h - 1, 0)
              const symFs = Math.max(8, Math.min(h * 0.42, w / (Math.max(t.sym.length, 3) * 0.62), 26))
              const showSym = w > 22 && h > 13
              const showPct = w > 38 && h > 30
              return (
                <button
                  key={t.sym}
                  onClick={() => navigate(`/analysis/${t.sym}`)}
                  onContextMenu={(e) => ctx.onContextMenu(e, t.sym)}
                  onMouseEnter={(e) => setHover({ it: t, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover((hv) => hv && hv.it.sym === t.sym ? { ...hv, x: e.clientX, y: e.clientY } : hv)}
                  className="absolute rounded-[3px] flex flex-col items-center justify-center overflow-hidden transition hover:ring-2 hover:ring-white/40 hover:z-10 focus:outline-none focus:ring-2 focus:ring-accent"
                  style={{ left: t.x, top: t.y, width: w, height: h, background: tileBg(t.pct), color: tileText(t.pct) }}
                >
                  {showSym && (
                    <span className="font-mono font-bold leading-none" style={{ fontSize: symFs }}>{t.sym}</span>
                  )}
                  {showPct && (
                    <span className="font-mono tabular leading-none mt-1 opacity-95" style={{ fontSize: Math.max(7, symFs * 0.6) }}>
                      {fmtPct(t.pct)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Grid view (sector cards) ─────────────────────────────── */}
      {viewMode === 'grid' && (
        <div className="space-y-3">
          {gridData.map(({ sector, items, avg, totalVol }) => (
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
                  {items.map((it) => (
                    <GridTile
                      key={it.sym}
                      data={it}
                      onClick={() => navigate(`/analysis/${it.sym}`)}
                      onContextMenu={(e) => ctx.onContextMenu(e, it.sym)}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Floating tooltip (treemap) ───────────────────────────── */}
      {hover && <HoverTip hover={hover} />}

      {ctx.menu}
    </PageShell>
  )
}

// ── Floating tooltip following the cursor ───────────────────────────
function HoverTip({ hover }) {
  const { it, x, y } = hover
  // Flip to the left near the right edge so it never runs off-screen.
  const flip = x > window.innerWidth - 200
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: x + (flip ? -12 : 12), top: y + 12, transform: flip ? 'translateX(-100%)' : undefined }}
    >
      <div className="card-surface px-3 py-2 text-2xs font-mono tabular whitespace-nowrap text-ink-1 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="font-display font-semibold text-sm text-ink-1">{it.sym}</span>
          <span className={`font-semibold ${it.pct >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(it.pct)}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span className="text-ink-4">Last</span><span>${it.last?.toFixed(2) ?? '—'}</span>
          <span className="text-ink-4">Open</span><span>${it.open?.toFixed(2) ?? '—'}</span>
          <span className="text-ink-4">High</span><span>${it.high?.toFixed(2) ?? '—'}</span>
          <span className="text-ink-4">Low</span><span>${it.low?.toFixed(2) ?? '—'}</span>
          <span className="text-ink-4">Vol</span><span>{fmtVol(it.vol)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Grid tile — single-symbol cell with hover preview ───────────────
function GridTile({ data, onClick, onContextMenu }) {
  const { sym, pct, last, open, high, low, vol } = data
  const style = { background: tileBg(pct), color: tileText(pct) }
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={style}
      className="group relative rounded-md p-2 transition hover:ring-2 hover:ring-white/30 hover:z-10 text-left focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden"
    >
      <div className="font-mono font-bold text-xs">{sym}</div>
      <div className="font-mono tabular text-2xs opacity-95">{fmtPct(pct)}</div>

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
