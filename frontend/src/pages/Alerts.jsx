import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, AlertTriangle, AlertOctagon, Info } from 'lucide-react'
import { api } from '../lib/api'
import { useStore, selectAlerts } from '../lib/store'
import {
  PageShell, PageHeader, Card, Select, IconButton, Pill, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

const SEVERITY_CFG = {
  info:     { Icon: Info,           variant: 'info',  bg: 'bg-info/[0.04]  border-info/20'   },
  warning:  { Icon: AlertTriangle,  variant: 'warn',  bg: 'bg-warn/[0.04]  border-warn/20'   },
  critical: { Icon: AlertOctagon,   variant: 'down',  bg: 'bg-down/[0.06]  border-down/30'   },
}

export default function Alerts() {
  const allAlerts = useStore(selectAlerts)
  const hasBoot = useStore((s) => s.alerts.length > 0 || s.wsLastMessage !== null)
  const [filter, setFilter] = useState({ unack_only: false, severity: '' })
  const loading = !hasBoot && allAlerts.length === 0

  // Filter locally — the store holds all alerts and WS pushes updates,
  // so we don't refetch for filter changes.
  const alerts = useMemo(() => {
    return allAlerts.filter((a) => {
      if (filter.unack_only && a.acknowledged) return false
      if (filter.severity && a.severity !== filter.severity) return false
      return true
    })
  }, [allAlerts, filter])

  async function ack(id) {
    await api.ackAlert(id)
    useStore.getState().loadAlerts()
  }

  return (
    <PageShell>
      <PageHeader
        icon={Bell}
        title="System Alerts"
        subtitle="System events, risk warnings, and strategy notifications"
        actions={
          <div className="flex gap-2">
            <Select value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
              className="min-w-[140px]">
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </Select>
            <button
              onClick={() => setFilter({ ...filter, unack_only: !filter.unack_only })}
              className={`text-xs font-medium rounded-lg px-3 py-2 border transition ${
                filter.unack_only
                  ? 'bg-warn/15 text-warn border-warn/30'
                  : 'bg-white/[0.04] text-ink-3 border-white/[0.06] hover:bg-white/[0.08]'
              }`}
            >
              {filter.unack_only ? '✓ Unack only' : 'Show all'}
            </button>
          </div>
        }
      />

      {loading ? (
        <Card className="p-5"><SkeletonRows count={4} cols={3} /></Card>
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No alerts"
            body="System events, risk gate rejections, and strategy notifications will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => <AlertRow key={a.id} alert={a} onAck={() => ack(a.id)} />)}
        </div>
      )}
    </PageShell>
  )
}

function AlertRow({ alert, onAck }) {
  const cfg = SEVERITY_CFG[alert.severity] || SEVERITY_CFG.info
  return (
    <div className={`${cfg.bg} ${alert.acknowledged ? 'opacity-60' : ''} border rounded-xl p-4 flex items-start gap-3 transition`}>
      <cfg.Icon size={16} className={`text-${cfg.variant} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-sm text-ink-1">{alert.title}</span>
          <Pill variant="neutral" className="font-mono">{alert.category}</Pill>
          {alert.acknowledged && <Pill variant="neutral">acked</Pill>}
        </div>
        <p className="text-sm text-ink-2 leading-relaxed">{alert.message}</p>
        <p className="text-2xs text-ink-4 font-mono mt-1.5">{new Date(alert.timestamp).toLocaleString()}</p>
      </div>
      {!alert.acknowledged && (
        <IconButton icon={Check} label="Acknowledge" variant="ghost" onClick={onAck} />
      )}
    </div>
  )
}
