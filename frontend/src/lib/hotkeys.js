// Lightweight global hotkey system.
//
// Two surfaces:
//   • `useHotkey(key, handler, opts)` — register a single binding while mounted.
//   • `<HotkeyProvider>` (mounted in Layout) — owns the global listener and
//     respects "typing in an input" so shortcuts don't fire while the user is
//     filling a form.
//
// Keys: a single character or a small DSL — "shift+b", "g s", "?", "/".

import { useEffect } from 'react'

const listeners = new Set()       // { combo: 'shift+b', handler, opts }
let chord = null                  // for two-stroke chords like "g s"
let chordTimer = null

function isTypingTarget(t) {
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

function comboFromEvent(e) {
  const parts = []
  if (e.metaKey)  parts.push('meta')
  if (e.ctrlKey)  parts.push('ctrl')
  if (e.altKey)   parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  // Use key for letters/digits/named keys. Lower-case so shift+B === Shift+B.
  let key = e.key
  if (key.length === 1) key = key.toLowerCase()
  parts.push(key)
  return parts.join('+')
}

function fire(combo, event) {
  for (const l of listeners) {
    if (l.combo === combo) {
      event.preventDefault()
      l.handler(event)
      return true
    }
  }
  return false
}

function onKeyDown(e) {
  // Always allow Escape — useful for closing things even from inputs.
  if (e.key === 'Escape') {
    fire('escape', e)
    return
  }

  // Skip if focus is in a text input, with two exceptions:
  // - cmd/ctrl combos always go through
  // - Escape (handled above)
  const inputActive = isTypingTarget(document.activeElement)
  const hasMeta = e.metaKey || e.ctrlKey
  if (inputActive && !hasMeta) return

  const combo = comboFromEvent(e)

  // Chord support: "g s" → store 'g' for ~1s, await next keystroke.
  if (!chord && (combo === 'g' || combo === 'shift+g')) {
    // Reserve 'g' as a leader if anyone listens for "g <x>"
    for (const l of listeners) {
      if (l.combo.startsWith('g ')) {
        chord = 'g'
        clearTimeout(chordTimer)
        chordTimer = setTimeout(() => { chord = null }, 1000)
        e.preventDefault()
        return
      }
    }
  }

  if (chord) {
    const full = `${chord} ${e.key.toLowerCase()}`
    chord = null
    clearTimeout(chordTimer)
    if (fire(full, e)) return
  }

  fire(combo, e)
}

let installed = false
export function installHotkeys() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', onKeyDown)
}

export function useHotkey(combo, handler, opts = {}) {
  useEffect(() => {
    const entry = { combo, handler, opts }
    listeners.add(entry)
    return () => listeners.delete(entry)
  }, [combo, handler])
}
