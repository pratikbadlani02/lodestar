import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { GitCompare, BarChart3 } from 'lucide-react'
import { api } from '../lib/api'
import { chartColors, tooltipStyle } from '../lib/themeColors'
import {
  PageShell, PageHeader, Card, SectionHeader, FormField, Select,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function BacktestCompare() {
  const [params, setParams] = useSearchParams()
  const [backtests, setBacktests] = useState([])
  const [aId, setAId] = useState(params.get('a') || '')
  const [bId, setBId] = useState(params.get('b') || '')
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)

  useEffect(() => { api.listBacktests().then(setBacktests) }, [])
  useEffect(() => { aId ? api.getBacktest(aId).then(setA) : setA(null) }, [aId])
  useEffect(() => { bId ? api.getBacktest(bId).then(setB) : setB(null) }, [bId])

  // Reflect picks back into the URL so the comparison is shareable.
  useEffect(() => {
    const next = new URLSearchParams()
    if (aId) next.set('a', aId)
    if (bId) next.set('b', bId)
    setParams(next, { replace: true })
  }, [aId, bId, setParams])

  const mergedCurve = (() => {
    if (!a || !b) return []
    const aPoints = a.equity_curve || []
    const bPoints = b.equity_curve || []
    const len = Math.min(aPoints.length, bPoints.length)
    return Array.from({ length: len }, (_, i) => ({
      i,
      A: aPoints[i]?.equity,
      B: bPoints[i]?.equity,
    }))
  })()

  return (
    <PageShell>
      <PageHeader
        icon={GitCompare}
        title="Backtest Comparison"
        subtitle="Compare two backtests side by side"
      />

      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Backtest A">
            <Select value={aId} onChange={(e) => setAId(e.target.value)}>
              <option value="">— Select —</option>
              {backtests.filter((bt) => bt.status === 'completed').map((bt) => (
                <option key={bt.id} value={bt.id}>{bt.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Backtest B">
            <Select value={bId} onChange={(e) => setBId(e.target.value)}>
              <option value="">— Select —</option>
              {backtests.filter((bt) => bt.status === 'completed').map((bt) => (
                <option key={bt.id} value={bt.id}>{bt.name}</option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      {a && b ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CompareMetric label="Total Return" a={Number(a.total_return_pct)} b={Number(b.total_return_pct)} suffix="%" />
            <CompareMetric label="Sharpe" a={Number(a.sharpe_ratio)} b={Number(b.sharpe_ratio)} />
            <CompareMetric label="Max Drawdown" a={-Number(a.max_drawdown_pct)} b={-Number(b.max_drawdown_pct)} suffix="%" />
            <CompareMetric label="Win Rate" a={Number(a.win_rate_pct)} b={Number(b.win_rate_pct)} suffix="%" />
          </div>

          <Card>
            <SectionHeader icon={BarChart3} title="Equity Curves" />
            <div className="p-4">
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={mergedCurve}>
                  <CartesianGrid stroke={chartColors.grid()} />
                  <XAxis dataKey="i" stroke={chartColors.axis()} fontSize={10} />
                  <YAxis stroke={chartColors.axis()} fontSize={10} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Legend wrapperStyle={{ fontSize: 11, color: chartColors.text() }} />
                  <Line type="monotone" dataKey="A" stroke={chartColors.accent()}  dot={false} strokeWidth={2} name={a.name} />
                  <Line type="monotone" dataKey="B" stroke={chartColors.accent2()} dot={false} strokeWidth={2} name={b.name} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={GitCompare}
            title="Select two backtests"
            body="Pick two completed backtests above to compare their key metrics and equity curves."
          />
        </Card>
      )}
    </PageShell>
  )
}

function CompareMetric({ label, a, b, suffix = '' }) {
  const winner = a > b ? 'A' : b > a ? 'B' : null
  return (
    <Card className="p-3">
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium mb-2">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono tabular min-w-0">
          <span className={`text-base font-semibold ${winner === 'A' ? 'text-up' : 'text-ink-2'}`}>
            {a.toFixed(2)}{suffix}
          </span>
          <span className="text-2xs text-ink-4 ml-1">A</span>
        </div>
        <div className="font-mono tabular text-right min-w-0">
          <span className={`text-base font-semibold ${winner === 'B' ? 'text-up' : 'text-ink-2'}`}>
            {b.toFixed(2)}{suffix}
          </span>
          <span className="text-2xs text-ink-4 ml-1">B</span>
        </div>
      </div>
    </Card>
  )
}
