import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Newspaper, RefreshCw, TrendingUp, TrendingDown, Activity, Bitcoin, DollarSign,
  Calendar, ExternalLink, Search, Filter, Clock, Sparkles, Zap,
  Layers, Flame, BarChart3,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSymbol } from '../lib/SymbolContext'
import { useMarket } from '../lib/MarketContext'
import { useSymbolContextMenu } from '../components/ui/ContextMenu'
import {
  PageShell, PageHeader, Card, SectionHeader, IconButton, Input, Pill, SkeletonRows,
  TabStrip,
} from '../components/ui/primitives'
import { MiniEquityCurve, MagBar } from '../components/ui/charts'
import { fmtPrice, activeCurrency } from '../components/ui/format'
import EmptyState from '../components/ui/EmptyState'
import ConceptOfDay from '../components/ConceptOfDay'

// ── Macro tiles to show in the top strip ────────────────────────────
// Indices come from ETF proxies (Alpaca returns equity snapshots only).
const INDEX_PROXIES_US = [
  { symbol: 'SPY', label: 'S&P 500'      },
  { symbol: 'QQQ', label: 'Nasdaq 100'   },
  { symbol: 'IWM', label: 'Russell 2000' },
  { symbol: 'DIA', label: 'Dow Jones'    },
]
const MACRO_PROXIES_US = [
  { symbol: 'VIX',  label: 'Volatility'  },   // CBOE volatility (may not have a snapshot — show "—")
  { symbol: 'UVXY', label: 'VIX 2x ETF'  },   // fallback liquid proxy
  { symbol: 'GLD',  label: 'Gold'        },
  { symbol: 'USO',  label: 'Oil'         },
  { symbol: 'TLT',  label: '20+ Treasury'},
  { symbol: 'UUP',  label: 'USD Index'   },
]
const CRYPTO_PROXIES = [
  { symbol: 'BTC/USD', label: 'Bitcoin'  },
  { symbol: 'ETH/USD', label: 'Ethereum' },
  { symbol: 'SOL/USD', label: 'Solana'   },
]
// SPDR sector ETFs — one liquid proxy per GICS sector. Webull's market page
// leads with a sector-performance panel; these single snapshots give a clean
// day-change read per sector without fetching dozens of constituents.
const SECTOR_ETFS_US = [
  { symbol: 'XLK',  label: 'Technology'      },
  { symbol: 'XLC',  label: 'Communication'   },
  { symbol: 'XLY',  label: 'Cons. Disc.'     },
  { symbol: 'XLF',  label: 'Financials'      },
  { symbol: 'XLV',  label: 'Health Care'     },
  { symbol: 'XLI',  label: 'Industrials'     },
  { symbol: 'XLP',  label: 'Cons. Staples'   },
  { symbol: 'XLE',  label: 'Energy'          },
  { symbol: 'XLU',  label: 'Utilities'       },
  { symbol: 'XLRE', label: 'Real Estate'     },
  { symbol: 'XLB',  label: 'Materials'       },
]
const NEWS_PRESETS_US = [
  { id: 'all',     label: 'All news',    symbols: null },
  { id: 'megacap', label: 'Megacap',     symbols: 'AAPL,MSFT,NVDA,GOOGL,AMZN,META,TSLA,AVGO' },
  { id: 'banks',   label: 'Banks',       symbols: 'JPM,BAC,WFC,GS,MS,C,BLK' },
  { id: 'energy',  label: 'Energy',      symbols: 'XOM,CVX,COP,SLB,OXY' },
  { id: 'crypto',  label: 'Crypto',      symbols: 'COIN,MSTR,BITO,MARA,RIOT' },
  { id: 'ai',      label: 'AI / Chips',  symbols: 'NVDA,AMD,AVGO,TSM,SMCI,PLTR,ARM' },
]

