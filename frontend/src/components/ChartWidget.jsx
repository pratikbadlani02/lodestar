import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
} from 'lightweight-charts'
import {
  BarChart2,
  ChevronDown,
  Settings,
  RefreshCw,
  X,
  Plus,
  Minus,
  TrendingUp,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Candle size definitions ──────────────────────────────────────────────────
const CANDLE_SIZES = [
  { label: '1m',  alpacaTf: '1Min',  dbTf: '1m',  days: 5,   intraday: true,  desc: '1 minute'  },
  { label: '5m',  alpacaTf: '5Min',  dbTf: '5m',  days: 10,  intraday: true,  desc: '5 minutes' },
  { label: '15m', alpacaTf: '15Min', dbTf: '15m', days: 22,  intraday: true,  desc: '15 minutes'},
  { label: '1h',  alpacaTf: '1Hour', dbTf: '1h',  days: 60,  intraday: true,  desc: '1 hour'    },
  { label: '1D',  alpacaTf: '1Day',  dbTf: '1d',  days: 365, intraday: false, desc: 'Daily'     },
]

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '5Y', days: 1825 },
]

// ─── Math helpers ─────────────────────────────────────────────────────────────
function computeSMA(data, period) {
  const result = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close
    result.push({ time: data[i].time, value: +(sum / period).toFixed(4) })
  }
  return result
}

function computeEMA(data, period) {
  const k = 2 / (period + 1)
  const result = []
  let ema = 0
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue
    if (i === period - 1) {
      ema = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period
    } else {
      ema = data[i].close * k + ema * (1 - k)
    }
    result.push({ time: data[i].time, value: +ema.toFixed(4) })
  }
  return result
}

function computeEMAValues(pts, period) {
  const k = 2 / (period + 1)
  const result = []
  let ema = 0
  for (let i = 0; i < pts.length; i++) {
    if (i < period - 1) continue
    if (i === period - 1) ema = pts.slice(0, period).reduce((s, p) => s + p.value, 0) / period
    else ema = pts[i].value * k + ema * (1 - k)
    result.push({ time: pts[i].time, value: +ema.toFixed(4) })
  }
  return result
}

function computeBB(data, period = 20, mult = 2) {
  const upper = [], middle = [], lower = []
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const mean = slice.reduce((s, d) => s + d.close, 0) / period
    const variance = slice.reduce((s, d) => s + (d.close - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    middle.push({ time: data[i].time, value: +mean.toFixed(4) })
    upper.push({ time: data[i].time, value: +(mean + mult * std).toFixed(4) })
    lower.push({ time: data[i].time, value: +(mean - mult * std).toFixed(4) })
  }
  return { upper, middle, lower }
}

function computeRSI(data, period = 14) {
  if (data.length < period + 1) return []
  const result = []
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const delta = data[i].close - data[i - 1].close
    if (delta > 0) avgGain += delta
    else avgLoss += Math.abs(delta)
  }
  avgGain /= period
  avgLoss /= period
  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  result.push({ time: data[period].time, value: +firstRsi.toFixed(2) })
  for (let i = period + 1; i < data.length; i++) {
    const delta = data[i].close - data[i - 1].close
    const gain = delta > 0 ? delta : 0
    const loss = delta < 0 ? Math.abs(delta) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    result.push({ time: data[i].time, value: +rsi.toFixed(2) })
  }
  return result
}

function computeMACD(data, fast = 12, slow = 26, sig = 9) {
  const emaFast = computeEMA(data, fast)
  const emaSlow = computeEMA(data, slow)
  // align: emaSlow starts later
  const slowStart = data.length - emaSlow.length
  const fastStart = data.length - emaFast.length
  const macdRaw = []
  emaSlow.forEach((s, i) => {
    const fastIdx = i + (slowStart - fastStart)
    if (fastIdx >= 0 && fastIdx < emaFast.length) {
      macdRaw.push({ time: s.time, value: +(emaFast[fastIdx].value - s.value).toFixed(4) })
    }
  })
  const signalLine = computeEMAValues(macdRaw, sig)
  const sigStart = macdRaw.length - signalLine.length
  const histogram = signalLine.map((s, i) => {
    const m = macdRaw[i + sigStart]
    const val = +(m.value - s.value).toFixed(4)
    return { time: s.time, value: val, color: val >= 0 ? '#10b981' : '#ef4444' }
  })
  return { macdLine: macdRaw, signalLine, histogram }
}

function computeHA(candles) {
  let prevOpen = candles[0].open, prevClose = candles[0].close
  return candles.map((c, i) => {
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    prevOpen = haOpen
    prevClose = haClose
    return { time: c.time, open: +haOpen.toFixed(4), high: +haHigh.toFixed(4), low: +haLow.toFixed(4), close: +haClose.toFixed(4) }
  })
}

