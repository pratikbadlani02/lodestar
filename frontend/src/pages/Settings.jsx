import { useState } from 'react'
import { ShieldAlert, ShieldCheck, Pause, Play, AlertOctagon, Settings as SettingsIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useStore, selectControl } from '../lib/store'
import {
  PageShell, PageHeader, Card, SectionHeader, Button, Input, Alert, Pill, SkeletonRows,
} from '../components/ui/primitives'

export default function Settings() {
  const ctrl = useStore(selectControl)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function run(fn) {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e.message) }
    finally { setBusy(false); useStore.getState().loadControl() }
  }

  return (
    <PageShell>
      <PageHeader
        icon={SettingsIcon}
        title="Settings & Controls"
        subtitle="Runtime control and safety switches"
      />

      {!ctrl ? (
        <Card className="p-5"><SkeletonRows count={3} cols={3} /></Card>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <ModeBanner isLive={ctrl.is_live} />

          {err && <Alert variant="error">{err}</Alert>}

          <ControlCard
            title="Global Trading"
            subtitle="Kill switch — stops all order submission (does not close positions)"
            state={ctrl.trading_enabled ? 'Active' : 'Halted'}
            stateVariant={ctrl.trading_enabled ? 'up' : 'down'}
          >
            {ctrl.trading_enabled ? (
              <KillButton disabled={busy} onKill={(reason) => run(() => api.kill(reason))} />
            ) : (
              <Button variant="up" icon={Play} disabled={busy} onClick={() => run(() => api.resume())}>
                Resume Trading
              </Button>
            )}
          </ControlCard>

          <ControlCard
            title="Strategy Execution"
            subtitle="Pause or resume all strategy ticks — manual orders are unaffected"
            state={ctrl.strategies_enabled ? 'Running' : 'Paused'}
            stateVariant={ctrl.strategies_enabled ? 'up' : 'warn'}
          >
            {ctrl.strategies_enabled ? (
              <Button variant="ghost" icon={Pause} disabled={busy}
                onClick={() => run(() => api.pauseStrategies())}
                className="!bg-warn/10 !border-warn/30 !text-warn hover:!bg-warn/20">
                Pause Strategies
              </Button>
            ) : (
              <Button variant="up" icon={Play} disabled={busy}
                onClick={() => run(() => api.resumeStrategies())}>
                Resume Strategies
              </Button>
            )}
          </ControlCard>

          <ControlCard
            title="Emergency Liquidation"
            subtitle="Cancel all open orders AND close every position. Use in extreme situations only."
            danger
          >
            <LiquidateButton disabled={busy} onLiquidate={(reason) => run(() => api.liquidate(reason))} />
          </ControlCard>
        </div>
      )}
    </PageShell>
  )
}

function ModeBanner({ isLive }) {
  if (isLive) {
    return (
      <Alert variant="error" title="LIVE TRADING ACTIVE">
        Real money at risk. Enabled via <code className="font-mono text-2xs">ALPACA_LIVE_CONFIRMED=true</code> in .env
      </Alert>
    )
  }
  return (
    <Alert variant="success" title="PAPER TRADING MODE">
      Safe mode — no real money at risk. Default setting.
    </Alert>
  )
}

function ControlCard({ title, subtitle, state, stateVariant, danger, children }) {
  return (
    <Card className={`p-5 ${danger ? 'border-down/40' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-ink-1">{title}</h3>
          <p className="text-2xs text-ink-4 mt-1 leading-relaxed">{subtitle}</p>
        </div>
        {state && <Pill variant={stateVariant} className="uppercase tracking-wider">{state}</Pill>}
      </div>
      {children}
    </Card>
  )
}

function KillButton({ onKill, disabled }) {
  const [show, setShow] = useState(false)
  const [reason, setReason] = useState('')

  if (!show) return (
    <Button variant="down" icon={ShieldAlert} disabled={disabled} onClick={() => setShow(true)}>
      Activate Kill Switch
    </Button>
  )

  return (
    <div className="space-y-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
      <div className="flex gap-2">
        <Button variant="down" className="flex-1"
          disabled={!reason}
          onClick={() => { onKill(reason); setShow(false); setReason('') }}>
          Confirm Kill
        </Button>
        <Button variant="ghost" onClick={() => { setShow(false); setReason('') }}>Cancel</Button>
      </div>
    </div>
  )
}

function LiquidateButton({ onLiquidate, disabled }) {
  const [show, setShow] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')

  if (!show) return (
    <Button variant="down" icon={AlertOctagon} disabled={disabled} onClick={() => setShow(true)}>
      Liquidate All Positions
    </Button>
  )

  return (
    <div className="space-y-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus />
      <Input mono value={confirm} onChange={(e) => setConfirm(e.target.value)}
        placeholder='Type "LIQUIDATE" to confirm'
        className="!border-down/40 focus:!border-down" />
      <div className="flex gap-2">
        <Button variant="down" className="flex-1"
          disabled={confirm !== 'LIQUIDATE' || !reason}
          onClick={() => { onLiquidate(reason); setShow(false); setConfirm(''); setReason('') }}>
          CONFIRM LIQUIDATE
        </Button>
        <Button variant="ghost" onClick={() => { setShow(false); setConfirm(''); setReason('') }}>Cancel</Button>
      </div>
    </div>
  )
}
