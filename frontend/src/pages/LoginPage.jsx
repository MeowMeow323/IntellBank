import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import useAuthStore from '../store/authStore'
import AuthLayout from '../components/auth/AuthLayout'

const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, clearError } = useAuthStore()

  // Field name is 'email' — matches the backend AuthService.login() which reads data.get("email")
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)

  // Notice shown when the response interceptor bounced us here on token expiry.
  const sessionExpired = new URLSearchParams(location.search).get('expired') === '1'

  // Where to send the user after login: the page they were blocked from, or dashboard.
  const redirectTo = location.state?.from?.pathname || '/dashboard'

  const handleChange = (e) => {
    clearError()
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(form, remember)
      navigate(redirectTo, { replace: true })
    } catch {
      // Error handled in store
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit} id="login-form">
        <div className="section-label auth-eyebrow">
          <span className="section-label__dot" />
          <span className="section-label__text">Welcome Back</span>
        </div>
        <h2 className="auth-title">Sign in to <span className="gradient-text">IntellBank</span></h2>

        {sessionExpired && !error && (
          <div className="alert alert-info" id="login-expired">
            Your session expired. Please sign in again.
          </div>
        )}

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
          <div className="password-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="auth-options">
          <label className="remember-me">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <Link to="/forgot-password" id="forgot-password-link" className="forgot-link">
            Forgot password?
          </Link>
        </div>

        <button id="login-submit" type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="spinner" style={{ width: '1rem', height: '1rem' }} />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight size={18} className="btn-arrow" />
            </>
          )}
        </button>

        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" id="register-link">Create one here</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export default LoginPage