// ─── Indicator definitions ────────────────────────────────────────────────────
const INDICATOR_GROUPS = [
  {
    label: 'Moving Averages',
    items: [
      { key: 'ma5',  label: 'MA 5',  color: '#3b82f6' },
      { key: 'ma10', label: 'MA 10', color: '#a78bfa' },
      { key: 'ma20', label: 'MA 20', color: '#f59e0b' },
      { key: 'ma50', label: 'MA 50', color: '#06b6d4' },
    ],
  },
  {
    label: 'Exponential MA',
    items: [
      { key: 'ema12', label: 'EMA 12', color: '#10b981' },
      { key: 'ema26', label: 'EMA 26', color: '#ef4444' },
    ],
  },
  {
    label: 'Bands',
    items: [
      { key: 'bb20', label: 'Bollinger Bands 20,2', color: '#64748b' },
    ],
  },
  {
    label: 'Oscillators',
    items: [
      { key: 'rsi14', label: 'RSI (14)',     color: '#f59e0b' },
      { key: 'macd',  label: 'MACD (12,26,9)', color: '#3b82f6' },
    ],
  },
]

// flat map for quick lookup
const INDICATOR_MAP = {}
INDICATOR_GROUPS.forEach(g => g.items.forEach(it => { INDICATOR_MAP[it.key] = it }))

const CHART_TYPES = ['Candles', 'Heikin Ashi', 'Line', 'Area']

// ─── Chart base options ───────────────────────────────────────────────────────
// Reads from CSS vars so the chart inherits the active theme. Called fresh on
// each chart construct + on theme change (via observer below) so palette stays
// in sync without us having to import a hook into a non-component module.
function readVar(name) {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
function rgbVar(name, alpha = 1) {
  const v = readVar(name); if (!v) return 'transparent'
  return alpha === 1 ? `rgb(${v})` : `rgba(${v} / ${alpha})`
}

function baseChartOptions(height) {
  return {
    layout: {
      background: { color: rgbVar('--c-surf-1') },
      textColor:  rgbVar('--c-ink-3'),
      fontSize: 11,
    },
    grid: {
      vertLines: { color: rgbVar('--c-ink-5', 0.18), visible: true },
      horzLines: { color: rgbVar('--c-ink-5', 0.18), visible: true },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: rgbVar('--c-ink-4', 0.4), labelBackgroundColor: rgbVar('--c-surf-2') },
      horzLine: { color: rgbVar('--c-ink-4', 0.4), labelBackgroundColor: rgbVar('--c-surf-2') },
    },
    rightPriceScale: {
      borderColor: rgbVar('--c-ink-5', 0.2),
      textColor:   rgbVar('--c-ink-4'),
    },
    timeScale: {
      borderColor: rgbVar('--c-ink-5', 0.2),
      timeVisible: true,
      secondsVisible: false,
    },
    height,
  }
}

