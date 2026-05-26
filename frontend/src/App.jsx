import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { SkeletonRows } from './components/ui/primitives'

// Market overview is the index page — eager so the landing renders fast.
import Market from './pages/Market'

// Lazy — every other route gets its own chunk.
const Stocks            = lazy(() => import('./pages/Stocks'))
const Screener          = lazy(() => import('./pages/Screener'))
const Heatmap           = lazy(() => import('./pages/Heatmap'))
const Movers            = lazy(() => import('./pages/Movers'))
const Tape              = lazy(() => import('./pages/Tape'))
const Crypto            = lazy(() => import('./pages/Crypto'))
const Analysis          = lazy(() => import('./pages/Analysis'))
const Fundamentals      = lazy(() => import('./pages/Fundamentals'))
const Options           = lazy(() => import('./pages/Options'))
const Earnings          = lazy(() => import('./pages/Earnings'))
const Dividends         = lazy(() => import('./pages/Dividends'))
const Insiders          = lazy(() => import('./pages/Insiders'))
const Compare           = lazy(() => import('./pages/Compare'))

function RouteFallback() {
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 rounded-md bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] bg-[length:200%_100%] animate-shimmer" />
        <div className="h-3 w-72 rounded-md bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] bg-[length:200%_100%] animate-shimmer" />
      </div>
      <div className="card-surface p-5">
        <SkeletonRows count={6} cols={5} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Market />} />
        <Route path="market"                  element={<Market />} />
        <Route path="market/region/:id"       element={<Market />} />
        <Route path="stocks"                  element={<Suspense fallback={<RouteFallback />}><Stocks /></Suspense>} />
        <Route path="screener"                element={<Suspense fallback={<RouteFallback />}><Screener /></Suspense>} />
        <Route path="heatmap"                 element={<Suspense fallback={<RouteFallback />}><Heatmap /></Suspense>} />
        <Route path="movers"                  element={<Suspense fallback={<RouteFallback />}><Movers /></Suspense>} />
        <Route path="tape"                    element={<Suspense fallback={<RouteFallback />}><Tape /></Suspense>} />
        <Route path="tape/:symbol"            element={<Suspense fallback={<RouteFallback />}><Tape /></Suspense>} />
        <Route path="crypto"                  element={<Suspense fallback={<RouteFallback />}><Crypto /></Suspense>} />
        <Route path="analysis"                element={<Suspense fallback={<RouteFallback />}><Analysis /></Suspense>} />
        <Route path="analysis/:symbol"        element={<Suspense fallback={<RouteFallback />}><Analysis /></Suspense>} />
        <Route path="fundamentals"            element={<Suspense fallback={<RouteFallback />}><Fundamentals /></Suspense>} />
        <Route path="fundamentals/:symbol"    element={<Suspense fallback={<RouteFallback />}><Fundamentals /></Suspense>} />
        <Route path="options"                 element={<Suspense fallback={<RouteFallback />}><Options /></Suspense>} />
        <Route path="options/:symbol"         element={<Suspense fallback={<RouteFallback />}><Options /></Suspense>} />
        <Route path="earnings"                element={<Suspense fallback={<RouteFallback />}><Earnings /></Suspense>} />
        <Route path="dividends"               element={<Suspense fallback={<RouteFallback />}><Dividends /></Suspense>} />
        <Route path="dividends/:symbol"       element={<Suspense fallback={<RouteFallback />}><Dividends /></Suspense>} />
        <Route path="insiders"                element={<Suspense fallback={<RouteFallback />}><Insiders /></Suspense>} />
        <Route path="insiders/:symbol"        element={<Suspense fallback={<RouteFallback />}><Insiders /></Suspense>} />
        <Route path="compare"                 element={<Suspense fallback={<RouteFallback />}><Compare /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
