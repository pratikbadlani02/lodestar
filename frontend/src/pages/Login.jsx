import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Input, FormField, Alert } from '../components/ui/primitives'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null); setLoading(true)
    try {
      await api.login(username, password)
      navigate('/')
    } catch (e2) {
      setErr(e2.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background — matches global theme */}
      <div className="absolute inset-0 -z-10 bg-surf-0" />
      <div
        className="absolute inset-0 -z-10 opacity-60 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% -10%, rgba(34, 211, 238, 0.10), transparent 50%), radial-gradient(circle at 80% 110%, rgba(38, 194, 129, 0.08), transparent 50%)',
        }}
      />

      <form onSubmit={submit} className="w-full max-w-sm card-surface p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-7">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-brand-grad flex items-center justify-center shadow-glow-accent">
              <Activity size={20} className="text-[#fff]" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-brand-grad opacity-30 blur-md -z-10" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink-1 leading-tight">Lodestar</h1>
            <p className="text-2xs uppercase tracking-[0.16em] text-ink-4 font-medium mt-0.5">Admin Dashboard</p>
          </div>
        </div>

        <div className="space-y-4">
          <FormField label="Username">
            <Input
              type="text"
              mono
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="admin"
            />
          </FormField>
          <FormField label="Password">
            <Input
              type="password"
              mono
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </FormField>

          {err && <Alert variant="error">{err}</Alert>}

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            icon={Lock}
            className="w-full justify-center"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </div>

        <p className="text-2xs text-ink-4 text-center mt-6 leading-relaxed">
          Default credentials in <span className="font-mono">.env</span> — change before production use.
        </p>
      </form>
    </div>
  )
}
