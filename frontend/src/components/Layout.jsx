import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Bot, BarChart3, ListOrdered, Briefcase,
  ShieldAlert, Settings, LogOut, LogIn, Lock, Activity, AlertTriangle,
  Sparkles, Bell, Shield, GitCompare, Star, Newspaper, BellRing, Users,
  TrendingUp, Filter, Zap, FlaskConical,
  Layers, Building2, Calendar, LayoutGrid,
  Radio, Bitcoin, Coins, Gauge, PanelLeftClose, PanelLeftOpen, ChevronDown,
} from 'lucide-react'
import { Toaster } from 'sonner'
import { api } from '../lib/api'
import { useStore, initStoreWS, selectControl, selectHealth, selectUnackCount } from '../lib/store'
import { useTheme } from '../lib/ThemeContext'
import { installHotkeys, useHotkey } from '../lib/hotkeys'
import TopBar from './TopBar'
import WatchRail from './WatchRail'
import Ticker from './Ticker'
import OrderSlideOver from './OrderSlideOver'
import CommandPalette from './CommandPalette'
import StatusBar from './StatusBar'
import ShortcutHelp from './ShortcutHelp'
import ErrorBoundary from './ErrorBoundary'

const SIDEBAR_COLLAPSED_KEY = 'quant_sidebar_collapsed_v1'
const NAV_GROUPS_COLLAPSED_KEY = 'quant_nav_groups_collapsed_v1'

// Sidebar nav. `priv: true` means the route requires login — the click still
// works (RequireAuth in App.jsx will redirect to /login?from=...) but we tag
// the item visually for anonymous users so it's clear what's gated.
const NAV_GROUPS = [
  { id: 'pinned', label: null, items: [
    { to: '/',            icon: LayoutGrid,   label: 'Market',       end: true },
    { to: '/workspace',   icon: Activity,     label: 'Workspace',    priv: true },
  ]},
  { id: 'markets', label: 'Markets', items: [
    { to: '/stocks',      icon: TrendingUp,   label: 'Stocks'                  },
    { to: '/market/region/6', icon: Newspaper, label: 'Market News'            },
    { to: '/heatmap',     icon: LayoutGrid,   label: 'Heatmap'                 },
    { to: '/movers',      icon: Activity,     label: 'Movers'                  },
    { to: '/tape',        icon: Radio,        label: 'Time & Sales'            },
    { to: '/crypto',      icon: Bitcoin,      label: 'Crypto'                  },
    { to: '/screener',    icon: Filter,       label: 'Screener'                },
  ]},
  { id: 'research', label: 'Research', items: [
    { to: '/analysis',    icon: Gauge,        label: 'Analysis'                },
    { to: '/fundamentals',icon: Building2,    label: 'Fundamentals'            },
    { to: '/options',     icon: Layers,       label: 'Options'                 },
    { to: '/earnings',    icon: Calendar,     label: 'Earnings'                },
    { to: '/dividends',   icon: Coins,        label: 'Dividends'               },
    { to: '/insiders',    icon: Users,        label: 'Insiders'                },
    { to: '/compare',     icon: GitCompare,   label: 'Compare Symbols'         },
  ]},
  { id: 'trade', label: 'Trade', items: [
    { to: '/trade',       icon: Zap,          label: 'Quick Trade',  priv: true },
    { to: '/paper',       icon: FlaskConical, label: 'Paper Trade',  priv: true },
    { to: '/orders',      icon: ListOrdered,  label: 'Orders',       priv: true },
    { to: '/positions',   icon: Briefcase,    label: 'Positions',    priv: true },
    { to: '/watchlists',  icon: Star,         label: 'Watchlists',   priv: true },
  ]},
  { id: 'strategy', label: 'Strategy', items: [
    { to: '/strategies',  icon: Bot,          label: 'Strategies',       priv: true },
    { to: '/backtests',   icon: BarChart3,    label: 'Backtests',        priv: true },
    { to: '/backtest-compare', icon: GitCompare, label: 'Compare Backtests', priv: true },
    { to: '/optimizer',   icon: Sparkles,     label: 'Optimizer',        priv: true },
  ]},
  { id: 'risk', label: 'Risk & Alerts', items: [
    { to: '/risk',        icon: Shield,       label: 'Risk Analytics',   priv: true },
    { to: '/alerts',      icon: Bell,         label: 'System Alerts',    priv: true, badgeKey: 'alerts' },
    { to: '/price-alerts',icon: BellRing,     label: 'Price Alerts',     priv: true },
    { to: '/audit',       icon: ShieldAlert,  label: 'Audit Log',        priv: true },
  ]},
  { id: 'admin', label: 'Admin', items: [
    { to: '/settings',    icon: Settings,     label: 'Settings',     priv: true },
    { to: '/users',       icon: Users,        label: 'Users',        priv: true },
  ]},
]

function loadCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
}
function loadGroupCollapsed() {
  try { return JSON.parse(localStorage.getItem(NAV_GROUPS_COLLAPSED_KEY) || '{}') } catch { return {} }
}
function hasToken() {
  try { return !!sessionStorage.getItem('quant_token') } catch { return false }
}

export default function Layout() {
  const navigate = useNavigate()
  const control    = useStore(selectControl)
  const health     = useStore(selectHealth)
  const unackCount = useStore(selectUnackCount)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [groupCollapsed, setGroupCollapsed] = useState(loadGroupCollapsed)
  const [authed, setAuthed] = useState(hasToken)

  // Boot the global store + WS only after auth. Anonymous users don't fetch
  // any private state. Re-check after navigation in case Login just ran.
  useEffect(() => {
    installHotkeys()
    if (authed) initStoreWS()
  }, [authed])

  // Keep `authed` in sync with sessionStorage across tabs / login flow.
  useEffect(() => {
    function check() { setAuthed(hasToken()) }
    window.addEventListener('storage', check)
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  useHotkey('/', () => {
    const input = document.querySelector('input[placeholder*="ticker" i], input[placeholder*="search" i]')
    if (input) { input.focus(); input.select?.() }
  })
  useHotkey('shift+?', () => window.dispatchEvent(new CustomEvent('shortcut-help:open')))
  useHotkey('g m', () => navigate('/'))
  useHotkey('g s', () => navigate('/stocks'))
  useHotkey('g c', () => navigate('/screener'))
  useHotkey('g h', () => navigate('/heatmap'))
  useHotkey('g a', () => navigate('/analysis'))
  useHotkey('g p', () => navigate('/positions'))
  useHotkey('g o', () => navigate('/orders'))
  useHotkey('g t', () => navigate('/trade'))

  const refresh = () => {
    if (!authed) return
    const s = useStore.getState()
    s.loadControl(); s.loadHealth(); s.loadAccount(); s.loadPositions(); s.loadOrders(); s.loadAlerts()
  }

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])
  useEffect(() => {
    try { localStorage.setItem(NAV_GROUPS_COLLAPSED_KEY, JSON.stringify(groupCollapsed)) } catch {}
  }, [groupCollapsed])

  function logout() {
    api.logout()
    setAuthed(false)
    navigate('/')
  }
  function signIn() {
    navigate('/login')
  }
  function toggleGroup(id) { setGroupCollapsed((g) => ({ ...g, [id]: !g[id] })) }

  const isLive       = authed && control?.is_live
  const tradingOn    = authed && control?.trading_enabled
  const strategiesOn = authed && control?.strategies_enabled
  const badges = { alerts: unackCount }

  return (
    <div className="flex flex-col h-screen bg-surf-0">
     <div className="flex-1 flex min-h-0">
      <aside className={`${collapsed ? 'w-14' : 'w-56'} bg-surf-1/80 backdrop-blur-xl border-r border-white/[0.06] flex flex-col relative transition-[width] duration-200`}>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/20 to-transparent" />

        {/* Brand mark + collapse toggle */}
        <div className={`${collapsed ? 'px-2' : 'px-4'} py-4 border-b border-white/[0.06]`}>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-lg bg-brand-grad flex items-center justify-center shadow-glow-accent">
                <Activity size={15} className="text-[#fff]" />
              </div>
              <div className="absolute inset-0 rounded-lg bg-brand-grad opacity-30 blur-md -z-10" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold text-sm leading-tight text-ink-1">Lodestar</div>
                <div className={`text-2xs font-mono font-medium tracking-[0.16em] ${
                  !authed ? 'text-ink-4' : (isLive ? 'text-down' : 'text-up')
                }`}>
                  {!authed ? 'PUBLIC' : (isLive ? 'LIVE' : 'PAPER')}
                </div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-ink-4 hover:text-ink-1 hover:bg-white/[0.06] transition ${collapsed ? 'mx-auto mt-2' : ''}`}
            >
              {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 ${collapsed ? 'px-1.5' : 'px-2'} py-2 overflow-y-auto`}>
          {NAV_GROUPS.map((group) => {
            const groupIsCollapsed = !collapsed && groupCollapsed[group.id]
            return (
              <div key={group.id} className="mb-1">
                {group.label && !collapsed && (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-1.5 pt-3 pb-1 px-2 group hover:text-ink-3 transition"
                  >
                    <ChevronDown size={9} className={`text-ink-5 transition-transform ${groupIsCollapsed ? '-rotate-90' : ''}`} />
                    <span className="text-2xs uppercase tracking-[0.16em] text-ink-5 font-medium group-hover:text-ink-4">{group.label}</span>
                  </button>
                )}
                {collapsed && group.label && (
                  <div className="my-2 mx-2 border-t border-white/[0.06]" />
                )}
                {!groupIsCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const { to, icon: Icon, label, end, badgeKey, priv } = item
                      const badge = badgeKey ? badges[badgeKey] : 0
                      const gated = priv && !authed
                      return (
                        <NavLink key={to} to={to} end={end}
                          title={collapsed ? (gated ? `${label} — sign in required` : label) : undefined}
                          className={({ isActive }) =>
                            `group relative flex items-center gap-2.5 ${collapsed ? 'justify-center px-1.5 py-2' : 'px-2.5 py-1.5'} rounded-lg text-xs transition-all ${
                              isActive
                                ? 'bg-white/[0.06] text-ink-1'
                                : gated
                                  ? 'text-ink-4 hover:bg-white/[0.03] hover:text-ink-2'
                                  : 'text-ink-3 hover:bg-white/[0.03] hover:text-ink-1'
                            }`
                          }>
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-grad rounded-r" />
                              )}
                              <Icon size={14} className={isActive ? 'text-accent' : ''} />
                              {!collapsed && <span className="flex-1 font-medium truncate">{label}</span>}
                              {!collapsed && gated && (
                                <Lock size={10} className="text-ink-5 shrink-0" />
                              )}
                              {!collapsed && badge > 0 && (
                                <span className="bg-down/90 text-[#fff] text-2xs font-semibold rounded-full px-1.5 min-w-[18px] text-center shadow-glow-down">
                                  {badge}
                                </span>
                              )}
                              {collapsed && badge > 0 && (
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-down shadow-glow-down" />
                              )}
                            </>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Status block (auth-only) + sign in/out button */}
        <div className={`${collapsed ? 'px-1.5' : 'px-3'} py-3 border-t border-white/[0.06] space-y-2`}>
          {authed && !collapsed && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.025] rounded-lg p-2 border border-white/[0.04]">
                  <div className="text-2xs text-ink-4 mb-1">Trading</div>
                  <div className={`text-xs font-semibold flex items-center gap-1 ${tradingOn ? 'text-up' : 'text-down'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tradingOn ? 'bg-up shadow-glow-up' : 'bg-down'} soft-pulse`} />
                    {tradingOn ? 'ON' : 'OFF'}
                  </div>
                </div>
                <div className="bg-white/[0.025] rounded-lg p-2 border border-white/[0.04]">
                  <div className="text-2xs text-ink-4 mb-1">Strategies</div>
                  <div className={`text-xs font-semibold flex items-center gap-1 ${strategiesOn ? 'text-up' : 'text-warn'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${strategiesOn ? 'bg-up' : 'bg-warn'}`} />
                    {strategiesOn ? 'ON' : 'PAUSE'}
                  </div>
                </div>
              </div>
              {health && (
                <div className="flex items-center justify-between text-2xs px-1">
                  <span className="text-ink-4">Services</span>
                  <span className={`font-mono ${health.status === 'ok' ? 'text-up' : 'text-warn'}`}>
                    ● {health.status}
                  </span>
                </div>
              )}
            </>
          )}
          {authed && collapsed && (
            <div className="flex flex-col items-center gap-1.5 py-1" title={`Trading ${tradingOn ? 'ON' : 'OFF'} · Strategies ${strategiesOn ? 'ON' : 'OFF'}`}>
              <span className={`w-2 h-2 rounded-full ${tradingOn ? 'bg-up shadow-glow-up' : 'bg-down'} soft-pulse`} />
              <span className={`w-2 h-2 rounded-full ${strategiesOn ? 'bg-up' : 'bg-warn'}`} />
            </div>
          )}
          {!authed && !collapsed && (
            <p className="text-2xs leading-relaxed text-ink-5">
              Sign in to access trading, strategies, and account features.
            </p>
          )}
          {authed ? (
            <button onClick={logout}
              title="Logout"
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-2.5 py-1.5 rounded-lg text-xs text-ink-3 hover:bg-white/[0.04] hover:text-ink-1 transition`}>
              <LogOut size={12} />{!collapsed && 'Logout'}
            </button>
          ) : (
            <button onClick={signIn}
              title="Sign in"
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-2.5 py-1.5 rounded-lg text-xs bg-up/10 text-up hover:bg-up/20 transition`}>
              <LogIn size={12} />{!collapsed && 'Sign in'}
            </button>
          )}
        </div>
      </aside>

      {authed && <WatchRail />}

      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <Ticker />
        {authed && isLive && !tradingOn && (
          <div className="bg-down/10 border-b border-down/25 px-4 py-2 text-xs text-down flex items-center gap-2 backdrop-blur-sm">
            <AlertTriangle size={12} />
            <span className="font-medium">Trading is HALTED.</span>
            <span className="text-ink-3">Use Settings → Resume to re-enable.</span>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet context={{ refresh, control, health, authed }} />
          </ErrorBoundary>
        </div>
      </main>
     </div>
      <StatusBar control={control} health={health} authed={authed} />
      {authed && <OrderSlideOver />}
      <CommandPalette authed={authed} />
      <ShortcutHelp />
      <ToasterShell />
    </div>
  )
}

function ToasterShell() {
  const { theme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      richColors
      closeButton
      toastOptions={{
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '13px',
        },
      }}
    />
  )
}
