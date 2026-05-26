// Density preference — `cozy` (default) or `compact`.
//
// Applied to <html data-density="..."> so the CSS variables `--row-py` and
// `--row-px` in index.css take effect across every `t-dense` table.
// Persisted to localStorage; index.html pre-applies before paint to avoid flash.

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'quant_density_v1'
const Ctx = createContext(null)

function loadDensity() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'cozy' || v === 'compact' || v === 'comfortable') return v
  } catch {}
  return 'cozy'
}

export function DensityProvider({ children }) {
  const [density, setDensity] = useState(loadDensity)

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    try { localStorage.setItem(STORAGE_KEY, density) } catch {}
  }, [density])

  const value = {
    density,
    setDensity,
    toggle: () => setDensity((d) => d === 'compact' ? 'cozy' : 'compact'),
    cycle: () => setDensity((d) => d === 'comfortable' ? 'cozy' : d === 'cozy' ? 'compact' : 'comfortable'),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDensity() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDensity must be used inside <DensityProvider>')
  return v
}
