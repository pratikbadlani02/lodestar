// Small chart primitives that share the platform's semantic color tokens.
// Designed for embedding inline in tables, cards, and dashboards.

import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts'

const cssVar = (name) => `rgb(var(${name}))`
const upRgb = () => cssVar('--c-up')
const downRgb = () => cssVar('--c-down')
const accentRgb = () => cssVar('--c-accent')
const ink3Rgb = () => cssVar('--c-ink-3')
const ink4Rgb = () => cssVar('--c-ink-4')

// ── MiniEquityCurve ─────────────────────────────────────────────
// Inline sparkline with subtle area fill. Auto-colors green if last >= first,
// red otherwise. Use inside table rows or stat tiles.
export function MiniEquityCurve({ values, height = 32, showArea = true, neutralOk = false }) {
  if (!values || values.length < 2) {
    return <span className="text-2xs text-ink-5">—</span>
  }
  const data = values.map((v, i) => ({ x: i, v: Number(v) }))
  const first = Number(values[0])
  const last = Number(values[values.length - 1])
  const up = last >= first
  const color = (!neutralOk || up !== false) ? (up ? upRgb() : downRgb()) : ink3Rgb()
  const gradId = `mec-grad-${Math.random().toString(36).slice(2, 8)}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={showArea ? `url(#${gradId})` : 'none'}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── MagBar ──────────────────────────────────────────────────────
// Horizontal bar where the fill is proportional to abs(value)/scale.
// Used as a row background indicator or a stand-alone gauge.
export function MagBar({ value, scale = 10, height = 4, className = '' }) {
  if (value == null || Number.isNaN(value)) return null
  const v = Number(value)
  const pct = Math.min(100, (Math.abs(v) / scale) * 100)
  const up = v >= 0
  return (
    <div className={`w-full bg-surf-2 rounded-full overflow-hidden ${className}`} style={{ height }}>
      <div
        className={`h-full rounded-full transition-all ${up ? 'bg-up' : 'bg-down'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Magnitude background — used as a row-level subtle highlight ──
export function MagBackground({ value, scale = 10, side = 'right' }) {
  if (value == null || Number.isNaN(value)) return null
  const v = Number(value)
  const pct = Math.min(100, (Math.abs(v) / scale) * 100)
  const up = v >= 0
  const grad = up
    ? `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, transparent 0%, rgba(var(--c-up) / 0.12) ${pct}%)`
    : `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, transparent 0%, rgba(var(--c-down) / 0.12) ${pct}%)`
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ background: grad }} />
  )
}

// ── PnlCell ─────────────────────────────────────────────────────
// Cell that color-tints by sign AND has a subtle background scaled by
// magnitude. Drop-in for % cells in any table.
export function PnlCell({ value, decimals = 2, signed = true, scale = 5, className = '' }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className={`num-flat font-mono tabular ${className}`}>—</span>
  }
  const v = Number(value)
  const up = v >= 0
  const mag = Math.min(1, Math.abs(v) / scale)
  const bgOpacity = (0.05 + mag * 0.15).toFixed(3)
  const bg = up ? `rgba(var(--c-up) / ${bgOpacity})` : `rgba(var(--c-down) / ${bgOpacity})`
  const txt = signed
    ? `${up ? '+' : ''}${v.toFixed(decimals)}%`
    : `${v.toFixed(decimals)}%`
  return (
    <span
      className={`inline-block font-mono tabular font-semibold rounded px-1.5 py-0.5 ${up ? 'text-up' : 'text-down'} ${className}`}
      style={{ backgroundColor: bg }}
    >
      {txt}
    </span>
  )
}

// ── Donut ───────────────────────────────────────────────────────
// PieChart with a thick stroke (donut style) and an optional centered label.
export function Donut({ data, size = 160, thickness = 22, centerLabel, centerValue, colors }) {
  if (!data || data.length === 0) return null
  const palette = colors || [
    '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399',
    '#fb7185', '#60a5fa', '#f97316', '#94a3b8', '#22c55e',
  ]
  const inner = (size - thickness * 2) / 2
  const outer = size / 2 - 2
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color || palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgb(var(--c-surf-1))',
              border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgb(var(--c-ink-1))',
            }}
            formatter={(v) => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerValue && <div className="text-lg font-mono tabular font-bold text-ink-1">{centerValue}</div>}
          {centerLabel && <div className="text-2xs uppercase tracking-wider text-ink-4 mt-0.5">{centerLabel}</div>}
        </div>
      )}
    </div>
  )
}

// ── ScatterChart — for risk/return scatter plots ────────────────
export function PerfScatter({ data, xKey = 'x', yKey = 'y', xLabel, yLabel, height = 220, onPointClick }) {
  if (!data || data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--c-border-rgb) / 0.15)" />
        <XAxis
          dataKey={xKey}
          name={xLabel}
          type="number"
          stroke={ink4Rgb()}
          fontSize={11}
          label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fill: ink4Rgb(), fontSize: 11 } : undefined}
        />
        <YAxis
          dataKey={yKey}
          name={yLabel}
          type="number"
          stroke={ink4Rgb()}
          fontSize={11}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: ink4Rgb(), fontSize: 11 } : undefined}
        />
        <ZAxis range={[60, 60]} />
        <Tooltip
          cursor={{ stroke: accentRgb(), strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'rgb(var(--c-surf-1))',
            border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
            borderRadius: 8,
            fontSize: 12,
            color: 'rgb(var(--c-ink-1))',
          }}
        />
        <Scatter
          data={data}
          fill={accentRgb()}
          onClick={(p) => onPointClick?.(p)}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || (d[yKey] >= 0 ? upRgb() : downRgb())} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ── Radar — multi-axis comparison ───────────────────────────────
export function RadarCompare({ axes, series, height = 260 }) {
  // axes:  array of axis keys (strings)
  // series: array of { name, color, values: { [axisKey]: number } }
  if (!axes || !series || series.length === 0) return null
  const data = axes.map((axis) => {
    const row = { axis }
    series.forEach((s) => { row[s.name] = s.values[axis] ?? 0 })
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="rgba(var(--c-border-rgb) / 0.20)" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: ink3Rgb(), fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: ink4Rgb(), fontSize: 9 }} stroke="rgba(var(--c-border-rgb) / 0.15)" />
        {series.map((s, i) => (
          <Radar
            key={s.name}
            name={s.name}
            dataKey={s.name}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11, color: ink3Rgb() }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgb(var(--c-surf-1))',
            border: '1px solid rgba(var(--c-border-rgb) / 0.2)',
            borderRadius: 8,
            fontSize: 12,
            color: 'rgb(var(--c-ink-1))',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── HeatRing — small ring gauge used for scores ────────────────
export function HeatRing({ value, max = 100, size = 64, stroke = 6, label }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - v / max)
  const color =
    v / max >= 0.7 ? upRgb() :
    v / max >= 0.55 ? upRgb() :
    v / max >= 0.45 ? cssVar('--c-warn') :
    downRgb()
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(var(--c-border-rgb) / 0.15)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-mono tabular font-bold text-ink-1">{Math.round(v)}</span>
        {label && <span className="text-2xs text-ink-4 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
