import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ResponsiveContainer, LineChart, Line } from 'recharts'
import {
  GraduationCap, Lock, Check, CheckCircle2, ArrowRight, RotateCcw,
  Smartphone, Map, Compass, Sparkles, ExternalLink, Wand2, BookOpen, Layers,
} from 'lucide-react'
import { PageShell, PageHeader, Card, SectionHeader, Button, Pill, Alert, TabStrip } from '../components/ui/primitives'
import { RUNGS, RUNG_STEPS } from '../lib/learnContent'
import { TOPICS, TOPIC_STEPS } from '../lib/learnTopics'
import FieldGuide from '../components/FieldGuide'
import CoachTrade from '../components/CoachTrade'

// ─────────────────────────────────────────────────────────────────────────
// Learn — a self-paced ladder from "I've never bought a stock" to flying solo.
//
// Principles: start from everyday life, a no-numbers/no-charts ground floor,
// radical honesty about losing & fear, meet-you-where-you-are placement, and
// bite-sized steps. Every rung runs through one player (RungPlayer) over a list
// of typed steps authored in lib/learnContent.js. Progress is local-only.
// ─────────────────────────────────────────────────────────────────────────

const PROGRESS_KEY = 'quant_learn_progress_v2'

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null') } catch { return null }
}
function saveProgress(p) {
  try { if (p) localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); else localStorage.removeItem(PROGRESS_KEY) }
  catch { /* ignore */ }
}

const COLOR_HEX = { accent: '#3b82f6', up: '#22c55e', down: '#ef4444', warn: '#f59e0b', info: '#06b6d4' }

// Flat index of every quiz/chart step across rungs + topics, keyed by concept,
// so a stumbled concept can be pulled up for a quick review.
const ALL_QUIZ_BY_CONCEPT = (() => {
  const m = {}
  const add = (steps) => (steps || []).forEach((s) => {
    if ((s.type === 'quiz' || s.type === 'chart') && s.concept) m[s.concept] = s
  })
  Object.values(RUNG_STEPS).forEach(add)
  Object.values(TOPIC_STEPS).forEach(add)
  return m
})()

