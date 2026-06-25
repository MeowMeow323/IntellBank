import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import useAuthStore from '../store/authStore'
import AuthLayout from '../components/auth/AuthLayout'

// Mirrors the backend password policy (AuthService.validatePassword).
const passwordChecks = (pw) => ({
  length: pw.length >= 8,
  letter: /[a-zA-Z]/.test(pw),
  number: /[0-9]/.test(pw),
})

// 0–4 strength score for the meter (length + character variety).
const passwordStrength = (pw) => {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLORS = ['#B91C1C', '#B45309', '#EAB308', '#84cc16', '#15803D']

const RegisterPage = () => {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuthStore()

  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')

  const checks = passwordChecks(form.password)
  const allChecksPass = checks.length && checks.letter && checks.number
  const strength = passwordStrength(form.password)

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
      const { confirmPassword, ...payload } = form
      await register(payload)
      navigate('/login')
    } catch {
      // Error handled in store
    }
  }

  const displayError = localError || error

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit} id="register-form">
        <div className="section-label auth-eyebrow">
          <span className="section-label__dot" />
          <span className="section-label__text">Get Started</span>
        </div>
        <h2 className="auth-title">Create your <span className="gradient-text">account</span></h2>

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
          <label className="form-label" htmlFor="reg-password">Password</label>
          <div className="password-wrap">
            <input
              id="reg-password" name="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Create a password" value={form.password}
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

          {form.password && (
            <>
              <div className="strength-bar" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="strength-seg"
                    style={{ background: i < strength ? STRENGTH_COLORS[strength] : undefined }}
                  />
                ))}
              </div>
              <p className="strength-label" style={{ color: STRENGTH_COLORS[strength] }}>
                {STRENGTH_LABELS[strength]}
              </p>
            </>
          )}

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
          <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword" name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="Repeat password" value={form.confirmPassword}
            onChange={handleChange} required autoComplete="new-password"
          />
        </div>

        <button id="register-submit" type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Creating account...' : (
            <>
              Create Account
              <ArrowRight size={18} className="btn-arrow" />
            </>
          )}
        </button>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" id="login-link">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export default RegisterPage
