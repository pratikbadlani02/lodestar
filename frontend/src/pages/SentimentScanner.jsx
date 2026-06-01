import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, RefreshCw, Loader2, TrendingUp, Newspaper, CalendarClock, Target, UserCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import { PageShell, PageHeader, Card, SectionHeader, Pill, Select, Button, IconButton, Alert } from '../components/ui/primitives'
import { PnlCell, HeatRing } from '../components/ui/charts'

// ─────────────────────────────────────────────────────────────────────────
// Sentiment Scanner — ranks a universe into "top picks" by fusing five signals
// (momentum · news · earnings · analyst · insider) from /market/sentiment-scan.
// The backend scan runs in the background and is cached; this page polls while
// status === 'scanning'.
// ─────────────────────────────────────────────────────────────────────────

const UNIVERSES = [
  { key: 'megacap', label: 'Megacap leaders' },
  { key: 'ai_semis', label: 'AI & semiconductors' },
  { key: 'broad', label: 'Broad market & sectors' },
]

const SIGNALS = [
  { key: 'momentum', label: 'Momentum', short: 'Mom', icon: TrendingUp },
  { key: 'news', label: 'News sentiment', short: 'News', icon: Newspaper },
  { key: 'earnings', label: 'Earnings track', short: 'Earn', icon: CalendarClock },
  { key: 'analyst', label: 'Analyst targets', short: 'Analyst', icon: Target },
  { key: 'insider', label: 'Insider flow', short: 'Insider', icon: UserCheck },
]

const scoreColor = (v) => (v == null ? 'text-ink-5' : v >= 66 ? 'text-up' : v >= 45 ? 'text-warn' : 'text-down')
const scoreBg = (v) => (v == null ? 'bg-white/10' : v >= 66 ? 'bg-up' : v >= 45 ? 'bg-warn' : 'bg-down')

