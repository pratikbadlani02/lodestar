import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, BarChart3, CheckCircle2, AlertCircle, Clock, Loader, Activity, Target,
  Trash2, Copy, GitCompare, Filter,
} from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useStore, selectBacktests } from '../lib/store'
import EmptyState from '../components/ui/EmptyState'
import {
  PageShell, PageHeader, Card, SectionHeader, Button, IconButton, Modal,
  Input, Select, Textarea, FormField, Alert, Pill, StatusBadge, Stat, StatGrid, SkeletonRows,
} from '../components/ui/primitives'
import { PerfScatter, PnlCell, MagBar } from '../components/ui/charts'

const STATUS_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'running',   label: 'Running' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed',    label: 'Failed' },
  { id: 'pending',   label: 'Pending' },
]

function fmtPct(n) {
  if (n == null) return '—'
  return `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`
}

function fmtDuration(start, end) {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.max(0, Math.floor((e - s) / 1000))
  if (sec < 60)   return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export default function Backtests() {
  const navigate = useNavigate()
  const rows = useStore(selectBacktests)
  const hasBoot = useStore((s) => s.backtests.length > 0 || s.wsLastMessage !== null)

  const [showCreate, setShowCreate] = useState(false)
  const [createSeed, setCreateSeed] = useState(null)      // pre-fill from duplicate
  const [filter, setFilter]   = useState('all')
  const [picked, setPicked]   = useState([])              // for compare action
  const [pendingDelete, setPendingDelete] = useState(null)

  // Initial load + light refresh in case the WS misses an event
  useEffect(() => {
    useStore.getState().loadBacktests()
    const i = setInterval(() => useStore.getState().loadBacktests(), 15000)
    return () => clearInterval(i)
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const completed = useMemo(() => rows.filter((b) => b.status === 'completed'), [rows])

  // Top-strip aggregate
  const summary = useMemo(() => {
    if (completed.length === 0) return null
    const returns = completed.map((b) => Number(b.total_return_pct || 0))
    const sharpes = completed.map((b) => Number(b.sharpe_ratio || 0))
    return {
      count: completed.length,
      bestReturn: Math.max(...returns),
      bestSharpe: Math.max(...sharpes),
      avgReturn:  returns.reduce((s, x) => s + x, 0) / returns.length,
      winRate:    (returns.filter((r) => r > 0).length / returns.length) * 100,
    }
  }, [completed])

  // Risk/return scatter
  const scatterData = useMemo(() => completed.map((b) => ({
    x: Number(b.sharpe_ratio || 0),
    y: Number(b.total_return_pct || 0),
    name: b.name,
    id: b.id,
  })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), [completed])

  const maxReturnAbs = useMemo(
    () => Math.max(1, ...rows.map((b) => Math.abs(Number(b.total_return_pct || 0)))),
    [rows]
  )

  function togglePick(id) {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2))
  }

  function compareSelected() {
    if (picked.length !== 2) return
    navigate(`/backtest-compare?a=${picked[0]}&b=${picked[1]}`)
  }

  async function doDelete(id) {
    try {
      await api.deleteBacktest(id)
      toast.success('Backtest deleted')
      useStore.getState().loadBacktests()
    } catch (e) { toast.apiError(e, 'Delete failed') }
    finally { setPendingDelete(null) }
  }

  function duplicate(bt) {
    setCreateSeed({
      name: `${bt.name} (copy)`,
      strategy_type: bt.strategy_type,
      symbols: (bt.symbols || []).join(', '),
      params: JSON.stringify(bt.params || {}, null, 2),
      initial_capital: bt.initial_capital || '100000',
      start_date: bt.start_date?.slice(0, 10) || '',
      end_date:   bt.end_date?.slice(0, 10) || '',
    })
    setShowCreate(true)
  }

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        title="Backtests"
        subtitle="Simulate strategies on historical data"
        actions={
          <div className="flex items-center gap-2">
            {picked.length === 2 && (
              <Button variant="ghost" icon={GitCompare} onClick={compareSelected}>
                Compare ({picked.length})
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => { setCreateSeed(null); setShowCreate(true) }}>
              New Backtest
            </Button>
          </div>
        }
      />

      {!hasBoot ? (
        <Card className="p-5"><SkeletonRows count={4} cols={6} /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No backtests yet"
            body="Run a strategy against historical bars to evaluate risk and return before going live."
            action={() => setShowCreate(true)}
            actionLabel="Run first backtest"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Summary strip */}
          {summary && (
            <StatGrid cols={5}>
              <Stat label="Completed" value={summary.count} big />
              <Stat label="Win Rate" value={`${summary.winRate.toFixed(0)}%`} variant={summary.winRate >= 50 ? 'up' : 'down'} big />
              <Stat label="Avg Return" value={fmtPct(summary.avgReturn)} variant={summary.avgReturn >= 0 ? 'up' : 'down'} big />
              <Stat label="Best Return" value={fmtPct(summary.bestReturn)} variant="up" big />
              <Stat label="Best Sharpe" value={summary.bestSharpe.toFixed(2)} variant="up" big />
            </StatGrid>
          )}

          {/* Risk/return scatter */}
          {scatterData.length > 1 && (
            <Card>
              <SectionHeader
                icon={Target}
                title="Risk-Adjusted Return"
                action={<span className="text-2xs text-ink-4">click a point to open</span>}
              />
              <div className="p-3">
                <PerfScatter
                  data={scatterData}
                  xKey="x" yKey="y"
                  xLabel="Sharpe Ratio" yLabel="Return %"
                  height={240}
                  onPointClick={(p) => p?.payload?.id && navigate(`/backtests/${p.payload.id}`)}
                />
                <div className="text-2xs text-ink-4 text-center mt-1">
                  Top-right is the strategy "sweet spot" — high return + high risk-adjusted return.
                </div>
              </div>
            </Card>
          )}

          {/* Status filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={11} className="text-ink-5" />
            {STATUS_FILTERS.map((s) => {
              const n = s.id === 'all' ? rows.length : rows.filter((r) => r.status === s.id).length
              return (
                <button
                  key={s.id}
                  onClick={() => setFilter(s.id)}
                  className={`text-2xs px-2.5 py-1 rounded-md transition border ${
                    filter === s.id
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.08]'
                  }`}
                >
                  {s.label} <span className="font-mono tabular text-2xs ml-0.5 opacity-80">{n}</span>
                </button>
              )
            })}
            {picked.length > 0 && (
              <button
                onClick={() => setPicked([])}
                className="ml-auto text-2xs text-ink-4 hover:text-ink-1 underline"
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Table */}
          <Card className="overflow-hidden">
            <SectionHeader
              icon={Activity}
              title="All Backtests"
              action={<span className="text-2xs text-ink-4">Pick 2 → Compare</span>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm t-dense">
                <thead>
                  <tr>
                    <th className="w-8 text-center"></th>
                    <th className="text-left">Name</th>
                    <th className="text-left">Strategy</th>
                    <th className="text-left">Symbols</th>
                    <th className="text-right">Return %</th>
                    <th className="text-left w-32">Magnitude</th>
                    <th className="text-right">Sharpe</th>
                    <th className="text-right">Max DD</th>
                    <th className="text-right">Trades</th>
                    <th className="text-right">Duration</th>
                    <th className="text-left">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={12} className="px-3 py-10 text-center text-ink-4 text-xs">
                      No backtests match this filter.
                    </td></tr>
                  )}
                  {filtered.map((bt) => {
                    const ret = Number(bt.total_return_pct ?? 0)
                    const checked = picked.includes(bt.id)
                    return (
                      <tr key={bt.id} className="group">
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && picked.length >= 2}
                            onChange={() => togglePick(bt.id)}
                            className="accent-accent w-3.5 h-3.5"
                            title="Select to compare"
                          />
                        </td>
                        <td>
                          <Link to={`/backtests/${bt.id}`} className="text-accent hover:underline font-medium">
                            {bt.name}
                          </Link>
                        </td>
                        <td className="font-mono text-2xs text-ink-3">{bt.strategy_type}</td>
                        <td className="text-2xs font-mono text-ink-2">{(bt.symbols || []).join(', ')}</td>
                        <td className="text-right">
                          {bt.total_return_pct != null
                            ? <PnlCell value={ret} scale={maxReturnAbs * 0.8} />
                            : <span className="num-flat">—</span>}
                        </td>
                        <td className="pr-3">
                          {bt.total_return_pct != null && <MagBar value={ret} scale={maxReturnAbs} height={5} />}
                        </td>
                        <td className="text-right font-mono tabular text-ink-1 font-semibold">
                          {bt.sharpe_ratio != null ? Number(bt.sharpe_ratio).toFixed(2) : '—'}
                        </td>
                        <td className="text-right font-mono tabular text-down">
                          {bt.max_drawdown_pct != null ? `-${Number(bt.max_drawdown_pct).toFixed(2)}%` : '—'}
                        </td>
                        <td className="text-right font-mono tabular text-ink-2">{bt.total_trades ?? '—'}</td>
                        <td className="text-right text-2xs font-mono text-ink-4">
                          {fmtDuration(bt.created_at, bt.completed_at)}
                        </td>
                        <td><BacktestStatusPill status={bt.status} /></td>
                        <td className="text-right opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-1">
                            <IconButton icon={Copy} label="Duplicate" size="sm" onClick={() => duplicate(bt)} />
                            <IconButton icon={Trash2} label="Delete" size="sm" variant="danger" onClick={() => setPendingDelete(bt)} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {showCreate && (
        <CreateBacktestModal
          seed={createSeed}
          onClose={() => { setShowCreate(false); setCreateSeed(null) }}
          onCreated={() => {
            setShowCreate(false); setCreateSeed(null)
            useStore.getState().loadBacktests()
            toast.success('Backtest queued', { description: 'Status will update when it finishes.' })
          }}
        />
      )}

      {pendingDelete && (
        <Modal
          icon={Trash2}
          title="Delete backtest?"
          onClose={() => setPendingDelete(null)}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button variant="down" onClick={() => doDelete(pendingDelete.id)}>Delete</Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">
            Delete <span className="font-mono font-semibold text-ink-1">{pendingDelete.name}</span> and all its trade records?
            This cannot be undone.
          </p>
        </Modal>
      )}
    </PageShell>
  )
}

function BacktestStatusPill({ status }) {
  const cfg = {
    pending:   { Icon: Clock,         variant: 'warn' },
    running:   { Icon: Loader,        variant: 'info', spin: true },
    completed: { Icon: CheckCircle2,  variant: 'up' },
    failed:    { Icon: AlertCircle,   variant: 'down' },
  }[status] || { Icon: Clock, variant: 'neutral' }
  return (
    <Pill variant={cfg.variant} className="uppercase tracking-wider">
      <cfg.Icon size={10} className={cfg.spin ? 'animate-spin' : ''} /> {status}
    </Pill>
  )
}

function CreateBacktestModal({ seed, onClose, onCreated }) {
  const [name, setName] = useState(seed?.name || '')
  const [strategyType, setStrategyType] = useState(seed?.strategy_type || 'sma_crossover')
  const [symbols, setSymbols] = useState(seed?.symbols || 'SPY,QQQ')
  const [capital, setCapital] = useState(seed?.initial_capital || '100000')
  const [startDate, setStartDate] = useState(seed?.start_date || new Date(Date.now() - 365*24*3600*1000).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(seed?.end_date || new Date().toISOString().slice(0, 10))
  const [params, setParams] = useState(seed?.params || '{}')
  const [types, setTypes] = useState([])
  const [err, setErr] = useState(null)
  const [paramsErr, setParamsErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.listStrategyTypes().then((t) => {
      setTypes(t)
      // Only auto-fill default params if we don't have a seed
      if (!seed) {
        const defaults = t.find((x) => x.name === strategyType)?.default_params || {}
        setParams(JSON.stringify(defaults, null, 2))
      }
    })
  }, [])

  // When strategy type changes (and not seeded), refresh default params
  useEffect(() => {
    if (seed) return
    const defaults = types.find((x) => x.name === strategyType)?.default_params || {}
    setParams(JSON.stringify(defaults, null, 2))
  }, [strategyType, types, seed])

  async function submit(e) {
    e?.preventDefault?.()
    setErr(null); setParamsErr(null)
    let parsedParams
    try { parsedParams = JSON.parse(params) }
    catch { setParamsErr('Invalid JSON'); return }
    setSubmitting(true)
    try {
      await api.createBacktest({
        name, strategy_type: strategyType,
        symbols: symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        params: parsedParams,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        initial_capital: capital,
      })
      onCreated()
    } catch (e2) {
      setErr(e2.message)
      toast.apiError(e2, 'Failed to create backtest')
    } finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={BarChart3}
      title={seed ? 'Duplicate Backtest' : 'New Backtest'}
      subtitle="Runs asynchronously — you'll get a toast when it finishes"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Queueing…' : 'Run Backtest'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. SMA 20/50 SPY" />
        </FormField>
        <FormField label="Strategy">
          <Select value={strategyType} onChange={(e) => setStrategyType(e.target.value)}>
            {types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Symbols" hint="Comma-separated tickers">
          <Input mono className="uppercase" value={symbols} onChange={(e) => setSymbols(e.target.value)} required />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start"><Input mono type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></FormField>
          <FormField label="End"><Input mono type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></FormField>
        </div>
        <FormField label="Initial Capital">
          <Input mono type="number" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </FormField>
        <FormField label="Parameters (JSON)" error={paramsErr}>
          <Textarea mono rows={5} value={params} onChange={(e) => setParams(e.target.value)} />
        </FormField>
        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}
