import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useAuthStore()

  // Field name is 'email' — matches the backend AuthService.login() which reads data.get("email")
  const [form, setForm] = useState({ email: '', password: '' })

  const handleChange = (e) => {
    clearError()
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(form)
      navigate('/dashboard')
    } catch {
      // Error handled in store
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container fade-in">
        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-logo">IB</div>
          <h1 className="auth-title">IntellBank</h1>
          <p className="auth-subtitle">Intelligent Educational Question Bank</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} id="login-form">
          <h2 className="auth-form-title">Welcome Back</h2>

          {error && (
            <div className="alert alert-error" id="login-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="Enter your email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary w-full"
            disabled={isLoading}
          >
            {isLoading ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" id="register-link">Create one here</Link>
        </p>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-primary);
          background-image:
            radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.08) 0%, transparent 60%);
          padding: 1rem;
        }
        .auth-container {
          width: 100%;
          max-width: 420px;
        }
        .auth-brand {
          text-align: center;
          margin-bottom: 2rem;
        }
        .auth-logo {
          width: 60px;
          height: 60px;
          background: var(--gradient-primary);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 1.4rem;
          font-weight: 700;
          color: #fff;
          margin: 0 auto 1rem;
          box-shadow: var(--shadow-glow);
        }
        .auth-title {
          font-size: 1.75rem;
          font-weight: 700;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .auth-subtitle {
          color: var(--color-text-secondary);
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }
        .auth-form {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .auth-form-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--color-text-primary);
        }
        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
        }
        .alert-error {
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.3);
          color: var(--color-accent-rose);
        }
        .auth-footer {
          text-align: center;
          margin-top: 1.25rem;
          color: var(--color-text-secondary);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  )
}

export default LoginPage
