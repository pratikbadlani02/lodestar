import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Filter, Search, RefreshCw, Star, ChevronRight, Save, Trash2, Activity, BarChart3,
  TrendingUp, TrendingDown, Download, X, Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useSymbol } from '../lib/SymbolContext'
import { PnlCell, MagBar } from '../components/ui/charts'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import {
  PageShell, PageHeader, Card, Button, IconButton, Input, Select, Pill,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

// ── Constants ─────────────────────────────────────────────────────
const PRESETS_KEY = 'quant_screener_presets_v1'

const DEFAULT_FILTERS = {
  minPrice:     '',
  maxPrice:     '',
  minVolume:    '500000',
  minChangePct: '',
  maxChangePct: '',
  symbolFilter: '',     // client-side substring filter
  minAbsChange: '',     // client-side: |change_pct| >= X
}

// Curated one-click presets — describe the *trade idea* not the mechanics.
const QUICK_PRESETS = [
  { id: 'big_movers',  label: 'Big movers (|Δ| > 5%)',  icon: Zap,
    filters: { ...DEFAULT_FILTERS, minAbsChange: '5' } },
  { id: 'top_gainers', label: 'Top gainers',             icon: TrendingUp,
    filters: { ...DEFAULT_FILTERS, minChangePct: '0' } },
  { id: 'top_losers',  label: 'Top losers',              icon: TrendingDown,
    filters: { ...DEFAULT_FILTERS, maxChangePct: '0' } },
  { id: 'liquid',      label: 'Liquid (vol > 5M)',       icon: Activity,
    filters: { ...DEFAULT_FILTERS, minVolume: '5000000' } },
  { id: 'penny',       label: 'Sub-$10',                 icon: BarChart3,
    filters: { ...DEFAULT_FILTERS, maxPrice: '10' } },
]

const TABLE_COLS = [
  { key: 'symbol',     label: 'Symbol',  align: 'left'  },
  { key: 'price',      label: 'Price',   align: 'right' },
  { key: 'change_pct', label: 'Δ %',     align: 'right' },
  { key: 'volume',     label: 'Volume',  align: 'right' },
  { key: 'open',       label: 'Open',    align: 'right' },
  { key: 'high',       label: 'High',    align: 'right' },
  { key: 'low',        label: 'Low',     align: 'right' },
  { key: 'as_of',      label: 'Updated', align: 'right' },
]

// ── Helpers ───────────────────────────────────────────────────────
function fmtVol(v) {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}
function fmtPrice(n) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}
function fmtAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') } catch { return [] }
}
function persistPresets(list) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)) } catch {}
}

// Build CSV from result rows.
function toCSV(rows) {
  const headers = ['symbol', 'price', 'change_pct', 'volume', 'open', 'high', 'low', 'as_of']
  const head = headers.join(',')
  const body = rows.map((r) => headers.map((h) => {
    const v = r[h]
    if (v == null) return ''
    return String(v).replace(/[\n,]/g, ' ')
  }).join(',')).join('\n')
  return `${head}\n${body}`
}

