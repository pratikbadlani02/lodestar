import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, Sparkles, X } from 'lucide-react'
import { Card, SectionHeader, Pill, Input, Button, Alert } from './ui/primitives'
import { CATEGORIES, TERMS, getTerm } from '../lib/learnGlossary'

// Field Guide — searchable, categorized plain-English reference. One screen.
// Reuses the shared glossary data — the same entries power the in-context
// "explain this" chips on the Fundamentals / Analysis pages, which deep-link
// here with ?term=<id> (passed in as initialTermId).
export default function FieldGuide({ initialTermId }) {
  const navigate = useNavigate()
  const [q, setQ] = useState(() => getTerm(initialTermId)?.term || '')
  const [cat, setCat] = useState('all')

  const query = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    return TERMS.filter((t) => {
      if (cat !== 'all' && t.cat !== cat) return false
      if (!query) return true
      return (t.term + ' ' + t.short + ' ' + t.why).toLowerCase().includes(query)
    })
  }, [query, cat])

  // Group the filtered terms under their category for display.
  const groups = useMemo(() => {
    return CATEGORIES
      .map((c) => ({ cat: c, items: filtered.filter((t) => t.cat === c.id) }))
      .filter((g) => g.items.length > 0)
  }, [filtered])

  return (
    <div className="max-w-3xl mx-auto">
      <Alert variant="info" className="mb-3">
        Plain-English definitions for the words you’ll meet out there. Search it, or browse by topic — every entry
        says <span className="text-ink-1 font-medium">what it is</span> and <span className="text-ink-1 font-medium">why it matters</span>.
      </Alert>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms — e.g. P/E, dividend, RSI, S&P 500…" className="pl-9 pr-9" />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip active={cat === 'all'} onClick={() => setCat('all')}>All</FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} icon={c.icon}>{c.label}</FilterChip>
        ))}
      </div>

      {groups.length === 0 && (
        <Card><div className="p-8 text-center text-ink-4 text-sm">No terms match “{q}”. Try a simpler word.</div></Card>
      )}

      <div className="space-y-3">
        {groups.map(({ cat: c, items }) => (
          <Card key={c.id} className="overflow-hidden">
            <SectionHeader
              icon={c.icon}
              title={c.label}
              action={
                <button onClick={() => navigate(c.live.to)}
                  className="text-2xs text-ink-4 hover:text-accent transition inline-flex items-center gap-1">
                  {c.live.label} <ArrowRight size={11} />
                </button>
              }
            />
            <div className="px-2 py-1">
              {!query && cat !== 'all' && (
                <p className="text-xs text-ink-4 px-2 pt-2 pb-1 leading-relaxed">{c.blurb}</p>
              )}
              {items.map((t) => <TermRow key={t.id} term={t} query={query} />)}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 text-center">
        <span className="text-2xs text-ink-5">{TERMS.length} terms · more added as the guide grows</span>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition
        ${active ? 'bg-accent/15 border-accent/50 text-ink-1' : 'bg-white/[0.03] border-white/[0.08] text-ink-3 hover:border-accent/40 hover:text-ink-2'}`}>
      {Icon && <Icon size={12} />}{children}
    </button>
  )
}

function TermRow({ term, query }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={() => setOpen((o) => !o)}
      className="w-full text-left rounded-lg px-2 py-2.5 hover:bg-white/[0.03] transition">
      <div className="flex items-baseline gap-2">
        <span className="font-display font-semibold text-ink-1 text-sm">
          <Highlight text={term.term} q={query} />
        </span>
      </div>
      <p className="text-sm text-ink-2 leading-relaxed mt-1"><Highlight text={term.short} q={query} /></p>
      {open && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-accent/[0.06] border border-accent/20 px-2.5 py-2">
          <Sparkles size={12} className="shrink-0 mt-0.5 text-accent" />
          <p className="text-xs text-ink-2 leading-relaxed"><span className="text-accent font-medium">Why it matters: </span><Highlight text={term.why} q={query} /></p>
        </div>
      )}
      {!open && <span className="text-2xs text-ink-5 mt-1 inline-block">tap for why it matters →</span>}
    </button>
  )
}

// Highlight matching query text within a string.
function Highlight({ text, q }) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-accent/25 text-ink-1 rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
