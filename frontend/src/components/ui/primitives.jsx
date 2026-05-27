import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { signClass, fmt, fmtSigned, fmtSignedPct } from './format'

// ── Card ─────────────────────────────────────────────────────────
// Subtle gradient + soft border + inner highlight; optional hover lift.
export function Card({ className = '', hover = false, children }) {
  return (
    <div className={`card-surface ${hover ? 'card-surface-hover transition-shadow' : ''} ${className}`}>
      {children}
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────
export function SectionHeader({ icon: Icon, title, action, accent = 'text-accent' }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
      {Icon && (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md bg-white/[0.04] ${accent}`}>
          <Icon size={11} />
        </span>
      )}
      <h3 className="text-2xs font-semibold text-ink-2 uppercase tracking-[0.14em]">{title}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}

export function Section({ icon, title, action, accent, className = '', children, padded = true }) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <SectionHeader icon={icon} title={title} action={action} accent={accent} />
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </Card>
  )
}

// ── Stat ─────────────────────────────────────────────────────────
// Generous, rounded; numeric value gets visual weight. Optional accent variant.
export function Stat({ label, value, sub, cls, big = false, mono = true, variant = 'default' }) {
  const variants = {
    default: 'bg-white/[0.025] border-white/[0.06]',
    up:      'bg-up/[0.06]    border-up/[0.18]',
    down:    'bg-down/[0.06]  border-down/[0.18]',
    accent:  'bg-accent/[0.06] border-accent/[0.18]',
  }
  return (
    <div className={`rounded-lg border ${variants[variant] || variants.default} px-3 py-2 transition-colors`}>
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium">{label}</div>
      <div className={`${big ? 'text-lg' : 'text-sm'} ${mono ? 'font-mono tabular' : ''} ${cls || 'text-ink-1'} mt-1 font-semibold leading-tight`}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-2xs text-ink-4 mt-1">{sub}</div>}
    </div>
  )
}

// ── Pill / Badge ─────────────────────────────────────────────────
const PILL_VARIANTS = {
  up:      'bg-up/10       text-up      ring-up/30',
  down:    'bg-down/10     text-down    ring-down/30',
  warn:    'bg-warn/10     text-warn    ring-warn/30',
  info:    'bg-info/10     text-info    ring-info/30',
  accent:  'bg-accent/10   text-accent  ring-accent/30',
  neutral: 'bg-white/[0.05] text-ink-2  ring-white/[0.10]',
}

export function Pill({ children, variant = 'neutral', className = '', glow = false }) {
  const cls = PILL_VARIANTS[variant] || PILL_VARIANTS.neutral
  const glowCls = glow ? (variant === 'up' ? 'shadow-glow-up' : variant === 'down' ? 'shadow-glow-down' : variant === 'accent' ? 'shadow-glow-accent' : '') : ''
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-medium rounded-full ring-1 ${cls} ${glowCls} ${className}`}>
      {children}
    </span>
  )
}

// ── DataCell ─────────────────────────────────────────────────────
export function DataCell({ value, formatter = fmt, decimals = 2, signed = false, percent = false, className = '' }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className={`num-flat font-mono tabular ${className}`}>—</span>
  }
  const txt = signed
    ? (percent ? fmtSignedPct(value, decimals) : fmtSigned(value, decimals))
    : formatter(value, decimals)
  return <span className={`font-mono tabular ${signClass(value)} ${className}`}>{txt}</span>
}

// ── ChangePill — arrow + abs + percent in one chip ───────────────
export function ChangePill({ value, abs, prefix = '$' }) {
  if (value == null) return <span className="num-flat font-mono">—</span>
  const up = Number(value) >= 0
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-mono tabular ${up ? 'text-up' : 'text-down'}`}>
      {abs != null && (
        <span className="font-semibold">{up ? '+' : ''}{prefix}{Math.abs(Number(abs)).toFixed(2)}</span>
      )}
      <span className="text-xs opacity-90">({up ? '+' : ''}{Number(value).toFixed(2)}%)</span>
    </span>
  )
}

// ── DataTable ────────────────────────────────────────────────────
// Keyboard model (on focus): ArrowDown/j moves down, ArrowUp/k moves up,
// Enter triggers onRowClick. Tab moves focus out of the table.
export function DataTable({
  columns, rows,
  sortField, sortDir = 'desc', onSort,
  emptyText = 'No data',
  getRowKey, onRowClick,
  dense = true,
  selectable = true,   // false to disable keyboard selection entirely
}) {
  const [focusIdx, setFocusIdx] = useState(-1)
  const tbodyRef = useRef(null)

  function header(c) {
    const active = sortField === c.key
    return (
      <th
        key={c.key}
        onClick={c.sortable ? () => onSort?.(c.key) : undefined}
        className={`${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.sortable ? 'cursor-pointer hover:text-ink-2 select-none' : ''} ${active ? 'text-accent' : ''}`}
      >
        <span className="inline-flex items-center gap-1">
          {c.label}
          {c.sortable && active && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </span>
      </th>
    )
  }

  function onKeyDown(e) {
    if (!selectable || !rows || rows.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      setFocusIdx((i) => Math.min((i < 0 ? -1 : i) + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      setFocusIdx((i) => Math.max((i < 0 ? rows.length : i) - 1, 0))
    } else if (e.key === 'Enter' && focusIdx >= 0 && onRowClick) {
      e.preventDefault()
      onRowClick(rows[focusIdx])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFocusIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusIdx(rows.length - 1)
    }
  }

  // Auto-scroll selected row into view
  useEffect(() => {
    if (focusIdx < 0 || !tbodyRef.current) return
    const row = tbodyRef.current.children[focusIdx]
    row?.scrollIntoView({ block: 'nearest' })
  }, [focusIdx])

  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full text-sm ${dense ? 't-dense' : ''}`}
        tabIndex={selectable ? 0 : -1}
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            {columns.map(header)}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {(!rows || rows.length === 0) && (
            <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-ink-4">{emptyText}</td></tr>
          )}
          {rows?.map((r, i) => (
            <tr
              key={getRowKey ? getRowKey(r) : i}
              onClick={onRowClick ? () => { setFocusIdx(i); onRowClick(r) } : undefined}
              onMouseEnter={() => selectable && setFocusIdx(i)}
              aria-selected={i === focusIdx}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.mono ? 'font-mono tabular' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sparkline ────────────────────────────────────────────────────
export function Sparkline({ values, width = 80, height = 24, stroke }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastUp = values[values.length - 1] >= values[0]
  const strokeColor = stroke || (lastUp ? '#22c55e' : '#ef4444')
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline fill="none" stroke={strokeColor} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

// ── SymbolChip ───────────────────────────────────────────────────
export function SymbolChip({ symbol, onClick, className = '', size = 'md' }) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center font-mono font-semibold rounded-md bg-white/[0.04] hover:bg-accent/15 hover:text-accent text-ink-1 transition-colors ${sizes[size] || sizes.md} ${className}`}
    >
      {symbol}
    </button>
  )
}

// ── Button ───────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary:  'bg-brand-grad text-[#fff] shadow-glow-accent hover:brightness-110',
  up:       'bg-up-grad text-[#fff] shadow-glow-up hover:brightness-110',
  down:     'bg-down-grad text-[#fff] shadow-glow-down hover:brightness-110',
  ghost:    'bg-white/[0.04] hover:bg-white/[0.08] text-ink-2 border border-white/[0.06]',
  outline:  'bg-transparent border border-white/[0.12] hover:bg-white/[0.04] text-ink-2',
}

export function Button({ variant = 'ghost', size = 'md', className = '', icon: Icon, children, ...rest }) {
  const sizes = {
    xs: 'px-2 py-1 text-2xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }
  const cls = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.ghost
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition ${cls} ${sizes[size] || sizes.md} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {Icon && <Icon size={size === 'xs' ? 11 : size === 'sm' ? 13 : 14} />}
      {children}
    </button>
  )
}

// ── Tab strip ────────────────────────────────────────────────────
export function TabStrip({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-white/[0.06]">
      {tabs.map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`relative px-4 py-2.5 text-xs uppercase tracking-wider flex items-center gap-1.5 transition ${
            active === key ? 'text-ink-1' : 'text-ink-4 hover:text-ink-2'
          }`}
        >
          {Icon && <Icon size={12} />}
          {label}
          {active === key && (
            <span className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-grad rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}

// ── PageShell / PageHeader ───────────────────────────────────────
// Wraps every page in consistent padding + max-width + spacing.
export function PageShell({ className = '', children, padded = true, fluid = false }) {
  const padding = padded ? 'p-3 sm:p-4 md:p-6' : ''
  const width = fluid ? '' : 'max-w-[1600px] mx-auto'
  return <div className={`${padding} ${width} ${className}`}>{children}</div>
}

// PageHeader — title block + optional breadcrumbs + actions.
// Use this on every page for consistent vertical rhythm and chrome.
export function PageHeader({ icon: Icon, title, subtitle, breadcrumbs, actions, badge, className = '' }) {
  return (
    <div className={`mb-4 md:mb-6 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-2xs text-ink-4 mb-2 flex-wrap">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-5">/</span>}
              {b.to ? (
                <a href={b.to} className="hover:text-ink-2 transition">{b.label}</a>
              ) : (
                <span className="text-ink-3">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-3 md:gap-4 flex-wrap">
        <div className="flex items-start gap-2 md:gap-3 min-w-0 flex-1">
          {Icon && (
            <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-md bg-white/[0.04] border border-white/[0.06] text-accent">
              <Icon size={15} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-lg md:text-xl font-semibold text-ink-1 leading-tight">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="text-xs md:text-sm text-ink-3 mt-1 leading-relaxed">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
      </div>
    </div>
  )
}

// ── Form primitives ──────────────────────────────────────────────
// All inputs share the same surface treatment: subtle overlay bg, focus accent ring.
const INPUT_BASE =
  'w-full bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] focus:border-accent/50 focus:bg-white/[0.06] rounded-lg px-3 py-2 text-sm outline-none transition disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-ink-5'

export function Input({ className = '', mono = false, ...rest }) {
  return <input {...rest} className={`${INPUT_BASE} ${mono ? 'font-mono tabular' : ''} ${className}`} />
}

export function Textarea({ className = '', mono = false, rows = 4, ...rest }) {
  return <textarea rows={rows} {...rest} className={`${INPUT_BASE} ${mono ? 'font-mono tabular' : ''} ${className}`} />
}

export function Select({ className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select {...rest} className={`${INPUT_BASE} appearance-none pr-8 ${className}`}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
    </div>
  )
}

export function Checkbox({ label, hint, className = '', ...rest }) {
  return (
    <label className={`inline-flex items-start gap-2 cursor-pointer select-none group ${className}`}>
      <input type="checkbox" {...rest}
        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/[0.04] text-accent accent-accent focus:ring-2 focus:ring-accent/40" />
      <span className="text-sm text-ink-2 leading-tight">
        {label}
        {hint && <span className="block text-2xs text-ink-4 mt-0.5">{hint}</span>}
      </span>
    </label>
  )
}

// FormField wraps an Input/Select with a label + optional hint + error.
export function FormField({ label, hint, error, htmlFor, children, className = '' }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-2xs uppercase tracking-[0.12em] font-medium text-ink-4">
          {label}
        </label>
      )}
      {children}
      {error && <div className="text-2xs text-down flex items-center gap-1"><AlertCircle size={11} />{error}</div>}
      {hint && !error && <div className="text-2xs text-ink-4">{hint}</div>}
    </div>
  )
}

// ── Modal / Dialog ───────────────────────────────────────────────
const MODAL_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
}

export function Modal({ title, subtitle, icon: Icon, onClose, children, footer, size = 'md', dismissible = true }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && dismissible) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dismissible])

  function onBackdrop(e) {
    if (e.target === e.currentTarget && dismissible) onClose?.()
  }

  return (
    <div
      onClick={onBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className={`card-surface w-full ${MODAL_SIZES[size] || MODAL_SIZES.md} flex flex-col max-h-[90vh] shadow-2xl`}>
        {(title || dismissible) && (
          <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06]">
            {Icon && (
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent">
                <Icon size={15} />
              </span>
            )}
            <div className="flex-1 min-w-0">
              {title && <div className="font-display font-semibold text-base text-ink-1">{title}</div>}
              {subtitle && <div className="text-2xs text-ink-4 mt-0.5">{subtitle}</div>}
            </div>
            {dismissible && (
              <button onClick={onClose}
                className="shrink-0 w-7 h-7 rounded-md text-ink-4 hover:text-ink-1 hover:bg-white/[0.06] flex items-center justify-center transition">
                <X size={14} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.015] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Alert / Banner ───────────────────────────────────────────────
const ALERT_VARIANTS = {
  info:    { cls: 'bg-info/10  border-info/30  text-info',  Icon: Info },
  success: { cls: 'bg-up/10    border-up/30    text-up',    Icon: CheckCircle2 },
  warn:    { cls: 'bg-warn/10  border-warn/30  text-warn',  Icon: AlertTriangle },
  error:   { cls: 'bg-down/10  border-down/30  text-down',  Icon: AlertCircle },
}
export function Alert({ variant = 'info', title, children, onDismiss, className = '', compact = false }) {
  const { cls, Icon } = ALERT_VARIANTS[variant] || ALERT_VARIANTS.info
  return (
    <div className={`flex items-start gap-2 rounded-lg border ${cls} ${compact ? 'px-2.5 py-1.5 text-2xs' : 'px-3 py-2 text-xs'} ${className}`}>
      <Icon size={compact ? 12 : 14} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold leading-tight">{title}</div>}
        {children && <div className={`${title ? 'mt-0.5' : ''} opacity-95 leading-relaxed`}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ── StatusBadge ──────────────────────────────────────────────────
// Maps known statuses (orders, strategies, backtests, alerts) to a semantic pill.
const STATUS_MAP = {
  // Orders
  filled:           'up',
  partially_filled: 'accent',
  submitted:        'info',
  accepted:         'info',
  pending_risk:     'warn',
  pending_new:      'warn',
  pending:          'warn',
  risk_rejected:    'down',
  rejected:         'down',
  canceled:         'neutral',
  cancelled:        'neutral',
  expired:          'neutral',
  error:            'down',
  failed:           'down',
  // Strategies
  active:           'up',
  paused:           'warn',
  disabled:         'neutral',
  // Backtests
  completed:        'up',
  running:          'info',
  queued:           'warn',
  // Generic
  ok:               'up',
  on:               'up',
  off:              'neutral',
  live:             'down',
  paper:            'up',
}
export function StatusBadge({ status, className = '' }) {
  const key = String(status || '').toLowerCase()
  const variant = STATUS_MAP[key] || 'neutral'
  return <Pill variant={variant} className={`uppercase tracking-wider ${className}`}>{status}</Pill>
}

// ── Skeleton loaders ─────────────────────────────────────────────
export function Skeleton({ className = '', width, height, rounded = 'md' }) {
  const radius = { sm: 'rounded', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' }[rounded] || 'rounded-md'
  const style = {}
  if (width)  style.width  = typeof width === 'number'  ? `${width}px`  : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height
  return (
    <div
      style={style}
      className={`${radius} bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] bg-[length:200%_100%] animate-shimmer ${className}`}
    />
  )
}

export function SkeletonRows({ count = 4, cols = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} height={14} className={j === 0 ? 'w-16' : j === cols - 1 ? 'w-12 ml-auto' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── StatGrid — responsive grid of <Stat> ─────────────────────────
export function StatGrid({ children, cols = 4, className = '' }) {
  const map = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  }
  return <div className={`grid gap-2 ${map[cols] || map[4]} ${className}`}>{children}</div>
}

// ── IconButton — square buttons for toolbars ─────────────────────
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  const sizes = { sm: 'w-7 h-7', md: 'w-8 h-8', lg: 'w-9 h-9' }
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 16 : 14
  const variants = {
    ghost:   'bg-white/[0.04] hover:bg-white/[0.08] text-ink-3 hover:text-ink-1 border border-white/[0.06]',
    accent:  'bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30',
    up:      'bg-up/10 hover:bg-up/20 text-up border border-up/30',
    down:    'bg-down/10 hover:bg-down/20 text-down border border-down/30',
    danger:  'bg-transparent hover:bg-down/15 text-ink-4 hover:text-down border border-white/[0.06]',
  }
  return (
    <button {...rest} title={label} aria-label={label}
      className={`inline-flex items-center justify-center rounded-lg transition ${sizes[size]} ${variants[variant] || variants.ghost} ${className}`}>
      <Icon size={iconSize} />
    </button>
  )
}

// ── Toolbar — horizontal action bar with built-in spacing ────────
export function Toolbar({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>{children}</div>
  )
}
