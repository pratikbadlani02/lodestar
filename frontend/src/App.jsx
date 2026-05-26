import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { SkeletonRows } from './components/ui/primitives'

// Eager — small + needed first
import Login from './pages/Login'
import Workspace from './pages/Workspace'

// Lazy — every other route gets its own chunk
const Strategies        = lazy(() => import('./pages/Strategies'))
const Backtests         = lazy(() => import('./pages/Backtests'))
const BacktestDetail    = lazy(() => import('./pages/BacktestDetail'))
const BacktestCompare   = lazy(() => import('./pages/BacktestCompare'))
const Orders            = lazy(() => import('./pages/Orders'))
const Positions         = lazy(() => import('./pages/Positions'))
const AuditLog          = lazy(() => import('./pages/AuditLog'))
const Settings          = lazy(() => import('./pages/Settings'))
const Optimizer         = lazy(() => import('./pages/Optimizer').then(m => ({ default: m.default })))
const OptimizerDetail   = lazy(() => import('./pages/Optimizer').then(m => ({ default: m.OptimizerDetail })))
const Alerts            = lazy(() => import('./pages/Alerts'))
const RiskAnalytics     = lazy(() => import('./pages/RiskAnalytics'))
const Watchlists        = lazy(() => import('./pages/Watchlists'))
const Market            = lazy(() => import('./pages/Market'))
const PriceAlerts       = lazy(() => import('./pages/PriceAlerts'))
const Users             = lazy(() => import('./pages/Users'))
const Stocks            = lazy(() => import('./pages/Stocks'))
const Screener          = lazy(() => import('./pages/Screener'))
const Trade             = lazy(() => import('./pages/Trade'))
const Paper             = lazy(() => import('./pages/Paper'))
const Options           = lazy(() => import('./pages/Options'))
const Fundamentals      = lazy(() => import('./pages/Fundamentals'))
const Earnings          = lazy(() => import('./pages/Earnings'))
const Heatmap           = lazy(() => import('./pages/Heatmap'))
const Tape              = lazy(() => import('./pages/Tape'))
const Movers            = lazy(() => import('./pages/Movers'))
const Crypto            = lazy(() => import('./pages/Crypto'))
const Dividends         = lazy(() => import('./pages/Dividends'))
const Insiders          = lazy(() => import('./pages/Insiders'))
const Compare           = lazy(() => import('./pages/Compare'))
const Analysis          = lazy(() => import('./pages/Analysis'))

function RequireAuth({ children }) {
  const token = sessionStorage.getItem('quant_token')
  const location = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

// Route-level fallback while a chunk is loading
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
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Workspace />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="strategies"        element={<Suspense fallback={<RouteFallback />}><Strategies /></Suspense>} />
        <Route path="backtests"         element={<Suspense fallback={<RouteFallback />}><Backtests /></Suspense>} />
        <Route path="backtests/:id"     element={<Suspense fallback={<RouteFallback />}><BacktestDetail /></Suspense>} />
        <Route path="backtest-compare"  element={<Suspense fallback={<RouteFallback />}><BacktestCompare /></Suspense>} />
        <Route path="optimizer"         element={<Suspense fallback={<RouteFallback />}><Optimizer /></Suspense>} />
        <Route path="optimizer/:id"     element={<Suspense fallback={<RouteFallback />}><OptimizerDetail /></Suspense>} />
        <Route path="orders"            element={<Suspense fallback={<RouteFallback />}><Orders /></Suspense>} />
        <Route path="positions"         element={<Suspense fallback={<RouteFallback />}><Positions /></Suspense>} />
        <Route path="risk"              element={<Suspense fallback={<RouteFallback />}><RiskAnalytics /></Suspense>} />
        <Route path="alerts"            element={<Suspense fallback={<RouteFallback />}><Alerts /></Suspense>} />
        <Route path="audit"             element={<Suspense fallback={<RouteFallback />}><AuditLog /></Suspense>} />
        <Route path="settings"          element={<Suspense fallback={<RouteFallback />}><Settings /></Suspense>} />
        <Route path="watchlists"        element={<Suspense fallback={<RouteFallback />}><Watchlists /></Suspense>} />
        <Route path="market"            element={<Suspense fallback={<RouteFallback />}><Market /></Suspense>} />
        <Route path="market/region/:id" element={<Suspense fallback={<RouteFallback />}><Market /></Suspense>} />
        <Route path="price-alerts"      element={<Suspense fallback={<RouteFallback />}><PriceAlerts /></Suspense>} />
        <Route path="users"             element={<Suspense fallback={<RouteFallback />}><Users /></Suspense>} />
        <Route path="stocks"            element={<Suspense fallback={<RouteFallback />}><Stocks /></Suspense>} />
        <Route path="screener"          element={<Suspense fallback={<RouteFallback />}><Screener /></Suspense>} />
        <Route path="trade"             element={<Suspense fallback={<RouteFallback />}><Trade /></Suspense>} />
        <Route path="paper"             element={<Suspense fallback={<RouteFallback />}><Paper /></Suspense>} />
        <Route path="options"           element={<Suspense fallback={<RouteFallback />}><Options /></Suspense>} />
        <Route path="options/:symbol"   element={<Suspense fallback={<RouteFallback />}><Options /></Suspense>} />
        <Route path="fundamentals"           element={<Suspense fallback={<RouteFallback />}><Fundamentals /></Suspense>} />
        <Route path="fundamentals/:symbol"   element={<Suspense fallback={<RouteFallback />}><Fundamentals /></Suspense>} />
        <Route path="earnings"          element={<Suspense fallback={<RouteFallback />}><Earnings /></Suspense>} />
        <Route path="heatmap"           element={<Suspense fallback={<RouteFallback />}><Heatmap /></Suspense>} />
        <Route path="tape"              element={<Suspense fallback={<RouteFallback />}><Tape /></Suspense>} />
        <Route path="tape/:symbol"      element={<Suspense fallback={<RouteFallback />}><Tape /></Suspense>} />
        <Route path="movers"            element={<Suspense fallback={<RouteFallback />}><Movers /></Suspense>} />
        <Route path="crypto"            element={<Suspense fallback={<RouteFallback />}><Crypto /></Suspense>} />
        <Route path="dividends"           element={<Suspense fallback={<RouteFallback />}><Dividends /></Suspense>} />
        <Route path="dividends/:symbol"   element={<Suspense fallback={<RouteFallback />}><Dividends /></Suspense>} />
        <Route path="insiders"            element={<Suspense fallback={<RouteFallback />}><Insiders /></Suspense>} />
        <Route path="insiders/:symbol"    element={<Suspense fallback={<RouteFallback />}><Insiders /></Suspense>} />
        <Route path="compare"             element={<Suspense fallback={<RouteFallback />}><Compare /></Suspense>} />
        <Route path="analysis"            element={<Suspense fallback={<RouteFallback />}><Analysis /></Suspense>} />
        <Route path="analysis/:symbol"    element={<Suspense fallback={<RouteFallback />}><Analysis /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
