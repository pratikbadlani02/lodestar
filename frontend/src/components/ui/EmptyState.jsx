// Empty-state primitive — used wherever a page or section has nothing to show.
// Encourages an action rather than leaving the user staring at blank space.

import { Inbox } from 'lucide-react'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  body,
  action,
  actionLabel,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <div className="relative mb-4">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <Icon size={24} className="text-ink-4" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-2xl -z-10" />
      </div>
      <div className="text-sm font-semibold text-ink-1">{title}</div>
      {body && <p className="text-xs text-ink-4 mt-1.5 max-w-sm leading-relaxed">{body}</p>}
      {action && (
        <button
          onClick={action}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-xs font-medium transition"
        >
          {actionLabel || 'Get started'}
        </button>
      )}
    </div>
  )
}
