import { useEffect, useState } from 'react'
import { ShieldAlert, Check, X } from 'lucide-react'
import { api } from '../lib/api'
import { PageShell, PageHeader, Card, SkeletonRows } from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function AuditLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const load = async () => { try { setRows(await api.getAudit(200)) } finally { setLoading(false) } }
    load(); const i = setInterval(load, 10000); return () => clearInterval(i)
  }, [])

  return (
    <PageShell>
      <PageHeader
        icon={ShieldAlert}
        title="Audit Log"
        subtitle="Immutable record of every sensitive action"
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows count={6} cols={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No audit entries yet" body="Sensitive actions like kill switches, liquidations, and strategy changes will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm t-dense">
              <thead>
                <tr>
                  <th className="text-left">Time</th>
                  <th className="text-left">Actor</th>
                  <th className="text-left">Action</th>
                  <th className="text-left">Resource</th>
                  <th className="text-left">Details</th>
                  <th className="text-center">OK</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-4 font-mono tabular text-xs">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="text-accent font-mono text-xs">{r.actor}</td>
                    <td className="font-semibold text-ink-1">{r.action}</td>
                    <td className="text-ink-3 font-mono text-xs">{r.resource || '—'}</td>
                    <td className="text-ink-4 text-xs truncate max-w-md font-mono" title={JSON.stringify(r.details)}>
                      {JSON.stringify(r.details)}
                    </td>
                    <td className="text-center">
                      {r.success
                        ? <Check size={14} className="inline text-up" />
                        : <X size={14} className="inline text-down" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  )
}
