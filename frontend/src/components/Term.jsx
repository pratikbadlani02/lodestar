import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight } from 'lucide-react'
import { getTerm } from '../lib/learnGlossary'

// ─────────────────────────────────────────────────────────────────────────
// <Term id="pe">P/E TTM</Term>
//
// Tappable "explain this" affordance backed by the shared Field Guide glossary.
// The popover is rendered in a PORTAL with fixed positioning + viewport
// clamping, so it can never be clipped by a parent `overflow-hidden` card
// (the earlier bug) and stays fully on-screen near edges. Click/tap toggles it;
// hover opens it on desktop. Unknown ids render children plain (safe no-op).
// ─────────────────────────────────────────────────────────────────────────
const POP_W = 264

export default function Term({ id, children, className = '' }) {
  const entry = getTerm(id)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const closeTimer = useRef(null)
  const navigate = useNavigate()

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - POP_W - 8))
    const estH = popRef.current?.offsetHeight || 150
    const openAbove = r.bottom + 8 + estH > vh - 8 && r.top - estH - 8 > 8
    const top = openAbove ? r.top - estH - 8 : r.bottom + 8
    setPos({ left, top })
  }, [])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place])

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 140) }

  if (!entry) return <>{children}</>

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o) }}
        onMouseEnter={() => { cancelClose(); setOpen(true) }}
        onMouseLeave={scheduleClose}
        className={`inline-flex items-center gap-0.5 cursor-help border-b border-dotted border-accent/50 hover:border-accent text-inherit ${className}`}
        aria-label={`What is ${entry.term}?`}
      >
        {children}
        <span className="text-accent/70 text-[9px] leading-none align-super">ⓘ</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: POP_W, zIndex: 1000 }}
          className="card-surface shadow-2xl rounded-lg p-3 text-left normal-case tracking-normal font-normal"
        >
          <div className="font-display font-semibold text-ink-1 text-sm">{entry.term}</div>
          <div className="text-xs text-ink-2 leading-relaxed mt-1">{entry.short}</div>
          <div className="flex items-start gap-1.5 mt-2 rounded-md bg-accent/[0.07] border border-accent/20 px-2 py-1.5">
            <Sparkles size={11} className="shrink-0 mt-0.5 text-accent" />
            <div className="text-2xs text-ink-2 leading-relaxed"><span className="text-accent font-medium">Why it matters: </span>{entry.why}</div>
          </div>
          <button
            onClick={() => navigate(`/learn?tab=guide&term=${entry.id}`)}
            className="mt-2 inline-flex items-center gap-1 text-2xs text-ink-4 hover:text-accent transition"
          >
            Open in Field Guide <ArrowRight size={10} />
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
