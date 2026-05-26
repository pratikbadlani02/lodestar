import { useEffect, useState } from 'react'
import { Shield, Activity, AlertTriangle, GitBranch } from 'lucide-react'
import { api } from '../lib/api'
import {
  PageShell, PageHeader, Card, SectionHeader, Select, Stat, StatGrid, Alert, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function RiskAnalytics() {
  const [risk, setRisk] = useState(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setRisk(await api.getPortfolioRisk(days)) } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [days])

  const concentrationWarn = risk && Object.values(risk.concentration || {}).some((p) => p > 25)

  return (
    <PageShell>
      <PageHeader
        icon={Shield}
        title="Risk Analytics"
        subtitle="Portfolio risk metrics — VaR, beta, concentration, and correlation"
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-w-[140px]">
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </Select>
        }
      />

      {loading ? (
        <Card className="p-5"><SkeletonRows count={4} cols={3} /></Card>
      ) : !risk ? (
        <Alert variant="error">Failed to load risk metrics.</Alert>
      ) : risk.positions_count === 0 ? (
        <Card>
          <EmptyState
            icon={Shield}
            title="No positions to analyze"
            body="Open a position to see VaR, beta, and concentration analytics."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <StatGrid cols={3}>
            <Stat
              label="Value at Risk (95%)"
              value={`$${risk.var_95_dollars.toLocaleString()}`}
              sub={`${risk.var_95_pct.toFixed(2)}% of equity`}
              variant="accent"
              big
            />
            <Stat
              label="Beta vs SPY"
              value={risk.beta_vs_spy !== null ? risk.beta_vs_spy.toFixed(3) : '—'}
              sub={risk.beta_vs_spy > 1.2 ? 'High beta' : risk.beta_vs_spy < 0.8 ? 'Low beta' : 'Market-like'}
              variant={risk.beta_vs_spy > 1.5 ? 'down' : 'default'}
              big
            />
            <Stat
              label="Positions"
              value={risk.positions_count}
              sub={`Lookback: ${risk.lookback_days}d`}
              big
            />
          </StatGrid>

          <Card>
            <SectionHeader icon={Activity} title="Concentration" />
            <div className="p-5 space-y-2">
              {Object.entries(risk.concentration)
                .sort((a, b) => b[1] - a[1])
                .map(([sym, pct]) => (
                  <div key={sym} className="flex items-center gap-3">
                    <span className="font-mono font-semibold w-16 text-sm text-ink-1">{sym}</span>
                    <div className="flex-1 bg-white/[0.04] rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full transition-all ${pct > 20 ? 'bg-down' : pct > 10 ? 'bg-warn' : 'bg-up'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="font-mono tabular text-sm w-16 text-right text-ink-2">{pct.toFixed(1)}%</span>
                  </div>
                ))}
              {concentrationWarn && (
                <Alert variant="warn" className="mt-3">
                  <AlertTriangle size={11} className="inline mr-1" />
                  One or more positions exceed 25% of portfolio
                </Alert>
              )}
            </div>
          </Card>

          {risk.correlation.length > 0 && (
            <Card>
              <SectionHeader icon={GitBranch} title="Correlation Matrix" />
              <div className="p-5 overflow-x-auto">
                <CorrelationMatrix data={risk.correlation} />
              </div>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  )
}

function CorrelationMatrix({ data }) {
  const symbols = [...new Set(data.map((d) => d.symbol_a))]
  const lookup = {}
  data.forEach((d) => { lookup[`${d.symbol_a}|${d.symbol_b}`] = d.correlation })

  const cellColor = (v) => {
    if (v >= 0.7)  return 'bg-down/20 text-down'
    if (v >= 0.4)  return 'bg-warn/15 text-warn'
    if (v >= -0.4) return 'bg-white/[0.04] text-ink-2'
    if (v >= -0.7) return 'bg-info/15 text-info'
    return 'bg-info/25 text-info'
  }

  return (
    <table className="text-xs font-mono tabular border-separate border-spacing-1">
      <thead>
        <tr>
          <th></th>
          {symbols.map((s) => <th key={s} className="px-2 py-1 text-2xs uppercase tracking-wider text-ink-4 font-medium">{s}</th>)}
        </tr>
      </thead>
      <tbody>
        {symbols.map((s1) => (
          <tr key={s1}>
            <td className="pr-2 text-2xs uppercase tracking-wider text-ink-4 font-medium">{s1}</td>
            {symbols.map((s2) => {
              const v = lookup[`${s1}|${s2}`] ?? 0
              return (
                <td key={s2} className={`px-2 py-1 text-center rounded-md font-semibold ${cellColor(v)}`}>
                  {v.toFixed(2)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