// ─── SettingsModal ────────────────────────────────────────────────────────────
function SettingsModal({ logScale, showVolume, showGrid, onLogScale, onShowVolume, onShowGrid, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surf-1 border border-surf-3 rounded-xl shadow-2xl w-72 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-ink-2">Chart Settings</span>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-2">
            <X size={16} />
          </button>
        </div>

        {[
          { label: 'Log Scale',    value: logScale,    onChange: onLogScale },
          { label: 'Show Volume',  value: showVolume,  onChange: onShowVolume },
          { label: 'Show Grid',    value: showGrid,    onChange: onShowGrid },
        ].map(({ label, value, onChange }) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-surf-2">
            <span className="text-xs text-ink-2">{label}</span>
            <button
              onClick={() => onChange(!value)}
              className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-up' : 'bg-surf-3'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChartWidget({ symbol, height = 420, compact = false }) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const mainRef        = useRef(null)
  const rsiRef         = useRef(null)
  const macdRef        = useRef(null)
  const chartRef       = useRef(null)
  const rsiChartRef    = useRef(null)
  const macdChartRef   = useRef(null)
  const mainSeriesRef  = useRef(null)
  const volSeriesRef   = useRef(null)
  const overlayRefs    = useRef({})
  const rsiLineRef     = useRef(null)
  const rsiObRef       = useRef(null)
  const rsiOsRef       = useRef(null)
  const macdLineRef    = useRef(null)
  const macdSignalRef  = useRef(null)
  const macdHistRef    = useRef(null)
  const compareSeriesRef = useRef(null)
  const priceLines     = useRef([])
  const lastCandles    = useRef([])
  const lastBars       = useRef([])
  const drawingHandlerRef = useRef(null)
  const syncingRef     = useRef(false)

  // ── State ─────────────────────────────────────────────────────────────────
  const [candleIdx,         setCandleIdx]         = useState(4)  // default 1D
  const [rangeIdx,          setRangeIdx]          = useState(3)  // default 1Y
  const [showCandleMenu,    setShowCandleMenu]    = useState(false)
  const [chartType,         setChartType]          = useState('Candles')
  const [activeIndicators,  setActiveIndicators]   = useState(new Set())
  const [loading,           setLoading]            = useState(false)
  const [crosshairData,     setCrosshairData]      = useState(null)
  const [showTypeMenu,      setShowTypeMenu]        = useState(false)
  const [showIndicators,    setShowIndicators]      = useState(false)
  const [showSettings,      setShowSettings]        = useState(false)
  const [drawMode,          setDrawMode]            = useState(false)
  const [showDrawMenu,      setShowDrawMenu]        = useState(false)
  const [compareInput,      setCompareInput]        = useState(false)
  const [compareSymbol,     setCompareSymbol]       = useState('')
  const [compareActive,     setCompareActive]       = useState(false)
  const [logScale,          setLogScale]            = useState(false)
  const [showVolume,        setShowVolume]          = useState(true)
  const [showGrid,          setShowGrid]            = useState(true)

  const hasRsi  = activeIndicators.has('rsi14')
  const hasMacd = activeIndicators.has('macd')

  // ── Effect: mount/unmount ────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !rsiRef.current || !macdRef.current) return

    // Main chart
    const chart = createChart(mainRef.current, {
      ...baseChartOptions(height),
      width: mainRef.current.clientWidth,
    })
    chartRef.current = chart

    // Candlestick (default main series)
    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor:          '#10b981',
      downColor:        '#ef4444',
      borderUpColor:    '#10b981',
      borderDownColor:  '#ef4444',
      wickUpColor:      '#10b981',
      wickDownColor:    '#ef4444',
    })
    mainSeriesRef.current = mainSeries

    // Volume series
    const volSeries = chart.addSeries(HistogramSeries, {
      color:          '#3b82f680',
      priceFormat:    { type: 'volume' },
      priceScaleId:   'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })
    volSeriesRef.current = volSeries

    // RSI chart
    const rsiChart = createChart(rsiRef.current, {
      ...baseChartOptions(100),
      width: rsiRef.current.clientWidth,
      timeScale: { visible: false, borderColor: rgbVar('--c-ink-5', 0.2) },
    })
    rsiChartRef.current = rsiChart
    rsiLineRef.current = rsiChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1 })
    rsiObRef.current   = rsiChart.addSeries(LineSeries, {
      color: '#ef444460', lineWidth: 1, lineStyle: 2,
    })
    rsiOsRef.current   = rsiChart.addSeries(LineSeries, {
      color: '#10b98160', lineWidth: 1, lineStyle: 2,
    })

    // MACD chart
    const macdChart = createChart(macdRef.current, {
      ...baseChartOptions(100),
      width: macdRef.current.clientWidth,
      timeScale: { visible: false, borderColor: rgbVar('--c-ink-5', 0.2) },
    })
    macdChartRef.current  = macdChart
    macdLineRef.current   = macdChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1 })
    macdSignalRef.current = macdChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1 })
    macdHistRef.current   = macdChart.addSeries(HistogramSeries, { priceScaleId: 'macd_hist' })
    macdChart.priceScale('macd_hist').applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    })

    // Sync time scales
    const charts = [chart, rsiChart, macdChart]
    const syncHandler = (chart) => (range) => {
      // lightweight-charts fires this with null when a pane has no range yet
      // (e.g. an RSI/MACD pane just got created) — passing null into
      // setVisibleLogicalRange throws "Cannot read properties of null".
      if (syncingRef.current || range == null) return
      syncingRef.current = true
      charts.forEach(c => {
        if (c === chart) return
        try { c.timeScale().setVisibleLogicalRange(range) } catch { /* pane disposed mid-sync */ }
      })
      syncingRef.current = false
    }
    const unsubs = charts.map(c => {
      const h = syncHandler(c)
      c.timeScale().subscribeVisibleLogicalRangeChange(h)
      return () => c.timeScale().unsubscribeVisibleLogicalRangeChange(h)
    })

    // Crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !mainSeriesRef.current) { setCrosshairData(null); return }
      const cs = param.seriesData?.get(mainSeriesRef.current)
      if (!cs) return
      const bar = lastBars.current.find(b => b.t === param.time) || {}
      setCrosshairData({
        o: cs.open  ?? cs.value,
        h: cs.high  ?? cs.value,
        l: cs.low   ?? cs.value,
        c: cs.close ?? cs.value,
        v: bar.v ?? 0,
      })
    })

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      if (chartRef.current && mainRef.current)
        chartRef.current.applyOptions({ width: mainRef.current.clientWidth })
      if (rsiChartRef.current && rsiRef.current)
        rsiChartRef.current.applyOptions({ width: rsiRef.current.clientWidth })
      if (macdChartRef.current && macdRef.current)
        macdChartRef.current.applyOptions({ width: macdRef.current.clientWidth })
    })
    ro.observe(mainRef.current)
    ro.observe(rsiRef.current)
    ro.observe(macdRef.current)

    return () => {
      unsubs.forEach(u => u())
      ro.disconnect()
      chart.remove()
      rsiChart.remove()
      macdChart.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers: overlay indicator management ────────────────────────────────
  const removeOverlay = useCallback((key) => {
    if (!chartRef.current) return
    const existing = overlayRefs.current[key]
    if (!existing) return
    if (Array.isArray(existing)) {
      existing.forEach(s => { try { chartRef.current.removeSeries(s) } catch {} })
    } else {
      try { chartRef.current.removeSeries(existing) } catch {}
    }
    delete overlayRefs.current[key]
  }, [])

  const addOverlay = useCallback((key, candles) => {
    if (!chartRef.current || !candles.length) return
    const chart = chartRef.current
    const def = INDICATOR_MAP[key]

    if (key.startsWith('ma')) {
      const period = parseInt(key.replace('ma', ''), 10)
      const data   = computeSMA(candles, period)
      const s      = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1.5, priceLineVisible: false })
      s.setData(data)
      overlayRefs.current[key] = s
    } else if (key.startsWith('ema')) {
      const period = parseInt(key.replace('ema', ''), 10)
      const data   = computeEMA(candles, period)
      const s      = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1.5, priceLineVisible: false })
      s.setData(data)
      overlayRefs.current[key] = s
    } else if (key === 'bb20') {
      const { upper, middle, lower } = computeBB(candles, 20, 2)
      const opts = { lineWidth: 1, priceLineVisible: false }
      const us = chart.addSeries(LineSeries, { ...opts, color: '#94a3b8' })
      const ms = chart.addSeries(LineSeries, { ...opts, color: '#64748b' })
      const ls = chart.addSeries(LineSeries, { ...opts, color: '#94a3b8' })
      us.setData(upper)
      ms.setData(middle)
      ls.setData(lower)
      overlayRefs.current[key] = [us, ms, ls]
    }
  }, [])

  // ── applyData ────────────────────────────────────────────────────────────
  const applyData = useCallback((candles, indicatorsSet) => {
    if (!candles.length || !mainSeriesRef.current) return
    const chart = chartRef.current

    // Main series
    if (chartType === 'Heikin Ashi') {
      mainSeriesRef.current.setData(computeHA(candles))
    } else if (chartType === 'Line') {
      mainSeriesRef.current.setData(candles.map(c => ({ time: c.time, value: c.close })))
    } else if (chartType === 'Area') {
      mainSeriesRef.current.setData(candles.map(c => ({ time: c.time, value: c.close })))
    } else {
      mainSeriesRef.current.setData(candles)
    }

    // Volume
    if (volSeriesRef.current) {
      volSeriesRef.current.setData(
        lastBars.current.map(b => ({
          time:  b.t,
          value: b.v,
          color: b.c >= b.o ? '#10b98160' : '#ef444460',
        }))
      )
    }

    // Overlay indicators
    const active = indicatorsSet || activeIndicators
    const overlayKeys = ['ma5', 'ma10', 'ma20', 'ma50', 'ema12', 'ema26', 'bb20']
    overlayKeys.forEach(key => {
      removeOverlay(key)
      if (active.has(key)) addOverlay(key, candles)
    })

    // RSI
    if (rsiLineRef.current) {
      if (active.has('rsi14')) {
        const rsiData = computeRSI(candles)
        rsiLineRef.current.setData(rsiData)
        // Overbought / Oversold static lines
        const obData = rsiData.map(d => ({ time: d.time, value: 70 }))
        const osData = rsiData.map(d => ({ time: d.time, value: 30 }))
        rsiObRef.current?.setData(obData)
        rsiOsRef.current?.setData(osData)
      } else {
        rsiLineRef.current.setData([])
        rsiObRef.current?.setData([])
        rsiOsRef.current?.setData([])
      }
    }

    // MACD
    if (macdLineRef.current) {
      if (active.has('macd')) {
        const { macdLine, signalLine, histogram } = computeMACD(candles)
        macdLineRef.current.setData(macdLine)
        macdSignalRef.current?.setData(signalLine)
        macdHistRef.current?.setData(histogram)
      } else {
        macdLineRef.current.setData([])
        macdSignalRef.current?.setData([])
        macdHistRef.current?.setData([])
      }
    }

    // Compare overlay normalize
    if (compareSeriesRef.current && compareActive && candles.length) {
      // will be refreshed by compare logic independently
    }

    chart?.timeScale().fitContent()
    rsiChartRef.current?.timeScale().fitContent()
    macdChartRef.current?.timeScale().fitContent()
  }, [chartType, activeIndicators, removeOverlay, addOverlay, compareActive])

  // ── loadData ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (sym, days, alpacaTf, dbTf, isIntraday, indicatorsSet) => {
    if (!sym) return
    setLoading(true)
    try {
      let resp = await api.getOhlcv(sym, days, dbTf)
      let bars = (resp?.bars ?? []).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))

      // Seed if needed
      if (isIntraday ? bars.length === 0 : bars.length < days * 0.55) {
        try { await api.fetchMarket(sym, days, alpacaTf) } catch {}
        resp = await api.getOhlcv(sym, days, dbTf)
        bars = (resp?.bars ?? []).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
      }

      if (!bars.length) return

      const candles = bars.map(b => {
        let time = b.t
        if (typeof time === 'number' && time > 1e10) time = Math.floor(time / 1000)
        if (typeof time === 'string' && time.length > 10) {
          // intraday: ISO datetime → unix seconds; daily: YYYY-MM-DD
          time = isIntraday
            ? Math.floor(new Date(time).getTime() / 1000)
            : time.slice(0, 10)
        }
        return { time, open: +b.o, high: +b.h, low: +b.l, close: +b.c }
      })

      lastCandles.current = candles
      lastBars.current    = bars.map((b, i) => ({ ...b, t: candles[i].time }))

      applyData(candles, indicatorsSet)
    } catch (err) {
      console.error('ChartWidget loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [applyData])

  // ── Effect: symbol / candle size / range change ──────────────────────────
  useEffect(() => {
    if (!symbol || !chartRef.current) return
    if (compareSeriesRef.current) {
      try { chartRef.current.removeSeries(compareSeriesRef.current) } catch {}
      compareSeriesRef.current = null
      setCompareActive(false)
      setCompareSymbol('')
      setCompareInput(false)
    }
    priceLines.current.forEach(pl => {
      try { mainSeriesRef.current?.removePriceLine(pl) } catch {}
    })
    priceLines.current = []

    const cs   = CANDLE_SIZES[candleIdx]
    const days = cs.intraday ? cs.days : RANGES[rangeIdx].days
    loadData(symbol, days, cs.alpacaTf, cs.dbTf, cs.intraday, activeIndicators)
  }, [symbol, candleIdx, rangeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect: chart type switch ─────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !lastCandles.current.length) return
    const chart = chartRef.current

    // Remove old main series
    if (mainSeriesRef.current) {
      // Remove all price lines first
      priceLines.current.forEach(pl => {
        try { mainSeriesRef.current.removePriceLine(pl) } catch {}
      })
      priceLines.current = []
      try { chart.removeSeries(mainSeriesRef.current) } catch {}
      mainSeriesRef.current = null
    }

    // Create new series
    let newSeries
    if (chartType === 'Candles' || chartType === 'Heikin Ashi') {
      newSeries = chart.addSeries(CandlestickSeries, {
        upColor:         '#10b981',
        downColor:       '#ef4444',
        borderUpColor:   '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor:     '#10b981',
        wickDownColor:   '#ef4444',
      })
    } else if (chartType === 'Line') {
      newSeries = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false })
    } else if (chartType === 'Area') {
      newSeries = chart.addSeries(AreaSeries, {
        lineColor:     '#3b82f6',
        topColor:      '#3b82f630',
        bottomColor:   '#3b82f600',
        lineWidth:     2,
        priceLineVisible: false,
      })
    }
    mainSeriesRef.current = newSeries

    // Re-apply data
    const candles = lastCandles.current
    if (chartType === 'Heikin Ashi') {
      newSeries.setData(computeHA(candles))
    } else if (chartType === 'Line' || chartType === 'Area') {
      newSeries.setData(candles.map(c => ({ time: c.time, value: c.close })))
    } else {
      newSeries.setData(candles)
    }
  }, [chartType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect: active indicators change ─────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !lastCandles.current.length) return
    const candles = lastCandles.current

    const overlayKeys = ['ma5', 'ma10', 'ma20', 'ma50', 'ema12', 'ema26', 'bb20']
    overlayKeys.forEach(key => {
      removeOverlay(key)
      if (activeIndicators.has(key)) addOverlay(key, candles)
    })

    // RSI
    if (rsiLineRef.current) {
      if (activeIndicators.has('rsi14')) {
        const rsiData = computeRSI(candles)
        rsiLineRef.current.setData(rsiData)
        const obData = rsiData.map(d => ({ time: d.time, value: 70 }))
        const osData = rsiData.map(d => ({ time: d.time, value: 30 }))
        rsiObRef.current?.setData(obData)
        rsiOsRef.current?.setData(osData)
        rsiChartRef.current?.timeScale().fitContent()
      } else {
        rsiLineRef.current.setData([])
        rsiObRef.current?.setData([])
        rsiOsRef.current?.setData([])
      }
    }

    // MACD
    if (macdLineRef.current) {
      if (activeIndicators.has('macd')) {
        const { macdLine, signalLine, histogram } = computeMACD(candles)
        macdLineRef.current.setData(macdLine)
        macdSignalRef.current?.setData(signalLine)
        macdHistRef.current?.setData(histogram)
        macdChartRef.current?.timeScale().fitContent()
      } else {
        macdLineRef.current.setData([])
        macdSignalRef.current?.setData([])
        macdHistRef.current?.setData([])
      }
    }
  }, [activeIndicators, removeOverlay, addOverlay])

  // ── Effect: settings — log scale ─────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: logScale ? 1 : 0 })
  }, [logScale])

  // ── Effect: settings — show volume ───────────────────────────────────────
  useEffect(() => {
    volSeriesRef.current?.applyOptions({ visible: showVolume })
  }, [showVolume])

  // ── Effect: settings — show grid ─────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: rgbVar('--c-ink-5', 0.18), visible: showGrid },
        horzLines: { color: rgbVar('--c-ink-5', 0.18), visible: showGrid },
      },
    })
  }, [showGrid])

  // ── Draw mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (drawingHandlerRef.current) {
      chart.unsubscribeClick(drawingHandlerRef.current)
      drawingHandlerRef.current = null
    }

    if (drawMode) {
      const handler = (param) => {
        if (!param.point || !mainSeriesRef.current) return
        const price = mainSeriesRef.current.coordinateToPrice(param.point.y)
        if (price == null) return
        const pl = mainSeriesRef.current.createPriceLine({
          price,
          color:            '#60a5fa',
          lineWidth:        1,
          lineStyle:        2,
          axisLabelVisible: true,
          title:            price.toFixed(2),
        })
        priceLines.current.push(pl)
      }
      drawingHandlerRef.current = handler
      chart.subscribeClick(handler)
    }
  }, [drawMode])

  // ── Effect: click outside to close dropdowns ─────────────────────────────
  useEffect(() => {
    const handler = () => {
      setShowTypeMenu(false)
      setShowIndicators(false)
      setShowDrawMenu(false)
      setShowCandleMenu(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Compare apply ─────────────────────────────────────────────────────────
  const applyCompare = async () => {
    if (!compareSymbol.trim() || !chartRef.current) return
    const sym = compareSymbol.trim().toUpperCase()
    try {
      const cs   = CANDLE_SIZES[candleIdx]
      const days = cs.intraday ? cs.days : RANGES[rangeIdx].days
      let resp = await api.getOhlcv(sym, days, cs.dbTf)
      let bars = (resp?.bars ?? []).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
      if (!bars.length) return

      const compareBars = bars.map(b => {
        let time = b.t
        if (typeof time === 'number' && time > 1e10) time = Math.floor(time / 1000)
        if (typeof time === 'string' && time.length > 10) {
          time = cs.intraday
            ? Math.floor(new Date(time).getTime() / 1000)
            : time.slice(0, 10)
        }
        return { time, close: +b.c }
      })

      // Remove old compare series
      if (compareSeriesRef.current) {
        try { chartRef.current.removeSeries(compareSeriesRef.current) } catch {}
      }

      const s = chartRef.current.addSeries(LineSeries, {
        color:          '#f59e0b',
        lineWidth:      2,
        priceScaleId:   'compare',
        priceLineVisible: false,
      })
      chartRef.current.priceScale('compare').applyOptions({
        position:     'left',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      })

      const base = compareBars[0].close
      s.setData(
        compareBars.map(b => ({
          time:  b.time,
          value: +((b.close - base) / base * 100).toFixed(2),
        }))
      )

      compareSeriesRef.current = s
      setCompareActive(true)
    } catch (err) {
      console.error('ChartWidget compare error:', err)
    }
  }

  const removeCompare = () => {
    if (compareSeriesRef.current && chartRef.current) {
      try { chartRef.current.removeSeries(compareSeriesRef.current) } catch {}
      compareSeriesRef.current = null
    }
    setCompareActive(false)
    setCompareSymbol('')
    setCompareInput(false)
  }

  const clearAllDrawings = () => {
    priceLines.current.forEach(pl => {
      try { mainSeriesRef.current?.removePriceLine(pl) } catch {}
    })
    priceLines.current = []
  }

  const toggleIndicator = (key) => {
    setActiveIndicators(prev => {
      const next = prev.has(key)
        ? new Set([...prev].filter(k => k !== key))
        : new Set([...prev, key])
      return next
    })
  }

  const indicatorCount = [...activeIndicators].length

  // ─── JSX ─────────────────────────────────────────────────────────────────
  const textSize = compact ? 'text-[10px]' : 'text-xs'

  return (
    <div className="flex flex-col bg-surf-0 relative select-none rounded-lg overflow-hidden border border-surf-2">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surf-2 bg-surf-1/50 flex-wrap min-h-[36px]">

        {/* Left tools */}
        <div className="flex items-center gap-1.5">

          {/* Chart type dropdown */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowTypeMenu(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded bg-surf-2 hover:bg-surf-3 ${textSize} font-semibold text-ink-2`}
            >
              <BarChart2 size={compact ? 10 : 12} />
              {chartType}
              <ChevronDown size={compact ? 8 : 10} />
            </button>
            {showTypeMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surf-2 border border-surf-3 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                {CHART_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => { setChartType(t); setShowTypeMenu(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surf-3 ${chartType === t ? 'text-up' : 'text-ink-2'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Indicators */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowIndicators(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded bg-surf-2 hover:bg-surf-3 ${textSize} font-semibold text-ink-2`}
            >
              <TrendingUp size={compact ? 10 : 12} />
              Indicators
              {indicatorCount > 0 && (
                <span className="ml-0.5 px-1 py-0.5 rounded-full bg-up/20 text-up text-[9px] font-bold leading-none">
                  {indicatorCount}
                </span>
              )}
            </button>
            {showIndicators && (
              <div className="absolute top-full left-0 mt-1 bg-surf-2 border border-surf-3 rounded-lg shadow-xl z-50 py-2 min-w-[220px]">
                {INDICATOR_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="px-3 py-1 text-[9px] font-bold text-ink-4 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.items.map(item => (
                      <button
                        key={item.key}
                        onClick={() => toggleIndicator(item.key)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-surf-3 text-left"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                            activeIndicators.has(item.key)
                              ? 'border-up bg-up'
                              : 'border-surf-4 bg-transparent'
                          }`}
                        >
                          {activeIndicators.has(item.key) && (
                            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-[#fff] fill-current">
                              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                            </svg>
                          )}
                        </div>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs text-ink-2">{item.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compare */}
          <div className="flex items-center gap-1">
            {!compareActive && (
              <button
                onClick={() => setCompareInput(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded bg-surf-2 hover:bg-surf-3 ${textSize} font-semibold text-ink-2`}
              >
                <Plus size={compact ? 10 : 12} />
                Compare
              </button>
            )}
            {compareActive && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-warn/20 border border-warn/40">
                <span className={`${textSize} font-semibold text-warn`}>{compareSymbol}</span>
                <button onClick={removeCompare} className="text-warn hover:text-warn">
                  <X size={10} />
                </button>
              </div>
            )}
            {compareInput && !compareActive && (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  className="bg-surf-2 border border-surf-4 rounded px-2 py-0.5 text-xs text-ink-2 w-20 outline-none focus:border-warn"
                  placeholder="SYMBOL"
                  value={compareSymbol}
                  onChange={e => setCompareSymbol(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter') applyCompare()
                    if (e.key === 'Escape') { setCompareInput(false); setCompareSymbol('') }
                  }}
                />
                <button
                  onClick={applyCompare}
                  className="px-2 py-0.5 rounded bg-warn hover:bg-warn text-xs font-semibold text-[#fff]"
                >
                  Apply
                </button>
                <button
                  onClick={() => { setCompareInput(false); setCompareSymbol('') }}
                  className="text-ink-4 hover:text-ink-2"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Draw */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowDrawMenu(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded ${drawMode ? 'bg-info/30 border border-info/50 text-info' : 'bg-surf-2 hover:bg-surf-3 text-ink-2'} ${textSize} font-semibold`}
            >
              Draw
              <ChevronDown size={compact ? 8 : 10} />
            </button>
            {showDrawMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surf-2 border border-surf-3 rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
                <button
                  onClick={() => { setDrawMode(v => !v); setShowDrawMenu(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surf-3 ${drawMode ? 'text-info' : 'text-ink-2'}`}
                >
                  {drawMode ? '✓ ' : ''}Horizontal Line
                </button>
                <button
                  onClick={() => { clearAllDrawings(); setShowDrawMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-ink-2 hover:bg-surf-3"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-surf-2 hover:bg-surf-3 text-ink-2"
          >
            <Settings size={compact ? 10 : 12} />
          </button>
        </div>

        {/* OHLCV crosshair display */}
        {crosshairData && (
          <div className="flex gap-3 text-[10px] font-mono text-ink-3 ml-2">
            <span>O: <span className="text-ink-2">${crosshairData.o?.toFixed(2)}</span></span>
            <span>H: <span className="text-up">${crosshairData.h?.toFixed(2)}</span></span>
            <span>L: <span className="text-down">${crosshairData.l?.toFixed(2)}</span></span>
            <span>C: <span className="text-ink-2">${crosshairData.c?.toFixed(2)}</span></span>
            <span>
              V:{' '}
              <span className="text-ink-2">
                {crosshairData.v >= 1e9
                  ? (crosshairData.v / 1e9).toFixed(2) + 'B'
                  : crosshairData.v >= 1e6
                  ? (crosshairData.v / 1e6).toFixed(2) + 'M'
                  : crosshairData.v >= 1e3
                  ? (crosshairData.v / 1e3).toFixed(1) + 'K'
                  : crosshairData.v?.toFixed(0)}
              </span>
            </span>
          </div>
        )}

        {/* Refresh — pushed to right */}
        <button
          onClick={() => {
            const cs   = CANDLE_SIZES[candleIdx]
            const days = cs.intraday ? cs.days : RANGES[rangeIdx].days
            loadData(symbol, days, cs.alpacaTf, cs.dbTf, cs.intraday, activeIndicators)
          }}
          className={`ml-auto text-ink-4 hover:text-ink-2 ${loading ? 'animate-spin' : ''}`}
        >
          <RefreshCw size={compact ? 10 : 12} />
        </button>

        {/* Loading indicator */}
        {loading && (
          <span className="text-[10px] text-ink-4 font-mono">Loading…</span>
        )}
      </div>

      {/* ── Candle size bar ── */}
      <div className="flex items-center border-b border-surf-2 bg-surf-1/20">
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center">
            {CANDLE_SIZES.map((cs, i) => (
              <button
                key={cs.label}
                onClick={() => { setCandleIdx(i); setShowCandleMenu(false) }}
                className={`px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition border-b-2 -mb-px ${
                  candleIdx === i
                    ? 'text-info border-info'
                    : 'text-ink-4 hover:text-ink-2 border-transparent'
                }`}
              >
                {cs.label}
              </button>
            ))}
            {/* Range selector for daily mode */}
            {!CANDLE_SIZES[candleIdx]?.intraday && (
              <div className="flex items-center pl-2 ml-1 border-l border-surf-2 gap-0.5">
                {RANGES.map((r, i) => (
                  <button
                    key={r.label}
                    onClick={() => setRangeIdx(i)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                      rangeIdx === i ? 'bg-surf-3 text-ink-1' : 'text-ink-4 hover:text-ink-2'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* ▲ dropdown toggle */}
        <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowCandleMenu(v => !v)}
            className={`px-2.5 py-1 text-[11px] font-bold transition border-l border-surf-2 ${
              showCandleMenu ? 'text-ink-2 bg-surf-2' : 'text-ink-4 hover:text-ink-2'
            }`}
          >
            ▲
          </button>
          {showCandleMenu && (
            <div className="absolute right-0 top-full mt-px bg-surf-1 border border-surf-3 rounded-lg shadow-2xl z-50 w-44 py-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-ink-3 uppercase tracking-wider bg-surf-2/60 border-b border-surf-2 mb-1">
                Interval
              </div>
              {CANDLE_SIZES.map((cs, i) => (
                <button
                  key={cs.label}
                  onClick={() => { setCandleIdx(i); setShowCandleMenu(false) }}
                  className={`flex items-center justify-between w-full px-3 py-1.5 hover:bg-surf-2 transition ${
                    candleIdx === i ? 'text-info' : 'text-ink-2'
                  }`}
                >
                  <span className="text-xs font-semibold">{cs.desc}</span>
                  <span className="text-ink-5 text-sm">{candleIdx === i ? '★' : '☆'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main chart ── */}
      <div
        ref={mainRef}
        style={{ width: '100%', height }}
        className={drawMode ? 'cursor-crosshair' : ''}
      />

      {/* ── RSI pane ── */}
      <div style={{ height: hasRsi ? 'auto' : 0, overflow: 'hidden' }} className={hasRsi ? 'border-t border-surf-2' : ''}>
        <div className="px-3 py-0.5 text-[9px] text-ink-5 font-semibold tracking-wider">RSI (14)</div>
        <div ref={rsiRef} style={{ width: '100%', height: 100 }} />
      </div>

      {/* ── MACD pane ── */}
      <div style={{ height: hasMacd ? 'auto' : 0, overflow: 'hidden' }} className={hasMacd ? 'border-t border-surf-2' : ''}>
        <div className="px-3 py-0.5 text-[9px] text-ink-5 font-semibold tracking-wider">MACD (12,26,9)</div>
        <div ref={macdRef} style={{ width: '100%', height: 100 }} />
      </div>

      {/* ── Settings modal ── */}
      {showSettings && (
        <SettingsModal
          logScale={logScale}
          showVolume={showVolume}
          showGrid={showGrid}
          onLogScale={setLogScale}
          onShowVolume={setShowVolume}
          onShowGrid={setShowGrid}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
