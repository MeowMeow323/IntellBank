import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { AdminUserService } from '../services/api'
import useAuthStore from '../store/authStore'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/modals.css'

const ROLES = ['STUDENT', 'EDUCATOR', 'ADMIN']
const ROLE_BADGE = { STUDENT: 'badge-blue', EDUCATOR: 'badge-purple', ADMIN: 'badge-red' }

const SORT_COLUMNS = [
  { key: 'fullName',  label: 'Name' },
  { key: 'email',     label: 'Email' },
  { key: 'role',      label: 'Role' },
  { key: 'isActive',  label: 'Status' },
  { key: 'createdAt', label: 'Created' },
]

const sortValue = (u, key) => {
  if (key === 'isActive') return u.isActive ? 1 : 0
  if (key === 'createdAt') return u.createdAt ? new Date(u.createdAt).getTime() : 0
  return (u[key] || '').toString().toLowerCase()
}

// Mirrors the backend's PasswordPolicy: at least 8 characters, a letter, and a number.
const passwordChecks = (pw) => ({
  length: pw.length >= 8,
  letter: /[a-zA-Z]/.test(pw),
  number: /[0-9]/.test(pw),
})

const emptyCreateForm = { fullName: '', email: '', password: '', role: 'STUDENT' }

/**
 * Admin → Users: create, edit, and deactivate accounts of any role.
 */
