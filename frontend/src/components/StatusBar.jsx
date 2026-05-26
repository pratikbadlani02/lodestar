// Persistent status bar — market session + clock + API latency.
// Public viewer: no account, no control, no order info.

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Clock, Zap } from 'lucide-react'
import { api } from '../lib/api'

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
  return {
    weekday, hour, minute,
    mins: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

function getSession() {
  const { weekday, mins, hhmm } = getNYParts()
  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  if (isWeekend) return { label: 'CLOSED', next: 'Monday 04:00 ET', tone: 'text-ink-4 bg-white/[0.04]', hhmm }
  if (mins < 240)   return { label: 'CLOSED',  next: '04:00 ET', tone: 'text-ink-4 bg-white/[0.04]', hhmm }
  if (mins < 570)   return { label: 'PRE',     next: '09:30 ET', tone: 'text-info bg-info/10',       hhmm }
  if (mins < 960)   return { label: 'OPEN',    next: '16:00 ET', tone: 'text-up bg-up/10',           hhmm }
  if (mins < 1200)  return { label: 'POST',    next: '20:00 ET', tone: 'text-warn bg-warn/10',       hhmm }
  return { label: 'CLOSED', next: 'next day 04:00 ET', tone: 'text-ink-4 bg-white/[0.04]', hhmm }
}

export default function StatusBar() {
  const [session, setSession] = useState(getSession())
  const [latency, setLatency] = useState(null)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const t = setInterval(() => setSession(getSession()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function on() { setOnline(true) }
    function off() { setOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      const t0 = performance.now()
      try {
        await api.health()
        if (!cancelled) setLatency(Math.round(performance.now() - t0))
      } catch {
        if (!cancelled) setLatency(null)
      }
    }
    tick()
    const t = setInterval(tick, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const latTone =
    latency == null ? 'text-ink-5' :
    latency < 200 ? 'text-up' :
    latency < 600 ? 'text-warn' : 'text-down'

  return (
    <div className="h-7 border-t border-white/[0.06] bg-surf-1/60 backdrop-blur px-3 flex items-center gap-3 text-2xs text-ink-3 font-mono">
      <span className={`px-1.5 py-0.5 rounded ${session.tone} font-semibold tracking-wider`}>
        {session.label}
      </span>
      <span className="flex items-center gap-1 text-ink-4">
        <Clock size={10} /> {session.hhmm} ET
      </span>
      <span className="text-ink-5">→ {session.next}</span>

      <div className="flex-1" />

      <span className={`flex items-center gap-1 ${online ? 'text-ink-4' : 'text-down'}`}>
        {online ? <Wifi size={10} /> : <WifiOff size={10} />}
        {online ? 'online' : 'offline'}
      </span>
      <span className={`flex items-center gap-1 ${latTone}`}>
        <Zap size={10} />
        {latency != null ? `${latency} ms` : '—'}
      </span>
      <span className="text-ink-5 hidden sm:inline">⌘K</span>
    </div>
  )
}
