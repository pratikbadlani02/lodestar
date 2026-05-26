import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Activity, GitCompare, Newspaper,
  TrendingUp, Filter,
  Layers, Building2, Calendar, LayoutGrid,
  Radio, Bitcoin, Coins, Gauge, PanelLeftClose, PanelLeftOpen, ChevronDown, Users,
} from 'lucide-react'
import { Toaster } from 'sonner'
import { useTheme } from '../lib/ThemeContext'
import { installHotkeys, useHotkey } from '../lib/hotkeys'
import TopBar from './TopBar'
import Ticker from './Ticker'
import CommandPalette from './CommandPalette'
import StatusBar from './StatusBar'
import ShortcutHelp from './ShortcutHelp'
import ErrorBoundary from './ErrorBoundary'

const SIDEBAR_COLLAPSED_KEY = 'lodestar_sidebar_collapsed_v1'
const NAV_GROUPS_COLLAPSED_KEY = 'lodestar_nav_groups_collapsed_v1'

// Public market-data viewer — Markets group is the broad pulse, Research
// is single-symbol deep dives. No trading, strategy, or admin sections.
const NAV_GROUPS = [
  { id: 'pinned', label: null, items: [
    { to: '/',            icon: LayoutGrid,   label: 'Market',       end: true },
  ]},
  { id: 'markets', label: 'Markets', items: [
    { to: '/stocks',      icon: TrendingUp,   label: 'Stocks'                  },
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
]

function loadCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
}
function loadGroupCollapsed() {
  try { return JSON.parse(localStorage.getItem(NAV_GROUPS_COLLAPSED_KEY) || '{}') } catch { return {} }
}

export default function Layout() {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [groupCollapsed, setGroupCollapsed] = useState(loadGroupCollapsed)

  useEffect(() => { installHotkeys() }, [])

  useHotkey('/', (e) => {
    const input = document.querySelector('input[placeholder*="ticker" i], input[placeholder*="search" i]')
    if (input) { input.focus(); input.select?.() }
  })
  useHotkey('shift+?', () => window.dispatchEvent(new CustomEvent('shortcut-help:open')))
  useHotkey('g m', () => navigate('/'))
  useHotkey('g s', () => navigate('/stocks'))
  useHotkey('g c', () => navigate('/screener'))
  useHotkey('g h', () => navigate('/heatmap'))
  useHotkey('g a', () => navigate('/analysis'))

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])
  useEffect(() => {
    try { localStorage.setItem(NAV_GROUPS_COLLAPSED_KEY, JSON.stringify(groupCollapsed)) } catch {}
  }, [groupCollapsed])

  function toggleGroup(id) { setGroupCollapsed((g) => ({ ...g, [id]: !g[id] })) }

  return (
    <div className="flex flex-col h-screen bg-surf-0">
      <div className="flex-1 flex min-h-0">
        <aside className={`${collapsed ? 'w-14' : 'w-56'} bg-surf-1/80 backdrop-blur-xl border-r border-white/[0.06] flex flex-col relative transition-[width] duration-200`}>
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/20 to-transparent" />

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
                  <div className="text-2xs font-mono font-medium tracking-[0.16em] text-ink-4">
                    MARKET DATA
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
                        const { to, icon: Icon, label, end } = item
                        return (
                          <NavLink key={to} to={to} end={end}
                            title={collapsed ? label : undefined}
                            className={({ isActive }) =>
                              `group relative flex items-center gap-2.5 ${collapsed ? 'justify-center px-1.5 py-2' : 'px-2.5 py-1.5'} rounded-lg text-xs transition-all ${
                                isActive
                                  ? 'bg-white/[0.06] text-ink-1'
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

          {!collapsed && (
            <div className="px-3 py-3 border-t border-white/[0.06]">
              <p className="text-2xs leading-relaxed text-ink-5">
                Data may be delayed or incomplete. Not financial advice.
              </p>
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <Ticker />
          <div className="flex-1 overflow-auto">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
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
