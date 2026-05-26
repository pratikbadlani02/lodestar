import { useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles, CheckCircle2, Clock, Loader, AlertCircle, ArrowLeft, Rocket, BarChart3, Grid3x3 } from 'lucide-react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import {
  PageShell, PageHeader, Card, SectionHeader, Button, IconButton, Modal,
  Input, Select, Textarea, FormField, Alert, Pill, SkeletonRows, Stat, StatGrid,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function Optimizer() {
  const [runs, setRuns] = useState([])
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try { setRuns(await api.listOptimizerRuns()) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [])

  return (
    <PageShell>
      <PageHeader
        icon={Sparkles}
        title="Parameter Optimizer"
        subtitle="Find best parameters by walk-forward backtesting"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShow(true)}>
            New Optimizer Run
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows count={5} cols={6} /></div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No optimizer runs yet"
            body="Run a parameter sweep across many backtest combinations to discover the best-performing inputs for a strategy."
            action={() => setShow(true)}
            actionLabel="New Optimizer Run"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm t-dense">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">Strategy</th>
                  <th className="text-left">Symbols</th>
                  <th className="text-right">Best Sharpe</th>
                  <th className="text-left">Best Params</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/optimizer/${r.id}`} className="text-accent hover:underline font-medium">
                        {r.name}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-ink-2">{r.strategy_type}</td>
                    <td className="font-mono text-xs text-ink-3">{r.symbols.join(', ')}</td>
                    <td className="text-right font-mono tabular">
                      {r.best_sharpe !== null ? r.best_sharpe.toFixed(2) : <span className="text-ink-5">—</span>}
                    </td>
                    <td className="font-mono text-xs text-ink-4 truncate max-w-xs">
                      {r.best_params ? JSON.stringify(r.best_params) : '—'}
                    </td>
                    <td><RunStatus status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {show && <CreateModal onClose={() => setShow(false)} onCreated={() => { setShow(false); load() }} />}
    </PageShell>
  )
}

function RunStatus({ status }) {
  const m = {
    pending:   { Icon: Clock,         variant: 'neutral' },
    running:   { Icon: Loader,        variant: 'info', spin: true },
    completed: { Icon: CheckCircle2,  variant: 'up' },
    failed:    { Icon: AlertCircle,   variant: 'down' },
  }[status] || { Icon: Clock, variant: 'neutral' }
  return (
    <Pill variant={m.variant} className="uppercase tracking-wider">
      <m.Icon size={10} className={m.spin ? 'animate-spin' : ''} /> {status}
    </Pill>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('Optimization')
  const [strategyType, setStrategyType] = useState('sma_crossover')
  const [symbols, setSymbols] = useState('SPY')
  const [paramGrid, setParamGrid] = useState('{\n  "short_window": [10, 20, 30],\n  "long_window": [50, 100, 200]\n}')
  const [startDate, setStartDate] = useState(new Date(Date.now() - 365*24*3600*1000).toISOString().slice(0,10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0,10))
  const [capital, setCapital] = useState('100000')
  const [types, setTypes] = useState([])
  const [err, setErr] = useState(null)
  const [gridErr, setGridErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { api.listStrategyTypes().then(setTypes) }, [])

  async function submit(e) {
    e.preventDefault()
    setErr(null); setGridErr(null)
    let grid
    try { grid = JSON.parse(paramGrid) }
    catch { setGridErr('Invalid JSON'); return }
    setSubmitting(true)
    try {
      await api.createOptimizerRun({
        name, strategy_type: strategyType,
        symbols: symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        param_grid: grid,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        initial_capital: capital,
      })
      onCreated()
    } catch (e2) { setErr(e2.message) }
    finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={Sparkles}
      title="New Optimizer Run"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Starting…' : 'Run Optimizer'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Strategy Type">
          <Select value={strategyType} onChange={(e) => setStrategyType(e.target.value)}>
            {types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Symbols" hint="Comma-separated">
          <Input mono className="uppercase" value={symbols} onChange={(e) => setSymbols(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start Date">
            <Input mono type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <Input mono type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Initial Capital">
          <Input mono type="number" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </FormField>
        <FormField label="Param Grid" hint="JSON object; arrays = values to test" error={gridErr}>
          <Textarea mono rows={7} value={paramGrid} onChange={(e) => setParamGrid(e.target.value)} />
        </FormField>
        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}

export function OptimizerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [promoting, setPromoting] = useState(false)
  const [showPromote, setShowPromote] = useState(null)   // 'backtest' | 'strategy'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await api.getOptimizerRun(id)
        if (!cancelled) setRun(r)
      } catch (e) { /* network blip */ }
    }
    load()
    const i = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(i) }
  }, [id])

  // Discover param dimensions for the optional 2D heatmap. Only renders
  // when exactly two params have multiple unique values.
  const heatmapInfo = useMemo(() => {
    if (!run?.results?.length) return null
    const keys = Object.keys(run.results[0].params || {})
    const uniques = keys.map((k) => ({
      key: k,
      values: Array.from(new Set(run.results.map((r) => r.params[k]))).sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b
        return String(a).localeCompare(String(b))
      }),
    }))
    const multi = uniques.filter((u) => u.values.length > 1)
    if (multi.length !== 2) return null
    return { x: multi[0], y: multi[1] }
  }, [run])

  async function doPromote(kind, name, extra) {
    if (!run?.best_params) return
    setPromoting(true)
    try {
      if (kind === 'backtest') {
        await api.createBacktest({
          name,
          strategy_type: run.strategy_type,
          symbols: run.symbols,
          params: run.best_params,
          start_date: run.start_date,
          end_date: run.end_date,
          initial_capital: extra?.capital || '100000',
        })
        toast.success('Backtest queued from best params')
        navigate('/backtests')
      } else if (kind === 'strategy') {
        await api.createStrategy({
          name,
          strategy_type: run.strategy_type,
          symbols: run.symbols,
          params: run.best_params,
          position_size_pct: extra?.size || '5.00',
        })
        toast.success(`Strategy "${name}" created (paused)`)
        navigate('/strategies')
      }
    } catch (e) {
      toast.apiError(e, 'Promotion failed')
    } finally { setPromoting(false); setShowPromote(null) }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: 'Optimizer', to: '/optimizer' }, { label: run?.name || '…' }]}
        title={run?.name || 'Loading…'}
        subtitle={run ? `${run.strategy_type} · ${run.symbols.join(', ')}` : ''}
        badge={run ? <RunStatus status={run.status} /> : null}
        actions={
          <div className="flex items-center gap-2">
            {run?.best_params && (
              <>
                <Button variant="ghost" icon={BarChart3} onClick={() => setShowPromote('backtest')}>
                  Backtest best
                </Button>
                <Button variant="primary" icon={Rocket} onClick={() => setShowPromote('strategy')}>
                  Promote to strategy
                </Button>
              </>
            )}
            <Link to="/optimizer">
              <Button variant="ghost" icon={ArrowLeft}>Back</Button>
            </Link>
          </div>
        }
      />

      {!run ? (
        <Card className="p-5"><SkeletonRows count={6} cols={4} /></Card>
      ) : (
        <div className="space-y-3">
          {/* Progress while running */}
          {run.status === 'running' && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-ink-2">
                  <Loader size={12} className="inline mr-2 animate-spin text-info" />
                  Running…
                </span>
                <span className="text-2xs font-mono tabular text-ink-4">
                  {run.results?.length || 0} / {run.total_combinations || '?'} combinations
                </span>
              </div>
              {run.total_combinations && (
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-grad transition-all"
                    style={{ width: `${Math.min(100, ((run.results?.length || 0) / run.total_combinations) * 100)}%` }}
                  />
                </div>
              )}
            </Card>
          )}

          {/* Best stats */}
          {run.best_params && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card className="lg:col-span-2 p-5 border-up/30 bg-up/[0.04]">
                <h2 className="text-2xs uppercase tracking-[0.14em] font-semibold text-up mb-3">Best Parameters</h2>
                <BestParamsTable params={run.best_params} />
              </Card>
              <StatGrid cols={2} className="lg:col-span-1">
                <Stat label="Best Sharpe" value={run.best_sharpe?.toFixed(4) ?? '—'} variant="up" big />
                <Stat label="Combinations" value={run.results?.length ?? 0} big />
              </StatGrid>
            </div>
          )}

          {/* 2D heatmap (only when exactly 2 dimensions vary) */}
          {heatmapInfo && (
            <Card>
              <SectionHeader icon={Grid3x3} title={`Sharpe heatmap · ${heatmapInfo.y.key} × ${heatmapInfo.x.key}`} />
              <div className="p-4">
                <ParamHeatmap results={run.results} x={heatmapInfo.x} y={heatmapInfo.y} />
              </div>
            </Card>
          )}

          {run.results.length > 0 && (
            <Card className="overflow-hidden">
              <SectionHeader title={`Results (${run.results.length} combinations)`} />
              <div className="overflow-x-auto">
                <table className="w-full text-xs t-dense">
                  <thead>
                    <tr>
                      <th className="text-left">Params</th>
                      <th className="text-right">Return %</th>
                      <th className="text-right">Sharpe</th>
                      <th className="text-right">Trades</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.results.slice(0, 50).map((r, i) => (
                      <tr key={i} className={i === 0 ? 'bg-up/[0.06]' : 'group'}>
                        <td className="font-mono text-ink-2 break-all max-w-md">{JSON.stringify(r.params)}</td>
                        <td className={`text-right font-mono tabular ${r.total_return_pct >= 0 ? 'text-up' : 'text-down'}`}>
                          {r.total_return_pct.toFixed(2)}%
                        </td>
                        <td className="text-right font-mono tabular text-ink-1">{r.avg_sharpe.toFixed(2)}</td>
                        <td className="text-right font-mono tabular text-ink-3">{r.total_trades}</td>
                        <td className="text-right opacity-0 group-hover:opacity-100 transition">
                          <IconButton
                            icon={BarChart3}
                            label="Backtest these params"
                            size="sm"
                            onClick={async () => {
                              try {
                                await api.createBacktest({
                                  name: `${run.name} — ${JSON.stringify(r.params)}`,
                                  strategy_type: run.strategy_type,
                                  symbols: run.symbols,
                                  params: r.params,
                                  start_date: run.start_date,
                                  end_date: run.end_date,
                                  initial_capital: '100000',
                                })
                                toast.success('Backtest queued with these params')
                              } catch (e) { toast.apiError(e, 'Failed') }
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {showPromote && (
        <PromoteModal
          kind={showPromote}
          run={run}
          busy={promoting}
          onClose={() => setShowPromote(null)}
          onSubmit={doPromote}
        />
      )}
    </PageShell>
  )
}

// ── Promote modal — backtest the best, or turn it into a live strategy ─
function PromoteModal({ kind, run, busy, onClose, onSubmit }) {
  const defaultName = kind === 'strategy'
    ? `${run.name} (promoted)`
    : `${run.name} — best`
  const [name, setName] = useState(defaultName)
  const [size, setSize] = useState('5.00')
  const [capital, setCapital] = useState('100000')

  const isStrategy = kind === 'strategy'
  return (
    <Modal
      icon={isStrategy ? Rocket : BarChart3}
      title={isStrategy ? 'Promote best to live strategy' : 'Backtest best parameters'}
      subtitle={isStrategy
        ? 'A new paused strategy will be created with the optimal parameters.'
        : 'Run a fresh backtest using the optimizer\'s best parameters.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={isStrategy ? 'up' : 'primary'}
            disabled={busy || !name.trim()}
            onClick={() => onSubmit(kind, name.trim(), { size, capital })}
          >
            {busy ? 'Submitting…' : isStrategy ? 'Create Strategy (paused)' : 'Run Backtest'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        {isStrategy && (
          <FormField label="Position Size" hint="Percent of total equity per position">
            <Input mono type="number" step="0.1" min="0.1" max="100" value={size} onChange={(e) => setSize(e.target.value)} />
          </FormField>
        )}
        {!isStrategy && (
          <FormField label="Initial Capital">
            <Input mono type="number" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </FormField>
        )}
        <Alert variant="info" title="Parameters">
          <pre className="font-mono text-2xs mt-1 whitespace-pre-wrap break-all">
            {JSON.stringify(run.best_params, null, 2)}
          </pre>
          <div className="text-2xs mt-1">Sharpe: <span className="font-mono tabular">{run.best_sharpe?.toFixed(4)}</span></div>
        </Alert>
      </div>
    </Modal>
  )
}

// ── Pretty-print best params as a table ────────────────────────────
function BestParamsTable({ params }) {
  const entries = Object.entries(params || {})
  if (entries.length === 0) return <div className="text-ink-4 text-sm">No parameters</div>
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="bg-white/[0.03] border border-up/20 rounded px-2.5 py-1.5">
          <div className="text-2xs uppercase tracking-wider text-up/80 font-medium">{k}</div>
          <div className="font-mono tabular text-sm text-ink-1 font-semibold mt-0.5">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 2D Param Heatmap ──────────────────────────────────────────────
// Renders a grid where each cell is the sharpe for that (x, y) param combo.
// Color scales linearly from min to max sharpe in the result set.
function ParamHeatmap({ results, x, y }) {
  // Build lookup: { "xv|yv": sharpe }
  const map = new Map()
  let minSh = Infinity, maxSh = -Infinity
  for (const r of results) {
    const xv = r.params[x.key], yv = r.params[y.key]
    const sh = Number(r.avg_sharpe || 0)
    map.set(`${xv}|${yv}`, sh)
    if (sh < minSh) minSh = sh
    if (sh > maxSh) maxSh = sh
  }
  const range = maxSh - minSh || 1

  function cellColor(sh) {
    if (sh == null || Number.isNaN(sh)) return 'rgb(var(--c-surf-2))'
    // 0..1 normalized
    const t = (sh - minSh) / range
    if (t >= 0.5) {
      const a = 0.1 + ((t - 0.5) / 0.5) * 0.55
      return `rgba(var(--c-up) / ${a.toFixed(3)})`
    }
    const a = 0.1 + ((0.5 - t) / 0.5) * 0.55
    return `rgba(var(--c-down) / ${a.toFixed(3)})`
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono tabular border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="px-2 py-1 text-2xs uppercase tracking-wider text-ink-5 text-right">{y.key} \ {x.key}</th>
            {x.values.map((xv) => (
              <th key={String(xv)} className="px-2 py-1 text-2xs uppercase tracking-wider text-ink-4 font-medium text-center">
                {String(xv)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {y.values.map((yv) => (
            <tr key={String(yv)}>
              <td className="px-2 py-1 text-2xs uppercase tracking-wider text-ink-4 font-medium text-right">{String(yv)}</td>
              {x.values.map((xv) => {
                const sh = map.get(`${xv}|${yv}`)
                return (
                  <td
                    key={String(xv)}
                    style={{ background: cellColor(sh) }}
                    className="px-3 py-2 rounded-md text-center min-w-[64px]"
                    title={`${x.key}=${xv}, ${y.key}=${yv} → Sharpe ${sh != null ? sh.toFixed(3) : 'n/a'}`}
                  >
                    <span className={`font-semibold ${sh != null && sh > (minSh + range / 2) ? 'text-ink-1' : 'text-ink-2'}`}>
                      {sh != null ? sh.toFixed(2) : '—'}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 text-2xs text-ink-4 mt-2">
        <span>Sharpe:</span>
        <span className="font-mono tabular">{minSh.toFixed(2)}</span>
        <div className="h-2 w-32 rounded-full" style={{
          background: 'linear-gradient(to right, rgba(var(--c-down) / 0.6), rgba(var(--c-surf-3) / 1), rgba(var(--c-up) / 0.6))',
        }} />
        <span className="font-mono tabular">{maxSh.toFixed(2)}</span>
      </div>
    </div>
  )
}
