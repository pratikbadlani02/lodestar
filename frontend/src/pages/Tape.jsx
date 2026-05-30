import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pause, Play, Radio } from 'lucide-react'
import { api } from '../lib/api'
import { useSymbolPage } from '../lib/SymbolContext'
import { PageShell, PageHeader, Button } from '../components/ui/primitives'

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d))
const fmtTime = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleTimeString(undefined, { hour12: false }) } catch { return s }
}

// Alpaca trade conditions worth surfacing
const COND_LABEL = {
  '@': 'Reg',
  T: 'Form-T',
  I: 'Odd',
  '4': 'Cancel',
  F: 'Block',
}

export default function Tape({ embedded = false }) {
  const { symbol: routeSym } = useParams()
  const navigate = useNavigate()
  const [symbol, setSymbol] = useSymbolPage(routeSym)
  const [symInput, setSymInput] = useState(symbol)
  const [trades, setTrades] = useState([])
  const [error, setError] = useState('')
  const [streaming, setStreaming] = useState(true)
  const [refreshMs, setRefreshMs] = useState(3000)
  const lastIdRef = useRef(null)

  useEffect(() => {
    if (!streaming) return
    let cancelled = false
    async function tick() {
      try {
        const r = await api.getTrades(symbol, 200)
        if (cancelled) return
        setError('')
        const fresh = r.trades || []
        if (fresh.length) {
          // Use timestamp + price as a soft dedup key since Alpaca trade IDs vary by feed.
          const seen = new Set(trades.map((t) => `${t.t}|${t.p}|${t.s}`))
          const newOnes = fresh.filter((t) => !seen.has(`${t.t}|${t.p}|${t.s}`))
          if (newOnes.length) {
            setTrades((prev) => [...newOnes.reverse(), ...prev].slice(0, 500))
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load trades')
      }
    }
    tick()
    const id = setInterval(tick, refreshMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol, streaming, refreshMs])

  function submit(e) {
    e.preventDefault()
    const s = symInput.trim().toUpperCase()
    if (!s) return
    setTrades([])
    setSymbol(s)
    navigate(`/tape/${s}`, { replace: true })
  }

  // Classify trade direction by comparison to running mid; lacking a quote feed,
  // we approximate "up tick" / "down tick" using previous trade price.
  const decorated = trades.map((t, i) => {
    const prev = trades[i + 1]
    const direction = prev ? (t.p > prev.p ? 'up' : t.p < prev.p ? 'down' : 'flat') : 'flat'
    return { ...t, direction }
  })

  const Wrap = embedded ? 'div' : PageShell
  return (
    <Wrap className={embedded ? 'space-y-3' : undefined}>
      {!embedded && (
        <PageHeader
          icon={Radio}
          title="Time & Sales"
          subtitle={`Real-time trade tape · ${symbol}`}
          badge={streaming ? <span className="w-2 h-2 rounded-full bg-up shadow-glow-up soft-pulse inline-block" title="Streaming" /> : null}
          actions={
            <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!embedded && (
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              value={symInput}
              onChange={(e) => setSymInput(e.target.value)}
              className="bg-surf-1 border border-surf-3 rounded-lg px-3 py-1.5 text-sm font-mono uppercase w-32"
              placeholder="Symbol"
            />
            <button type="submit" className="bg-up hover:bg-up text-[#fff] text-sm rounded-lg px-3 py-1.5">
              Load
            </button>
          </form>
        )}

        <select
          value={refreshMs}
          onChange={(e) => setRefreshMs(Number(e.target.value))}
          className="bg-surf-1 border border-surf-3 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value={1000}>1s</option>
          <option value={3000}>3s</option>
          <option value={5000}>5s</option>
          <option value={10000}>10s</option>
        </select>

        <button
          onClick={() => setStreaming((v) => !v)}
          className="flex items-center gap-1 text-sm bg-surf-1 border border-surf-3 rounded-lg px-3 py-1.5 hover:bg-surf-2"
        >
          {streaming ? <Pause size={14} /> : <Play size={14} />}
          {streaming ? 'Pause' : 'Resume'}
        </button>

        <span className="text-xs text-ink-4 ml-auto">
          {decorated.length} prints · IEX feed
        </span>
      </div>

      {error && (
        <div className="bg-down/40 border border-down text-down text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-surf-1 border border-surf-2 rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-ink-4 bg-surf-0/40 sticky top-0">
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2 text-center">Exch</th>
              <th className="px-3 py-2 text-left">Conditions</th>
            </tr>
          </thead>
          <tbody>
            {decorated.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-12 text-center text-ink-4">
                {streaming ? 'Waiting for trades…' : 'Paused.'}
              </td></tr>
            )}
            {decorated.map((t, i) => {
              const cls =
                t.direction === 'up' ? 'text-up' :
                t.direction === 'down' ? 'text-down' : 'text-ink-2'
              return (
                <tr key={`${t.t}-${i}`} className="border-t border-surf-2/60 hover:bg-surf-2/30">
                  <td className="px-3 py-1 text-ink-3">{fmtTime(t.t)}</td>
                  <td className={`px-3 py-1 text-right font-semibold ${cls}`}>{fmt(t.p)}</td>
                  <td className="px-3 py-1 text-right">{Number(t.s || 0).toLocaleString()}</td>
                  <td className="px-3 py-1 text-center text-ink-3">{t.x || '—'}</td>
                  <td className="px-3 py-1 text-ink-4">
                    {(t.c || []).map((c) => COND_LABEL[c] || c).join(' ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Wrap>
  )
}
