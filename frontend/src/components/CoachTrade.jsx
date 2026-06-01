import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ArrowRight, ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2,
  Sparkles, TrendingUp, TrendingDown, Minus, Loader2, FlaskConical, GraduationCap,
  FastForward, HeartPulse,
} from 'lucide-react'
import { api } from '../lib/api'
import { Card, SectionHeader, Button, Pill, Alert, Input } from './ui/primitives'
import Term from './Term'

// ─────────────────────────────────────────────────────────────────────────
// Coach Mode — a beginner-safe guided trade. Fetches REAL analysis data
// (GET /market/analysis/:symbol, public), translates it into plain English
// with tappable <Term> chips, runs honest guardrails (concentration, "don't
// buy the overheated top", don't panic-sell), sizes the position from a risk
// preset, frames a stop-loss as an "automatic exit", and places a clearly
// labelled PRACTICE trade (simulated — no real money, works without login).
//
// Deliberately NOT a buy/sell recommender: it explains and protects, it never
// tells you to trade. Used standalone (pages/Coach.jsx) and as ladder Rung 8.
// ─────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'SPY']
const PRACTICE_CASH = 10000
const STOP_PCT = 0.10 // illustrative auto-exit distance

const ALLOCS = [
  { key: 'cons', label: 'Cautious', pct: 0.05 },
  { key: 'mod',  label: 'Moderate', pct: 0.10 },
  { key: 'bold', label: 'Bold',     pct: 0.25 },
]

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10)

