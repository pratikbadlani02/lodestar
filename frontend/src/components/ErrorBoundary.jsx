import { Component } from 'react'
import { AlertOctagon, RefreshCw, Home } from 'lucide-react'
import { Card, Button } from './ui/primitives'

// Route-level error boundary. Wraps <Outlet/> so a crash in one page doesn't
// take down the sidebar, top bar, or other navigation chrome — the user can
// retry the route or go home.
export default class ErrorBoundary extends Component {
  state = { err: null, info: null }

  static getDerivedStateFromError(err) { return { err } }

  componentDidCatch(err, info) {
    this.setState({ info })
    // Surface to console for now; hook into Sentry/observability here later.
    console.error('Route error:', err, info)
  }

  reset = () => this.setState({ err: null, info: null })

  render() {
    if (!this.state.err) return this.props.children

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-down/15 border border-down/30 flex items-center justify-center text-down">
              <AlertOctagon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink-1">Something broke on this page</h2>
              <p className="text-sm text-ink-3 mt-1">
                The rest of the app is fine — only this view crashed. You can retry the page or go back to the workspace.
              </p>
              <details className="mt-4 text-2xs text-ink-4">
                <summary className="cursor-pointer hover:text-ink-2 transition select-none">Show technical details</summary>
                <pre className="mt-2 font-mono text-2xs bg-white/[0.03] border border-white/[0.06] rounded p-3 overflow-x-auto leading-relaxed text-down">
                  {String(this.state.err?.stack || this.state.err)}
                </pre>
              </details>
              <div className="mt-5 flex items-center gap-2">
                <Button variant="primary" icon={RefreshCw} onClick={this.reset}>Retry</Button>
                <Button variant="ghost" icon={Home} onClick={() => { window.location.href = '/' }}>Workspace</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }
}
