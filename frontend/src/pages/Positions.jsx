import { useEffect, useMemo, useState } from 'react'
import { Briefcase, PieChart, DollarSign, TrendingUp } from 'lucide-react'
import { api } from '../lib/api'
import { useStore, selectPositions } from '../lib/store'
import EmptyState from '../components/ui/EmptyState'
import { Card, SectionHeader, PageShell, PageHeader } from '../components/ui/primitives'
import { Donut, PnlCell, MagBar, MiniEquityCurve } from '../components/ui/charts'
import { activeCurrency, fmtPrice } from '../components/ui/format'

function fmtUsd(n) {
  if (n === null || n === undefined) return '—'
  return `${activeCurrency()}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtUsdCompact(n) {
  if (n === null || n === undefined) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  const c = activeCurrency()
  if (abs >= 1e9) return `${v >= 0 ? '' : '-'}${c}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${v >= 0 ? '' : '-'}${c}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${v >= 0 ? '' : '-'}${c}${(abs / 1e3).toFixed(1)}K`
  return fmtUsd(v)
}

export default function Positions() {
  // Positions come from the global store — Layout has already mounted the WS,
  // so updates flow in as order_update / position_closed events fire.
  const positions = useStore(selectPositions)
  const [equityCurve, setEquityCurve] = useState([])

  // Pull 30-day equity curve for the header sparkline
  useEffect(() => {
    api.getEquityCurve(30)
      .then((r) => {
        const pts = (r?.points || r || []).map((p) => Number(p.equity ?? p.value ?? p.v))
          .filter((x) => Number.isFinite(x))
        setEquityCurve(pts)
      })
      .catch(() => setEquityCurve([]))
  }, [])

  const totalValue = positions.reduce((s, p) => s + Number(p.market_value || 0), 0)
  const totalPL = positions.reduce((s, p) => s + Number(p.unrealized_pl || 0), 0)
  const totalCost = positions.reduce((s, p) => s + Number(p.cost_basis || (Number(p.avg_entry_price) * Number(p.qty)) || 0), 0)
  const totalPlPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null

  // Build donut data: each position as a slice by market value
  const donutData = useMemo(() => {
    if (positions.length === 0) return []
    const rows = positions
      .map((p) => ({ name: p.symbol, value: Math.abs(Number(p.market_value || 0)) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
    // Combine tail into "Other" if more than 8 slices
    if (rows.length > 8) {
      const head = rows.slice(0, 7)
      const tail = rows.slice(7)
      const otherSum = tail.reduce((s, r) => s + r.value, 0)
      head.push({ name: 'Other', value: otherSum })
      return head
    }
    return rows
  }, [positions])

  // Max position size for MagBar normalization
  const maxValue = useMemo(() => Math.max(1, ...positions.map((p) => Math.abs(Number(p.market_value || 0)))), [positions])

  return (
    <PageShell>
      <PageHeader
        icon={Briefcase}
        title="Positions"
        subtitle="Live from broker · refreshes every 10s"
      />

      {/* Top stats row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
        {/* Equity card with sparkline */}
        <Card className="md:col-span-5 p-4 flex flex-col justify-between min-h-[120px]">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Total Market Value</div>
              <div className="text-2xl font-mono tabular font-bold text-ink-1 mt-1">{fmtUsd(totalValue)}</div>
            </div>
            <DollarSign size={16} className="text-ink-4" />
          </div>
          {equityCurve.length > 1 && (
            <div className="mt-2 -mx-2">
              <MiniEquityCurve values={equityCurve} height={42} />
            </div>
          )}
        </Card>

        {/* Total P/L card */}
        <Card className="md:col-span-4 p-4 flex flex-col justify-between min-h-[120px]">
          <div className="flex items-start justify-between">
            <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Unrealized P/L</div>
            <TrendingUp size={16} className={totalPL >= 0 ? 'text-up' : 'text-down'} />
          </div>
          <div>
            <div className={`text-2xl font-mono tabular font-bold ${totalPL >= 0 ? 'text-up' : 'text-down'}`}>
              {totalPL >= 0 ? '+' : ''}{fmtUsd(totalPL)}
            </div>
            {totalPlPct != null && (
              <div className="mt-1">
                <PnlCell value={totalPlPct} scale={10} />
                <span className="text-2xs text-ink-4 ml-2">vs cost basis</span>
              </div>
            )}
          </div>
        </Card>

        {/* Count card */}
        <Card className="md:col-span-3 p-4 flex flex-col justify-between min-h-[120px]">
          <div className="flex items-start justify-between">
            <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Open Positions</div>
            <Briefcase size={16} className="text-ink-4" />
          </div>
          <div>
            <div className="text-2xl font-mono tabular font-bold text-ink-1">{positions.length}</div>
            <div className="text-2xs text-ink-4 mt-1">
              {positions.filter((p) => Number(p.unrealized_pl) >= 0).length} winners ·{' '}
              {positions.filter((p) => Number(p.unrealized_pl) < 0).length} losers
            </div>
          </div>
        </Card>
      </div>

      {/* Mid row: donut allocation + sector breakdown (or table inline) */}
      {donutData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
          <Card className="lg:col-span-4 p-4">
            <SectionHeader icon={PieChart} title="Allocation by Position" />
            <div className="flex items-center justify-center pt-4">
              <Donut
                data={donutData}
                size={180}
                thickness={22}
                centerLabel="positions"
                centerValue={String(positions.length)}
              />
            </div>
            <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
              {donutData.map((d, i) => {
                const palette = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185', '#60a5fa', '#f97316']
                const pct = (d.value / totalValue) * 100
                return (
                  <div key={d.name} className="flex items-center gap-2 text-2xs">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: palette[i % palette.length] }} />
                    <span className="font-mono font-semibold text-ink-2 w-12">{d.name}</span>
                    <span className="text-ink-4 ml-auto font-mono tabular">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="lg:col-span-8">
            <Card className="overflow-hidden h-full">
              <SectionHeader icon={Briefcase} title="Holdings" />
              <table className="w-full text-sm t-dense">
                <thead>
                  <tr>
                    <th className="text-left">Symbol</th>
                    <th className="text-left">Side</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg Entry</th>
                    <th className="text-right">Current</th>
                    <th className="text-right">Market Value</th>
                    <th className="text-left w-28">Weight</th>
                    <th className="text-right">P/L $</th>
                    <th className="text-right">P/L %</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {positions.map((p) => {
                    const mv = Number(p.market_value || 0)
                    const pl = Number(p.unrealized_pl || 0)
                    const pct = Number(p.unrealized_plpc || 0) * 100
                    return (
                      <tr key={p.symbol}>
                        <td className="font-semibold text-ink-1">{p.symbol}</td>
                        <td className={p.side === 'long' ? 'text-up' : 'text-down'}>{p.side}</td>
                        <td className="text-right text-ink-2">{p.qty}</td>
                        <td className="text-right text-ink-2">{fmtPrice(p.avg_entry_price)}</td>
                        <td className="text-right text-ink-2">{fmtPrice(p.current_price)}</td>
                        <td className="text-right text-ink-1 font-semibold">{fmtUsdCompact(mv)}</td>
                        <td>
                          <MagBar value={mv} scale={maxValue} height={6} />
                        </td>
                        <td className={`text-right font-semibold ${pl >= 0 ? 'text-up' : 'text-down'}`}>
                          {pl >= 0 ? '+' : ''}{fmtUsdCompact(pl)}
                        </td>
                        <td className="text-right">
                          <PnlCell value={pct} scale={10} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {positions.length === 0 && (
                <EmptyState
                  icon={Briefcase}
                  title="No open positions"
                  body="Buy a symbol to open your first position — orders fill into positions automatically."
                  action={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
                  actionLabel="Open order ticket"
                />
              )}
            </Card>
          </div>
        </div>
      )}

      {positions.length === 0 && (
        <Card className="overflow-hidden">
          <EmptyState
            icon={Briefcase}
            title="No open positions"
            body="Buy a symbol to open your first position — orders fill into positions automatically."
            action={() => window.dispatchEvent(new CustomEvent('order-ticket:open', { detail: { side: 'buy' } }))}
            actionLabel="Open order ticket"
          />
        </Card>
      )}
    </PageShell>
  )
}
