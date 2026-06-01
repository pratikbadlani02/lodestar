import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { SkeletonRows } from './components/ui/primitives'

// Eager — small + needed first
import Login from './pages/Login'

// Lazy — every other route gets its own chunk
const Workspace         = lazy(() => import('./pages/Workspace'))
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
const Learn             = lazy(() => import('./pages/Learn'))
const Coach             = lazy(() => import('./pages/Coach'))
const SentimentScanner  = lazy(() => import('./pages/SentimentScanner'))

// Gate that only allows render if a token is present in sessionStorage.
// Used to wrap private routes inside the otherwise-public Layout.
function RequireAuth({ children }) {
  const token = sessionStorage.getItem('quant_token')
  const location = useLocation()
  if (!token) {
    // Preserve where the user was trying to go so Login can send them back.
    const from = location.pathname + (location.search || '')
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }
  return children
}

function S({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

function Private({ children }) {
  return <RequireAuth>{children}</RequireAuth>
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

      {/* Layout is unauthenticated — anonymous users see the public pages.
          Private pages are individually wrapped in <Private>. */}
      <Route path="/" element={<Layout />}>
        {/* Public landing: market overview */}
        <Route index                          element={<S><Market /></S>} />
        <Route path="learn"                   element={<S><Learn /></S>} />
        <Route path="coach"                   element={<S><Coach /></S>} />
        <Route path="market"                  element={<S><Market /></S>} />
        <Route path="market/region/:id"       element={<S><Market /></S>} />

        {/* Public market data */}
        <Route path="stocks"                  element={<S><Stocks /></S>} />
        <Route path="screener"                element={<S><Screener /></S>} />
        <Route path="scanner"                 element={<S><SentimentScanner /></S>} />
        <Route path="heatmap"                 element={<S><Heatmap /></S>} />
        <Route path="movers"                  element={<S><Movers /></S>} />
        <Route path="tape"                    element={<S><Tape /></S>} />
        <Route path="tape/:symbol"            element={<S><Tape /></S>} />
        <Route path="crypto"                  element={<S><Crypto /></S>} />

        {/* Public research */}
        <Route path="analysis"                element={<S><Analysis /></S>} />
        <Route path="analysis/:symbol"        element={<S><Analysis /></S>} />
        <Route path="fundamentals"            element={<S><Fundamentals /></S>} />
        <Route path="fundamentals/:symbol"    element={<S><Fundamentals /></S>} />
        <Route path="options"                 element={<S><Options /></S>} />
        <Route path="options/:symbol"         element={<S><Options /></S>} />
        <Route path="earnings"                element={<S><Earnings /></S>} />
        <Route path="dividends"               element={<S><Dividends /></S>} />
        <Route path="dividends/:symbol"       element={<S><Dividends /></S>} />
        <Route path="insiders"                element={<S><Insiders /></S>} />
        <Route path="insiders/:symbol"        element={<S><Insiders /></S>} />
        <Route path="compare"                 element={<S><Compare /></S>} />

        {/* Private — login required */}
        <Route path="workspace"               element={<Private><S><Workspace /></S></Private>} />
        <Route path="dashboard"               element={<Navigate to="/workspace" replace />} />
        <Route path="trade"                   element={<Private><S><Trade /></S></Private>} />
        <Route path="paper"                   element={<Private><S><Paper /></S></Private>} />
        <Route path="orders"                  element={<Private><S><Orders /></S></Private>} />
        <Route path="positions"               element={<Private><S><Positions /></S></Private>} />
        <Route path="watchlists"              element={<Private><S><Watchlists /></S></Private>} />
        <Route path="strategies"              element={<Private><S><Strategies /></S></Private>} />
        <Route path="backtests"               element={<Private><S><Backtests /></S></Private>} />
        <Route path="backtests/:id"           element={<Private><S><BacktestDetail /></S></Private>} />
        <Route path="backtest-compare"        element={<Private><S><BacktestCompare /></S></Private>} />
        <Route path="optimizer"               element={<Private><S><Optimizer /></S></Private>} />
        <Route path="optimizer/:id"           element={<Private><S><OptimizerDetail /></S></Private>} />
        <Route path="risk"                    element={<Private><S><RiskAnalytics /></S></Private>} />
        <Route path="alerts"                  element={<Private><S><Alerts /></S></Private>} />
        <Route path="price-alerts"            element={<Private><S><PriceAlerts /></S></Private>} />
        <Route path="audit"                   element={<Private><S><AuditLog /></S></Private>} />
        <Route path="settings"                element={<Private><S><Settings /></S></Private>} />
        <Route path="users"                   element={<Private><S><Users /></S></Private>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
