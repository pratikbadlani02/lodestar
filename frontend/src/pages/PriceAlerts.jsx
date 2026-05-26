import { useEffect, useState } from 'react'
import { BellRing, Plus, Trash2, CheckCircle, Clock } from 'lucide-react'
import { api, connectWebSocket } from '../lib/api'
import {
  PageShell, PageHeader, Card, Button, IconButton, Modal,
  Input, Select, FormField, Alert, Pill, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function PriceAlerts() {
  const [alerts, setAlerts] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try { setAlerts(await api.listPriceAlerts().catch(() => [])) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 15000)
    const ws = connectWebSocket((msg) => {
      if (msg.type === 'price_alert_triggered') load()
    })
    return () => { clearInterval(i); ws.close() }
  }, [])

  async function remove(id) {
    await api.deletePriceAlert(id)
    load()
  }

  const active = alerts.filter((a) => !a.triggered)
  const fired = alerts.filter((a) => a.triggered)

  return (
    <PageShell>
      <PageHeader
        icon={BellRing}
        title="Price Alerts"
        subtitle="Get notified when a symbol crosses a price threshold"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            New Alert
          </Button>
        }
      />

      {loading ? (
        <Card className="p-5"><SkeletonRows count={3} cols={3} /></Card>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="text-2xs uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
              Active <span className="text-ink-5">({active.length})</span>
            </h2>
            {active.length === 0 ? (
              <Card>
                <EmptyState
                  icon={BellRing}
                  title="No active alerts"
                  body="Create your first price-based notification — alerts fire over WebSocket and email."
                  action={() => setShowCreate(true)}
                  actionLabel="New Alert"
                />
              </Card>
            ) : (
              <div className="space-y-2">
                {active.map((a) => <AlertCard key={a.id} alert={a} onDelete={() => remove(a.id)} />)}
              </div>
            )}
          </section>

          {fired.length > 0 && (
            <section>
              <h2 className="text-2xs uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
                Triggered <span className="text-ink-5">({fired.length})</span>
              </h2>
              <div className="space-y-2">
                {fired.map((a) => <AlertCard key={a.id} alert={a} onDelete={() => remove(a.id)} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={async (data) => {
          await api.createPriceAlert(data)
          setShowCreate(false)
          load()
        }} />
      )}
    </PageShell>
  )
}

function AlertCard({ alert: a, onDelete }) {
  const triggered = a.triggered
  return (
    <Card className={`p-4 flex items-start gap-3 transition ${triggered ? 'opacity-70 border-up/30 bg-up/[0.04]' : ''}`}>
      <div className={`shrink-0 mt-0.5 ${triggered ? 'text-up' : 'text-warn'}`}>
        {triggered ? <CheckCircle size={16} /> : <Clock size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono font-semibold text-ink-1">{a.symbol}</span>
          <Pill variant={a.condition === 'above' ? 'up' : 'down'} className="uppercase">
            {a.condition === 'above' ? '↑' : '↓'} {a.condition} ${Number(a.threshold).toFixed(2)}
          </Pill>
          {triggered && a.triggered_at && (
            <span className="text-2xs text-ink-4 font-mono">
              fired {new Date(a.triggered_at).toLocaleString()}
            </span>
          )}
        </div>
        {a.message && <p className="text-xs text-ink-2">{a.message}</p>}
        <p className="text-2xs text-ink-5 font-mono mt-1">
          Created {new Date(a.created_at).toLocaleDateString()}
        </p>
      </div>
      <IconButton icon={Trash2} label="Delete alert" variant="danger" size="sm" onClick={onDelete} />
    </Card>
  )
}

function CreateModal({ onClose, onCreate }) {
  const [symbol, setSymbol] = useState('')
  const [alertType, setAlertType] = useState('price')
  const [condition, setCondition] = useState('above')
  const [threshold, setThreshold] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const thresholdLabel =
    alertType === 'volume' ? 'Volume threshold' :
    alertType === 'pct_change' ? 'Change % threshold' :
    'Price threshold ($)'

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setErr(null)
    try {
      await onCreate({
        symbol: symbol.toUpperCase(),
        alert_type: alertType,
        condition,
        threshold: parseFloat(threshold),
        message: message || null,
      })
    } catch (e2) { setErr(e2.message) }
    finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={BellRing}
      title="New Alert"
      subtitle="Worker checks prices every 60 seconds during market hours"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Alert'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Symbol">
          <Input mono className="uppercase" placeholder="AAPL" value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())} required autoFocus />
        </FormField>

        <FormField label="Alert Type">
          <Select value={alertType} onChange={(e) => setAlertType(e.target.value)}>
            <option value="price">Price</option>
            <option value="volume">Volume</option>
            <option value="pct_change">% Change (intraday)</option>
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="above">↑ Above</option>
              <option value="below">↓ Below</option>
            </Select>
          </FormField>
          <FormField label={thresholdLabel}>
            <Input mono type="number" step="any" min="0" value={threshold}
              onChange={(e) => setThreshold(e.target.value)} required />
          </FormField>
        </div>

        <FormField label="Message" hint="Optional">
          <Input value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. AAPL broke 200d MA" />
        </FormField>

        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}
