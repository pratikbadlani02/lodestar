import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Play, Pause, Trash2, Bot, Copy, Filter, BarChart3, Search,
} from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useStore, selectStrategies } from '../lib/store'
import {
  PageShell, PageHeader, Card, Button, IconButton, Modal,
  Input, Select, Textarea, FormField, Alert, StatusBadge, SkeletonRows, Pill,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

const STATUS_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'active',   label: 'Active' },
  { id: 'paused',   label: 'Paused' },
  { id: 'disabled', label: 'Disabled' },
]

export default function Strategies() {
  const navigate = useNavigate()
  const strategies = useStore(selectStrategies)
  const hasBoot = useStore((s) => s.strategies.length > 0 || s.wsLastMessage !== null)
  const [available, setAvailable] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [createSeed, setCreateSeed] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyIds, setBusyIds] = useState(new Set())

  useEffect(() => {
    useStore.getState().loadStrategies()
    api.listStrategyTypes().then(setAvailable).catch(() => {})
  }, [])

  function setBusy(id, on) {
    setBusyIds((s) => {
      const next = new Set(s)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function toggle(s) {
    const nextStatus = s.status === 'active' ? 'paused' : 'active'
    setBusy(s.id, true)
    try {
      await api.updateStrategy(s.id, { status: nextStatus })
      toast.success(`${s.name} ${nextStatus === 'active' ? 'activated' : 'paused'}`)
      useStore.getState().loadStrategies()
    } catch (e) { toast.apiError(e, 'Update failed') }
    finally { setBusy(s.id, false) }
  }

  async function doDelete(s) {
    setBusy(s.id, true)
    try {
      await api.deleteStrategy(s.id)
      toast.success(`Deleted "${s.name}"`)
      useStore.getState().loadStrategies()
    } catch (e) { toast.apiError(e, 'Delete failed') }
    finally { setBusy(s.id, false); setPendingDelete(null) }
  }

  function duplicate(s) {
    setCreateSeed({
      name: `${s.name} (copy)`,
      strategy_type: s.strategy_type,
      symbols: s.symbols.join(', '),
      position_size_pct: String(s.position_size_pct ?? '5.00'),
      params: JSON.stringify(s.params || {}, null, 2),
    })
    setShowCreate(true)
  }

  // Bulk actions on the *currently filtered* set
  async function bulk(action) {
    const targets = filtered.filter((s) => {
      if (action === 'activate') return s.status !== 'active'
      if (action === 'pause')    return s.status === 'active'
      return false
    })
    if (!targets.length) {
      toast.info(`Nothing to ${action}`)
      return
    }
    const nextStatus = action === 'activate' ? 'active' : 'paused'
    const results = await Promise.allSettled(
      targets.map((s) => api.updateStrategy(s.id, { status: nextStatus }))
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    toast.success(`${ok}/${targets.length} ${nextStatus === 'active' ? 'activated' : 'paused'}`)
    useStore.getState().loadStrategies()
  }

  // Filter + search
  const filtered = useMemo(() => {
    return strategies.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false
      if (query) {
        const q = query.toLowerCase()
        if (!s.name.toLowerCase().includes(q) &&
            !s.strategy_type.toLowerCase().includes(q) &&
            !s.symbols.join(',').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [strategies, filter, query])

  return (
    <PageShell>
      <PageHeader
        icon={Bot}
        title="Strategies"
        subtitle="Configure and activate automated trading strategies"
        actions={
          <div className="flex items-center gap-2">
            {strategies.length > 0 && filter !== 'paused' && filter !== 'disabled' && (
              <Button variant="ghost" icon={Pause} onClick={() => bulk('pause')}>Pause all</Button>
            )}
            {strategies.length > 0 && filter !== 'active' && (
              <Button variant="ghost" icon={Play} onClick={() => bulk('activate')}>Activate all</Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => { setCreateSeed(null); setShowCreate(true) }}>
              New Strategy
            </Button>
          </div>
        }
      />

      {/* Filter + search */}
      {strategies.length > 0 && (
        <Card className="px-3 py-2.5 mb-3 flex items-center gap-2 flex-wrap">
          <Filter size={11} className="text-ink-5 shrink-0" />
          {STATUS_FILTERS.map((s) => {
            const n = s.id === 'all' ? strategies.length : strategies.filter((x) => x.status === s.id).length
            return (
              <button
                key={s.id}
                onClick={() => setFilter(s.id)}
                className={`text-2xs px-2.5 py-1 rounded-md border transition ${
                  filter === s.id
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.08]'
                }`}
              >
                {s.label} <span className="font-mono tabular ml-0.5 opacity-80">{n}</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2 min-w-[200px]">
            <Search size={11} className="text-ink-5" />
            <Input
              className="!py-1 !text-xs"
              placeholder="Filter by name, type, symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Card>
      )}

      {!hasBoot ? (
        <Card className="p-6"><SkeletonRows count={4} cols={4} /></Card>
      ) : strategies.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No strategies yet"
            body="Create a strategy to define entry/exit rules, symbols, and position sizing. Strategies always start paused so you can review them first."
            action={() => setShowCreate(true)}
            actionLabel="New Strategy"
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Filter}
            title="No strategies match"
            body={`No ${filter === 'all' ? '' : filter} strategies${query ? ` matching "${query}"` : ''}.`}
            action={() => { setFilter('all'); setQuery('') }}
            actionLabel="Clear filters"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <StrategyCard
              key={s.id}
              s={s}
              busy={busyIds.has(s.id)}
              onToggle={() => toggle(s)}
              onDuplicate={() => duplicate(s)}
              onDelete={() => setPendingDelete(s)}
              onBacktest={() => navigate(`/backtests?seed=${s.id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          types={available}
          seed={createSeed}
          onClose={() => { setShowCreate(false); setCreateSeed(null) }}
          onCreated={() => {
            setShowCreate(false); setCreateSeed(null)
            useStore.getState().loadStrategies()
            toast.success('Strategy created (paused)')
          }}
        />
      )}

      {pendingDelete && (
        <Modal
          icon={Trash2}
          title="Delete strategy?"
          size="sm"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button variant="down" onClick={() => doDelete(pendingDelete)} disabled={busyIds.has(pendingDelete.id)}>
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">
            Delete <span className="font-mono font-semibold text-ink-1">{pendingDelete.name}</span>?
            Open positions are not affected, but the strategy will stop placing new orders.
          </p>
        </Modal>
      )}
    </PageShell>
  )
}

// ── Strategy card ────────────────────────────────────────────────────
function StrategyCard({ s, busy, onToggle, onDuplicate, onDelete, onBacktest }) {
  const active = s.status === 'active'
  return (
    <Card hover className="p-5 relative">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-ink-1 truncate">{s.name}</h3>
          <p className="text-2xs font-mono uppercase tracking-wider text-ink-4 mt-1">{s.strategy_type}</p>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <div className="text-xs space-y-2.5 mb-4">
        <div className="flex gap-1 flex-wrap">
          {s.symbols.map((sym) => (
            <Pill key={sym} variant="neutral" className="font-mono">{sym}</Pill>
          ))}
        </div>
        <div className="flex items-center justify-between text-ink-4">
          <span>Position size</span>
          <span className="text-ink-2 font-mono tabular">{s.position_size_pct}% of equity</span>
        </div>

        {/* Pretty params table — replaces raw JSON dump */}
        <ParamsTable params={s.params} />
      </div>

      <div className="flex gap-1.5 pt-3 border-t border-white/[0.06]">
        <Button
          variant={active ? 'ghost' : 'up'}
          size="sm"
          className="flex-1"
          icon={active ? Pause : Play}
          disabled={busy}
          onClick={onToggle}
        >
          {active ? 'Pause' : 'Activate'}
        </Button>
        <IconButton icon={BarChart3} label="Backtest with these params" size="md" onClick={onBacktest} />
        <IconButton icon={Copy}      label="Duplicate" size="md" onClick={onDuplicate} />
        <IconButton icon={Trash2}    label="Delete"    size="md" variant="danger" onClick={onDelete} />
      </div>
    </Card>
  )
}

// ── Params display — table when shallow, fallback to JSON ──────────
function ParamsTable({ params }) {
  if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
    return <div className="text-2xs text-ink-5 italic">No parameters</div>
  }

  const entries = Object.entries(params)
  const allScalar = entries.every(([_, v]) => typeof v !== 'object' || v == null)

  if (!allScalar) {
    return (
      <details className="text-ink-4">
        <summary className="cursor-pointer hover:text-ink-2 transition select-none text-2xs">Show params</summary>
        <pre className="mt-1 text-[10px] font-mono bg-white/[0.03] border border-white/[0.06] rounded p-2 overflow-x-auto leading-relaxed">
          {JSON.stringify(params, null, 2)}
        </pre>
      </details>
    )
  }

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-md overflow-hidden">
      <table className="w-full text-2xs">
        <tbody className="divide-y divide-white/[0.04]">
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="px-2.5 py-1 text-ink-4 font-medium">{k}</td>
              <td className="px-2.5 py-1 text-right font-mono tabular text-ink-1">
                {typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateModal({ types, seed, onClose, onCreated }) {
  const [name, setName] = useState(seed?.name || '')
  const [type, setType] = useState(seed?.strategy_type || types[0]?.name || '')
  const [symbols, setSymbols] = useState(seed?.symbols || 'AAPL,MSFT')
  const [size, setSize] = useState(seed?.position_size_pct || '5.00')
  const [paramsText, setParamsText] = useState(seed?.params || '')
  const [paramsError, setParamsError] = useState(null)
  const [err, setErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const current = types.find((t) => t.name === type)

  // Only auto-fill default params if we don't have a seed
  useEffect(() => {
    if (seed) return
    const c = types.find((t) => t.name === type)
    setParamsText(JSON.stringify(c?.default_params || {}, null, 2))
    setParamsError(null)
  }, [type, types, seed])

  async function submit(e) {
    e?.preventDefault?.()
    setErr(null); setParamsError(null)
    let parsedParams
    try { parsedParams = JSON.parse(paramsText) }
    catch { setParamsError('Invalid JSON'); return }
    setSubmitting(true)
    try {
      await api.createStrategy({
        name,
        strategy_type: type,
        symbols: symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        params: parsedParams,
        position_size_pct: size,
      })
      onCreated()
    } catch (e2) {
      setErr(e2.message || 'Failed to create strategy')
      toast.apiError(e2, 'Create failed')
    } finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={Bot}
      title={seed ? 'Duplicate Strategy' : 'New Strategy'}
      subtitle="Strategies always start paused — activate them once you've reviewed the parameters"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="up" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create (paused)'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Momentum 5d" />
        </FormField>
        <FormField label="Strategy Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.name} value={t.name}>{t.name} — {t.description}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Symbols" hint="Comma-separated tickers">
          <Input mono className="uppercase" value={symbols} onChange={(e) => setSymbols(e.target.value)} required />
        </FormField>
        <FormField label="Position Size" hint="Percent of total equity per position">
          <Input mono type="number" step="0.1" min="0.1" max="100" value={size} onChange={(e) => setSize(e.target.value)} />
        </FormField>
        {current && (
          <FormField label="Parameters (JSON)" error={paramsError}>
            <Textarea mono rows={6} value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
          </FormField>
        )}
        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}
