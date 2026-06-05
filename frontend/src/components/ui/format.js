// Centralized number/date formatters used across pages.

export function fmtPrice(v, d = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `$${Number(v).toFixed(d)}`
}

// Currency-aware money formatter. `cur` is a currency symbol ('$', '₹', …) and
// defaults to USD so existing callers are unaffected. Use with the active
// market's symbol (see MarketContext) or currencySymbolOf(symbol).
export function fmtMoney(v, cur = '$', d = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return `${cur}${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

export function fmtNum(v, d = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d })
}

export function fmt(v, d = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toFixed(d)
}

export function fmtPct(v, d = 2) {
  if (v == null || Number.isNaN(v)) return '—'
  return `${Number(v).toFixed(d)}%`
}

export function fmtSignedPct(v, d = 2) {
  if (v == null || Number.isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`
}

export function fmtSigned(v, d = 2) {
  if (v == null || Number.isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}`
}

export function fmtBig(v) {
  if (v == null) return '—'
  const n = Number(v); if (Number.isNaN(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e3)  return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
}

export function fmtVol(v) {
  if (v == null) return '—'
  return fmtBig(v).replace(/\.00$/, '')
}

export function fmtTime(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleTimeString(undefined, { hour12: false }) } catch { return s }
}
export function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString() } catch { return s }
}
export function fmtAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function signClass(v) {
  if (v == null || Number.isNaN(v)) return 'num-flat'
  return Number(v) >= 0 ? 'num-up' : 'num-down'
}
