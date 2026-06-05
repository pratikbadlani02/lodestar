import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, RefreshCw, Star, Trash2, Edit2, Check,
  TrendingUp, TrendingDown, ChevronUp, ChevronDown, BarChart2, ShoppingCart,
} from 'lucide-react'
import { api } from '../lib/api'
import {
  PageShell, PageHeader, Card, Button, IconButton, Modal,
  Input, Select, FormField, Alert, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'
import { activeCurrency } from '../components/ui/format'

function fmtPrice(n) {
  if (n === null || n === undefined) return '—'
  return `${activeCurrency()}${Number(n).toFixed(2)}`
}
function fmtVol(n) {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

const COLS = [
  { key: 'symbol',     label: 'Symbol',   align: 'left'  },
  { key: 'price',      label: 'Price',    align: 'right' },
  { key: 'change_pct', label: 'Change',   align: 'right' },
  { key: 'open',       label: 'Open',     align: 'right' },
  { key: 'high',       label: 'High',     align: 'right' },
  { key: 'low',        label: 'Low',      align: 'right' },
  { key: 'volume',     label: 'Volume',   align: 'right' },
  { key: 'bid',        label: 'Bid',      align: 'right' },
  { key: 'ask',        label: 'Ask',      align: 'right' },
]

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronUp size={10} className="text-ink-5 opacity-0 group-hover:opacity-100 transition" />
  return sort.dir === 'asc' ? <ChevronUp size={10} className="text-accent" /> : <ChevronDown size={10} className="text-accent" />
}

export default function Watchlists() {
  const navigate = useNavigate()
  const [lists, setLists] = useState([])
  const [selected, setSelected] = useState(null)
  const [quotes, setQuotes] = useState(null)
  const [quotesLoading, setQL] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [sort, setSort] = useState({ col: 'symbol', dir: 'asc' })
  const [tradeSymbol, setTradeSymbol] = useState(null)
  const [loadingLists, setLoadingLists] = useState(true)

  async function loadLists() {
    try {
      const data = await api.listWatchlists().catch(() => [])
      setLists(data)
      if (data.length > 0 && !selected) setSelected(data[0])
    } finally { setLoadingLists(false) }
  }

  const loadQuotes = useCallback(async () => {
    if (!selected) return
    setQL(true)
    try { setQuotes(await api.getWatchlistQuotes(selected.id)) }
    catch { setQuotes(null) }
    finally { setQL(false) }
  }, [selected?.id])

  useEffect(() => { loadLists() }, [])
  useEffect(() => {
    setQuotes(null); loadQuotes()
    const i = setInterval(loadQuotes, 15000)
    return () => clearInterval(i)
  }, [loadQuotes])

  async function deleteList(id) {
    if (!confirm('Delete this watchlist?')) return
    await api.deleteWatchlist(id)
    const next = lists.filter(l => l.id !== id)
    setLists(next)
    if (selected?.id === id) setSelected(next[0] || null)
  }

  function toggleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }

  const rows = (selected?.symbols || []).map(sym => ({
    symbol: sym,
    ...(quotes?.quotes?.[sym] || {}),
  })).sort((a, b) => {
    const av = a[sort.col] ?? (sort.dir === 'asc' ? Infinity : -Infinity)
    const bv = b[sort.col] ?? (sort.dir === 'asc' ? Infinity : -Infinity)
    if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sort.dir === 'asc' ? av - bv : bv - av
  })

  return (
    <PageShell padded fluid={false}>
      <PageHeader
        icon={Star}
        title="Watchlists"
        subtitle="Live quotes with sortable columns"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            New Watchlist
          </Button>
        }
      />

      <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[400px]">
        {/* Watchlist sidebar */}
        <aside className="w-56 shrink-0">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-white/[0.06] text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">
              Your Lists
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {loadingLists ? (
                <div className="p-3"><SkeletonRows count={3} cols={2} /></div>
              ) : lists.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-4">
                  No watchlists yet
                </div>
              ) : (
                lists.map((l) => (
                  <div key={l.id}
                    onClick={() => { setSelected(l); setEditing(null) }}
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition ${
                      selected?.id === l.id
                        ? 'bg-white/[0.06] text-ink-1'
                        : 'text-ink-3 hover:bg-white/[0.03] hover:text-ink-1'
                    }`}>
                    <Star size={12} className={selected?.id === l.id ? 'text-warn' : 'text-ink-5'} />
                    <span className="flex-1 text-xs truncate">{l.name}</span>
                    <span className="text-2xs font-mono tabular text-ink-4">{l.symbols.length}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteList(l.id) }}
                      className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-down transition">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </aside>

        {/* Table */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          {!selected ? (
            <EmptyState
              icon={Star}
              title="Select a watchlist"
              body="Choose a list on the left or create a new one to see live quotes."
              action={() => setShowCreate(true)}
              actionLabel="New Watchlist"
            />
          ) : (
            <>
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
                {editing === selected.id ? (
                  <EditSymbols watchlist={selected} onSave={async (symbols) => {
                    const updated = await api.updateWatchlist(selected.id, { name: selected.name, symbols })
                    setLists(lists.map(l => l.id === selected.id ? updated : l))
                    setSelected(updated); setEditing(null); loadQuotes()
                  }} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <h2 className="font-display font-semibold text-ink-1 flex-1 truncate">{selected.name}</h2>
                    <span className="text-2xs font-mono tabular text-ink-4">{selected.symbols.length} symbols</span>
                    <IconButton icon={Edit2} label="Edit symbols" size="sm" onClick={() => setEditing(selected.id)} />
                    <IconButton icon={RefreshCw} label="Refresh quotes" size="sm" onClick={loadQuotes}
                      className={quotesLoading ? 'animate-spin' : ''} />
                  </>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                {rows.length === 0 ? (
                  <EmptyState
                    icon={Star}
                    title="No symbols"
                    body="Click Edit above to add tickers to this list."
                    action={() => setEditing(selected.id)}
                    actionLabel="Edit symbols"
                  />
                ) : (
                  <table className="w-full text-sm t-dense">
                    <thead className="sticky top-0 bg-surf-1/95 backdrop-blur z-10">
                      <tr>
                        {COLS.map((c) => (
                          <th key={c.key}
                            className={`group cursor-pointer hover:text-ink-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                            onClick={() => toggleSort(c.key)}>
                            <span className="inline-flex items-center gap-1">
                              {c.align === 'right' && <SortIcon col={c.key} sort={sort} />}
                              {c.label}
                              {c.align === 'left' && <SortIcon col={c.key} sort={sort} />}
                            </span>
                          </th>
                        ))}
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const up = r.change_pct >= 0
                        return (
                          <tr key={r.symbol}>
                            <td className="font-mono font-semibold text-ink-1">
                              <button onClick={() => navigate(`/analysis/${r.symbol}`)}
                                className="hover:text-accent flex items-center gap-1 transition">
                                {r.symbol} <BarChart2 size={11} className="opacity-40" />
                              </button>
                            </td>
                            <td className="text-right font-mono tabular font-semibold">{fmtPrice(r.price)}</td>
                            <td className={`text-right font-mono tabular font-semibold ${r.change_pct !== undefined ? (up ? 'text-up' : 'text-down') : 'text-ink-4'}`}>
                              {r.change_pct !== undefined ? (
                                <span className="inline-flex items-center gap-1 justify-end">
                                  {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                  {up ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.open)}</td>
                            <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.high)}</td>
                            <td className="text-right font-mono tabular text-ink-3">{fmtPrice(r.low)}</td>
                            <td className="text-right font-mono tabular text-ink-3">{fmtVol(r.volume)}</td>
                            <td className="text-right font-mono tabular text-up">{fmtPrice(r.bid)}</td>
                            <td className="text-right font-mono tabular text-down">{fmtPrice(r.ask)}</td>
                            <td className="text-right">
                              <IconButton icon={ShoppingCart} label="Quick trade" variant="accent" size="sm"
                                onClick={() => setTradeSymbol(r.symbol)} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={async (data) => {
          const wl = await api.createWatchlist(data)
          setLists([...lists, wl]); setSelected(wl); setShowCreate(false)
        }} />
      )}

      {tradeSymbol && (
        <QuickTradeModal symbol={tradeSymbol} onClose={() => setTradeSymbol(null)} />
      )}
    </PageShell>
  )
}