// ── India (NSE) equivalents ─────────────────────────────────────────
const INDEX_PROXIES_IN = [
  { symbol: '^NSEI',     label: 'NIFTY 50'   },
  { symbol: '^BSESN',    label: 'SENSEX'     },
  { symbol: '^NSEBANK',  label: 'Bank Nifty' },
  { symbol: '^INDIAVIX', label: 'India VIX'  },
]
const MACRO_PROXIES_IN = [
  { symbol: '^INDIAVIX',  label: 'India VIX' },
  { symbol: 'GOLDBEES.NS', label: 'Gold ETF' },
  { symbol: 'NIFTYBEES.NS', label: 'Nifty ETF' },
  { symbol: 'RELIANCE.NS', label: 'Reliance'  },
]
const SECTOR_ETFS_IN = [
  { symbol: '^CNXIT',     label: 'IT'        },
  { symbol: '^NSEBANK',   label: 'Bank'      },
  { symbol: '^CNXAUTO',   label: 'Auto'      },
  { symbol: '^CNXPHARMA', label: 'Pharma'    },
  { symbol: '^CNXFMCG',   label: 'FMCG'      },
  { symbol: '^CNXMETAL',  label: 'Metal'     },
  { symbol: '^CNXENERGY', label: 'Energy'    },
  { symbol: '^CNXREALTY', label: 'Realty'    },
]
const NEWS_PRESETS_IN = [
  { id: 'all',   label: 'All news', symbols: null },
  { id: 'nifty', label: 'Nifty',    symbols: 'RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS,ICICIBANK.NS' },
  { id: 'banks', label: 'Banks',    symbols: 'HDFCBANK.NS,ICICIBANK.NS,SBIN.NS,KOTAKBANK.NS,AXISBANK.NS' },
  { id: 'it',    label: 'IT',       symbols: 'TCS.NS,INFY.NS,HCLTECH.NS,WIPRO.NS,TECHM.NS' },
  { id: 'auto',  label: 'Auto',     symbols: 'MARUTI.NS,TATAMOTORS.NS,M&M.NS,EICHERMOT.NS,HEROMOTOCO.NS' },
]

// Sentiment is a quick lexical heuristic. The backend doesn't tag articles, so
// we score headline + summary against a small word list. Not perfect but good
// enough to make the feed feel less monotonous and to surface bearish news.
const POS_WORDS = ['beat', 'beats', 'surge', 'surges', 'rally', 'rallies', 'rallied', 'jumps', 'soars', 'gains', 'record', 'high', 'profit', 'profits', 'upgrade', 'upgrades', 'raises', 'positive', 'strong', 'outperform', 'rises', 'boost', 'wins', 'expansion', 'growth', 'top', 'tops', 'breakthrough', 'launch', 'launches', 'approved']
const NEG_WORDS = ['miss', 'misses', 'plunge', 'plunges', 'crash', 'crashes', 'drops', 'drop', 'falls', 'fall', 'loss', 'losses', 'cut', 'cuts', 'downgrade', 'downgrades', 'lowers', 'negative', 'weak', 'underperform', 'declines', 'warns', 'warning', 'fraud', 'lawsuit', 'investigation', 'recall', 'recalls', 'bankruptcy', 'layoffs', 'layoff', 'fire', 'fires', 'fired']

function scoreArticle(a) {
  const txt = `${a.headline || ''} ${a.summary || ''}`.toLowerCase()
  let s = 0
  for (const w of POS_WORDS) if (txt.includes(w)) s += 1
  for (const w of NEG_WORDS) if (txt.includes(w)) s -= 1
  return s
}
function sentimentClass(s) {
  if (s >= 2)  return { variant: 'up',      label: 'Bullish' }
  if (s === 1) return { variant: 'up',      label: 'Positive' }
  if (s === 0) return { variant: 'neutral', label: 'Neutral' }
  if (s === -1) return { variant: 'down',   label: 'Negative' }
  return { variant: 'down', label: 'Bearish' }
}

