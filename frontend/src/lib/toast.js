// Toast helper — thin wrapper over sonner so we don't import sonner everywhere
// and so we can swap implementations later without page-by-page churn.
//
// Usage:
//   import { toast } from '../lib/toast'
//   toast.success('Order placed')
//   toast.error('Rejected', { description: e.message })

import { toast as sonner } from 'sonner'

function pickDetail(e) {
  if (!e) return null
  if (typeof e === 'string') return e
  const detail = e.detail?.detail || e.detail || e.message
  if (typeof detail === 'string') return detail
  try { return JSON.stringify(detail) } catch { return String(e) }
}

export const toast = {
  success: (msg, opts) => sonner.success(msg, opts),
  info:    (msg, opts) => sonner(msg, opts),
  warn:    (msg, opts) => sonner.warning(msg, opts),
  error:   (msg, opts) => sonner.error(msg, opts),

  // Promise variant — show loading, replace with success/error
  promise: (p, opts) => sonner.promise(p, opts),

  // Convenience: turn an API exception into an error toast
  apiError: (e, title = 'Request failed') => {
    sonner.error(title, { description: pickDetail(e) })
  },
}
