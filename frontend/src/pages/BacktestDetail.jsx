import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/api'
import { chartColors, tooltipStyle } from '../lib/themeColors'
import {
  PageShell, PageHeader, Card, SectionHeader, Button,
  Stat, StatGrid, Alert, StatusBadge, SkeletonRows,
} from '../components/ui/primitives'

export default function BacktestDetail() {
  const { id } = useParams()
  const [bt, setBt] = useState(null)
  const [trades, setTrades] = useState([])

  async function load() {
    setBt(await api.getBacktest(id))
    setTrades(await api.getBacktestTrades(id).catch(() => []))
  }
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i) }, [id])

  const curve = (bt?.equity_curve || []).slice(0, 1000).map((p) => ({
    t: p.t ? p.t.slice(0, 10) : '',
    equity: p.equity,
  }))

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: 'Backtests', to: '/backtests' }, { label: bt?.name || '…' }]}
        title={bt?.name || 'Loading…'}
        subtitle={bt ? `${bt.strategy_type} · ${bt.symbols.join(', ')}` : ''}
        badge={bt ? <StatusBadge status={bt.status} /> : null}
        actions={
          <Link to="/backtests">
            <Button variant="ghost" icon={ArrowLeft}>Back</Button>
          </Link>
        }
      />

      {!bt ? (
        <Card className="p-5"><SkeletonRows count={4} cols={5} /></Card>
      ) : (
        <div className="space-y-3">
          <StatGrid cols={5}>
            <Stat label="Final Equity" value={bt.final_equity ? `$${Number(bt.final_equity).toLocaleString()}` : '—'} big />
            <Stat
              label="Total Return"
              value={bt.total_return_pct !== null ? `${Number(bt.total_return_pct).toFixed(2)}%` : '—'}
              variant={Number(bt.total_return_pct) >= 0 ? 'up' : 'down'}
              big
            />
            <Stat label="Sharpe" value={bt.sharpe_ratio !== null ? Number(bt.sharpe_ratio).toFixed(2) : '—'} big />
            <Stat
              label="Max Drawdown"
              value={bt.max_drawdown_pct !== null ? `-${Number(bt.max_drawdown_pct).toFixed(2)}%` : '—'}
              variant="down"
              big
            />
            <Stat label="Win Rate" value={bt.win_rate_pct !== null ? `${Number(bt.win_rate_pct).toFixed(1)}%` : '—'} big />
          </StatGrid>

          {bt.error && <Alert variant="error" title="Backtest error"><pre className="font-mono whitespace-pre-wrap text-2xs">{bt.error}</pre></Alert>}

          {curve.length > 0 && (
            <Card>
              <SectionHeader icon={BarChart3} title="Equity Curve" />
              <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={curve}>
                    <CartesianGrid stroke={chartColors.grid()} />
                    <XAxis dataKey="t" stroke={chartColors.axis()} fontSize={10} />
                    <YAxis stroke={chartColors.axis()} fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={tooltipStyle()} />
                    <Line type="monotone" dataKey="equity" stroke={chartColors.accent()} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {trades.length > 0 && (
            <Card className="overflow-hidden">
              <SectionHeader title={`Trades (${trades.length})`} />
              <div className="overflow-auto max-h-96">
                <table className="w-full text-xs t-dense">
                  <thead className="sticky top-0 bg-surf-1/95 backdrop-blur z-10">
                    <tr>
                      <th className="text-left">Symbol</th>
                      <th className="text-left">Entry</th>
                      <th className="text-left">Exit</th>
                      <th className="text-right">Entry $</th>
                      <th className="text-right">Exit $</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">P/L</th>
                      <th className="text-right">P/L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t, i) => (
                      <tr key={i}>
                        <td className="font-mono font-semibold">{t.symbol}</td>
                        <td className="font-mono text-ink-3">{t.entry_time ? t.entry_time.slice(0, 10) : '—'}</td>
                        <td className="font-mono text-ink-3">{t.exit_time ? t.exit_time.slice(0, 10) : '—'}</td>
                        <td className="text-right font-mono tabular">${Number(t.entry_price).toFixed(2)}</td>
                        <td className="text-right font-mono tabular">{t.exit_price ? `$${Number(t.exit_price).toFixed(2)}` : '—'}</td>
                        <td className="text-right font-mono tabular">{Number(t.qty).toFixed(0)}</td>
                        <td className={`text-right font-mono tabular font-semibold ${Number(t.pnl) >= 0 ? 'text-up' : 'text-down'}`}>
                          {t.pnl ? `$${Number(t.pnl).toFixed(2)}` : '—'}
                        </td>
                        <td className={`text-right font-mono tabular ${Number(t.pnl_pct) >= 0 ? 'text-up' : 'text-down'}`}>
                          {t.pnl_pct ? `${Number(t.pnl_pct).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  )
}
