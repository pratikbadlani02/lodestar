import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Activity } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/api'
import { chartColors, tooltipStyle } from '../lib/themeColors'
import {
  PageShell, PageHeader, Card, SectionHeader, Button,
  Stat, StatGrid, Alert, StatusBadge, SkeletonRows,
} from '../components/ui/primitives'
import { currencySymbolOf } from '../lib/MarketContext'

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

  // Market making has no round-trip trades — derive a session/fills summary
  // from the equity curve (daily P/L) + total fills instead.
  const isMM = bt?.strategy_type === 'market_making'
  const mm = useMemo(() => {
    if (!isMM || !(bt?.equity_curve?.length)) return null
    const eqs = bt.equity_curve.map((p) => Number(p.equity))
    const init = Number(bt.initial_capital)
    const daily = eqs.map((e, i) => ({ t: bt.equity_curve[i].t?.slice(0, 10) || '', pl: e - (i === 0 ? init : eqs[i - 1]) }))
    const pls = daily.map((d) => d.pl)
    const sessions = pls.length || 1
    const fills = Number(bt.total_trades) || 0
    const totalPL = eqs[eqs.length - 1] - init
    const wins = pls.filter((p) => p > 0).length
    return {
      daily, sessions, fills,
      fillsPerDay: fills / sessions,
      totalPL,
      winPct: (wins / sessions) * 100,
      best: Math.max(...pls), worst: Math.min(...pls),
      avg: pls.reduce((a, b) => a + b, 0) / sessions,
      plPerFill: fills ? totalPL / fills : 0,
    }
  }, [bt, isMM])
  // Currency follows the backtested instrument (Indian symbols carry .NS/.BO).
  const ccy = currencySymbolOf(bt?.symbols?.[0])
  const money = (v) => `${v < 0 ? '-' : ''}${ccy}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

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
            <Stat label="Final Equity" value={bt.final_equity ? `${ccy}${Number(bt.final_equity).toLocaleString()}` : '—'} big />
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

          {isMM && mm && (
            <Card>
              <SectionHeader icon={Activity} title="Market-Making Summary"
                action={<span className="text-2xs text-ink-4">no round-trip trades · spread capture across fills</span>} />
              <div className="p-4 space-y-4">
                <StatGrid cols={4}>
                  <Stat label="Total Fills" value={mm.fills.toLocaleString()} big />
                  <Stat label="Fills / Session" value={mm.fillsPerDay.toFixed(0)} big />
                  <Stat label="Sessions" value={mm.sessions.toLocaleString()} big />
                  <Stat label="Profitable Sessions" value={`${mm.winPct.toFixed(0)}%`} big />
                  <Stat label="Total P/L" value={money(mm.totalPL)} variant={mm.totalPL >= 0 ? 'up' : 'down'} />
                  <Stat label="Avg / Session" value={money(mm.avg)} variant={mm.avg >= 0 ? 'up' : 'down'} />
                  <Stat label="Best / Worst Day" value={`${money(mm.best)} / ${money(mm.worst)}`} />
                  <Stat label="Avg P/L per Fill" value={`${ccy}${mm.plPerFill.toFixed(3)}`} />
                </StatGrid>
                <div>
                  <div className="text-2xs uppercase tracking-wider text-ink-4 mb-1">Daily session P/L</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={mm.daily}>
                      <CartesianGrid stroke={chartColors.grid()} vertical={false} />
                      <XAxis dataKey="t" stroke={chartColors.axis()} fontSize={9} minTickGap={30} />
                      <YAxis stroke={chartColors.axis()} fontSize={9} />
                      <Tooltip contentStyle={tooltipStyle()} formatter={(v) => money(Number(v))} />
                      <Bar dataKey="pl">
                        {mm.daily.map((d, i) => (
                          <Cell key={i} fill={d.pl >= 0 ? 'rgb(var(--c-up))' : 'rgb(var(--c-down))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
                        <td className="text-right font-mono tabular">{ccy}{Number(t.entry_price).toFixed(2)}</td>
                        <td className="text-right font-mono tabular">{t.exit_price ? `${ccy}${Number(t.exit_price).toFixed(2)}` : '—'}</td>
                        <td className="text-right font-mono tabular">{Number(t.qty).toFixed(0)}</td>
                        <td className={`text-right font-mono tabular font-semibold ${Number(t.pnl) >= 0 ? 'text-up' : 'text-down'}`}>
                          {t.pnl ? `${ccy}${Number(t.pnl).toFixed(2)}` : '—'}
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
