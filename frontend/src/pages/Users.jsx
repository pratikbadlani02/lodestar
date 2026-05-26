import { useEffect, useState } from 'react'
import { Users as UsersIcon, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import {
  PageShell, PageHeader, Card, Button, IconButton, Modal,
  Input, Select, FormField, Alert, Pill, SkeletonRows,
} from '../components/ui/primitives'
import EmptyState from '../components/ui/EmptyState'

export default function Users() {
  const [users, setUsers] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try { setUsers(await api.listUsers()) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function remove(id) {
    if (!confirm('Delete this user?')) return
    try { await api.deleteUser(id); load() }
    catch (e) { setErr(e.message) }
  }

  async function setRole(id, role) {
    try { await api.updateUserRole(id, role); load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Manage platform access (admin only)"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            New User
          </Button>
        }
      />

      {err && <Alert variant="error" onDismiss={() => setErr(null)} className="mb-3">{err}</Alert>}

      <Card className="overflow-hidden mb-3">
        {loading ? (
          <div className="p-5"><SkeletonRows count={4} cols={4} /></div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No users yet"
            body="The config-based admin can always log in. Add additional users here for team access."
            action={() => setShowCreate(true)}
            actionLabel="New User"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm t-dense">
              <thead>
                <tr>
                  <th className="text-left">Username</th>
                  <th className="text-left">Role</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold text-ink-1">{u.username}</td>
                    <td>
                      <Select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="!py-1 !text-xs max-w-[120px]">
                        <option value="admin">admin</option>
                        <option value="viewer">viewer</option>
                      </Select>
                    </td>
                    <td>
                      <Pill variant={u.is_active ? 'up' : 'neutral'}>{u.is_active ? 'active' : 'disabled'}</Pill>
                    </td>
                    <td className="text-ink-4 font-mono text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <IconButton icon={Trash2} label="Delete user" variant="danger" size="sm" onClick={() => remove(u.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 text-xs text-ink-3 leading-relaxed space-y-1.5">
        <p><Pill variant="up" className="mr-1">admin</Pill> — manage strategies, submit orders, use kill switch, and manage users.</p>
        <p><Pill variant="info" className="mr-1">viewer</Pill> — read-only access to dashboards, charts, and analytics.</p>
        <p className="text-ink-5 pt-1">The config-based admin account (from .env) always has admin rights regardless of this table.</p>
      </Card>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={() => { setShowCreate(false); load() }} />
      )}
    </PageShell>
  )
}

function CreateModal({ onClose, onCreate }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')
  const [err, setErr] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setErr(null)
    try { await api.createUser({ username, password, role }); onCreate() }
    catch (e2) { setErr(e2.message) }
    finally { setSubmitting(false) }
  }

  return (
    <Modal
      icon={UsersIcon}
      title="New User"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create User'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <FormField label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoFocus />
        </FormField>
        <FormField label="Password" hint="At least 6 characters">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </FormField>
        <FormField label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="admin">Admin (full access)</option>
          </Select>
        </FormField>
        {err && <Alert variant="error">{err}</Alert>}
      </form>
    </Modal>
  )
}
