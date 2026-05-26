import { useState } from 'react'
import { RefreshCw, Plus, ListOrdered } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { useStore, selectOrders } from '../lib/store'
import {
  PageShell, PageHeader, Card, Button, IconButton, Modal,
  Input, Select, Checkbox, FormField, Alert, StatusBadge, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function Orders() {
  // Orders come from the global store; WS pushes updates on order_update events
  // so we never have to poll. Empty initial state shows skeleton via length check.
  const orders = useStore(selectOrders)
  const hasBoot = useStore((s) => s.wsLastMessage !== null || s.orders.length > 0)
  const [showSubmit, setShowSubmit] = useState(false)
  const loading = !hasBoot && orders.length === 0

  async function sync(id) {
    await api.syncOrder(id)
    // Trigger a manual refresh in case the broker doesn't push a WS update
    useStore.getState().loadOrders()
  }

  return (
    <PageShell>
      <PageHeader
        icon={ListOrdered}
        title="Orders"
        subtitle="All order activity — manual and strategy-generated"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowSubmit(true)}>
            Manual Order
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows count={6} cols={7} /></div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No orders yet"
            body="Orders placed manually or by a strategy will appear here. Try the quick-trade ticket (⇧B / ⇧S) to place your first."
            action={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
            actionLabel="Open order ticket"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm t-dense">
              <thead>
                <tr>
                  <th className="text-left">Time</th>
                  <th className="text-left">Symbol</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Filled</th>
                  <th className="text-right">Avg Price</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="text-ink-3 font-mono tabular text-xs">{new Date(o.submitted_at).toLocaleString()}</td>
                    <td className="font-mono font-semibold">{o.symbol}</td>
                    <td className={`font-mono font-semibold ${o.side === 'buy' ? 'text-up' : 'text-down'}`}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="text-right font-mono tabular">{o.qty}</td>
                    <td className="text-right font-mono tabular">{o.filled_qty}</td>
                    <td className="text-right font-mono tabular">
                      {o.avg_fill_price ? `$${Number(o.avg_fill_price).toFixed(2)}` : <span className="text-ink-5">—</span>}
                    </td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-ink-4 text-xs truncate max-w-xs" title={o.reason}>{o.reason || '—'}</td>
                    <td>
                      {['submitted', 'accepted', 'partially_filled'].includes(o.status) && (
                        <IconButton icon={RefreshCw} label="Sync order" size="sm" onClick={() => sync(o.id)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showSubmit && <SubmitModal onClose={() => setShowSubmit(false)} onSubmitted={() => { setShowSubmit(false); load() }} />}
    </PageShell>
  )
}

function SubmitModal({ onClose, onSubmitted }) {
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState('buy')
  const [qty, setQty] = useState('1')
  const [orderType, setOrderType] = useState('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tif, setTif] = useState('day')
  const [extendedHours, setExtendedHours] = useState(false)
  const [err, setErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const needsLimit = ['limit', 'stop_limit'].includes(orderType)
  const needsStop  = ['stop', 'stop_limit'].includes(orderType)

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setErr(null)
    try {
      const payload = {
        symbol: symbol.toUpperCase(), side, qty: parseFloat(qty),
        order_type: orderType, time_in_force: tif, extended_hours: extendedHours,
      }
      if (needsLimit && limitPrice) payload.limit_price = parseFloat(limitPrice)
      if (needsStop  && stopPrice)  payload.stop_price  = parseFloat(stopPrice)
      await api.submitOrder(payload)
      toast.success(`${side.toUpperCase()} ${qty} ${symbol.toUpperCase()} placed`, {
        description: `${orderType} · ${tif.toUpperCase()}`,
      })
      onSubmitted()
    } catch (e2) {
      const detail = e2.detail?.detail || e2.message
      setErr(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
      toast.apiError(e2, 'Order rejected')
    } finally { setSubmitting(false) }
  }

  return (
    <Modal
      title="Manual Order"
      subtitle="All orders pass through the full risk gate before submission"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={side === 'buy' ? 'up' : 'down'} onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : `${side.toUpperCase()} ${symbol || '—'}`}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Symbol">
          <Input mono className="uppercase" placeholder="AAPL" value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())} required />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Side">
            <Select value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="buy">BUY</option>
              <option value="sell">SELL</option>
            </Select>
          </FormField>
          <FormField label="Type">
            <Select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
              <option value="stop_limit">Stop-Limit</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quantity">
            <Input mono type="number" min="0.001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </FormField>
          <FormField label="TIF">
            <Select value={tif} onChange={(e) => setTif(e.target.value)}>
              <option value="day">Day</option>
              <option value="gtc">GTC</option>
              <option value="ioc">IOC</option>
              <option value="fok">FOK</option>
              <option value="opg">OPG</option>
            </Select>
          </FormField>
        </div>

        {needsLimit && (
          <FormField label="Limit Price">
            <Input mono type="number" step="0.01" min="0.01" placeholder="$" value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)} />
          </FormField>
        )}
        {needsStop && (
          <FormField label="Stop Trigger Price">
            <Input mono type="number" step="0.01" min="0.01" placeholder="$" value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)} />
          </FormField>
        )}

        <Checkbox
          checked={extendedHours}
          onChange={(e) => setExtendedHours(e.target.checked)}
          label="Extended hours"
          hint={extendedHours && orderType === 'market' ? 'Requires limit order on Alpaca' : null}
        />

        {err && (
          <Alert variant="error" title="Order rejected">
            <pre className="font-mono whitespace-pre-wrap text-2xs leading-relaxed">{err}</pre>
          </Alert>
        )}
      </form>
    </Modal>
  )
}
