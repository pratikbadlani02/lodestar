import { useEffect, useState } from 'react'
import { Bitcoin, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { PageShell, PageHeader, IconButton } from '../components/ui/primitives'

const PAIRS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LTC/USD',
  'LINK/USD', 'DOT/USD', 'MATIC/USD', 'UNI/USD', 'AAVE/USD',
  'XRP/USD', 'DOGE/USD', 'SHIB/USD', 'BCH/USD', 'YFI/USD',
]

const fmt = (v, d = 2) => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (Math.abs(n) >= 1) return n.toFixed(d)
  return n.toFixed(6)
}
const fmtPct = (v) => {
  if (v == null || Number.isNaN(v)) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

export default function Crypto() {
  const [snapshots, setSnapshots] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.getCryptoSnapshots(PAIRS.join(','))
      setSnapshots(r.snapshots || {})
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e.message || 'Failed to load crypto snapshots')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rows = PAIRS
    .filter((p) => !search || p.toLowerCase().includes(search.toLowerCase()))
    .map((pair) => {
      const s = snapshots[pair] || {}
      const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
      const prev = s.prevDailyBar?.c
      const change = last && prev ? last - prev : null
      const pct = last && prev ? ((last - prev) / prev) * 100 : null
      const vol = s.dailyBar?.v
      return { pair, last, change, pct, vol, bid: s.latestQuote?.bp, ask: s.latestQuote?.ap }
    })

  return (
    <PageShell>
      <PageHeader
        icon={Bitcoin}
        title="Crypto"
        subtitle={`24/7 markets · ${updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading…'}`}
        actions={
          <IconButton icon={RefreshCw} label="Refresh" onClick={load} className={loading ? 'animate-spin' : ''} />
        }
      />

      {error && (
        <div className="bg-down/40 border border-down text-down text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter pairs…"
        className="bg-surf-1 border border-surf-3 rounded-lg px-3 py-1.5 text-sm w-64"
      />

      <div className="bg-surf-1 border border-surf-2 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-4 bg-surf-0/40">
              <th className="px-3 py-2 text-left">Pair</th>
              <th className="px-3 py-2 text-right">Last</th>
              <th className="px-3 py-2 text-right">24h Δ</th>
              <th className="px-3 py-2 text-right">% Δ</th>
              <th className="px-3 py-2 text-right">Bid</th>
              <th className="px-3 py-2 text-right">Ask</th>
              <th className="px-3 py-2 text-right">24h Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const up = (r.pct ?? 0) >= 0
              return (
                <tr key={r.pair} className="border-t border-surf-2/60 hover:bg-surf-2/30">
                  <td className="px-3 py-2 font-mono font-semibold text-warn">{r.pair}</td>
                  <td className="px-3 py-2 text-right font-mono">${fmt(r.last)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${up ? 'text-up' : 'text-down'}`}>
                    {r.change == null ? '—' : `${up ? '+' : ''}${fmt(r.change)}`}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${up ? 'text-up' : 'text-down'}`}>
                    {fmtPct(r.pct)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-3">{fmt(r.bid)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-3">{fmt(r.ask)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-3">{fmt(r.vol, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-ink-4">
        Crypto markets trade 24/7. Quotes from Alpaca's crypto exchange.
      </div>
    </PageShell>
  )
}
