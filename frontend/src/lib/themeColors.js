// Theme-aware color access for charting libraries (recharts, lightweight-charts)
// that can't consume Tailwind utilities directly.
//
// Reads CSS variables at call time, so colors automatically reflect the active
// theme. Components that mount before paint should call these inside their
// effects or render, not at module top level.

function rgb(varName, alpha = 1) {
  if (typeof window === 'undefined') return 'rgba(0,0,0,0)'
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!v) return 'rgba(0,0,0,0)'
  return alpha === 1 ? `rgb(${v})` : `rgba(${v} / ${alpha})`
}

export const chartColors = {
  // Grid + axis ticks — subtle, low-contrast
  grid:    () => rgb('--c-ink-5', 0.18),
  axis:    () => rgb('--c-ink-4', 0.7),
  border:  () => rgb('--c-ink-5', 0.25),

  // Series strokes
  up:      () => rgb('--c-up'),
  down:    () => rgb('--c-down'),
  accent:  () => rgb('--c-accent'),
  accent2: () => rgb('--c-accent2'),

  // Tooltip / panel backgrounds
  tooltipBg:     () => rgb('--c-surf-2'),
  tooltipBorder: () => rgb('--c-ink-5', 0.3),
  text:          () => rgb('--c-ink-1'),
  textMuted:     () => rgb('--c-ink-3'),

  // Palette for multi-series charts (radar, donut, etc.)
  palette: () => [
    rgb('--c-accent'),
    rgb('--c-accent2'),
    rgb('--c-warn'),
    rgb('--c-info'),
    rgb('--c-up'),
    rgb('--c-down'),
  ],
}

// Standard recharts <Tooltip contentStyle> — used so every tooltip looks the same.
export function tooltipStyle() {
  return {
    background: chartColors.tooltipBg(),
    border: `1px solid ${chartColors.tooltipBorder()}`,
    borderRadius: 8,
    fontSize: 12,
    color: chartColors.text(),
  }
}
