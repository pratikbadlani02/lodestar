import { useEffect, useState, useCallback } from 'react'
import {
  ChevronDown, ChevronUp, TrendingUp, RefreshCw,
  CheckCircle2, AlertCircle, X as XIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import ChartWidget from '../components/ChartWidget'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n, dash = '—') {
  if (n === null || n === undefined) return dash
  return `$${Number(n).toFixed(2)}`
}

function fmtDollar(n) {
  if (n === null || n === undefined) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtVol(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtChgPct(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return { text: `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`, up: n >= 0 }
}

const OPEN_STATUSES = new Set(['pending_new', 'new', 'accepted', 'submitted', 'partially_filled'])

// ── Main component ────────────────────────────────────────────────────────────

export default function Trade({ isPaper = false }) {
  // Watchlist / symbol selection
  const [watchlists, setWatchlists]               = useState([])
  const [activeWatchlistId, setActiveWatchlistId] = useState(null)
  const [quotes, setQuotes]                       = useState(null)
  const [selectedSymbol, setSelectedSymbol]       = useState(null)

  // Order form
  const [side, setSide]               = useState('buy')
  const [orderType, setOrderType]     = useState('market')
  const [qty, setQty]                 = useState('')
  const [limitPrice, setLimitPrice]   = useState('')
  const [stopPrice, setStopPrice]     = useState('')
  const [tif, setTif]                 = useState('day')
  const [extHours, setExtHours]       = useState(false)
  const [orderErr, setOrderErr]       = useState(null)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [orderSuccess, setOrderSuccess]       = useState(null)

  // Bracket order fields (UI only)
  const [bracketTp, setBracketTp]   = useState('')
  const [bracketSl, setBracketSl]   = useState('')

  // Account / positions / orders
  const [account, setAccount]     = useState(null)
  const [positions, setPositions] = useState([])
  const [orders, setOrders]       = useState([])

  // Right-panel tab: positions | orders | history
  const [rightTab, setRightTab] = useState('positions')

  // History orders (filled + cancelled)
  const [historyOrders, setHistoryOrders] = useState([])

  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId) || null

  // ── Load watchlists ───────────────────────────────────────────────────────

  useEffect(() => {
    api.listWatchlists().then(data => {
      setWatchlists(data || [])
      if (data && data.length > 0) setActiveWatchlistId(data[0].id)
    }).catch(() => {})
  }, [])

  // ── Load quotes + poll ────────────────────────────────────────────────────

  const loadQuotes = useCallback(async (id) => {
    if (!id) return
    try {
      const data = await api.getWatchlistQuotes(id)
      setQuotes(data)
      setSelectedSymbol(prev => {
        if (prev) return prev
        const syms = Object.keys(data?.quotes || {})
        return syms.length > 0 ? syms[0] : null
      })
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeWatchlistId) return
    setQuotes(null)
    setSelectedSymbol(null)
    loadQuotes(activeWatchlistId)
    const t = setInterval(() => loadQuotes(activeWatchlistId), 10000)
    return () => clearInterval(t)
  }, [activeWatchlistId, loadQuotes])

  // ── Load account + positions + orders ─────────────────────────────────────

  const loadAccountData = useCallback(async () => {
    const [acct, pos, ord] = await Promise.allSettled([
      api.getAccount(),
      api.getPositions(),
      api.listOrders(50),
    ])
    if (acct.status === 'fulfilled') setAccount(acct.value)
    if (pos.status  === 'fulfilled') setPositions(pos.value  || [])
    if (ord.status  === 'fulfilled') {
      const all = ord.value || []
      setOrders(all)
      setHistoryOrders(all.filter(o => ['filled', 'cancelled', 'canceled', 'expired', 'rejected'].includes(o.status)))
    }
  }, [])

  useEffect(() => {
    loadAccountData()
    const t = setInterval(loadAccountData, 30000)
    return () => clearInterval(t)
  }, [loadAccountData])

  // ── Submit order ──────────────────────────────────────────────────────────

  async function handleSubmitOrder(e) {
    e.preventDefault()
    if (!selectedSymbol || !qty) return
    if (orderType === 'bracket') return // bracket not yet supported
    setOrderErr(null)
    setOrderSubmitting(true)
    try {
      const payload = {
        symbol:         selectedSymbol,
        side,
        qty:            parseFloat(qty),
        order_type:     orderType,
        time_in_force:  tif,
        extended_hours: extHours,
      }
      const needsLimit = orderType === 'limit' || orderType === 'stop_limit'
      const needsStop  = orderType === 'stop'  || orderType === 'stop_limit'
      if (needsLimit && limitPrice) payload.limit_price = parseFloat(limitPrice)
      if (needsStop  && stopPrice)  payload.stop_price  = parseFloat(stopPrice)

      await api.submitOrder(payload)

      setQty('')
      setLimitPrice('')
      setStopPrice('')
      setOrderSuccess(`${side === 'buy' ? 'Buy' : 'Sell'} order placed for ${selectedSymbol}`)
      setTimeout(() => setOrderSuccess(null), 4000)
      await loadAccountData()
    } catch (err) {
      const msg = err.detail?.detail?.reason || err.detail?.detail || err.message || 'Order failed'
      setOrderErr(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setOrderSubmitting(false)
    }
  }

  // ── Quick-close position ──────────────────────────────────────────────────

  async function handleClosePosition(p) {
    const confirmed = window.confirm(
      `Close entire position: SELL ${p.qty} ${p.symbol} at market?`
    )
    if (!confirmed) return
    try {
      await api.submitOrder({
        symbol:        p.symbol,
        side:          'sell',
        qty:           parseFloat(p.qty),
        order_type:    'market',
        time_in_force: 'day',
      })
      setOrderSuccess(`Sell order placed for ${p.qty} ${p.symbol}`)
      setTimeout(() => setOrderSuccess(null), 4000)
      await loadAccountData()
    } catch (err) {
      const msg = err.detail?.detail?.reason || err.detail?.detail || err.message || 'Close failed'
      setOrderErr(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const symbolList = activeWatchlist?.symbols || []
  const selQuote   = selectedSymbol ? (quotes?.quotes?.[selectedSymbol] || {}) : {}
  const selChg     = fmtChgPct(selQuote.change_pct)
  const refPrice   = side === 'buy' ? selQuote.ask : selQuote.bid
  const estCost    = qty && refPrice ? parseFloat(qty) * parseFloat(refPrice) : null
  const openOrders = orders.filter(o => OPEN_STATUSES.has(o.status))

  const needsLimit  = orderType === 'limit' || orderType === 'stop_limit'
  const needsStop   = orderType === 'stop'  || orderType === 'stop_limit'
  const isBracket   = orderType === 'bracket'

  // Account derived
  const acctDayPl    = account?.equity != null && account?.last_equity != null
    ? Number(account.equity) - Number(account.last_equity)
    : null
  const acctDayPlPct = account?.last_equity && acctDayPl != null
    ? (acctDayPl / Number(account.last_equity)) * 100
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-surf-0">

      {/* ── LEFT PANEL: Symbol list ─────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-surf-2">
        {/* Watchlist selector */}
        <div className="px-3 py-2 border-b border-surf-2">
          <select
            value={activeWatchlistId || ''}
            onChange={e => setActiveWatchlistId(Number(e.target.value) || e.target.value)}
            className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs text-ink-2 focus:outline-none focus:border-up">
            {watchlists.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Symbol rows */}
        <div className="flex-1 overflow-y-auto">
          {symbolList.length === 0 && (
            <div className="text-xs text-ink-5 text-center mt-8">No symbols</div>
          )}
          {symbolList.map(sym => {
            const q   = quotes?.quotes?.[sym] || {}
            const chg = fmtChgPct(q.change_pct)
            const isActive = sym === selectedSymbol
            return (
              <div key={sym} onClick={() => setSelectedSymbol(sym)}
                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
                  isActive
                    ? 'bg-surf-2 border-l-2 border-up'
                    : 'border-l-2 border-transparent hover:bg-surf-1'
                }`}>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono font-bold text-sm text-ink-1">{sym}</span>
                  {chg && (
                    <span className={`text-[10px] font-mono ${chg.up ? 'text-up' : 'text-down'}`}>
                      {chg.text}
                    </span>
                  )}
                </div>
                <span className="font-mono text-sm font-semibold text-ink-2 ml-2 shrink-0">
                  {q.price != null ? `$${Number(q.price).toFixed(2)}` : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── CENTER PANEL: Chart ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Symbol info bar */}
        <div className="px-4 py-2 border-b border-surf-2 flex items-center gap-3 bg-surf-1/40 shrink-0">
          <span className="font-mono font-bold text-lg">{selectedSymbol || '—'}</span>
          {selectedSymbol && (
            <>
              <span className="font-mono text-base font-semibold text-ink-2">
                {selQuote.price != null ? `$${Number(selQuote.price).toFixed(2)}` : '—'}
              </span>
              {selChg && (
                <span className={`text-xs font-mono font-semibold ${selChg.up ? 'text-up' : 'text-down'}`}>
                  {selChg.text}
                </span>
              )}
            </>
          )}
        </div>

        {/* Chart */}
        {selectedSymbol ? (
          <ChartWidget symbol={selectedSymbol} height={420} compact />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-5 gap-2">
            <TrendingUp size={40} className="opacity-20"/>
            <p className="text-sm">Select a symbol from the left panel</p>
          </div>
        )}
      </main>

      {/* ── RIGHT PANEL: Order entry + account + positions + orders ────────── */}
      <aside className="w-80 shrink-0 flex flex-col border-l border-surf-2 overflow-y-auto">

        {/* Paper trading banner — very top */}
        {isPaper && (
          <div className="px-4 py-2.5 bg-warn/20 border-b border-warn/40 text-warn text-xs font-semibold text-center">
            📄 Paper Trading — trades use simulated account
          </div>
        )}

        {/* Account summary card */}
        <div className="p-4 border-b border-surf-2 bg-surf-1/30">
          <div className="text-[10px] text-ink-4 uppercase tracking-wider font-semibold mb-2">
            Account: {isPaper ? 'Paper Trading' : 'Live'}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="text-ink-4 mb-0.5">Equity</div>
              <div className="font-mono font-semibold text-ink-2">{fmtDollar(account?.equity)}</div>
            </div>
            <div>
              <div className="text-ink-4 mb-0.5">Day P&amp;L</div>
              <div className={`font-mono font-semibold ${
                acctDayPl == null ? 'text-ink-3'
                  : acctDayPl >= 0 ? 'text-up' : 'text-down'
              }`}>
                {acctDayPl == null ? '—' : (
                  `${acctDayPl >= 0 ? '+' : ''}${fmtDollar(acctDayPl)}` +
                  (acctDayPlPct != null ? ` (${acctDayPlPct >= 0 ? '+' : ''}${acctDayPlPct.toFixed(3)}%)` : '')
                )}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-ink-4 mb-0.5">{isPaper ? 'Virtual ' : ''}Buying Power</div>
              <div className="font-mono font-semibold text-ink-2">{fmtDollar(account?.buying_power)}</div>
            </div>
          </div>
        </div>

        {/* ── ORDER ENTRY ────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-surf-2">
          <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-3">Order Entry</h2>

          {/* BUY / SELL toggle */}
          <div className="flex rounded-lg overflow-hidden border border-surf-3 mb-3">
            <button onClick={() => setSide('buy')}
              className={`flex-1 py-2 text-sm font-bold transition ${
                side === 'buy'
                  ? 'bg-up text-[#fff]'
                  : 'bg-surf-1 text-[#fff] hover:text-[#fff]'
              }`}>
              BUY
            </button>
            <button onClick={() => setSide('sell')}
              className={`flex-1 py-2 text-sm font-bold transition ${
                side === 'sell'
                  ? 'bg-down text-[#fff]'
                  : 'bg-surf-1 text-[#fff] hover:text-[#fff]'
              }`}>
              SELL
            </button>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-2.5">
            {/* Order Type */}
            <div>
              <label className="text-[10px] text-ink-4 block mb-1">Order Type</label>
              <select value={orderType} onChange={e => setOrderType(e.target.value)}
                className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs text-ink-2 focus:outline-none focus:border-up">
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
                <option value="stop_limit">Stop-Limit</option>
                <option value="bracket">Bracket</option>
              </select>
            </div>

            {/* Bracket not supported notice */}
            {isBracket && (
              <div className="text-[10px] text-warn/80 bg-warn/30 rounded px-2 py-1.5">
                Bracket orders not yet supported
              </div>
            )}

            {/* Qty */}
            <div>
              <label className="text-[10px] text-ink-4 block mb-1">Quantity</label>
              <input type="number" min="0.001" step="any" placeholder="0"
                value={qty} onChange={e => setQty(e.target.value)} required
                className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs font-mono text-ink-2 focus:outline-none focus:border-up"/>
            </div>

            {/* Limit price */}
            {needsLimit && (
              <div>
                <label className="text-[10px] text-ink-4 block mb-1">Limit Price</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                  className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs font-mono text-ink-2 focus:outline-none focus:border-up"/>
              </div>
            )}

            {/* Stop price */}
            {needsStop && (
              <div>
                <label className="text-[10px] text-ink-4 block mb-1">Stop Price</label>
                <input type="number" step="0.01" placeholder="0.00"
                  value={stopPrice} onChange={e => setStopPrice(e.target.value)}
                  className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs font-mono text-ink-2 focus:outline-none focus:border-up"/>
              </div>
            )}

            {/* Bracket fields */}
            {isBracket && (
              <>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Take Profit %</label>
                  <input type="number" step="0.01" placeholder="e.g. 5"
                    value={bracketTp} onChange={e => setBracketTp(e.target.value)}
                    disabled
                    className="w-full bg-surf-1/50 border border-surf-3 rounded px-2 py-1.5 text-xs font-mono text-ink-4 focus:outline-none cursor-not-allowed"/>
                </div>
                <div>
                  <label className="text-[10px] text-ink-4 block mb-1">Stop Loss %</label>
                  <input type="number" step="0.01" placeholder="e.g. 2"
                    value={bracketSl} onChange={e => setBracketSl(e.target.value)}
                    disabled
                    className="w-full bg-surf-1/50 border border-surf-3 rounded px-2 py-1.5 text-xs font-mono text-ink-4 focus:outline-none cursor-not-allowed"/>
                </div>
              </>
            )}

            {/* Time in Force */}
            <div>
              <label className="text-[10px] text-ink-4 block mb-1">Time in Force</label>
              <select value={tif} onChange={e => setTif(e.target.value)}
                className="w-full bg-surf-1 border border-surf-3 rounded px-2 py-1.5 text-xs text-ink-2 focus:outline-none focus:border-up">
                <option value="day">Day</option>
                <option value="gtc">GTC</option>
                <option value="ioc">IOC</option>
                <option value="fok">FOK</option>
              </select>
            </div>

            {/* Extended hours */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={extHours} onChange={e => setExtHours(e.target.checked)}
                className="w-3 h-3 accent-up"/>
              <span className="text-xs text-ink-3">Extended Hours</span>
            </label>

            {/* Reference price + estimate */}
            <div className="bg-surf-1/60 rounded-lg px-3 py-2 space-y-1 text-[11px]">
              <div className="flex justify-between text-ink-4">
                <span>{side === 'buy' ? 'Ask (ref)' : 'Bid (ref)'}</span>
                <span className="font-mono">{fmtPrice(refPrice)}</span>
              </div>
              {estCost != null && (
                <div className="flex justify-between text-ink-3">
                  <span>Est. {side === 'buy' ? 'Cost' : 'Proceeds'}</span>
                  <span className="font-mono font-semibold">{fmtDollar(estCost)}</span>
                </div>
              )}
            </div>

            {/* Error */}
            {orderErr && (
              <div className="flex items-start gap-2 text-xs text-down bg-down/30 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5"/>
                <span className="font-mono leading-snug">{orderErr}</span>
              </div>
            )}

            {/* Success toast */}
            {orderSuccess && (
              <div className="flex items-center gap-2 text-xs text-up bg-up/30 rounded-lg px-3 py-2">
                <CheckCircle2 size={13} className="shrink-0"/>
                <span>{orderSuccess}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={orderSubmitting || !selectedSymbol || isBracket}
              className={`w-full py-2.5 rounded-lg text-sm font-bold text-[#fff] transition disabled:opacity-50 disabled:cursor-not-allowed ${
                side === 'buy'
                  ? 'bg-up hover:bg-up'
                  : 'bg-down hover:bg-down'
              }`}>
              {orderSubmitting
                ? 'Placing…'
                : `${isPaper ? 'Paper ' : ''}Place ${side === 'buy' ? 'Buy' : 'Sell'} Order`
              }
            </button>
          </form>
        </div>

        {/* ── POSITIONS / ORDERS / HISTORY TAB STRIP ─────────────────────────── */}
        <div className="border-b border-surf-2 shrink-0">
          <div className="flex">
            {[
              { key: 'positions', label: `Positions (${positions.length})` },
              { key: 'orders',    label: `Orders (${openOrders.length})`   },
              { key: 'history',   label: 'History'                         },
            ].map(t => (
              <button key={t.key} onClick={() => setRightTab(t.key)}
                className={`flex-1 py-2 text-[10px] font-semibold border-b-2 transition ${
                  rightTab === t.key
                    ? 'border-up text-up'
                    : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── POSITIONS ──────────────────────────────────────────────────────── */}
        {rightTab === 'positions' && (
          <div className="px-3 py-3">
            {positions.length === 0 ? (
              <div className="text-[11px] text-ink-5 text-center py-3">No open positions</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-ink-5 border-b border-surf-2">
                      <th className="text-left py-1.5 pr-1 font-medium">Sym</th>
                      <th className="text-right py-1.5 pr-1 font-medium">Qty</th>
                      <th className="text-right py-1.5 pr-1 font-medium">Avg</th>
                      <th className="text-right py-1.5 pr-1 font-medium">Cur</th>
                      <th className="text-right py-1.5 pr-1 font-medium">P&amp;L</th>
                      <th className="py-1.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {positions.map(p => {
                      const pl    = Number(p.unrealized_pl)
                      const plPct = Number(p.unrealized_plpc) * 100
                      const up    = pl >= 0
                      return (
                        <tr key={p.symbol} className="border-b border-surf-2/50 hover:bg-surf-1/40 group">
                          <td className="py-1.5 pr-1 font-bold text-ink-2">{p.symbol}</td>
                          <td className="py-1.5 pr-1 text-right text-ink-3">{p.qty}</td>
                          <td className="py-1.5 pr-1 text-right text-ink-3">{fmtPrice(p.avg_entry_price)}</td>
                          <td className="py-1.5 pr-1 text-right text-ink-2">{fmtPrice(p.current_price)}</td>
                          <td className={`py-1.5 pr-1 text-right ${up ? 'text-up' : 'text-down'}`}>
                            <div>{up ? '+' : ''}{pl.toFixed(2)}</div>
                            <div className="text-[9px] opacity-80">{up ? '+' : ''}{plPct.toFixed(2)}%</div>
                          </td>
                          <td className="py-1.5">
                            <button
                              onClick={() => handleClosePosition(p)}
                              title={`Close ${p.symbol}`}
                              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-4 hover:text-down hover:bg-surf-3 transition">
                              <XIcon size={11}/>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── OPEN ORDERS ────────────────────────────────────────────────────── */}
        {rightTab === 'orders' && (
          <div className="px-3 py-3">
            {openOrders.length === 0 ? (
              <div className="text-[11px] text-ink-5 text-center py-3">No open orders</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-ink-5 border-b border-surf-2">
                      <th className="text-left py-1.5 pr-2 font-medium">Sym</th>
                      <th className="text-left py-1.5 pr-2 font-medium">Side</th>
                      <th className="text-right py-1.5 pr-2 font-medium">Qty</th>
                      <th className="text-left py-1.5 pr-2 font-medium">Type</th>
                      <th className="text-left py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {openOrders.map(o => (
                      <tr key={o.id} className="border-b border-surf-2/50 hover:bg-surf-1/40 group">
                        <td className="py-1.5 pr-2 font-bold text-ink-2">{o.symbol}</td>
                        <td className={`py-1.5 pr-2 font-semibold ${o.side === 'buy' ? 'text-up' : 'text-down'}`}>
                          {o.side.toUpperCase()}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-ink-3">{o.qty}</td>
                        <td className="py-1.5 pr-2 text-ink-3 capitalize">{o.order_type || '—'}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ink-4 capitalize text-[10px]">{o.status}</span>
                            <button
                              onClick={() => api.syncOrder(o.id).then(loadAccountData).catch(() => {})}
                              className="opacity-0 group-hover:opacity-100 text-ink-4 hover:text-up transition"
                              title="Sync order">
                              <RefreshCw size={10}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY ────────────────────────────────────────────────────────── */}
        {rightTab === 'history' && (
          <div className="px-3 py-3">
            {historyOrders.length === 0 ? (
              <div className="text-[11px] text-ink-5 text-center py-3">No order history</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-ink-5 border-b border-surf-2">
                      <th className="text-left py-1.5 pr-2 font-medium">Sym</th>
                      <th className="text-left py-1.5 pr-2 font-medium">Side</th>
                      <th className="text-right py-1.5 pr-2 font-medium">Qty</th>
                      <th className="text-left py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {historyOrders.map(o => (
                      <tr key={o.id} className="border-b border-surf-2/50 hover:bg-surf-1/40">
                        <td className="py-1.5 pr-2 font-bold text-ink-2">{o.symbol}</td>
                        <td className={`py-1.5 pr-2 font-semibold ${o.side === 'buy' ? 'text-up' : 'text-down'}`}>
                          {o.side.toUpperCase()}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-ink-3">{o.filled_qty ?? o.qty}</td>
                        <td className="py-1.5 text-ink-4 capitalize text-[10px]">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </aside>
    </div>
  )
}
