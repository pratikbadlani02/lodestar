// Persistent status bar at the bottom of every page. Shows market session,
// connection state, account snapshot, API latency, and a ⌘K hint.

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Clock, DollarSign, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { fmt, fmtBig, fmtSignedPct, signClass, activeCurrency } from './ui/format'

// ── Market session helper ───────────────────────────────────────
// All times in NY (ET). Returns one of pre / regular / post / closed
function getNYParts() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value
  const weekday = get('weekday')
  const hour = parseInt(get('hour') || '0', 10)
  const minute = parseInt(get('minute') || '0', 10)
  const mins = hour * 60 + minute
  return { weekday, hour, minute, mins, hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

function getSession() {
  const { weekday, mins, hhmm } = getNYParts()
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  if (isWeekend) return { state: 'closed', label: 'CLOSED', next: 'Monday 04:00 ET', tone: 'text-ink-4 bg-white/[0.04]' }
  if (mins < 240)   return { state: 'closed',  label: 'CLOSED',  next: '04:00 ET', tone: 'text-ink-4 bg-white/[0.04]', hhmm }
  if (mins < 570)   return { state: 'pre',     label: 'PRE',     next: '09:30 ET', tone: 'text-info bg-info/10', hhmm }
  if (mins < 960)   return { state: 'regular', label: 'OPEN',    next: '16:00 ET', tone: 'text-up bg-up/10', hhmm }
  if (mins < 1200)  return { state: 'post',    label: 'POST',    next: '20:00 ET', tone: 'text-warn bg-warn/10', hhmm }
  return { state: 'closed', label: 'CLOSED', next: 'next day 04:00 ET', tone: 'text-ink-4 bg-white/[0.04]', hhmm }
}

// ── Component ──────────────────────────────────────────────────
export default function StatusBar({ control, health, authed = false }) {
  const [clock, setClock] = useState(getNYParts())
  const [session, setSession] = useState(getSession())
  const [account, setAccount] = useState(null)
  const [latency, setLatency] = useState(null)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [lastSync, setLastSync] = useState(null)

  // Tick the clock once per second
  useEffect(() => {
    const t = setInterval(() => {
      setClock(getNYParts())
      setSession(getSession())
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Browser online/offline events
  useEffect(() => {
    function on() { setOnline(true) }
    function off() { setOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Latency + (when authed) account snapshot. For anonymous users we measure
  // latency against the public /api/health probe instead.
  useEffect(() => {
    let cancelled = false
    async function tick() {
      const t0 = performance.now()
      try {
        if (authed) {
          const a = await api.getAccount()
          const ms = performance.now() - t0
          if (cancelled) return
          setAccount(a); setLatency(Math.round(ms)); setLastSync(Date.now())
        } else {
          await api.health()
          if (cancelled) return
          setAccount(null); setLatency(Math.round(performance.now() - t0)); setLastSync(Date.now())
        }
      } catch {
        if (!cancelled) setLatency(null)
      }
    }
    tick()
    const t = setInterval(tick, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [authed])

  const equity = account ? Number(account.equity) : null
  const bp     = account ? Number(account.buying_power) : null
  const lastEq = account ? Number(account.last_equity) : null
  const dayPnl = equity != null && lastEq ? equity - lastEq : null
  const dayPct = dayPnl != null && lastEq ? (dayPnl / lastEq) * 100 : null

  const wsHealthy = health?.status === 'ok' && online
  const isLive = control?.is_live

  function lastSyncLabel() {
    if (!lastSync) return '—'
    const s = Math.max(0, Math.round((Date.now() - lastSync) / 1000))
    if (s < 60) return `${s}s ago`
    return `${Math.round(s / 60)}m ago`
  }

  // Latency badge color
  const latTone =
    latency == null ? 'text-ink-5' :
    latency < 150   ? 'text-up' :
    latency < 400   ? 'text-warn' : 'text-down'

  return (
    <footer className="h-7 px-2 md:px-3 flex items-center gap-2 md:gap-3 text-2xs font-mono tabular border-t border-white/[0.06] bg-surf-1/85 backdrop-blur z-20 overflow-hidden">
      {/* Market session + clock */}
      <span className={`inline-flex items-center gap-1.5 px-1.5 py-px rounded shrink-0 ${session.tone}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${session.state === 'regular' ? 'bg-up soft-pulse' : session.state === 'pre' ? 'bg-info' : session.state === 'post' ? 'bg-warn' : 'bg-ink-5'}`} />
        <span className="font-semibold tracking-wider">{session.label}</span>
      </span>
      <span className="text-ink-3 shrink-0">
        <Clock size={10} className="inline-block -mt-0.5 mr-1" />
        {clock.hhmm} <span className="text-ink-5">ET</span>
      </span>
      <span className="text-ink-5 hidden sm:inline">·</span>
      <span className="text-ink-4 hidden sm:inline shrink-0">→ {session.next}</span>

      {/* Connection */}
      <span className={`inline-flex items-center gap-1 ml-2 md:ml-3 shrink-0 ${wsHealthy ? 'text-up' : 'text-down'}`}>
        {wsHealthy ? <Wifi size={11} /> : <WifiOff size={11} />}
        <span className="hidden sm:inline">{wsHealthy ? 'connected' : 'offline'}</span>
      </span>

      {/* Latency */}
      <span className={`hidden sm:inline-flex items-center gap-1 shrink-0 ${latTone}`}>
        <Zap size={11} />
        {latency != null ? `${latency}ms` : '—'}
      </span>

      {/* Center: account snapshot — hidden on small screens */}
      <div className="flex-1 hidden lg:flex items-center justify-center gap-4 text-ink-3 min-w-0">
        {equity != null && (
          <>
            <span><span className="text-ink-5 mr-1">EQ</span><span className="text-ink-1">{activeCurrency()}{fmtBig(equity)}</span></span>
            <span><span className="text-ink-5 mr-1">BP</span>{activeCurrency()}{fmtBig(bp)}</span>
            {dayPnl != null && (
              <span className="inline-flex items-center gap-1">
                <span className="text-ink-5">PnL</span>
                <span className={signClass(dayPnl)}>
                  {dayPnl >= 0 ? '+' : ''}${fmt(Math.abs(dayPnl))} ({fmtSignedPct(dayPct)})
                </span>
              </span>
            )}
            <span className={`text-2xs px-1.5 py-px rounded ${isLive ? 'bg-down/15 text-down' : 'bg-up/15 text-up'}`}>
              {isLive ? 'LIVE' : 'PAPER'}
            </span>
          </>
        )}
      </div>
      <div className="flex-1 lg:hidden" />

      {/* Right: last sync + ⌘K hint */}
      <span className="text-ink-5 hidden md:inline shrink-0">sync {lastSyncLabel()}</span>
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }))}
        className="hidden sm:inline-flex items-center gap-1 text-ink-4 hover:text-accent transition shrink-0"
        title="Open command palette"
      >
        <kbd className="bg-white/[0.04] border border-white/[0.06] rounded px-1 py-px font-mono">⌘K</kbd>
      </button>
    </footer>
  )
}