// ── Helpers ─────────────────────────────────────────────────────────
function fmt(n, dec = 2) { return n != null ? Number(n).toFixed(dec) : '—' }
function fmtBig(n) {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3)  return `${(n / 1e3).toFixed(0)}K`
  return n.toFixed(2)
}
function fmtAgo(ts) {
  if (!ts) return '—'
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Market session label — purely client-side, market-aware (US/Eastern, IN/IST).
function sessionLabel(market = 'us') {
  if (market === 'in') {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const day = ist.getDay()
    if (day === 0 || day === 6) return { label: 'Closed (weekend)', variant: 'neutral' }
    const m = ist.getHours() * 60 + ist.getMinutes()
    if (m < 9 * 60 + 15) return { label: 'Pre-open', variant: 'warn' }
    if (m <= 15 * 60 + 30) return { label: 'Open', variant: 'up' }
    return { label: 'Closed', variant: 'neutral' }
  }
  const now = new Date()
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = est.getDay()                  // 0 Sun, 6 Sat
  if (day === 0 || day === 6) return { label: 'Closed (weekend)', variant: 'neutral' }
  const minutes = est.getHours() * 60 + est.getMinutes()
  if (minutes < 4 * 60) return { label: 'Closed', variant: 'neutral' }
  if (minutes < 9 * 60 + 30) return { label: 'Pre-market', variant: 'warn' }
  if (minutes < 16 * 60) return { label: 'Open', variant: 'up' }
  if (minutes < 20 * 60) return { label: 'After hours', variant: 'warn' }
  return { label: 'Closed', variant: 'neutral' }
}

// Extract pct change from an Alpaca snapshot
function pctFromSnap(s) {
  if (!s) return null
  const last = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c
  const prev = s.prevDailyBar?.c
  if (last == null || prev == null) return null
  return ((last - prev) / prev) * 100
}
function lastFromSnap(s) {
  if (!s) return null
  return s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c ?? null
}

// ── Macro Tile — single tile in the top strip ──────────────────────
function MacroTile({ label, symbol, snap, onClick }) {
  const pct  = pctFromSnap(snap)
  const last = lastFromSnap(snap)
  const up   = (pct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[110px] px-3 py-2 text-left rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-accent/30 transition"
    >
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium leading-tight">{label}</div>
      <div className="font-mono text-2xs text-ink-5 mt-0.5">{symbol}</div>
      <div className="flex items-baseline justify-between mt-1.5 gap-2">
        <span className="font-mono tabular text-sm font-bold text-ink-1">
          {last != null ? fmtPrice(last) : '—'}
        </span>
        {pct != null && (
          <span className={`font-mono tabular text-xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
            {up ? '+' : ''}{fmt(pct)}%
          </span>
        )}
      </div>
    </button>
  )
}

// ── Crypto tile uses different price format ────────────────────────
function CryptoTile({ label, symbol, snap, onClick }) {
  const last = snap?.latestTrade?.p ?? snap?.latestQuote?.bp ?? snap?.dailyBar?.c
  const prev = snap?.prevDailyBar?.c
  const pct  = (last != null && prev != null) ? ((last - prev) / prev) * 100 : null
  const up   = (pct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[110px] px-3 py-2 text-left rounded-lg border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-accent/30 transition"
    >
      <div className="text-2xs uppercase tracking-wider text-ink-4 font-medium leading-tight">{label}</div>
      <div className="font-mono text-2xs text-ink-5 mt-0.5">{symbol}</div>
      <div className="flex items-baseline justify-between mt-1.5 gap-2">
        <span className="font-mono tabular text-sm font-bold text-ink-1">
          {last != null ? `$${fmtBig(last)}` : '—'}
        </span>
        {pct != null && (
          <span className={`font-mono tabular text-xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
            {up ? '+' : ''}{fmt(pct)}%
          </span>
        )}
      </div>
    </button>
  )
}

// ── Index hero card — large card with last/chg + intraday sparkline ─
function IndexHeroCard({ label, symbol, snap, spark, onClick }) {
  const pct  = pctFromSnap(snap)
  const last = lastFromSnap(snap)
  const prev = snap?.prevDailyBar?.c
  const chg  = (last != null && prev != null) ? last - prev : null
  const up   = (pct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.045] hover:border-accent/30 transition p-3.5 min-w-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-1 truncate group-hover:text-accent transition-colors">{label}</div>
          <div className="font-mono text-2xs text-ink-5 mt-0.5">{symbol}</div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 font-mono tabular text-xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
          {pct != null && (up ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
          {pct != null ? `${up ? '+' : ''}${fmt(pct)}%` : '—'}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div className="min-w-0">
          <div className="font-mono tabular text-xl font-bold text-ink-1 leading-none">
            {last != null ? fmt(last) : '—'}
          </div>
          <div className={`font-mono tabular text-2xs mt-1.5 ${up ? 'text-up' : 'text-down'}`}>
            {chg != null ? `${up ? '+' : ''}${fmt(chg)}` : '—'}
          </div>
        </div>
        <div className="w-24 h-10 shrink-0 self-center">
          <MiniEquityCurve values={spark} height={40} />
        </div>
      </div>
    </button>
  )
}

// ── Sector performance row — label · magnitude bar · pct ───────────
function SectorRow({ label, pct, onClick }) {
  const up = (pct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-white/[0.04] transition"
    >
      <span className="w-28 shrink-0 text-left text-xs text-ink-2 truncate">{label}</span>
      <div className="flex-1 min-w-0"><MagBar value={pct} scale={3} height={6} /></div>
      <span className={`w-16 shrink-0 text-right font-mono tabular text-xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
        {pct != null ? `${up ? '+' : ''}${fmt(pct)}%` : '—'}
      </span>
    </button>
  )
}

// ── Market breadth gauge — advancing vs declining across a universe ─
function BreadthGauge({ up, down, flat }) {
  const total = up + down + flat || 1
  const upW   = (up / total) * 100
  const flatW = (flat / total) * 100
  const downW = (down / total) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono tabular text-sm font-bold text-up">{up} ▲</span>
        <span className="text-2xs text-ink-4 font-mono">{flat} flat</span>
        <span className="font-mono tabular text-sm font-bold text-down">▼ {down}</span>
      </div>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-white/[0.04]">
        <div className="bg-up"   style={{ width: `${upW}%` }} />
        <div className="bg-ink-5 opacity-30" style={{ width: `${flatW}%` }} />
        <div className="bg-down" style={{ width: `${downW}%` }} />
      </div>
    </div>
  )
}

// ── Movers table — one row per symbol with chg-magnitude bar ───────
function MoversTable({ rows, onSymbolClick, showVolume = false }) {
  if (!rows?.length) {
    return <div className="px-3 py-6 text-center text-xs text-ink-4">No data available.</div>
  }
  return (
    <div className="divide-y divide-white/[0.04]">
      {rows.map((m, i) => {
        const pct = Number(m.percent_change ?? m.change_pct ?? 0)
        const up  = pct >= 0
        return (
          <button
            key={m.symbol}
            onClick={() => onSymbolClick(m.symbol)}
            className="w-full grid grid-cols-[1.2rem_1fr_auto] items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition text-left"
          >
            <span className="text-2xs font-mono text-ink-5 tabular">{i + 1}</span>
            <div className="min-w-0">
              <div className="font-mono font-semibold text-sm text-ink-1 truncate">{m.symbol}</div>
              <div className="mt-1 w-24"><MagBar value={pct} scale={10} height={4} /></div>
            </div>
            <div className="text-right">
              <div className="font-mono tabular text-sm text-ink-1">{activeCurrency()}{fmt(m.price)}</div>
              <div className={`font-mono tabular text-2xs font-semibold ${up ? 'text-up' : 'text-down'}`}>
                {showVolume && m.volume != null
                  ? <span className="text-ink-4 mr-1.5">{fmtBig(m.volume)}</span>
                  : null}
                {up ? '+' : ''}{fmt(pct)}%
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── News card ──────────────────────────────────────────────────────
function NewsCard({ article, onSymbolClick }) {
  const s = scoreArticle(article)
  const cls = sentimentClass(s)
  const tone = {
    up:      'border-l-up      hover:bg-up/[0.03]',
    down:    'border-l-down    hover:bg-down/[0.03]',
    neutral: 'border-l-white/[0.10] hover:bg-white/[0.04]',
  }[cls.variant]

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-lg border border-white/[0.06] border-l-4 ${tone} p-3 transition`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-1 leading-snug group-hover:text-accent transition-colors">
            {article.headline}
          </div>
          {article.summary && (
            <div className="text-xs text-ink-3 mt-1 leading-relaxed line-clamp-2">
              {article.summary}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill variant={cls.variant} className="uppercase">{cls.label}</Pill>
            {article.source && (
              <span className="text-2xs text-ink-4 font-medium">{article.source}</span>
            )}
            <span className="text-2xs text-ink-5">·</span>
            <span className="text-2xs text-ink-4 font-mono">
              <Clock size={9} className="inline mr-0.5" />{fmtAgo(article.published_at)}
            </span>
            {article.symbols?.length > 0 && (
              <>
                <span className="text-2xs text-ink-5">·</span>
                <div className="flex items-center gap-0.5 flex-wrap">
                  {article.symbols.slice(0, 5).map((sym) => (
                    <button
                      key={sym}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSymbolClick?.(sym) }}
                      className="text-2xs font-mono font-semibold text-accent hover:text-accent-soft hover:underline transition px-1"
                    >
                      {sym}
                    </button>
                  ))}
                  {article.symbols.length > 5 && (
                    <span className="text-2xs text-ink-5">+{article.symbols.length - 5}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <ExternalLink size={12} className="text-ink-5 group-hover:text-accent shrink-0 mt-1 transition" />
      </div>
    </a>
  )
}

// ── Trending tickers — counted from news article references ────────
function useTrendingTickers(articles, limit = 8) {
  return useMemo(() => {
    const counts = new Map()
    for (const a of articles) {
      for (const sym of (a.symbols || [])) {
        counts.set(sym, (counts.get(sym) || 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([symbol, count]) => ({ symbol, count }))
  }, [articles, limit])
}

// ── Main page ───────────────────────────────────────────────────────
export default function Market() {
  const navigate = useNavigate()
  const { setSymbol } = useSymbol()
  const { market } = useMarket()
  const ctx = useSymbolContextMenu()

  // Market-scoped universes (shadow the module-level US defaults).
  const isIn = market === 'in'
  const INDEX_PROXIES = isIn ? INDEX_PROXIES_IN : INDEX_PROXIES_US
  const MACRO_PROXIES = isIn ? MACRO_PROXIES_IN : MACRO_PROXIES_US
  const SECTOR_ETFS   = isIn ? SECTOR_ETFS_IN   : SECTOR_ETFS_US
  const NEWS_PRESETS  = isIn ? NEWS_PRESETS_IN  : NEWS_PRESETS_US

  const [snapshots, setSnapshots]       = useState({})
  const [cryptoSnaps, setCryptoSnaps]   = useState({})
  const [sparks, setSparks]             = useState({})   // symbol → array of closes
  const [moverTab, setMoverTab]         = useState('gainers')
  const [articles, setArticles]         = useState([])
  const [movers, setMovers]             = useState({ gainers: [], losers: [] })
  const [mostActives, setMostActives]   = useState([])
  const [newsPreset, setNewsPreset]     = useState('all')
  const [newsFilter, setNewsFilter]     = useState('')
  const [customSymbol, setCustomSymbol] = useState('')
  const [loading, setLoading]           = useState(true)
  const [newsLoading, setNewsLoading]   = useState(false)
  const [error, setError]               = useState(null)
  const [updatedAt, setUpdatedAt]       = useState(null)
  const refreshTimer = useRef(null)

  const session = sessionLabel(market)

  function openSymbol(sym) {
    if (!sym) return
    setSymbol(sym)
    navigate(`/analysis/${sym}`)
  }

  async function loadMacro() {
    try {
      const syms = [...INDEX_PROXIES, ...MACRO_PROXIES, ...SECTOR_ETFS].map((x) => x.symbol)
      const r = await api.getSnapshots(syms.join(','))
      setSnapshots(r?.snapshots || {})
    } catch (e) { /* tolerate broker hiccups */ }
  }

  // Intraday-ish sparklines for the index hero cards. Daily closes over ~6 weeks
  // give a clean trend line; fetched once per full refresh (not on the 30s tick).
  async function loadSparks() {
    // Index sparklines come from the US OHLCV cache; Indian indices (^NSEI, …)
    // aren't on that feed, so skip the cosmetic sparkline there.
    if (isIn) { setSparks({}); return }
    try {
      const results = await Promise.allSettled(
        INDEX_PROXIES.map((x) => api.getOhlcv(x.symbol, 42, '1d'))
      )
      const next = {}
      results.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const bars = res.value?.bars || []
          if (bars.length >= 2) next[INDEX_PROXIES[i].symbol] = bars.map((b) => b.c)
        }
      })
      setSparks((prev) => ({ ...prev, ...next }))
    } catch (e) { /* */ }
  }

  async function loadCrypto() {
    try {
      const syms = CRYPTO_PROXIES.map((c) => c.symbol).join(',')
      const r = await api.getCryptoSnapshots(syms)
      setCryptoSnaps(r?.snapshots || {})
    } catch (e) { /* */ }
  }

  async function loadNews(preset = newsPreset, custom = customSymbol) {
    setNewsLoading(true)
    try {
      let symbols = null
      if (custom)              symbols = custom.toUpperCase()
      else {
        const p = NEWS_PRESETS.find((x) => x.id === preset)
        symbols = p?.symbols || null
      }
      const r = await api.getNews(symbols, 40)
      setArticles(r?.articles || [])
    } catch (e) {
      setError(e.message || 'Failed to fetch news')
    } finally { setNewsLoading(false) }
  }

  async function loadMovers() {
    try {
      const r = await api.getMovers(15)
      setMovers({
        gainers: r?.gainers || r?.market_movers?.gainers || [],
        losers:  r?.losers  || r?.market_movers?.losers  || [],
      })
    } catch (e) { /* */ }
  }

  async function loadMostActives() {
    try {
      const r = await api.getMostActives(10)
      setMostActives(r?.most_actives || r?.results || [])
    } catch (e) { /* */ }
  }

  async function loadAll() {
    setLoading(true); setError(null)
    await Promise.allSettled([loadMacro(), loadCrypto(), loadSparks(), loadNews(), loadMovers(), loadMostActives()])
    setUpdatedAt(new Date())
    setLoading(false)
  }

  // Initial load + auto-refresh — macro every 30s, news every 60s.
  // Re-runs when the market switches so every panel reflects the selection.
  useEffect(() => {
    loadAll()
    refreshTimer.current = setInterval(() => {
      loadMacro(); loadCrypto(); loadMovers(); loadMostActives()
    }, 30000)
    const newsTimer = setInterval(() => loadNews(), 60000)
    return () => { clearInterval(refreshTimer.current); clearInterval(newsTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market])

  // Reload news when preset changes
  useEffect(() => { loadNews(newsPreset, '') }, [newsPreset])

  // Trending tickers from current news set
  const trending = useTrendingTickers(articles)

  // Sector performance — sorted best → worst by day change.
  const sectorRows = useMemo(() => {
    return SECTOR_ETFS
      .map((s) => ({ ...s, pct: pctFromSnap(snapshots[s.symbol]) }))
      .filter((s) => s.pct != null)
      .sort((a, b) => b.pct - a.pct)
  }, [snapshots])

  // Market breadth across indices + macro + sectors (a broad-tape proxy).
  const breadth = useMemo(() => {
    let up = 0, down = 0, flat = 0
    for (const snap of Object.values(snapshots)) {
      const p = pctFromSnap(snap)
      if (p == null) continue
      if (p > 0.05) up++
      else if (p < -0.05) down++
      else flat++
    }
    return { up, down, flat }
  }, [snapshots])

  // Movers shown in the tabbed table.
  const moverRows = useMemo(() => {
    if (moverTab === 'gainers') return movers.gainers
    if (moverTab === 'losers')  return movers.losers
    return mostActives
  }, [moverTab, movers, mostActives])

  // Client-side text filter applied to whatever set is loaded
  const filteredArticles = useMemo(() => {
    if (!newsFilter) return articles
    const q = newsFilter.toLowerCase()
    return articles.filter((a) =>
      (a.headline || '').toLowerCase().includes(q) ||
      (a.summary || '').toLowerCase().includes(q) ||
      (a.symbols || []).join(',').toLowerCase().includes(q)
    )
  }, [articles, newsFilter])

  // Sentiment breakdown for the news set
  const sentimentSplit = useMemo(() => {
    let pos = 0, neg = 0, neu = 0
    for (const a of articles) {
      const s = scoreArticle(a)
      if (s > 0) pos++; else if (s < 0) neg++; else neu++
    }
    return { pos, neg, neu, total: articles.length }
  }, [articles])

  function submitCustomSymbol(e) {
    e?.preventDefault?.()
    const v = customSymbol.trim().toUpperCase()
    if (!v) return
    loadNews('custom', v)
  }

  return (
    <PageShell>
      <PageHeader
        icon={Newspaper}
        title="Market"
        subtitle={updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · auto-refresh active` : 'Loading…'}
        badge={<Pill variant={session.variant} className="uppercase">{session.label}</Pill>}
        actions={
          <IconButton icon={RefreshCw} label="Refresh all" onClick={loadAll} className={loading ? 'animate-spin' : ''} />
        }
      />

      <ConceptOfDay />

      {/* ── Index hero cards + market breadth ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
        <div className="lg:col-span-9 grid grid-cols-2 xl:grid-cols-4 gap-3">
          {INDEX_PROXIES.map((x) => (
            <IndexHeroCard
              key={x.symbol}
              {...x}
              snap={snapshots[x.symbol]}
              spark={sparks[x.symbol]}
              onClick={() => openSymbol(x.symbol)}
            />
          ))}
        </div>
        <Card className="lg:col-span-3 p-3.5 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2.5">
            <Activity size={11} className="text-accent" />
            <span className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Market Breadth</span>
          </div>
          <BreadthGauge up={breadth.up} down={breadth.down} flat={breadth.flat} />
          <div className="text-2xs text-ink-5 mt-2.5">Across indices, macro &amp; sector ETFs</div>
        </Card>
      </div>

      {/* ── Commodities / FX + Crypto ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <DollarSign size={11} className="text-accent" />
            <span className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Commodities · Treasuries · FX</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {MACRO_PROXIES.map((x) => (
              <MacroTile key={x.symbol} {...x} snap={snapshots[x.symbol]} onClick={() => openSymbol(x.symbol)} />
            ))}
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Bitcoin size={11} className="text-warn" />
            <span className="text-2xs uppercase tracking-[0.14em] text-ink-4 font-semibold">Crypto</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CRYPTO_PROXIES.map((x) => (
              <CryptoTile key={x.symbol} {...x} snap={cryptoSnaps[x.symbol]} onClick={() => navigate('/crypto')} />
            ))}
          </div>
        </Card>
      </div>

      {/* ── Sector performance + tabbed movers ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card>
          <SectionHeader icon={Layers} title="Sector Performance"
            action={
              <button onClick={() => navigate('/heatmap')} className="text-2xs text-ink-4 hover:text-accent transition">
                Heatmap →
              </button>
            }
          />
          <div className="p-2">
            {sectorRows.length === 0 ? (
              <SkeletonRows count={6} cols={3} />
            ) : (
              sectorRows.map((s) => (
                <SectorRow key={s.symbol} label={s.label} pct={s.pct} onClick={() => openSymbol(s.symbol)} />
              ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader icon={Flame} title="Movers"
            action={
              <button onClick={() => navigate('/movers')} className="text-2xs text-ink-4 hover:text-accent transition">
                All →
              </button>
            }
          />
          <TabStrip
            tabs={[
              ['gainers', 'Gainers', TrendingUp],
              ['losers',  'Losers',  TrendingDown],
              ['actives', 'Active',  BarChart3],
            ]}
            active={moverTab}
            onChange={setMoverTab}
          />
          <div className="max-h-[420px] overflow-y-auto">
            <MoversTable rows={moverRows.slice(0, 12)} onSymbolClick={openSymbol} showVolume={moverTab === 'actives'} />
          </div>
        </Card>
      </div>

      {/* ── Main grid: news + sidebar panels ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* ── News feed (8 cols) ──────────────────────────────── */}
        <div className="lg:col-span-8 space-y-3">
          {/* News controls */}
          <Card className="p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={11} className="text-ink-5" />
              {NEWS_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCustomSymbol(''); setNewsPreset(p.id) }}
                  className={`text-2xs px-2.5 py-1 rounded-md border transition ${
                    newsPreset === p.id && !customSymbol
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : 'bg-white/[0.04] border-white/[0.06] text-ink-3 hover:text-ink-1 hover:bg-white/[0.08]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <form onSubmit={submitCustomSymbol} className="flex items-center gap-1">
                <Input
                  mono
                  className="uppercase !w-32"
                  placeholder="TICKER"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                />
                <button
                  type="submit"
                  className="text-2xs font-medium px-2.5 py-1.5 rounded-md bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition"
                  disabled={!customSymbol.trim()}
                >
                  News for {customSymbol || '…'}
                </button>
              </form>
              <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <Search size={11} className="text-ink-5" />
                <Input
                  className="!py-1 !text-xs"
                  placeholder="Filter headlines…"
                  value={newsFilter}
                  onChange={(e) => setNewsFilter(e.target.value)}
                />
              </div>
              {/* Sentiment ratio bar */}
              {sentimentSplit.total > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex h-1.5 w-28 rounded-full overflow-hidden bg-white/[0.04]" title={`${sentimentSplit.pos} bullish · ${sentimentSplit.neu} neutral · ${sentimentSplit.neg} bearish`}>
                    <div className="bg-up"   style={{ width: `${(sentimentSplit.pos / sentimentSplit.total) * 100}%` }} />
                    <div className="bg-ink-5 opacity-30" style={{ width: `${(sentimentSplit.neu / sentimentSplit.total) * 100}%` }} />
                    <div className="bg-down" style={{ width: `${(sentimentSplit.neg / sentimentSplit.total) * 100}%` }} />
                  </div>
                  <span className="text-2xs font-mono text-ink-4">
                    <span className="text-up">{sentimentSplit.pos}</span>·<span className="text-down">{sentimentSplit.neg}</span>
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* News list */}
          <Card className="overflow-hidden">
            <SectionHeader icon={Newspaper} title={`Headlines (${filteredArticles.length})`}
              action={newsLoading && <RefreshCw size={11} className="animate-spin text-accent" />}
            />
            <div className="p-3 space-y-2 max-h-[800px] overflow-y-auto">
              {newsLoading && articles.length === 0 ? (
                <SkeletonRows count={6} cols={3} />
              ) : error ? (
                <div className="p-6 text-sm text-down">{error}</div>
              ) : filteredArticles.length === 0 ? (
                <EmptyState
                  icon={Newspaper}
                  title="No headlines"
                  body={newsFilter ? `No headlines match "${newsFilter}".` : 'No news available for this filter.'}
                  action={newsFilter ? () => setNewsFilter('') : null}
                  actionLabel="Clear filter"
                />
              ) : (
                filteredArticles.map((a) => (
                  <div key={a.id} onContextMenu={(e) => a.symbols?.[0] && ctx.onContextMenu(e, a.symbols[0])}>
                    <NewsCard article={a} onSymbolClick={openSymbol} />
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ── Right rail (4 cols) ─────────────────────────────── */}
        <div className="lg:col-span-4 space-y-3">
          {/* Trending tickers — derived from news symbol references */}
          {trending.length > 0 && (
            <Card>
              <SectionHeader icon={Sparkles} title="Trending in news" />
              <div className="p-3 grid grid-cols-2 gap-1.5">
                {trending.map((t) => (
                  <button
                    key={t.symbol}
                    onClick={() => openSymbol(t.symbol)}
                    onContextMenu={(e) => ctx.onContextMenu(e, t.symbol)}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.025] border border-white/[0.06] hover:border-accent/40 hover:bg-accent/10 transition"
                  >
                    <span className="font-mono font-semibold text-ink-1 text-sm">{t.symbol}</span>
                    <span className="text-2xs font-mono tabular text-ink-4">{t.count}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Quick links */}
          <Card>
            <SectionHeader icon={Calendar} title="Explore" />
            <div className="p-3 grid grid-cols-2 gap-1.5">
              {[
                ['Earnings',  '/earnings',   Calendar],
                ['Heatmap',   '/heatmap',    Activity],
                ['Screener',  '/screener',   Filter],
                ['Tape',      '/tape',       Zap],
                ['Options',   '/options',    Sparkles],
                ['Crypto',    '/crypto',     Bitcoin],
              ].map(([label, to, Icon]) => (
                <button
                  key={label}
                  onClick={() => navigate(to)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.025] border border-white/[0.06] text-ink-2 hover:text-accent hover:border-accent/40 hover:bg-accent/10 transition text-xs"
                >
                  <Icon size={12} className="text-accent" /> {label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {ctx.menu}
    </PageShell>
  )
}