export default function SentimentScanner() {
  const navigate = useNavigate()
  const { setSymbol } = useSymbol()
  const ctx = useSymbolContextMenu()
  const [universe, setUniverse] = useState('megacap')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const timer = useRef(null)

  const open = (sym) => { setSymbol(sym); navigate(`/analysis/${sym}`) }

  const fetchScan = useCallback(async (uni, refresh = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setErr('')
    try {
      const d = await api.getSentimentScan({ universe: uni, refresh })
      setData(d)
      if (d.status === 'scanning') timer.current = setTimeout(() => fetchScan(uni, false), 3500)
    } catch (e) {
      setErr(e.message || 'Scan failed')
    }
  }, [])

  useEffect(() => {
    setData(null)
    fetchScan(universe, false)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [universe, fetchScan])

  const scanning = !data || data.status === 'scanning'
  const picks = data?.status === 'ready' ? (data.picks || []) : []
  const top = picks.slice(0, 3)
  const rest = picks.slice(3)
  const genAt = data?.generated_at ? new Date(data.generated_at) : null

  return (
    <PageShell>
      <PageHeader
        icon={Radar}
        title="Sentiment Scanner"
        subtitle="Top picks ranked by momentum, news, earnings, analyst & insider signals"
        actions={
          <div className="flex items-center gap-2">
            <div className="w-48">
              <Select value={universe} onChange={(e) => setUniverse(e.target.value)}>
                {UNIVERSES.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
              </Select>
            </div>
            <IconButton icon={RefreshCw} label="Rescan" onClick={() => fetchScan(universe, true)}
              className={scanning ? 'animate-spin' : ''} />
          </div>
        }
      />

      {err && <Alert variant="error" className="mb-3" onDismiss={() => setErr('')}>{err}</Alert>}
      {data?.status === 'error' && <Alert variant="error" className="mb-3">Scan failed: {data.error}</Alert>}

      {scanning && !err && (
        <Card>
          <div className="p-10 flex flex-col items-center text-center">
            <Loader2 size={26} className="text-accent animate-spin mb-3" />
            <div className="font-display font-semibold text-ink-1">Scanning {data?.label || 'the market'}…</div>
            <p className="text-sm text-ink-3 mt-1.5 max-w-md leading-relaxed">
              Fusing momentum, news sentiment, earnings track record, analyst targets and insider flow across the
              universe. The first scan can take up to a minute; after that it’s cached and instant.
            </p>
          </div>
        </Card>
      )}

      {!scanning && picks.length > 0 && (
        <>
          {/* ── Top picks ── */}
          <SectionHeader icon={TrendingUp} title="Top picks" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 mb-4">
            {top.map((p) => (
              <Card key={p.symbol} hover className="overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => open(p.symbol)}
                  onContextMenu={(e) => ctx.onContextMenu(e, p.symbol)}>
                  <div className="flex items-center gap-3">
                    <HeatRing value={p.overall} size={58} stroke={6} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-ink-1 text-lg">{p.symbol}</span>
                        <span className="text-2xs text-ink-5">#{p.rank}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ink-3 font-mono">${fmtPrice(p.last_price)}</span>
                        {p.change_1d != null && <PnlCell value={p.change_1d} />}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed mt-3">{p.rationale}</p>
                  <SignalBars signals={p.signals} className="mt-3" />
                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {p.tags.map((t, i) => <Pill key={i} variant={t.tone === 'up' ? 'up' : t.tone === 'down' ? 'down' : 'neutral'}>{t.label}</Pill>)}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* ── Full ranking ── */}
          {rest.length > 0 && (
            <Card className="overflow-hidden">
              <SectionHeader icon={Radar} title="Full ranking" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm t-dense">
                  <thead>
                    <tr>
                      <th className="text-right w-10">#</th>
                      <th className="text-left">Symbol</th>
                      <th className="text-right">1d</th>
                      <th className="text-right w-16">Score</th>
                      <th className="text-left">Signals</th>
                      <th className="text-left">Highlights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((p) => (
                      <tr key={p.symbol} onClick={() => open(p.symbol)} onContextMenu={(e) => ctx.onContextMenu(e, p.symbol)}
                        className="cursor-pointer hover:bg-white/[0.04] transition-colors">
                        <td className="text-right text-ink-5 font-mono">{p.rank}</td>
                        <td className="font-mono font-semibold text-ink-1">{p.symbol}</td>
                        <td className="text-right">{p.change_1d != null ? <PnlCell value={p.change_1d} /> : '—'}</td>
                        <td className="text-right">
                          <span className={`font-mono tabular font-bold ${scoreColor(p.overall)}`}>{Math.round(p.overall)}</span>
                        </td>
                        <td><SignalBars signals={p.signals} compact /></td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(p.tags || []).slice(0, 3).map((t, i) => (
                              <Pill key={i} variant={t.tone === 'up' ? 'up' : t.tone === 'down' ? 'down' : 'neutral'}>{t.label}</Pill>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <p className="text-2xs text-ink-5 text-center mt-4 leading-relaxed">
            Composite of momentum · news sentiment · earnings track · analyst targets · insider flow.
            {genAt && <> Generated {genAt.toLocaleTimeString()}.</>} Educational research, not investment advice.
          </p>
        </>
      )}

      {!scanning && picks.length === 0 && !err && (
        <Card><div className="p-10 text-center text-ink-4 text-sm">No ranked results — try a different universe or rescan.</div></Card>
      )}

      {ctx.menu}
    </PageShell>
  )
}

function fmtPrice(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Five-signal meter. `compact` renders a tight inline row for the table.
function SignalBars({ signals = {}, compact = false, className = '' }) {
  return (
    <div className={`flex ${compact ? 'gap-2' : 'gap-2.5'} ${className}`}>
      {SIGNALS.map((s) => {
        const v = signals[s.key]
        return (
          <div key={s.key} className="flex flex-col items-center gap-1" title={`${s.label}: ${v == null ? 'no data' : Math.round(v)}`}>
            <div className={`${compact ? 'w-6' : 'w-8'} h-1.5 rounded-full bg-white/10 overflow-hidden`}>
              <div className={`h-full rounded-full ${scoreBg(v)}`} style={{ width: `${v == null ? 0 : v}%` }} />
            </div>
            <span className="text-[9px] uppercase tracking-wide text-ink-5">{s.short}</span>
          </div>
        )
      })}
    </div>
  )
}