export default function AdminUsersPage() {
  const { user: currentUser } = useAuthStore()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('fullName')
  const [sortDir, setSortDir] = useState('asc')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editError, setEditError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [statusTarget, setStatusTarget] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true); setLoadError('')
    try {
      const res = await AdminUserService.getAll()
      setUsers(res.data || [])
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Failed to load users.')
    } finally { setLoading(false) }
  }

  const isSelf = (u) => u.userId === currentUser?.userId

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = !q ? users : users.filter((u) =>
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q))

    const dir = sortDir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [users, search, sortKey, sortDir])

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────
  const openCreate = () => { setCreateForm(emptyCreateForm); setCreateError(''); setIsCreateOpen(true) }
  const closeCreate = () => setIsCreateOpen(false)

  const submitCreate = async (e) => {
    e.preventDefault()
    const checks = passwordChecks(createForm.password)
    if (!checks.length || !checks.letter || !checks.number) {
      setCreateError('Password must be at least 8 characters and contain a letter and a number.')
      return
    }
    setIsCreating(true); setCreateError('')
    try {
      const res = await AdminUserService.create(createForm)
      setUsers((list) => [...list, res.data])
      setIsCreateOpen(false)
    } catch (err) {
      setCreateError(err?.response?.data?.message || 'Failed to create user.')
    } finally { setIsCreating(false) }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditTarget(u)
    setEditForm({ fullName: u.fullName || '', email: u.email || '', role: u.role })
    setEditError('')
  }
  const closeEdit = () => setEditTarget(null)

  const submitEdit = async (e) => {
    e.preventDefault()
    setIsSaving(true); setEditError('')
    try {
      const res = await AdminUserService.update(editTarget.userId, editForm)
      setUsers((list) => list.map((u) => (u.userId === editTarget.userId ? res.data : u)))
      setEditTarget(null)
    } catch (err) {
      setEditError(err?.response?.data?.message || 'Failed to update user.')
    } finally { setIsSaving(false) }
  }

  // ── Deactivate / Activate ────────────────────────────────────────────────
  const askToggleStatus = (u) => { setStatusTarget(u); setStatusError('') }
  const cancelToggleStatus = () => setStatusTarget(null)

  const confirmToggleStatus = async () => {
    setIsTogglingStatus(true); setStatusError('')
    try {
      const res = await AdminUserService.update(statusTarget.userId, { isActive: !statusTarget.isActive })
      setUsers((list) => list.map((u) => (u.userId === statusTarget.userId ? res.data : u)))
      setStatusTarget(null)
    } catch (err) {
      setStatusError(err?.response?.data?.message || 'Failed to update account status.')
    } finally { setIsTogglingStatus(false) }
  }

  const createChecks = passwordChecks(createForm.password)

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Manage Users</h1>
            <p className="page-subtitle">Create, edit, and deactivate user accounts of any role.</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
        </div>

        <input
          type="text"
          className="input form-input admin-users-search"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : loadError ? (
          <p style={{ color: 'var(--danger, #d32f2f)' }}>{loadError}</p>
        ) : (
          <div className="card admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  {SORT_COLUMNS.map((col) => {
                    const active = sortKey === col.key
                    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                    return (
                      <th key={col.key}>
                        <button type="button" className={`admin-users-sort ${active ? 'active' : ''}`} onClick={() => handleSort(col.key)}>
                          {col.label} <Icon size={13} />
                        </button>
                      </th>
                    )
                  })}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.fullName || '—'}{isSelf(u) && <span className="admin-users-you"> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-blue'}`}>{u.role}</span></td>
                    <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="admin-users-actions">
                      <button className="btn btn-secondary" onClick={() => openEdit(u)}>Edit</button>
                      <button
                        className={u.isActive ? 'btn btn-danger' : 'btn btn-secondary'}
                        onClick={() => askToggleStatus(u)}
                        disabled={isSelf(u)}
                        title={isSelf(u) ? "You can't deactivate your own account" : undefined}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--color-text-muted)' }}>No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Create Modal ── */}
        {isCreateOpen && (
          <div className="modal-overlay" onClick={closeCreate}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Add User</h2>
              <form onSubmit={submitCreate}>
                {createError && <div className="alert alert-error">{createError}</div>}
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    required
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-input"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    autoComplete="new-password"
                  />
                  <ul className="pw-requirements">
                    <li className={createChecks.length ? 'met' : ''}>
                      {createChecks.length ? '✓' : '○'} At least 8 characters
                    </li>
                    <li className={createChecks.letter ? 'met' : ''}>
                      {createChecks.letter ? '✓' : '○'} Contains a letter
                    </li>
                    <li className={createChecks.number ? 'met' : ''}>
                      {createChecks.number ? '✓' : '○'} Contains a number
                    </li>
                  </ul>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeCreate}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isCreating}>
                    {isCreating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Edit Modal ── */}
        {editTarget && editForm && (
          <div className="modal-overlay" onClick={closeEdit}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Edit {editTarget.fullName || editTarget.email}</h2>
              <form onSubmit={submitEdit}>
                {editError && <div className="alert alert-error">{editError}</div>}
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="form-input"
                    value={editForm.role}
                    disabled={isSelf(editTarget)}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {isSelf(editTarget) && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      You cannot change your own role.
                    </p>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeEdit}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Deactivate / Activate Confirmation ── */}
        {statusTarget && (
          <div className="modal-overlay" onClick={cancelToggleStatus}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>
                {statusTarget.isActive ? 'Deactivate' : 'Activate'} {statusTarget.fullName || statusTarget.email}?
              </h2>
              <p>
                {statusTarget.isActive
                  ? 'This will immediately prevent them from logging in. You can reactivate the account at any time.'
                  : 'This will restore their ability to log in.'}
              </p>
              {statusError && <div className="alert alert-error">{statusError}</div>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={cancelToggleStatus} disabled={isTogglingStatus}>
                  Cancel
                </button>
                <button
                  className={statusTarget.isActive ? 'btn btn-danger' : 'btn btn-primary'}
                  onClick={confirmToggleStatus}
                  disabled={isTogglingStatus}
                >
                  {isTogglingStatus
                    ? (statusTarget.isActive ? 'Deactivating…' : 'Activating…')
                    : (statusTarget.isActive ? 'Deactivate' : 'Activate')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .admin-users-search { max-width: 360px; margin-bottom: 1rem; display: block; }
        .admin-users-table-wrap { overflow-x: auto; }
        .admin-users-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .admin-users-table th, .admin-users-table td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--color-border); }
        .admin-users-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
        .admin-users-you { color: var(--color-text-muted); font-size: 0.78rem; }
        .admin-users-sort {
          display: inline-flex; align-items: center; gap: 0.3rem;
          background: none; border: none; padding: 0; cursor: pointer;
          font: inherit; font-weight: 600; color: var(--color-text-muted);
        }
        .admin-users-sort:hover { color: var(--color-text-primary); }
        .admin-users-sort.active { color: var(--color-primary); }
      `}</style>
    </div>
  )
}