function EditSymbols({ watchlist, onSave, onCancel }) {
  const [value, setValue] = useState(watchlist.symbols.join(', '))
  return (
    <div className="flex-1 flex items-center gap-2">
      <Input mono className="uppercase" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="AAPL, MSFT, GOOGL…" autoFocus />
      <IconButton icon={Check} label="Save" variant="up"
        onClick={() => onSave(value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))} />
      <IconButton icon={X} label="Cancel" variant="ghost" onClick={onCancel} />
    </div>
  )
}

function CreateModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [symbols, setSymbols] = useState('')
  const [err, setErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setErr(null)
    try {
      await onCreate({ name, symbols: symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) })
    } catch (e2) { setErr(e2.message) }
    finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={Star}
      title="New Watchlist"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Tech Megacaps" autoFocus />
        </FormField>
        <FormField label="Symbols" hint="Comma-separated tickers">
          <Input mono className="uppercase" value={symbols} onChange={(e) => setSymbols(e.target.value)}
            placeholder="AAPL, MSFT, GOOGL" />
        </FormField>
        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}

function QuickTradeModal({ symbol, onClose }) {
  const [side, setSide] = useState('buy')
  const [qty, setQty] = useState('1')
  const [orderType, setOrderType] = useState('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [tif, setTif] = useState('day')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault(); setErr(null); setSubmitting(true)
    try {
      const payload = { symbol, side, qty: parseFloat(qty), order_type: orderType, time_in_force: tif }
      if (orderType !== 'market' && limitPrice) payload.limit_price = parseFloat(limitPrice)
      const order = await api.submitOrder(payload)
      setDone(order.status)
    } catch (e2) {
      const detail = e2.detail?.detail || e2.message
      setErr(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally { setSubmitting(false) }
  }

  return (
    <Modal
      title={<>Trade <span className="font-mono text-accent">{symbol}</span></>}
      onClose={onClose}
      size="sm"
      footer={!done && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={side === 'buy' ? 'up' : 'down'} onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : `${side.toUpperCase()} ${symbol}`}
          </Button>
        </>
      )}
    >
      {done ? (
        <div className="text-center py-4 space-y-3">
          <div className={`text-base font-semibold ${done === 'submitted' || done === 'accepted' ? 'text-up' : 'text-warn'}`}>
            Order {done}
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Side">
              <Select value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="buy">BUY</option><option value="sell">SELL</option>
              </Select>
            </FormField>
            <FormField label="Quantity">
              <Input mono type="number" min="1" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type">
              <Select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
                <option value="stop_limit">Stop-Limit</option>
              </Select>
            </FormField>
            <FormField label="TIF">
              <Select value={tif} onChange={(e) => setTif(e.target.value)}>
                <option value="day">Day</option>
                <option value="gtc">GTC</option>
                <option value="ioc">IOC</option>
                <option value="fok">FOK</option>
              </Select>
            </FormField>
          </div>
          {orderType !== 'market' && (
            <FormField label="Limit Price">
              <Input mono type="number" step="0.01" placeholder="$" value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)} />
            </FormField>
          )}
          {err && <Alert variant="error">{err}</Alert>}
        </form>
      )}
    </Modal>
  )
}