export default function Learn() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(() => loadProgress())
  const [view, setView] = useState(progress ? 'ladder' : 'placement') // placement | ladder | player
  const [activeRung, setActiveRung] = useState(null)
  const [activeTopic, setActiveTopic] = useState(null)
  const [reviewStep, setReviewStep] = useState(null)
  const [sp] = useSearchParams()
  const initTab = sp.get('tab')
  const [tab, setTab] = useState(initTab === 'guide' ? 'guide' : initTab === 'topics' ? 'topics' : 'journey') // journey | topics | guide
  const initialTermId = sp.get('term') || null

  useEffect(() => { saveProgress(progress) }, [progress])

  // Keep progress in sync across open tabs/windows (no backend needed).
  useEffect(() => {
    function onStorage(e) { if (e.key === PROGRESS_KEY) setProgress(loadProgress()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const completed = progress?.completed || []
  const steps = progress?.steps || {}     // { rungId: furthest step index reached }

  // ground is always open; each later rung opens once the previous is complete.
  const unlockedThrough = useMemo(() => {
    let idx = 0
    for (let i = 1; i < RUNGS.length; i++) {
      if (completed.includes(RUNGS[i - 1].id)) idx = i; else break
    }
    return idx
  }, [completed])

  function begin(level) {
    const p = { completed: [], steps: {}, placement: level, started: true }
    setProgress(p)
    if (level === 'zero') { setActiveRung('ground'); setView('player') }
    else setView('ladder')
  }

  function openRung(rung, idx) {
    if (idx > unlockedThrough) return
    setActiveRung(rung.id); setView('player')
  }

  function setStep(rungId, stepIdx) {
    setProgress((p) => ({ ...(p || {}), steps: { ...(p?.steps || {}), [rungId]: Math.max(stepIdx, p?.steps?.[rungId] || 0) } }))
  }

  function completeRung(rungId) {
    setProgress((p) => ({
      ...(p || { steps: {}, placement: 'some', started: true }),
      completed: Array.from(new Set([...(p?.completed || []), rungId])),
    }))
    setView('ladder')
  }

  // Adaptive remediation: remember concepts the learner got wrong (picked a
  // non-intuitive answer) and clear them once they nail it on review.
  const reviewable = (progress?.stumbles || []).filter((c) => ALL_QUIZ_BY_CONCEPT[c])
  function recordAnswer(concept, correct) {
    if (!concept) return
    setProgress((p) => {
      const base = p || { completed: [], steps: {}, placement: 'browse', started: true }
      const set = new Set(base.stumbles || [])
      if (correct) set.delete(concept); else set.add(concept)
      return { ...base, stumbles: Array.from(set) }
    })
  }
  function openReview(concept) {
    const s = ALL_QUIZ_BY_CONCEPT[concept]
    if (s) setReviewStep(s)
  }

  function completeTopic(topicId) {
    setProgress((p) => ({
      ...(p || { completed: [], steps: {}, placement: 'browse', started: true }),
      topics: Array.from(new Set([...(p?.topics || []), topicId])),
    }))
    setActiveTopic(null)
  }

  function resetAll() {
    setProgress(null); setView('placement'); setActiveRung(null); setActiveTopic(null)
  }

  const headerBadge = progress
    ? <Pill variant="accent"><Sparkles size={10} /> {completed.length} / {RUNGS.length} rungs</Pill>
    : null

  return (
    <PageShell>
      <PageHeader
        icon={GraduationCap}
        title="Learn"
        subtitle="From “I’ve never bought a stock” to flying solo — one small idea at a time, at your own pace."
        badge={headerBadge}
        actions={tab === 'journey' && progress && view !== 'placement'
          ? <Button variant="ghost" size="sm" icon={RotateCcw} onClick={resetAll}>Start over</Button>
          : null}
      />

      {reviewStep ? (
        <ReviewPlayer step={reviewStep} onAnswered={recordAnswer} onDone={() => setReviewStep(null)} />
      ) : (
        <>
          <div className="max-w-3xl mx-auto mb-4">
            <TabStrip
              tabs={[['journey', 'Your journey', GraduationCap], ['topics', 'Topics', Layers], ['guide', 'Field guide', BookOpen]]}
              active={tab}
              onChange={(t) => { setTab(t); setActiveTopic(null) }}
            />
          </div>

          {tab === 'guide' && <FieldGuide initialTermId={initialTermId} />}

          {tab === 'topics' && !activeTopic && (
            <>
              <div className="max-w-3xl mx-auto"><ReviewPanel concepts={reviewable} onPick={openReview} /></div>
              <TopicList topics={TOPICS} done={progress?.topics || []} onOpen={setActiveTopic} />
            </>
          )}

          {tab === 'topics' && activeTopic && (
            <RungPlayer
              rung={{ title: TOPICS.find((t) => t.id === activeTopic)?.title }}
              steps={TOPIC_STEPS[activeTopic] || []}
              startAt={0}
              onStep={() => {}}
              onAnswered={recordAnswer}
              onComplete={() => completeTopic(activeTopic)}
              onSkip={() => completeTopic(activeTopic)}
              onBack={() => setActiveTopic(null)}
              onGoPlatform={(to) => navigate(to)}
            />
          )}

          {tab === 'journey' && view === 'placement' && <Placement onPick={begin} />}

          {tab === 'journey' && view === 'ladder' && (
            <>
              <div className="max-w-3xl mx-auto"><ReviewPanel concepts={reviewable} onPick={openReview} /></div>
              <Ladder completed={completed} steps={steps} unlockedThrough={unlockedThrough} onOpen={openRung} />
            </>
          )}

          {tab === 'journey' && view === 'player' && activeRung === 'coach' && (
            <CoachTrade onComplete={() => completeRung('coach')} onBack={() => setView('ladder')} />
          )}

          {tab === 'journey' && view === 'player' && activeRung && activeRung !== 'coach' && (
            <RungPlayer
              rung={RUNGS.find((r) => r.id === activeRung)}
              steps={RUNG_STEPS[activeRung] || []}
              startAt={completed.includes(activeRung) ? 0 : (steps[activeRung] || 0)}
              onStep={(i) => setStep(activeRung, i)}
              onAnswered={recordAnswer}
              onComplete={() => completeRung(activeRung)}
              onSkip={() => completeRung(activeRung)}
              onBack={() => setView('ladder')}
              onGoPlatform={(to) => navigate(to)}
            />
          )}
        </>
      )}
    </PageShell>
  )
}

// ── Placement ────────────────────────────────────────────────────────────
function Placement({ onPick }) {
  const options = [
    { level: 'zero', icon: Smartphone, title: "I'm brand new", variant: 'primary', cta: 'Start from zero',
      body: "I've never bought a stock and the words are foreign. Start me at the very beginning." },
    { level: 'some', icon: Map, title: 'I know a little', variant: 'ghost', cta: 'Show me the map',
      body: 'I get the basics. Show me the whole map and let me skip anything I already know.' },
    { level: 'browse', icon: Compass, title: 'Just looking', variant: 'ghost', cta: 'Browse the ladder',
      body: 'I want to see the journey first before committing to anything.' },
  ]
  return (
    <div className="max-w-3xl mx-auto">
      <Card className="overflow-hidden mb-4">
        <div className="p-5 md:p-6">
          <h2 className="font-display text-lg md:text-xl text-ink-1 font-semibold">Where are you starting from?</h2>
          <p className="text-sm text-ink-3 mt-1.5 leading-relaxed">
            There are no wrong answers here, and nothing real is ever on the line. Pick the rung that feels honest —
            you can always move faster or slower later.
          </p>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((o) => (
          <Card key={o.level} hover className="overflow-hidden flex flex-col">
            <div className="p-5 flex-1">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 text-accent mb-3">
                <o.icon size={18} />
              </span>
              <div className="font-display font-semibold text-ink-1">{o.title}</div>
              <p className="text-xs text-ink-3 mt-1.5 leading-relaxed">{o.body}</p>
            </div>
            <div className="px-5 pb-5">
              <Button variant={o.variant} size="sm" icon={ArrowRight} className="w-full" onClick={() => onPick(o.level)}>{o.cta}</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Ladder ───────────────────────────────────────────────────────────────
function Ladder({ completed, steps, unlockedThrough, onOpen }) {
  return (
    <div className="max-w-3xl mx-auto space-y-2.5">
      <Alert variant="info" className="mb-1">
        Climb at your own pace. A rung unlocks once you finish the one below it — but you can always
        <span className="text-ink-1 font-medium"> tap “I already know this” inside a rung to skip ahead.</span>
      </Alert>
      {RUNGS.map((r, idx) => {
        const done = completed.includes(r.id)
        const locked = idx > unlockedThrough
        const total = (RUNG_STEPS[r.id] || []).length
        const at = Math.min(steps[r.id] || 0, total)
        const inProgress = !done && at > 0
        const subtitle = inProgress ? `${at} of ${total} steps explored` : r.blurb
        return (
          <button key={r.id} onClick={() => onOpen(r, idx)} disabled={locked}
            className={`w-full text-left group ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <Card hover={!locked} className={`overflow-hidden transition ${locked ? 'opacity-45' : ''}`}>
              <div className="flex items-center gap-3.5 p-4">
                <span className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl border
                  ${done ? 'bg-up/10 border-up/30 text-up'
                    : locked ? 'bg-white/[0.03] border-white/[0.06] text-ink-5'
                    : 'bg-accent/10 border-accent/25 text-accent'}`}>
                  {done ? <CheckCircle2 size={19} /> : locked ? <Lock size={16} /> : <r.icon size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-mono text-ink-5">RUNG {r.n}</span>
                    {done && <Pill variant="up">Done</Pill>}
                    {!done && !locked && idx === unlockedThrough && <Pill variant="accent">You’re here</Pill>}
                  </div>
                  <div className="font-display font-semibold text-ink-1 leading-tight mt-0.5">{r.title}</div>
                  <div className="text-xs text-ink-3 mt-1 leading-relaxed line-clamp-2">{subtitle}</div>
                </div>
                {!locked && <ArrowRight size={16} className="shrink-0 text-ink-4 group-hover:text-accent transition" />}
              </div>
              {inProgress && total > 0 && (
                <div className="h-1 bg-white/[0.04]">
                  <div className="h-full bg-brand-grad" style={{ width: `${(at / total) * 100}%` }} />
                </div>
              )}
            </Card>
          </button>
        )
      })}
    </div>
  )
}

// ── Adaptive review (resurfaces concepts you stumbled on) ────────────────
function ReviewPanel({ concepts, onPick }) {
  if (!concepts || concepts.length === 0) return null
  return (
    <Card className="overflow-hidden mb-3 border border-warn/20">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <RotateCcw size={14} className="text-warn" />
          <span className="font-display font-semibold text-ink-1 text-sm">Worth another look</span>
        </div>
        <p className="text-xs text-ink-3 mt-1 leading-relaxed">A few ideas you found tricky. Tap one for a quick, painless revisit — nail it and it drops off this list.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {concepts.map((c) => (
            <button key={c} onClick={() => onPick(c)}
              className="rounded-full border border-warn/30 bg-warn/[0.06] hover:bg-warn/[0.12] px-3 py-1.5 text-xs text-ink-1 transition">
              {c}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

function ReviewPlayer({ step, onAnswered, onDone }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onDone} className="text-2xs text-ink-4 hover:text-ink-2 transition">← Back</button>
        <Pill variant="warn"><RotateCcw size={10} /> Quick review</Pill>
      </div>
      <StepView step={step} idx={0} total={1} isLast={true} onNext={onDone} onAnswered={onAnswered} onGoPlatform={() => {}} />
    </div>
  )
}

// ── Topic list (breadth deep-dives) ──────────────────────────────────────
function TopicList({ topics, done, onOpen }) {
  return (
    <div className="max-w-3xl mx-auto space-y-2.5">
      <Alert variant="info" className="mb-1">
        Bite-sized 2-minute deep-dives on the things you’ll meet most. Take them in any order — they pair with the
        <span className="text-ink-1 font-medium"> Field guide</span> for when you just need a quick definition.
      </Alert>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {topics.map((t) => {
          const isDone = done.includes(t.id)
          const total = (TOPIC_STEPS[t.id] || []).length
          return (
            <button key={t.id} onClick={() => onOpen(t.id)} className="text-left group">
              <Card hover className="overflow-hidden h-full">
                <div className="flex items-start gap-3 p-4">
                  <span className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border
                    ${isDone ? 'bg-up/10 border-up/30 text-up' : 'bg-accent/10 border-accent/25 text-accent'}`}>
                    {isDone ? <CheckCircle2 size={18} /> : <t.icon size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-display font-semibold text-ink-1 leading-tight">{t.title}</div>
                      {isDone && <Pill variant="up">Done</Pill>}
                    </div>
                    <div className="text-xs text-ink-3 mt-1 leading-relaxed">{t.blurb}</div>
                    <div className="text-2xs text-ink-5 mt-1.5">{total} quick questions</div>
                  </div>
                </div>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── RungPlayer — runs one rung's steps ───────────────────────────────────
function RungPlayer({ rung, steps, startAt, onStep, onComplete, onSkip, onBack, onGoPlatform, onAnswered }) {
  const [idx, setIdx] = useState(Math.min(startAt, Math.max(steps.length - 1, 0)))
  const step = steps[idx]
  const isLast = idx === steps.length - 1

  useEffect(() => { onStep(idx) }, [idx]) // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (!isLast) setIdx((i) => i + 1)
    else onComplete()
  }

  if (!step) return null

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="text-2xs text-ink-4 hover:text-ink-2 transition">← Ladder</button>
        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-accent' : i < idx ? 'w-1.5 bg-up' : 'w-1.5 bg-white/15'}`} />
          ))}
        </div>
        <button onClick={onSkip} className="text-2xs text-ink-4 hover:text-ink-2 transition">I already know this →</button>
      </div>

      <StepView
        key={idx} step={step} idx={idx} total={steps.length} isLast={isLast}
        rungTitle={rung.title} onNext={next} onGoPlatform={onGoPlatform} onAnswered={onAnswered}
      />
    </div>
  )
}

// ── Step dispatcher ──────────────────────────────────────────────────────
function StepView(props) {
  switch (props.step.type) {
    case 'quiz':
    case 'chart':     return <QuizStep {...props} />
    case 'decision':  return <DecisionStep {...props} />
    case 'character': return <CharacterStep {...props} />
    case 'breakit':   return <BreakItStep {...props} />
    case 'builder':   return <BuilderStep {...props} />
    case 'recap':     return <RecapStep {...props} />
    default:          return null
  }
}

function NextBtn({ isLast, onNext, label }) {
  return (
    <div className="flex justify-end mt-4">
      <Button variant="primary" icon={ArrowRight} onClick={onNext}>
        {label || (isLast ? 'Finish this rung' : 'Next')}
      </Button>
    </div>
  )
}

function MiniChart({ series, height = 140 }) {
  // Merge parallel numeric arrays into recharts rows; axes hidden on purpose.
  const len = Math.max(...series.map((s) => s.data.length))
  const rows = Array.from({ length: len }).map((_, i) => {
    const row = { i }
    series.forEach((s, k) => { row[`s${k}`] = s.data[i] })
    return row
  })
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          {series.map((s, k) => (
            <Line key={k} type="monotone" dataKey={`s${k}`} stroke={COLOR_HEX[s.color] || COLOR_HEX.accent}
              strokeWidth={2.5} dot={false} isAnimationActive={true} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="text-2xs text-ink-5 text-center mt-1">← past · time · now →  (numbers hidden on purpose — read the shape)</div>
    </div>
  )
}

// ── Quiz / Chart step ────────────────────────────────────────────────────
function QuizStep({ step, idx, total, isLast, onNext, onAnswered }) {
  const [picked, setPicked] = useState(null)
  const answered = picked != null
  function choose(c) { setPicked(c); onAnswered?.(step.concept, !!c.gut) }
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title={`Step ${idx + 1} of ${total}`} />
      <div className="p-5 md:p-6">
        <p className="text-sm text-ink-2 leading-relaxed">{step.scene}</p>
        {step.chart && <div className="mt-4"><MiniChart series={step.chart.series} /></div>}
        <h3 className="font-display text-base md:text-lg text-ink-1 font-semibold mt-4 leading-snug">{step.q}</h3>

        <div className="space-y-2 mt-4">
          {step.choices.map((c) => {
            const isPicked = picked?.v === c.v
            return (
              <button key={c.v} disabled={answered} onClick={() => choose(c)}
                className={`w-full text-left rounded-lg border px-3.5 py-3 text-sm transition flex items-center gap-3
                  ${isPicked ? 'bg-accent/10 border-accent/40 text-ink-1'
                    : answered ? 'bg-white/[0.02] border-white/[0.06] text-ink-3 opacity-70'
                    : 'bg-white/[0.03] border-white/[0.08] text-ink-2 hover:border-accent/40 hover:bg-white/[0.05] cursor-pointer'}`}>
                <span className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-2xs
                  ${isPicked ? 'border-accent text-accent' : 'border-white/20 text-ink-5'}`}>
                  {isPicked ? <Check size={12} /> : c.v.toUpperCase()}
                </span>
                <span className="flex-1">{c.label}</span>
              </button>
            )
          })}
        </div>

        {answered && (
          <div className="mt-5">
            <div className="rounded-lg border border-up/25 bg-up/[0.06] p-4">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Pill variant="up"><Check size={10} /> {step.concept}</Pill>
                {picked?.gut && <span className="text-2xs text-ink-4">— the intuition most people reach for, and it’s right.</span>}
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">{step.reveal}</p>
            </div>
            <NextBtn isLast={isLast} onNext={onNext} />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Decision step ────────────────────────────────────────────────────────
function DecisionStep({ step, idx, total, isLast, onNext }) {
  const [picked, setPicked] = useState(null)
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title={`Step ${idx + 1} of ${total} — your call`} />
      <div className="p-5 md:p-6">
        <p className="text-sm text-ink-2 leading-relaxed">{step.scene}</p>
        <h3 className="font-display text-base md:text-lg text-ink-1 font-semibold mt-4 leading-snug">{step.q}</h3>

        <div className="space-y-2 mt-4">
          {step.options.map((o) => {
            const isPicked = picked?.v === o.v
            const dim = picked && !isPicked
            return (
              <button key={o.v} disabled={!!picked} onClick={() => setPicked(o)}
                className={`w-full text-left rounded-lg border px-3.5 py-3 text-sm transition
                  ${isPicked ? 'bg-accent/10 border-accent/40 text-ink-1'
                    : dim ? 'bg-white/[0.02] border-white/[0.06] text-ink-3 opacity-60'
                    : 'bg-white/[0.03] border-white/[0.08] text-ink-2 hover:border-accent/40 hover:bg-white/[0.05] cursor-pointer'}`}>
                {o.label}
              </button>
            )
          })}
        </div>

        {picked && (
          <div className="mt-5">
            <div className={`rounded-lg border p-4 ${picked.tone === 'up' ? 'border-up/25 bg-up/[0.06]' : picked.tone === 'down' ? 'border-down/25 bg-down/[0.06]' : 'border-warn/25 bg-warn/[0.06]'}`}>
              <div className="flex items-center gap-3 mb-3">
                <Outcome label="Your choice" pct={picked.you} />
                <span className="text-ink-5 text-xs">vs</span>
                <Outcome label="The alternative" pct={picked.baseline} muted />
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">{picked.verdict}</p>
              <p className="text-xs text-ink-3 leading-relaxed mt-2 flex items-start gap-1.5">
                <Sparkles size={12} className="shrink-0 mt-0.5 text-accent" /> <span>{picked.lesson}</span>
              </p>
            </div>
            <NextBtn isLast={isLast} onNext={onNext} />
          </div>
        )}
      </div>
    </Card>
  )
}

function Outcome({ label, pct, muted }) {
  const up = pct >= 0
  return (
    <div className={`rounded-lg border px-3 py-2 ${muted ? 'border-white/[0.06] bg-white/[0.02]' : up ? 'border-up/25 bg-up/10' : 'border-down/25 bg-down/10'}`}>
      <div className="text-2xs uppercase tracking-wider text-ink-4">{label}</div>
      <div className={`font-mono tabular font-semibold text-lg leading-tight ${muted ? 'text-ink-3' : up ? 'text-up' : 'text-down'}`}>
        {up ? '+' : ''}{pct}%
      </div>
    </div>
  )
}

// ── Character step ───────────────────────────────────────────────────────
function CharacterStep({ step, idx, total, isLast, onNext }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title={`Step ${idx + 1} of ${total} — meet a character`} />
      <div className="p-5 md:p-6">
        <div className="flex items-center gap-4">
          <span className={`shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-2xl border
            ${step.color === 'up' ? 'bg-up/10 border-up/30 text-up' : step.color === 'info' ? 'bg-info/10 border-info/30 text-info' : 'bg-warn/10 border-warn/30 text-warn'}`}>
            <step.icon size={26} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-xl text-ink-1 font-semibold">{step.name}</div>
            <div className="text-sm text-ink-3">{step.alias}</div>
          </div>
          <div className="ml-auto"><MiniSpark data={step.spark} color={step.color} /></div>
        </div>

        <div className="grid gap-2.5 mt-5">
          <Trait label="Superpower" tone="up" text={step.superpower} />
          <Trait label="Fatal flaw" tone="down" text={step.flaw} />
          <Trait label="Shines when" tone="accent" text={step.bestWhen} />
        </div>
        <NextBtn isLast={isLast} onNext={onNext} label="Next" />
      </div>
    </Card>
  )
}

function Trait({ label, tone, text }) {
  const c = tone === 'up' ? 'border-up/25 bg-up/[0.05]' : tone === 'down' ? 'border-down/25 bg-down/[0.05]' : 'border-accent/25 bg-accent/[0.05]'
  const t = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-accent'
  return (
    <div className={`rounded-lg border ${c} px-3.5 py-2.5`}>
      <div className={`text-2xs uppercase tracking-wider font-semibold ${t}`}>{label}</div>
      <p className="text-sm text-ink-2 leading-relaxed mt-0.5">{text}</p>
    </div>
  )
}

function MiniSpark({ data, color }) {
  const rows = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width={92} height={44}>
      <LineChart data={rows} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={COLOR_HEX[color] || COLOR_HEX.accent} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Break-it step (rung 5) ───────────────────────────────────────────────
function BreakItStep({ step, idx, total, isLast, onNext }) {
  const [revealed, setRevealed] = useState([])  // indices of variants shown
  const allShown = revealed.length === step.variants.length
  function reveal(i) { setRevealed((r) => (r.includes(i) ? r : [...r, i])) }
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title={`Step ${idx + 1} of ${total} — find its kryptonite`} />
      <div className="p-5 md:p-6">
        <p className="text-sm text-ink-2 leading-relaxed">{step.intro}</p>

        <div className="grid gap-2 mt-4">
          <ResultBar label={step.base.label} pct={step.base.pct} tone="up" big />
          <ResultBar label={step.bench.label} pct={step.bench.pct} tone="muted" />
        </div>

        <div className="mt-5">
          <div className="text-2xs uppercase tracking-wider text-ink-4 mb-2">Now run the exact same rule on a different basket:</div>
          <div className="grid gap-2">
            {step.variants.map((v, i) => (
              revealed.includes(i)
                ? <ResultBar key={i} label={v.label} pct={v.pct} tone="down" dead={v.dead} />
                : <button key={i} onClick={() => reveal(i)}
                    className="w-full text-left rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-accent/40 hover:bg-white/[0.05] px-3.5 py-3 text-sm text-ink-2 transition flex items-center justify-between">
                    <span>{v.label}</span>
                    <span className="text-2xs text-ink-4">tap to reveal →</span>
                  </button>
            ))}
          </div>
        </div>

        {allShown && (
          <div className="mt-5">
            <Alert variant="warn" title="The lesson">{step.lesson}</Alert>
            <NextBtn isLast={isLast} onNext={onNext} />
          </div>
        )}
      </div>
    </Card>
  )
}

function ResultBar({ label, pct, tone, dead, big }) {
  const up = pct >= 0
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink-3'
  const barColor = tone === 'up' ? 'bg-up/40' : tone === 'down' ? 'bg-down/40' : 'bg-white/15'
  const width = Math.min(100, Math.abs(pct) / 5.5) // 550% → full bar
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${tone === 'up' ? 'border-up/20 bg-up/[0.04]' : tone === 'down' ? 'border-down/20 bg-down/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2 flex items-center gap-1.5">{dead && <span>💀</span>}{label}</span>
        <span className={`font-mono tabular font-semibold ${big ? 'text-lg' : 'text-sm'} ${color}`}>{up ? '+' : ''}{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

// ── Builder step (rung 6) ────────────────────────────────────────────────
function BuilderStep({ step, idx, total, isLast, onNext }) {
  const [sel, setSel] = useState({})
  const ready = step.slots.every((s) => sel[s.key])
  const combo = ready ? step.combos[`${sel[step.slots[0].key]}|${sel[step.slots[1].key]}`] : null
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title={`Step ${idx + 1} of ${total} — build it in plain English`} />
      <div className="p-5 md:p-6">
        <p className="text-sm text-ink-2 leading-relaxed">{step.intro}</p>

        <div className="mt-4 space-y-4">
          {step.slots.map((slot) => (
            <div key={slot.key}>
              <div className="text-2xs uppercase tracking-wider text-ink-4 mb-2">{slot.label}</div>
              <div className="flex flex-wrap gap-2">
                {slot.options.map((o) => {
                  const on = sel[slot.key] === o.v
                  return (
                    <button key={o.v} onClick={() => setSel((s) => ({ ...s, [slot.key]: o.v }))}
                      className={`rounded-full border px-3.5 py-1.5 text-xs transition
                        ${on ? 'bg-accent/15 border-accent/50 text-ink-1' : 'bg-white/[0.03] border-white/[0.08] text-ink-2 hover:border-accent/40'}`}>
                      {o.text}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {ready && (
          <div className="mt-5 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-sm text-ink-2 italic">
            “Buy <span className="text-ink-1 not-italic font-medium">{step.slots[0].options.find((o) => o.v === sel[step.slots[0].key])?.text}</span>, and <span className="text-ink-1 not-italic font-medium">{step.slots[1].options.find((o) => o.v === sel[step.slots[1].key])?.text}</span>.”
          </div>
        )}

        {combo && (
          <div className="mt-4">
            <div className={`rounded-lg border p-4 ${combo.tone === 'up' ? 'border-up/25 bg-up/[0.06]' : 'border-warn/25 bg-warn/[0.06]'}`}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Pill variant={combo.tone === 'up' ? 'up' : 'warn'}><Wand2 size={10} /> {combo.name}</Pill>
                <span className="font-mono tabular font-semibold text-lg text-ink-1">{combo.pct >= 0 ? '+' : ''}{combo.pct}%</span>
                <span className="text-2xs text-ink-4">historical replay</span>
              </div>
              <p className="text-sm text-ink-2 leading-relaxed">{combo.note}</p>
            </div>
            <p className="text-xs text-ink-3 leading-relaxed mt-3">{step.outro}</p>
            <NextBtn isLast={isLast} onNext={onNext} />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Recap / graduation step (rung 7) ─────────────────────────────────────
function RecapStep({ step, onNext, onGoPlatform }) {
  return (
    <Card className="overflow-hidden">
      <SectionHeader icon={step.icon} title="Graduation" />
      <div className="p-6">
        <h2 className="font-display text-xl md:text-2xl text-ink-1 font-semibold">{step.title}</h2>
        <p className="text-sm text-ink-2 leading-relaxed mt-3">{step.closing}</p>

        <div className="text-2xs uppercase tracking-wider text-ink-4 mt-6 mb-2">What you now understand</div>
        <div className="space-y-2">
          {step.learned.map((t, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-ink-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-up" /> <span>{t}</span>
            </div>
          ))}
        </div>

        <div className="text-2xs uppercase tracking-wider text-ink-4 mt-6 mb-2">Step onto the real platform</div>
        <div className="grid grid-cols-2 gap-2">
          {step.links.map((l) => (
            <Button key={l.to} variant="ghost" size="sm" icon={ExternalLink} className="justify-start" onClick={() => onGoPlatform(l.to)}>
              {l.label}
            </Button>
          ))}
        </div>

        <NextBtn isLast={true} onNext={onNext} label="Finish — I’ve graduated 🎓" />
      </div>
    </Card>
  )
}
