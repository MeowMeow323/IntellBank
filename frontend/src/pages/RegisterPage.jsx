import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const ROLES = ['STUDENT', 'EDUCATOR', 'ADMIN']

const RegisterPage = () => {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuthStore()

  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'STUDENT',
  })
  const [localError, setLocalError] = useState('')

  const handleChange = (e) => {
    clearError()
    setLocalError('')
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }
    try {
      const { confirmPassword, ...payload } = form
      await register(payload)
      navigate('/login')
    } catch {
      // Error handled in store
    }
  }

  const displayError = localError || error

  return (
    <div className="auth-page">
      <div className="auth-container fade-in">
        <div className="auth-brand">
          <div className="auth-logo">IB</div>
          <h1 className="auth-title">IntellBank</h1>
          <p className="auth-subtitle">Create your account</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} id="register-form">
          <h2 className="auth-form-title">Get Started</h2>

          {displayError && (
            <div className="alert alert-error" id="register-error">
              {displayError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="fullName">Full Name</label>
            <input
              id="fullName" name="fullName" type="text" className="form-input"
              placeholder="John Doe" value={form.fullName} onChange={handleChange} required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-username">Username</label>
            <input
              id="reg-username" name="username" type="text" className="form-input"
              placeholder="john_doe" value={form.username} onChange={handleChange} required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email" className="form-input"
              placeholder="john@example.com" value={form.email} onChange={handleChange} required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="role">Role</label>
            <select
              id="role" name="role" className="form-select"
              value={form.role} onChange={handleChange}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password" name="password" type="password" className="form-input"
              placeholder="Min. 8 characters" value={form.password} onChange={handleChange} required minLength={8}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword" name="confirmPassword" type="password" className="form-input"
              placeholder="Repeat password" value={form.confirmPassword} onChange={handleChange} required
            />
          </div>

          <button id="register-submit" type="submit" className="btn btn-primary w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" id="login-link">Sign in</Link>
        </p>
      </div>

      <style>{`
        .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--desk); background-image: radial-gradient(ellipse at 50% -10%, var(--highlight-soft) 0%, transparent 55%); padding: 1rem; }
        .auth-container { width: 100%; max-width: 440px; }
        .auth-brand { text-align: center; margin-bottom: 2rem; }
        .auth-logo { width: 60px; height: 60px; background: var(--gradient-primary); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0 auto 1rem; box-shadow: var(--shadow-glow); }
        .auth-title { font-family: var(--font-heading); font-size: 1.85rem; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
        .auth-subtitle { color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.25rem; }
        .auth-form { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 2rem; display: flex; flex-direction: column; gap: 1.1rem; }
        .auth-form-title { font-size: 1.25rem; font-weight: 600; color: var(--color-text-primary); }
        .alert { padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.875rem; }
        .alert-error { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); color: var(--color-accent-rose); }
        .auth-footer { text-align: center; margin-top: 1.25rem; color: var(--color-text-secondary); font-size: 0.875rem; }
      `}</style>
    </div>
  )
}

export default RegisterPage
