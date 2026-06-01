import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, GraduationCap, ArrowRight } from 'lucide-react'
import { Card } from './ui/primitives'
import { TERMS } from '../lib/learnGlossary'

// ─────────────────────────────────────────────────────────────────────────
// Concept of the Day — a daily hook on the Market landing page. Surfaces one
// rotating glossary term (deterministic by date) plus a light "days in a row"
// streak, so there's a reason to come back and learn one small thing daily.
// Pure frontend (localStorage); links into the Field Guide.
// ─────────────────────────────────────────────────────────────────────────
const STREAK_KEY = 'quant_learn_streak_v1'
const dayStr = (d) => new Date(d).toISOString().slice(0, 10)

function bumpStreak() {
  try {
    const today = dayStr(Date.now())
    const yest = dayStr(Date.now() - 86400000)
    const prev = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null')
    let count = 1
    if (prev?.last === today) count = prev.count || 1
    else if (prev?.last === yest) count = (prev.count || 0) + 1
    else count = 1
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }))
    return count
  } catch { return 1 }
}

export default function ConceptOfDay() {
  const navigate = useNavigate()
  const { term, streak } = useMemo(() => {
    const epochDay = Math.floor(Date.now() / 86400000)
    const t = TERMS[epochDay % TERMS.length]
    return { term: t, streak: bumpStreak() }
  }, [])

  if (!term) return null

  return (
    <Card className="overflow-hidden mb-3">
      <button onClick={() => navigate(`/learn?tab=guide&term=${term.id}`)} className="w-full text-left group">
        <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-accent/[0.07] to-transparent">
          <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 text-accent">
            <GraduationCap size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xs uppercase tracking-[0.14em] text-accent font-semibold">Concept of the day</span>
              {streak > 1 && (
                <span className="inline-flex items-center gap-1 text-2xs text-warn"><Flame size={11} /> {streak}-day streak</span>
              )}
            </div>
            <div className="text-sm text-ink-1 mt-0.5 leading-snug truncate">
              <span className="font-display font-semibold">{term.term}</span>
              <span className="text-ink-3"> — {term.short}</span>
            </div>
          </div>
          <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-2xs text-ink-4 group-hover:text-accent transition">
            Learn it <ArrowRight size={12} />
          </span>
        </div>
      </button>
    </Card>
  )
}
