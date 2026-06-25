import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import useAuthStore from '../store/authStore'
import AuthLayout from '../components/auth/AuthLayout'

// Mirrors the backend password policy (AuthService.validatePassword).
const passwordChecks = (pw) => ({
  length: pw.length >= 8,
  letter: /[a-zA-Z]/.test(pw),
  number: /[0-9]/.test(pw),
})

const ResetPasswordPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const { resetPassword, isLoading, error, clearError } = useAuthStore()

  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')
  const [done, setDone] = useState(false)

  const checks = passwordChecks(form.password)
  const allChecksPass = checks.length && checks.letter && checks.number

  const handleChange = (e) => {
    clearError()
    setLocalError('')
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allChecksPass) {
      setLocalError('Password does not meet the requirements below')
      return
    }
    if (form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }
    try {
      await resetPassword(token, form.password)
      setDone(true)
    } catch {
      // Error handled in store
    }
  }

  const displayError = localError || error

  // No token in the URL → the link is malformed.
  if (!token) {
    return (
      <AuthLayout>
        <div className="auth-form">
          <div className="section-label auth-eyebrow">
            <span className="section-label__dot" />
            <span className="section-label__text">Invalid Link</span>
          </div>
          <h2 className="auth-title">Something's <span className="gradient-text">wrong</span></h2>
          <div className="alert alert-error">
            This password reset link is invalid or incomplete. Please request a new one.
          </div>
          <Link to="/forgot-password" className="btn btn-primary">
            Request New Link
            <ArrowRight size={18} className="btn-arrow" />
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {done ? (
        <div className="auth-form" id="reset-done">
          <div className="section-label auth-eyebrow">
            <span className="section-label__dot" />
            <span className="section-label__text">All Set</span>
          </div>
          <h2 className="auth-title">Password <span className="gradient-text">updated</span></h2>
          <div className="alert alert-success">
            Your password has been reset. You can now sign in with your new password.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/login', { replace: true })}
          >
            Go to Sign In
            <ArrowRight size={18} className="btn-arrow" />
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} id="reset-form">
          <div className="section-label auth-eyebrow">
            <span className="section-label__dot" />
            <span className="section-label__text">New Password</span>
          </div>
          <h2 className="auth-title">Set a new <span className="gradient-text">password</span></h2>

          {displayError && <div className="alert alert-error" id="reset-error">{displayError}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">New Password</label>
            <div className="password-wrap">
              <input
                id="reset-password" name="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Create a new password" value={form.password}
                onChange={handleChange} required autoComplete="new-password"
              />
              <button
                type="button" className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <ul className="pw-requirements">
              <li className={checks.length ? 'met' : ''}>
                {checks.length ? '✓' : '○'} At least 8 characters
              </li>
              <li className={checks.letter ? 'met' : ''}>
                {checks.letter ? '✓' : '○'} Contains a letter
              </li>
              <li className={checks.number ? 'met' : ''}>
                {checks.number ? '✓' : '○'} Contains a number
              </li>
            </ul>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reset-confirm">Confirm New Password</label>
            <input
              id="reset-confirm" name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Repeat new password" value={form.confirmPassword}
              onChange={handleChange} required autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Resetting...' : (
              <>
                Reset Password
                <ArrowRight size={18} className="btn-arrow" />
              </>
            )}
          </button>

          <p className="auth-footer">
            <Link to="/login" id="login-link">Back to Sign In</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

export default ResetPasswordPage