function downloadCSV(rows, name = 'screener-results.csv') {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Describe an active filter for the chip strip.
function describeFilter(key, value) {
  switch (key) {
    case 'minPrice':     return `Price ≥ $${value}`
    case 'maxPrice':     return `Price ≤ $${value}`
    case 'minVolume':    return `Vol ≥ ${fmtVol(Number(value))}`
    case 'minChangePct': return `Δ ≥ ${value}%`
    case 'maxChangePct': return `Δ ≤ ${value}%`
    case 'minAbsChange': return `|Δ| ≥ ${value}%`
    case 'symbolFilter': return `Symbol ~ "${value}"`
    default: return `${key}=${value}`
  }
}

// ── Main component ────────────────────────────────────────────────
export default function Screener() {
  const navigate = useNavigate()
  const { setSymbol } = useSymbol()
  const ctx = useSymbolContextMenu()

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [results, setResults] = useState([])
  const [count, setCount]     = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun]   = useState(false)
  const [sortField, setSortField] = useState('change_pct')
  const [sortDir, setSortDir]     = useState('desc')

  const [watchlists, setWatchlists] = useState([])
  const [presets, setPresets] = useState(() => loadPresets())
  const [presetName, setPresetName] = useState('')

  // Load watchlists once
  useEffect(() => { api.listWatchlists().then(setWatchlists).catch(() => {}) }, [])

  // Auto-run on mount
  useEffect(() => { runScreener() }, [])

  const setFilter = (key) => (val) => setFilters((f) => ({ ...f, [key]: val }))

  function resetFilters() { setFilters(DEFAULT_FILTERS) }

  function applyPreset(p) { setFilters(p.filters || DEFAULT_FILTERS) }

  function saveCurrentPreset() {
    const name = presetName.trim()
    if (!name) return
    const snapshot = { name, filters, createdAt: Date.now() }
    const next = [...presets.filter((p) => p.name !== name), snapshot]
    setPresets(next); persistPresets(next); setPresetName('')
    toast.success(`Saved preset "${name}"`)
  }
  function deletePreset(name) {
    const next = presets.filter((p) => p.name !== name)
    setPresets(next); persistPresets(next)
  }

  async function runScreener() {
    setLoading(true)
    try {
      const params = {}
      if (filters.minPrice !== '')     params.min_price      = parseFloat(filters.minPrice)
      if (filters.maxPrice !== '')     params.max_price      = parseFloat(filters.maxPrice)
      if (filters.minVolume !== '')    params.min_volume     = parseFloat(filters.minVolume)
      if (filters.minChangePct !== '') params.min_change_pct = parseFloat(filters.minChangePct)
      if (filters.maxChangePct !== '') params.max_change_pct = parseFloat(filters.maxChangePct)

      const data = await api.screenStocks(params)
      setResults(data.results || [])
      setCount(data.count || 0)
      setHasRun(true)
    } catch (e) {
      toast.apiError(e, 'Screener failed')
      setResults([]); setCount(0)
    } finally {
      setLoading(false)
    }
  }

  function handleSort(field) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  // ── Client-side post-filter (symbol substring + abs change) ─────
  const filtered = useMemo(() => {
    let rs = results
    if (filters.symbolFilter) {
      const q = filters.symbolFilter.toUpperCase()
      rs = rs.filter((r) => r.symbol.toUpperCase().includes(q))
    }
    if (filters.minAbsChange) {
      const min = parseFloat(filters.minAbsChange)
      if (!Number.isNaN(min)) rs = rs.filter((r) => Math.abs(Number(r.change_pct || 0)) >= min)
    }
    return rs
  }, [results, filters.symbolFilter, filters.minAbsChange])

  const sortedResults = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField], bv = b[sortField]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [filtered, sortField, sortDir])

  // Summary stats
  const summary = useMemo(() => {
    if (!filtered.length) return null
    let g = 0, l = 0, sumCh = 0, sumV = 0, maxV = 0
    for (const r of filtered) {
      const c = Number(r.change_pct || 0); if (c > 0) g++; else if (c < 0) l++
      sumCh += c
      const v = Number(r.volume || 0); sumV += v; if (v > maxV) maxV = v
    }
    return { total: filtered.length, g, l, avg: sumCh / filtered.length, sumV, maxV }
  }, [filtered])

  // Active filter chips
  const activeChips = useMemo(() => {
    return Object.entries(filters).filter(([_, v]) => v !== '' && v != null)
  }, [filters])

  async function addToWatchlist(symbol) {
    if (!watchlists.length) {
      toast.warn('No watchlists yet', { description: 'Create one from the Watchlists page first.' })
      return
    }
    const wl = watchlists[0]
    const existing = wl.symbols || []
    if (existing.includes(symbol)) {
      toast.info(`${symbol} already in "${wl.name}"`)
      return
    }
    try {
      const updated = await api.updateWatchlist(wl.id, { name: wl.name, symbols: [...existing, symbol] })
      setWatchlists((ws) => ws.map((w) => w.id === wl.id ? updated : w))
      toast.success(`Added ${symbol} to "${wl.name}"`)
    } catch (e) {
      toast.apiError(e, `Failed to add ${symbol}`)
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={Filter}
        title="Stock Screener"
        subtitle={hasRun ? `${filtered.length} of ${count} match${count !== 1 ? 'es' : ''}` : 'Configure filters and run'}
        actions={
          <div className="flex items-center gap-2">
            <IconButton
              icon={Download}
              label="Export CSV"
              onClick={() => downloadCSV(sortedResults)}
              disabled={!sortedResults.length}
            />
            <Button variant="primary" icon={Search} onClick={runScreener} disabled={loading}>
              {loading ? 'Scanning…' : 'Run'}
            </Button>
          </div>
        }
      />

      {/* Quick presets — clearly labeled, no decoration that doesn't work */}
      <Card className="px-3 py-2.5 mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Quick presets:</span>
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { applyPreset(p); setTimeout(runScreener, 0) }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium rounded-md bg-white/[0.04] border border-white/[0.06] text-ink-2 hover:text-accent hover:border-accent/30 hover:bg-accent/10 transition"
          >
            <p.icon size={11} />{p.label}
          </button>
        ))}
      </Card>

      <div className="grid grid-cols-12 gap-3">
        {/* ── Filter Panel (compact) ─────────────────────────────── */}
        <Card className="col-span-12 lg:col-span-3 p-4 space-y-4 self-start">
          <div className="space-y-2">
            <h3 className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Symbol</h3>
            <Input
              mono
              placeholder="Filter ticker (substring)"
              value={filters.symbolFilter}
              onChange={(e) => setFilter('symbolFilter')(e.target.value.toUpperCase())}
              className="uppercase"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Price</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input mono type="number" placeholder="Min $"  value={filters.minPrice} onChange={(e) => setFilter('minPrice')(e.target.value)} step="0.01" />
              <Input mono type="number" placeholder="Max $"  value={filters.maxPrice} onChange={(e) => setFilter('maxPrice')(e.target.value)} step="0.01" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Volume</h3>
            <Input mono type="number" placeholder="Min volume" value={filters.minVolume} onChange={(e) => setFilter('minVolume')(e.target.value)} />
            <div className="flex gap-1 flex-wrap">
              {[['100K', 100000], ['500K', 500000], ['1M', 1000000], ['5M', 5000000]].map(([label, v]) => (
                <button
                  key={v}
                  onClick={() => setFilter('minVolume')(String(v))}
                  className={`text-2xs font-mono px-2 py-0.5 rounded border transition ${
                    filters.minVolume === String(v)
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Change %</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input mono type="number" placeholder="Min %" value={filters.minChangePct} onChange={(e) => setFilter('minChangePct')(e.target.value)} step="0.1" />
              <Input mono type="number" placeholder="Max %" value={filters.maxChangePct} onChange={(e) => setFilter('maxChangePct')(e.target.value)} step="0.1" />
            </div>
            <Input mono type="number" placeholder="|Δ| ≥ %  (client-side)" value={filters.minAbsChange} onChange={(e) => setFilter('minAbsChange')(e.target.value)} step="0.1" />
          </div>

          <div className="border-t border-white/[0.06] pt-3 space-y-2">
            <h3 className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Presets</h3>
            {presets.length > 0 && (
              <Select onChange={(e) => { const p = presets.find((x) => x.name === e.target.value); if (p) applyPreset(p) }} defaultValue="">
                <option value="">— Load preset —</option>
                {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </Select>
            )}
            <div className="flex gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Save current as…"
                className="flex-1"
              />
              <IconButton icon={Save} label="Save preset" variant="accent" onClick={saveCurrentPreset} disabled={!presetName.trim()} />
            </div>
            {presets.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto pt-1">
                {presets.map((p) => (
                  <div key={p.name} className="group flex items-center gap-1.5 text-2xs">
                    <button onClick={() => applyPreset(p)} className="flex-1 text-left text-ink-2 hover:text-accent truncate transition">
                      {p.name}
                    </button>
                    <button onClick={() => deletePreset(p.name)} className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-down transition">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] pt-3 flex gap-2">
            <Button variant="primary" icon={Search} className="flex-1" onClick={runScreener} disabled={loading}>
              {loading ? 'Scanning…' : 'Run'}
            </Button>
            <Button variant="ghost" onClick={resetFilters}>Reset</Button>
          </div>
        </Card>

        {/* ── Results Panel ──────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-9 space-y-3 min-w-0">
          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs uppercase tracking-[0.14em] text-ink-5 font-semibold pr-1">Active:</span>
              {activeChips.map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-accent/[0.08] border border-accent/30 text-accent">
                  {describeFilter(k, v)}
                  <button onClick={() => setFilter(k)('')} className="opacity-60 hover:opacity-100">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button onClick={resetFilters} className="text-2xs text-ink-4 hover:text-ink-1 underline ml-1">Clear all</button>
            </div>
          )}

          {/* Summary tiles */}
          {summary && hasRun && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <SummaryTile label="Matches" value={summary.total} tone="text-ink-1" />
              <SummaryTile label="Gainers" value={summary.g}    tone="text-up"   sub={`${Math.round(summary.g / summary.total * 100)}%`} />
              <SummaryTile label="Losers"  value={summary.l}    tone="text-down" sub={`${Math.round(summary.l / summary.total * 100)}%`} />
              <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
                <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Avg Δ</div>
                <div className="mt-1"><PnlCell value={summary.avg} scale={5} /></div>
              </div>
              <SummaryTile label="Total Vol" value={fmtVol(summary.sumV)} tone="text-ink-1" />
            </div>
          )}

          {/* Results table */}
          <Card className="overflow-hidden">
            {!hasRun && !loading ? (
              <EmptyState icon={Filter} title="Run the screener" body="Configure filters or pick a quick preset, then click Run." action={runScreener} actionLabel="Run now" />
            ) : loading ? (
              <div className="p-16 flex items-center justify-center text-ink-4 gap-3">
                <RefreshCw size={16} className="animate-spin text-accent" />
                <span className="text-sm">Scanning…</span>
              </div>
            ) : sortedResults.length === 0 ? (
              <EmptyState icon={Search} title="No matches" body="No stocks match your filters. Loosen the criteria or try a quick preset." action={resetFilters} actionLabel="Reset filters" />
            ) : (
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                <table className="w-full text-sm t-dense">
                  <thead>
                    <tr>
                      {TABLE_COLS.map((c) => (
                        <th
                          key={c.key}
                          onClick={() => handleSort(c.key)}
                          className={`cursor-pointer select-none hover:text-ink-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${sortField === c.key ? 'text-accent' : ''}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            {sortField === c.key && (sortDir === 'asc' ? '↑' : '↓')}
                          </span>
                        </th>
                      ))}
                      <th className="text-right w-16">Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((r) => (
                      <tr
                        key={r.symbol}
                        onClick={() => { setSymbol(r.symbol); navigate(`/analysis/${r.symbol}`) }}
                        onContextMenu={(e) => ctx.onContextMenu(e, r.symbol)}
                        className="cursor-pointer group"
                      >
                        <td className="font-mono font-semibold text-ink-1">
                          <span className="inline-flex items-center gap-1">
                            {r.symbol}
                            <ChevronRight size={11} className="opacity-0 group-hover:opacity-60 text-accent transition" />
                          </span>
                        </td>
                        <td className="text-right font-mono tabular text-ink-1 font-semibold">{fmtPrice(r.price)}</td>
                        <td className="text-right"><PnlCell value={Number(r.change_pct)} scale={10} /></td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono tabular text-ink-2 text-xs">{fmtVol(r.volume)}</span>
                            <div className="w-12 shrink-0">
                              <MagBar value={Number(r.volume || 0)} scale={summary?.maxV || 1} height={3} />
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.open)}</td>
                        <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.high)}</td>
                        <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.low)}</td>
                        <td className="text-right text-2xs font-mono text-ink-4">{fmtAgo(r.as_of)}</td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => addToWatchlist(r.symbol)}
                            title={watchlists[0] ? `Add to ${watchlists[0].name}` : 'No watchlist'}
                            className="text-ink-5 hover:text-warn transition p-1"
                          >
                            <Star size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Footer */}
          {hasRun && !loading && sortedResults.length > 0 && (
            <div className="flex items-center justify-between text-2xs text-ink-5 px-1">
              <span>{sortedResults.length} of {count} · sorted by <span className="font-mono text-ink-3">{sortField}</span> ({sortDir})</span>
              <span>Click row → analysis · Right-click → context menu · ★ to watchlist</span>
            </div>
          )}
        </div>
      </div>
      {ctx.menu}
    </PageShell>
  )
}

function SummaryTile({ label, value, sub, tone = 'text-ink-1' }) {
  return (
    <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-2.5">
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">{label}</div>
      <div className={`mt-1 text-lg font-mono tabular font-bold leading-none ${tone}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-5 font-mono mt-1">{sub}</div>}
    </div>
  )
}
