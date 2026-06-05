import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Activity, RefreshCw, BarChart3 } from 'lucide-react'
import { api } from '../lib/api'
import { Card, SectionHeader } from '../components/ui/primitives'
import { PnlCell, MagBar } from '../components/ui/charts'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import { useMarket } from '../lib/MarketContext'
import { fmtPrice } from '../components/ui/format'

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d))
const fmtBig = (v) => {
  if (v == null) return '—'
  const n = Number(v); if (Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toString()
}

// One mover row with a magnitude background hint
function MoverRow({ m, max, side, onClick, onContextMenu }) {
  const pct = Number(m.percent_change ?? m.change ?? 0)
  const ratio = max > 0 ? Math.min(1, Math.abs(pct) / max) : 0
  const opacity = (0.04 + ratio * 0.14).toFixed(3)
  const up = pct >= 0
  const bg = up
    ? `linear-gradient(to left, rgba(var(--c-up) / ${opacity}) 0%, transparent ${Math.max(20, ratio * 100)}%)`
    : `linear-gradient(to left, rgba(var(--c-down) / ${opacity}) 0%, transparent ${Math.max(20, ratio * 100)}%)`
  return (
    <tr
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="cursor-pointer transition-colors hover:bg-white/[0.04]"
      style={{ backgroundImage: bg }}
    >
      <td className="font-mono font-semibold text-ink-1">{m.symbol}</td>
      <td className="text-right font-mono tabular text-ink-2">{fmtPrice(m.price)}</td>
      <td className="text-right">
        <PnlCell value={pct} scale={Math.max(5, max * 0.8)} />
      </td>
    </tr>
  )
}

function MoverList({ title, items, icon: Icon, accent, tone, onSelect }) {
  const max = useMemo(() => Math.max(0, ...items.map((m) => Math.abs(Number(m.percent_change || 0)))), [items])
  const ctx = useSymbolContextMenu()
  return (
    <Card className="overflow-hidden">
      <SectionHeader
        icon={Icon}
        title={title}
        accent={accent}
        action={<span className="text-2xs text-ink-4">{items.length} symbols</span>}
      />
      <table className="w-full text-sm t-dense">
        <thead>
          <tr>
            <th className="text-left">Symbol</th>
            <th className="text-right">Price</th>
            <th className="text-right">% Δ</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-8 text-center text-ink-4">No data</td></tr>
          )}
          {items.map((m) => (
            <MoverRow
              key={m.symbol}
              m={m}
              max={max}
              side={tone}
              onClick={() => onSelect(m.symbol)}
              onContextMenu={(e) => ctx.onContextMenu(e, m.symbol)}
            />
          ))}
        </tbody>
      </table>
      {ctx.menu}
    </Card>
  )
}

export default function Movers() {
  const navigate = useNavigate()
  const [gainers, setGainers] = useState([])
  const [losers, setLosers] = useState([])
  const [actives, setActives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const activeCtx = useSymbolContextMenu()
  const { market } = useMarket()

  async function load() {
    setLoading(true); setError('')
    try {
      const [m, a] = await Promise.all([
        api.getMovers(25),
        api.getMostActives(25, 'volume'),
      ])
      setGainers(m.gainers || [])
      setLosers(m.losers || [])
      setActives(a.most_actives || [])
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e.message || 'Failed to load movers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [market])

  function openSymbol(sym) {
    navigate(`/analysis/${sym}`)
  }

  // Header strip stats: best gainer, worst loser, spread
  const bestGainer = gainers[0]
  const worstLoser = losers[0]
  const spread = bestGainer && worstLoser
    ? Number(bestGainer.percent_change) - Number(worstLoser.percent_change)
    : null
  const maxVolume = useMemo(() => Math.max(1, ...actives.map((a) => Number(a.volume || 0))), [actives])

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-3 md:space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-display font-semibold tracking-tight">Market Movers</h1>
          <p className="text-2xs text-ink-4 uppercase tracking-wider">
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <button onClick={load} className="ml-auto w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-ink-3 hover:text-ink-1 transition">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Best Gainer</div>
          {bestGainer ? (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono font-bold text-ink-1">{bestGainer.symbol}</span>
              <PnlCell value={Number(bestGainer.percent_change)} scale={20} />
            </div>
          ) : <div className="text-sm text-ink-4 mt-1">—</div>}
        </Card>
        <Card className="p-3">
          <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Worst Loser</div>
          {worstLoser ? (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono font-bold text-ink-1">{worstLoser.symbol}</span>
              <PnlCell value={Number(worstLoser.percent_change)} scale={20} />
            </div>
          ) : <div className="text-sm text-ink-4 mt-1">—</div>}
        </Card>
        <Card className="p-3">
          <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">Spread (max – min)</div>
          <div className="text-sm font-mono tabular font-semibold text-ink-1 mt-1">
            {spread != null ? `${spread.toFixed(2)}%` : '—'}
          </div>
        </Card>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 text-down text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MoverList title="Top Gainers" items={gainers} icon={TrendingUp} accent="text-up" tone="up" onSelect={openSymbol} />
        <MoverList title="Top Losers" items={losers} icon={TrendingDown} accent="text-down" tone="down" onSelect={openSymbol} />
      </div>

      {/* Most active — with volume bar */}
      <Card className="overflow-hidden">
        <SectionHeader
          icon={BarChart3}
          title="Most Active by Volume"
          action={<span className="text-2xs text-ink-4">{actives.length} symbols</span>}
        />
        <table className="w-full text-sm t-dense">
          <thead>
            <tr>
              <th className="text-left">Symbol</th>
              <th className="text-right">Volume</th>
              <th className="text-left w-1/3">Relative</th>
              <th className="text-right">Trade Count</th>
            </tr>
          </thead>
          <tbody>
            {actives.map((a) => (
              <tr
                key={a.symbol}
                onClick={() => openSymbol(a.symbol)}
                onContextMenu={(e) => activeCtx.onContextMenu(e, a.symbol)}
                className="cursor-pointer hover:bg-white/[0.03] transition-colors"
              >
                <td className="font-mono font-semibold text-ink-1">{a.symbol}</td>
                <td className="text-right font-mono tabular text-ink-2">{fmtBig(a.volume)}</td>
                <td className="pr-4">
                  <MagBar value={Number(a.volume || 0)} scale={maxVolume} height={6} />
                </td>
                <td className="text-right font-mono tabular text-ink-3">{fmtBig(a.trade_count)}</td>
              </tr>
            ))}
            {actives.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-4">No data</td></tr>
            )}
          </tbody>
        </table>
        {activeCtx.menu}
      </Card>
    </div>
  )
}
