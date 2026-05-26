// Global slide-in order ticket. Opens from anywhere via:
//   - the Buy/Sell button in TopBar (dispatches `order-ticket:open` event)
//   - keyboard shortcuts Shift+B (buy) and Shift+S (sell)
// Closes on Escape or backdrop click.

import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import { useSymbol } from '../lib/SymbolContext'
import { api } from '../lib/api'
import { fmt, fmtSigned, fmtSignedPct, signClass } from './ui/format'

export default function OrderSlideOver() {
  const { symbol } = useSymbol()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('buy')
  const [orderType, setOrderType] = useState('market')
  const [qty, setQty] = useState('')
  const [tif, setTif] = useState('day')
  const [limit, setLimit] = useState('')
  const [stop, setStop] = useState('')
  const [extHours, setExtHours] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [snap, setSnap] = useState(null)

  // Open via custom event or keyboard
  useEffect(() => {
    function onOpen(e) {
      const s = e.detail?.side
      if (s === 'buy' || s === 'sell') setSide(s)
      setOpen(true)
      setErr(null); setOk(null)
    }
    function onKey(e) {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.shiftKey && (e.key === 'B' || e.key === 'b')) { setSide('buy'); setOpen(true) }
      else if (e.shiftKey && (e.key === 'S' || e.key === 's')) { setSide('sell'); setOpen(true) }
    }
    window.addEventListener('order-ticket:open', onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('order-ticket:open', onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Live quote for the active symbol whenever the panel is open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer
    async function poll() {
      try {
        const r = await api.getSnapshots(symbol)
        if (cancelled) return
        const s = r?.snapshots?.[symbol]
        if (!s) { setSnap(null); return }
        const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
        const prev = s.prevDailyBar?.c
        setSnap({
          last, prev,
          bid: s.latestQuote?.bp, ask: s.latestQuote?.ap,
          change: last && prev ? last - prev : null,
          changePct: last && prev ? ((last - prev) / prev) * 100 : null,
        })
      } catch {}
    }
    poll(); timer = setInterval(poll, 8000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [open, symbol])

  async function submit() {
    setErr(null); setOk(null)
    if (!qty || Number(qty) <= 0) { setErr('Enter quantity'); return }
    setSubmitting(true)
    try {
      const payload = {
        symbol,
        side,
        qty: Number(qty),
        order_type: orderType,
        time_in_force: tif,
        extended_hours: extHours,
      }
      if ((orderType === 'limit' || orderType === 'stop_limit') && limit) payload.limit_price = Number(limit)
      if ((orderType === 'stop' || orderType === 'stop_limit') && stop) payload.stop_price = Number(stop)
      await api.submitOrder(payload)
      setOk(`${side.toUpperCase()} ${qty} ${symbol} placed`)
      setQty(''); setLimit(''); setStop('')
      setTimeout(() => { setOk(null); setOpen(false) }, 1800)
    } catch (e2) {
      const msg = e2.detail?.detail?.reason || e2.detail?.detail || e2.message || 'Order failed'
      setErr(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSubmitting(false)
    }
  }

  const needsLimit = orderType === 'limit' || orderType === 'stop_limit'
  const needsStop = orderType === 'stop' || orderType === 'stop_limit'
  const estCost = Number(qty || 0) * Number(limit || snap?.last || 0)
  const up = (snap?.change ?? 0) >= 0

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 bg-surf-0/70 backdrop-blur-sm z-40"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[360px] max-w-[90vw] z-50 bg-surf-1 border-l border-white/[0.08] shadow-2xl flex flex-col"
        style={{ animation: 'slide-in 180ms ease-out' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Send size={14} className="text-accent" />
            <span className="text-2xs uppercase tracking-[0.16em] font-semibold text-ink-2">Order Ticket</span>
          </div>
          <button onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md hover:bg-white/[0.06] text-ink-3 hover:text-ink-1 flex items-center justify-center transition">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Quote */}
          <div className="bg-surf-2 rounded-lg p-3 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-semibold text-ink-1">{symbol}</span>
              <span className="font-mono tabular text-lg text-ink-1 font-semibold">
                {snap?.last != null ? `$${fmt(snap.last)}` : '—'}
              </span>
            </div>
            {snap?.change != null && (
              <div className="flex justify-end">
                <span className={`text-xs font-mono tabular ${signClass(snap.change)}`}>
                  {fmtSigned(snap.change)} ({fmtSignedPct(snap.changePct)})
                </span>
              </div>
            )}
            <div className="flex justify-between text-2xs text-ink-4 font-mono pt-1.5 border-t border-white/[0.04]">
              <span>Bid {snap?.bid != null ? `$${fmt(snap.bid)}` : '—'}</span>
              <span>Ask {snap?.ask != null ? `$${fmt(snap.ask)}` : '—'}</span>
            </div>
          </div>

          {/* Side toggle */}
          <div className="grid grid-cols-2 gap-1.5">
            {['buy', 'sell'].map((s) => {
              const sel = side === s
              const isBuy = s === 'buy'
              return (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition ${
                    sel
                      ? (isBuy ? 'bg-up text-[#fff] shadow-glow-up' : 'bg-down text-[#fff] shadow-glow-down')
                      : 'bg-white/[0.04] border border-white/[0.06] text-[#fff] hover:text-ink-1 hover:bg-white/[0.08]'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {/* Order type */}
          <div>
            <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Type</label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value)}
              className="w-full bg-surf-2 border border-white/[0.06] rounded-lg px-2.5 py-2 text-xs">
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
              <option value="stop_limit">Stop Limit</option>
            </select>
          </div>

          {/* Qty */}
          <div>
            <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Quantity</label>
            <input
              type="number" min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-surf-2 border border-white/[0.06] rounded-lg px-2.5 py-2 text-sm font-mono tabular focus:border-accent/40 outline-none"
            />
            <div className="flex gap-1 mt-1.5">
              {[10, 25, 50, 100].map((n) => (
                <button key={n} onClick={() => setQty(String(n))}
                  className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-md py-1 text-2xs font-mono">
                  {n}
                </button>
              ))}
            </div>
          </div>

          {needsLimit && (
            <div>
              <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Limit Price</label>
              <input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)}
                className="w-full bg-surf-2 border border-white/[0.06] rounded-lg px-2.5 py-2 text-sm font-mono tabular focus:border-accent/40 outline-none" />
            </div>
          )}
          {needsStop && (
            <div>
              <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">Stop Price</label>
              <input type="number" step="0.01" value={stop} onChange={(e) => setStop(e.target.value)}
                className="w-full bg-surf-2 border border-white/[0.06] rounded-lg px-2.5 py-2 text-sm font-mono tabular focus:border-accent/40 outline-none" />
            </div>
          )}

          {/* TIF + ext hours */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-2xs uppercase tracking-wider text-ink-4 block mb-1">TIF</label>
              <select value={tif} onChange={(e) => setTif(e.target.value)}
                className="w-full bg-surf-2 border border-white/[0.06] rounded-lg px-2.5 py-2 text-xs">
                <option value="day">Day</option>
                <option value="gtc">GTC</option>
                <option value="opg">OPG</option>
                <option value="cls">CLS</option>
                <option value="ioc">IOC</option>
                <option value="fok">FOK</option>
              </select>
            </div>
            <label className="flex items-end gap-1.5 text-2xs text-ink-3 pb-2">
              <input type="checkbox" checked={extHours} onChange={(e) => setExtHours(e.target.checked)} />
              Ext. hours
            </label>
          </div>

          <div className="bg-surf-2 border border-white/[0.04] rounded-lg px-2.5 py-1.5 text-2xs font-mono tabular text-ink-2 flex justify-between">
            <span>Est. notional</span>
            <span>${fmt(estCost)}</span>
          </div>

          {err && <div className="bg-down/10 border border-down/30 text-down text-xs rounded-lg px-2.5 py-1.5">{err}</div>}
          {ok && <div className="bg-up/10 border border-up/30 text-up text-xs rounded-lg px-2.5 py-1.5">{ok}</div>}
        </div>

        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={submit}
            disabled={submitting}
            className={`w-full py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition ${
              side === 'buy'
                ? 'bg-up-grad shadow-glow-up hover:brightness-110'
                : 'bg-down-grad shadow-glow-down hover:brightness-110'
            } text-[#fff] disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {submitting ? 'Submitting…' : `${side.toUpperCase()} ${symbol}`}
          </button>
          <div className="text-2xs text-ink-5 text-center mt-2 tracking-wider">
            <kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">⇧B</kbd>
            <span> buy · </span>
            <kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">⇧S</kbd>
            <span> sell · </span>
            <kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">Esc</kbd>
            <span> close</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  )
}
