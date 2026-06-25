import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import useAuthStore from '../store/authStore'
import AuthLayout from '../components/auth/AuthLayout'

const ForgotPasswordPage = () => {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()

  const [email, setEmail] = useState('')
  const [sentMessage, setSentMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const message = await forgotPassword(email)
      // Server returns the same generic message whether or not the email exists.
      setSentMessage(message || 'If an account exists for that email, a reset link has been sent.')
    } catch {
      // Error handled in store
    }
  }

  return (
    <AuthLayout>
      {sentMessage ? (
        <div className="auth-form" id="forgot-sent">
          <div className="section-label auth-eyebrow">
            <span className="section-label__dot" />
            <span className="section-label__text">Check your email</span>
          </div>
          <h2 className="auth-title">Link <span className="gradient-text">sent</span></h2>
          <div className="alert alert-success">{sentMessage}</div>
          <p className="auth-lead">
            The link expires shortly and can only be used once. Didn't get it?
            Check your spam folder or try again.
          </p>
          <Link to="/login" className="btn btn-primary">
            <ArrowLeft size={18} /> Back to Sign In
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} id="forgot-form">
          <div className="section-label auth-eyebrow">
            <span className="section-label__dot" />
            <span className="section-label__text">Password Reset</span>
          </div>
          <h2 className="auth-title">Forgot your <span className="gradient-text">password?</span></h2>
          <p className="auth-lead">
            Enter the email associated with your account and we'll send you a link to reset your password.
          </p>

          {error && <div className="alert alert-error" id="forgot-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email" className="form-input"
              placeholder="Enter your email" value={email}
              onChange={(e) => { clearError(); setEmail(e.target.value) }}
              required autoComplete="email"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Sending...' : (
              <>
                Send Reset Link
                <ArrowRight size={18} className="btn-arrow" />
              </>
            )}
          </button>

          <p className="auth-footer">
            Remember your password?{' '}
            <Link to="/login" id="login-link">Sign in</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

export default ForgotPasswordPage