export default function CoachTrade({ onComplete, onBack }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0 pick · 1 read · 2 checklist · 3 size · 4 confirm · 5 done
  const [symInput, setSymInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [data, setData] = useState(null)        // analysis payload
  const [checks, setChecks] = useState({})
  const [allocKey, setAllocKey] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [placedMode, setPlacedMode] = useState('sim') // 'real' | 'sim' | 'sim-anon'
  const [eventChoice, setEventChoice] = useState(null) // 'hold' | 'sell'

  const sym = data?.symbol
  const price = data?.last_price
  const tech = data?.technicals || {}
  const risk = data?.risk || {}
  const overheated = tech.rsi_signal === 'overbought'

  async function loadSymbol(raw) {
    const s = (raw || symInput).trim().toUpperCase()
    if (!s) return
    setLoading(true); setErr(null)
    try {
      const a = await api.getAnalysis(s, false)
      if (!a || a.last_price == null) throw new Error('No data for that symbol')
      setData(a); setStep(1)
    } catch (e) {
      setErr(e?.detail || e?.message || 'Could not find that symbol. Try another, like AAPL.')
    } finally { setLoading(false) }
  }

  // ── derived sizing ──
  const alloc = ALLOCS.find((a) => a.key === allocKey)
  const dollars = alloc ? PRACTICE_CASH * alloc.pct : 0
  const qty = alloc && price ? Math.floor(dollars / price) : 0
  const cost = qty * (price || 0)
  const stopPrice = price ? price * (1 - STOP_PCT) : 0
  const maxLoss = cost * STOP_PCT

  // ── guardrail checklist items (some conditional) ──
  const checklist = [
    { id: 'afford', text: 'This is money I could leave invested for a while — not next month’s rent.' },
    { id: 'concentr', text: 'I understand I’m buying a single company, which is concentrated — higher risk than a basket.' },
    ...(overheated ? [{ id: 'hot', text: 'I can see this looks overheated right now, and I’m choosing to practise anyway.' }] : []),
    { id: 'nopanic', text: 'I know the price can drop, and my plan is to not panic-sell at the first dip.' },
  ]
  const allChecked = checklist.every((c) => checks[c.id])

  // Place the trade. Submits a REAL paper order only when (a) the user is
  // logged in and (b) the platform confirms it's in paper mode — otherwise it
  // stays a safe local simulation. There is no per-order paper flag, so this
  // guard is the only way to be sure we never fire a live order from a learning
  // tool. Any failure (market closed, network) falls back to simulation.
  async function placeTrade() {
    setPlacing(true)
    let mode = 'sim'
    let token = null
    try { token = sessionStorage.getItem('quant_token') } catch { /* ignore */ }
    if (!token) {
      mode = 'sim-anon'
    } else {
      try {
        const ctrl = await api.getControl()
        if (ctrl && ctrl.is_live === false) {
          await api.submitOrder({ symbol: sym, side: 'buy', qty, order_type: 'market', time_in_force: 'day' })
          mode = 'real'
        }
      } catch { mode = 'sim' }
    }
    setPlacedMode(mode)
    setPlacing(false)
    setStep(5)
  }

  function resetAll() {
    setStep(0); setSymInput(''); setData(null); setErr(null); setChecks({})
    setAllocKey(null); setEventChoice(null); setPlacedMode('sim')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button onClick={step === 0 ? onBack : () => setStep((s) => Math.max(0, s - 1))}
          className="text-2xs text-ink-4 hover:text-ink-2 transition inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {step === 0 ? 'Back' : 'Previous'}
        </button>
        <Pill variant="up"><FlaskConical size={10} /> PAPER · practice · no real money</Pill>
      </div>

      {/* progress dots */}
      <div className="flex items-center justify-center gap-1.5 mb-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === Math.min(step, 4) ? 'w-5 bg-accent' : i < step ? 'w-1.5 bg-up' : 'w-1.5 bg-white/15'}`} />
        ))}
      </div>

      {/* ── Step 0 · pick ── */}
      {step === 0 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={Search} title="Step 1 — what would you like to practise trading?" />
          <div className="p-5 md:p-6">
            <p className="text-sm text-ink-2 leading-relaxed">
              Pick a company and we’ll read its real analysis together — in plain English — before you place a single
              (pretend) dollar.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); loadSymbol() }} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                <Input value={symInput} onChange={(e) => setSymInput(e.target.value)} placeholder="Type a ticker — e.g. AAPL"
                  className="pl-9 uppercase" autoFocus />
              </div>
              <Button type="submit" variant="primary" icon={loading ? Loader2 : ArrowRight} disabled={loading || !symInput.trim()}>
                {loading ? 'Reading…' : 'Read it'}
              </Button>
            </form>
            <div className="flex flex-wrap gap-2 mt-3">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => { setSymInput(s); loadSymbol(s) }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] hover:border-accent/40 px-3 py-1 text-xs font-mono text-ink-2 transition">
                  {s}
                </button>
              ))}
            </div>
            {err && <Alert variant="error" className="mt-3">{err}</Alert>}
          </div>
        </Card>
      )}

      {/* ── Step 1 · read the analysis ── */}
      {step === 1 && data && (
        <Card className="overflow-hidden">
          <SectionHeader icon={TrendingUp} title={`Step 2 — what the analysis says about ${sym}`} />
          <div className="p-5 md:p-6">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-display text-xl text-ink-1 font-semibold">{sym}</span>
              <span className="font-mono tabular text-ink-2">{money(price)}</span>
            </div>
            <div className="space-y-2">
              {buildVerdict(data).map((b, i) => <VerdictRow key={i} {...b} />)}
            </div>
            <Alert variant="info" className="mt-4">
              Notice we’re <span className="text-ink-1 font-medium">describing</span>, not telling you to buy. Tap any
              underlined word to learn it. A coach explains and protects — it never barks “BUY”.
            </Alert>
            <div className="flex justify-end mt-4">
              <Button variant="primary" icon={ArrowRight} onClick={() => setStep(2)}>Makes sense — continue</Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 2 · honest checklist ── */}
      {step === 2 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={ShieldCheck} title="Step 3 — a quick honesty check" />
          <div className="p-5 md:p-6">
            <p className="text-sm text-ink-2 leading-relaxed">
              The pros lose less not by being smarter, but by checking themselves first. Tick each only if it’s honestly true.
            </p>
            <div className="space-y-2 mt-4">
              {checklist.map((c) => {
                const on = !!checks[c.id]
                return (
                  <button key={c.id} onClick={() => setChecks((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    className={`w-full text-left rounded-lg border px-3.5 py-3 text-sm transition flex items-start gap-3
                      ${on ? 'bg-up/[0.07] border-up/30 text-ink-1' : 'bg-white/[0.03] border-white/[0.08] text-ink-2 hover:border-accent/40'}`}>
                    <span className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center mt-0.5
                      ${on ? 'border-up bg-up/20 text-up' : 'border-white/20 text-transparent'}`}>
                      <CheckCircle2 size={13} />
                    </span>
                    <span className="flex-1">{c.text}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="primary" icon={ArrowRight} disabled={!allChecked} onClick={() => setStep(3)}>
                {allChecked ? 'I’m clear-eyed — continue' : 'Tick each box to continue'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3 · size it safely ── */}
      {step === 3 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={ShieldCheck} title="Step 4 — size it safely" />
          <div className="p-5 md:p-6">
            <p className="text-sm text-ink-2 leading-relaxed">
              You have a <span className="text-ink-1 font-medium">{money(PRACTICE_CASH)}</span> practice balance. How much of it
              do you want to put into {sym}? Smaller is calmer.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {ALLOCS.map((a) => {
                const on = allocKey === a.key
                return (
                  <button key={a.key} onClick={() => setAllocKey(a.key)}
                    className={`rounded-lg border px-3 py-3 text-center transition
                      ${on ? 'bg-accent/10 border-accent/40' : 'bg-white/[0.03] border-white/[0.08] hover:border-accent/40'}`}>
                    <div className="text-sm font-semibold text-ink-1">{a.label}</div>
                    <div className="text-2xs text-ink-4 mt-0.5">{Math.round(a.pct * 100)}% · {money(PRACTICE_CASH * a.pct)}</div>
                  </button>
                )
              })}
            </div>

            {alloc && qty >= 1 && (
              <div className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2.5">
                <Row label="You'd buy" value={`${qty} share${qty > 1 ? 's' : ''} of ${sym}`} />
                <Row label="Costing about" value={money(cost)} />
                <div className="border-t border-white/[0.06] pt-2.5">
                  <div className="flex items-start gap-2">
                    <ShieldCheck size={15} className="shrink-0 mt-0.5 text-up" />
                    <p className="text-xs text-ink-2 leading-relaxed">
                      Your safety net: set an <Term id="ordertypes">automatic exit</Term> so that if {sym} falls about{' '}
                      <span className="text-ink-1 font-medium">{Math.round(STOP_PCT * 100)}%</span> to{' '}
                      <span className="font-mono text-ink-1">{money(stopPrice)}</span>, it sells itself — capping your loss
                      near <span className="text-down font-medium">{money(maxLoss)}</span> instead of letting it run.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {alloc && qty < 1 && (
              <Alert variant="warn" className="mt-4">One share of {sym} costs more than this slice ({money(dollars)}). Pick a bigger slice or a cheaper stock.</Alert>
            )}

            <div className="flex justify-end mt-4">
              <Button variant="primary" icon={ArrowRight} disabled={!alloc || qty < 1} onClick={() => setStep(4)}>Review the trade</Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 4 · confirm ── */}
      {step === 4 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={FlaskConical} title="Step 5 — your trade, in one sentence" />
          <div className="p-5 md:p-6">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-sm text-ink-2 leading-relaxed">
              Buy <span className="text-ink-1 font-semibold">{qty} share{qty > 1 ? 's' : ''}</span> of{' '}
              <span className="text-ink-1 font-semibold">{sym}</span> at about{' '}
              <span className="font-mono text-ink-1">{money(price)}</span> — and{' '}
              <Term id="ordertypes">auto-sell</Term> if it falls to{' '}
              <span className="font-mono text-ink-1">{money(stopPrice)}</span> to cap the loss near{' '}
              <span className="text-down font-medium">{money(maxLoss)}</span>.
            </div>
            <Alert variant="info" className="mt-3">
              This is a <span className="text-ink-1 font-medium">practice</span> trade — pretend money, zero risk. It’s
              here so the moves feel familiar before any of it is real.
            </Alert>
            <div className="flex justify-end mt-4">
              <Button variant="up" icon={placing ? Loader2 : CheckCircle2} disabled={placing} onClick={placeTrade}>
                {placing ? 'Placing…' : 'Place trade'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 5 · filled ── */}
      {step === 5 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={CheckCircle2} title="Done — your first guided trade" />
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-3 rounded-lg border border-up/30 bg-up/[0.07] p-4">
              <CheckCircle2 size={22} className="text-up shrink-0" />
              <div className="text-sm text-ink-1">
                {placedMode === 'real'
                  ? <>Paper order submitted to your account: <span className="font-semibold">{qty} {sym}</span> at ~{money(price)}.</>
                  : <>Practice order filled: bought <span className="font-semibold">{qty} {sym}</span> at ~{money(price)}.</>}
              </div>
            </div>
            {placedMode === 'real'
              ? <Alert variant="success" className="mt-3">This went to your real <span className="text-ink-1 font-medium">paper</span> account — track it on the Orders page. Still no real money.</Alert>
              : placedMode === 'sim-anon'
                ? <Alert variant="info" className="mt-3">Simulated (you’re not logged in). <span className="text-ink-1 font-medium">Log in</span> to place real paper trades that show up in your account.</Alert>
                : <Alert variant="info" className="mt-3">Simulated practice fill — no order was sent.</Alert>}

            <div className="text-2xs uppercase tracking-wider text-ink-4 mt-5 mb-2">What to watch now</div>
            <div className="space-y-2 text-sm text-ink-2">
              <Watch text="Don’t check it every five minutes — the wiggle is normal and watching it invites panic." />
              <Watch text={`If it slides toward ${money(stopPrice)}, your auto-exit is the plan working, not a failure.`} />
              <Watch text="A green day doesn’t make you a genius and a red one doesn’t make you a fool. Zoom out." />
            </div>

            <div className="mt-5 rounded-lg border border-warn/25 bg-warn/[0.05] p-4">
              <div className="flex items-center gap-2 text-sm text-ink-1 font-medium"><HeartPulse size={15} className="text-warn" /> Want to feel the hard part?</div>
              <p className="text-xs text-ink-3 mt-1 leading-relaxed">The real test isn’t buying — it’s what you do when it drops. Fast-forward a few weeks and find out, safely.</p>
              <div className="mt-3">
                <Button variant="primary" size="sm" icon={FastForward} onClick={() => setStep(6)}>Fast-forward a few weeks</Button>
              </div>
            </div>

            <FinalActions onComplete={onComplete} onReset={resetAll} navigate={navigate} />
          </div>
        </Card>
      )}

      {/* ── Step 6 · the drop (emotional muscle) ── */}
      {step === 6 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={TrendingDown} title="A few weeks later…" />
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-3 rounded-lg border border-down/30 bg-down/[0.07] p-4">
              <TrendingDown size={22} className="text-down shrink-0" />
              <div className="text-sm text-ink-1">
                {sym} has dropped to <span className="font-mono">{money(price * 0.88)}</span> — your position is{' '}
                <span className="text-down font-semibold">down about 12%</span>. The headlines are scary. Your stomach is in a knot.
              </div>
            </div>
            <p className="text-sm text-ink-2 leading-relaxed mt-4">This is the exact moment that separates investors from gamblers. What do you do?</p>
            <div className="space-y-2 mt-4">
              <button onClick={() => { setEventChoice('sell'); setStep(7) }}
                className="w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-down/40 px-3.5 py-3 text-sm text-ink-2 transition">
                Sell now — make the pain stop
              </button>
              <button onClick={() => { setEventChoice('hold'); setStep(7) }}
                className="w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-up/40 px-3.5 py-3 text-sm text-ink-2 transition">
                Hold — stick to the plan and breathe
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 7 · the lesson ── */}
      {step === 7 && (
        <Card className="overflow-hidden">
          <SectionHeader icon={HeartPulse} title="What happened next" />
          <div className="p-5 md:p-6">
            {eventChoice === 'hold' ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-up/30 bg-up/[0.07] p-4">
                  <TrendingUp size={22} className="text-up shrink-0" />
                  <div className="text-sm text-ink-1">You held. The panic faded, buyers returned, and {sym} recovered to <span className="font-mono">{money(price * 1.06)}</span> — now <span className="text-up font-semibold">up about 6%</span>.</div>
                </div>
                <p className="text-sm text-ink-2 leading-relaxed mt-4">
                  This is the whole game. The drop felt like danger; it was just noise. Remember from your journey: the hard part isn’t picking winners — <span className="text-ink-1 font-medium">it’s not flinching</span>. You just practised the single most valuable skill in investing.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-down/30 bg-down/[0.07] p-4">
                  <TrendingDown size={22} className="text-down shrink-0" />
                  <div className="text-sm text-ink-1">You sold and locked in the <span className="text-down font-semibold">12% loss</span>. Weeks later {sym} recovered past where you bought — without you on board.</div>
                </div>
                <p className="text-sm text-ink-2 leading-relaxed mt-4">
                  No shame — almost every beginner does this once. That’s the lesson: the loss only became real when fear made you sell at the bottom. Next time, the plan (and your auto-exit) decides — not the panic. <span className="text-ink-1 font-medium">Not flinching</span> is a muscle, and you just trained it.
                </p>
              </>
            )}
            <FinalActions onComplete={onComplete} onReset={resetAll} navigate={navigate} />
          </div>
        </Card>
      )}
    </div>
  )
}

// ── verdict synthesis: analysis JSON → plain-English bullets ──────────────
function buildVerdict(a) {
  const t = a.technicals || {}, r = a.risk || {}, sc = a.score || {}, at = a.analyst_targets || {}
  const sym = a.symbol
  const out = []

  // Trend
  if (t.trend === 'bullish') {
    out.push({ tone: 'good', node: <>{sym} is in an <Term id="trend">uptrend</Term>{t.above_sma200 ? <>, trading above its long-term <Term id="ma">trend line</Term> — a healthy sign</> : ''}.</> })
  } else if (t.trend === 'bearish') {
    out.push({ tone: 'caution', node: <>{sym} is in a <Term id="trend">downtrend</Term> — it has been falling, so you’d be catching a falling knife.</> })
  } else {
    out.push({ tone: 'neutral', node: <>{sym} is drifting <Term id="trend">sideways</Term> with no clear trend right now.</> })
  }

  // RSI
  if (t.rsi14 != null) {
    if (t.rsi_signal === 'overbought') out.push({ tone: 'caution', node: <>It looks <Term id="rsi">overheated</Term> (RSI {round1(t.rsi14)}). Buying right after a hot run is a classic beginner trap.</> })
    else if (t.rsi_signal === 'oversold') out.push({ tone: 'neutral', node: <>It’s been <Term id="rsi">beaten down</Term> (RSI {round1(t.rsi14)}) — it could bounce, or keep falling.</> })
    else out.push({ tone: 'good', node: <>Momentum looks <Term id="rsi">healthy</Term>, not overheated (RSI {round1(t.rsi14)}).</> })
  }

  // Beta / how wild the ride
  if (r.beta_vs_spy != null) {
    if (r.beta_vs_spy > 1.2) out.push({ tone: 'caution', node: <>It’s <Term id="beta">racier than the market</Term> (beta {round1(r.beta_vs_spy)}) — expect bigger swings both ways.</> })
    else if (r.beta_vs_spy < 0.8) out.push({ tone: 'good', node: <>It’s <Term id="beta">calmer than the market</Term> (beta {round1(r.beta_vs_spy)}) — a smoother ride.</> })
    else out.push({ tone: 'neutral', node: <>It moves roughly <Term id="beta">in line with the market</Term> (beta {round1(r.beta_vs_spy)}).</> })
  }

  // Analyst upside
  if (at.target_mean_upside_pct != null) {
    const u = round1(at.target_mean_upside_pct)
    if (u > 5) out.push({ tone: 'good', node: <>Analysts see about <span className="font-medium text-ink-1">{u}% upside</span> to their average target.</> })
    else if (u < 0) out.push({ tone: 'caution', node: <>Analysts’ average target sits <span className="font-medium text-ink-1">below</span> today’s price.</> })
    else out.push({ tone: 'neutral', node: <>Analysts see only <span className="font-medium text-ink-1">limited upside</span> from here.</> })
  }

  // Overall quality
  if (sc.verdict) out.push({ tone: 'neutral', node: <>Overall quality score: <span className="font-medium text-ink-1">{sc.verdict}</span>{sc.overall != null ? <> ({Math.round(sc.overall)}/100)</> : ''}.</> })

  return out
}

function VerdictRow({ tone, node }) {
  const cfg = {
    good:    { Icon: TrendingUp,    cls: 'border-up/25 bg-up/[0.05]',     ic: 'text-up' },
    caution: { Icon: AlertTriangle, cls: 'border-warn/25 bg-warn/[0.05]', ic: 'text-warn' },
    neutral: { Icon: Minus,         cls: 'border-white/[0.08] bg-white/[0.02]', ic: 'text-ink-4' },
  }[tone] || {}
  const Icon = cfg.Icon || Minus
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border ${cfg.cls} px-3.5 py-2.5`}>
      <Icon size={15} className={`shrink-0 mt-0.5 ${cfg.ic}`} />
      <p className="text-sm text-ink-2 leading-relaxed">{node}</p>
    </div>
  )
}

function FinalActions({ onComplete, onReset, navigate }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-white/[0.06]">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onReset}>Practise another</Button>
        <Button variant="ghost" size="sm" icon={ArrowRight} onClick={() => navigate('/paper')}>Real paper trading →</Button>
      </div>
      {onComplete && <Button variant="primary" icon={GraduationCap} onClick={onComplete}>Finish rung 🎓</Button>}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-4">{label}</span>
      <span className="text-ink-1 font-medium">{value}</span>
    </div>
  )
}

function Watch({ text }) {
  return (
    <div className="flex items-start gap-2">
      <Sparkles size={13} className="shrink-0 mt-0.5 text-accent" />
      <span className="leading-relaxed">{text}</span>
    </div>
  )
}
