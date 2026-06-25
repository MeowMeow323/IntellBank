import React from 'react'
import { BrainCircuit, FileCheck2, LineChart } from 'lucide-react'
import '../../styles/auth.css'

/**
 * Shared shell for all authentication pages (login / register / forgot / reset).
 *
 * Left: an inverted, animated brand panel (hidden on mobile).
 * Right: the form card, passed in as `children`.
 *
 * Centralising this removes the ~40 lines of duplicated inline styling each
 * auth page previously carried, and guarantees a consistent identity.
 */
const AuthLayout = ({ children }) => {
  return (
    <div className="auth-shell">
      {/* ── Brand panel ── */}
      <aside className="auth-brand-panel">
        <div className="auth-brand-row fade-in-up">
          <div className="auth-brand-mark">IB</div>
          <span className="auth-brand-name">IntellBank</span>
        </div>

        <div>
          <div className="section-label fade-in-up" style={{ marginBottom: '1.25rem' }}>
            <span className="section-label__dot" />
            <span className="section-label__text">Intelligent Question Bank</span>
          </div>

          <h1 className="auth-brand-headline fade-in-up delay-1">
            Study smarter with{' '}
            <span className="gradient-text">AI-powered</span> exam prep.
          </h1>
          <p className="auth-brand-sub fade-in-up delay-2">
            Generate questions, get instant solutions, and track your weak topics —
            all in one focused workspace built for exam success.
          </p>

          <ul className="auth-feature-list fade-in-up delay-3">
            <li>
              <span className="icon-tile"><BrainCircuit size={18} /></span>
              AI-generated questions tailored to your syllabus
            </li>
            <li>
              <span className="icon-tile"><FileCheck2 size={18} /></span>
              Verified, step-by-step worked solutions
            </li>
            <li>
              <span className="icon-tile"><LineChart size={18} /></span>
              Predictive analytics on your weak topics
            </li>
          </ul>
        </div>

        {/* Animated hero graphic */}
        <div className="auth-hero" aria-hidden="true">
          <div className="auth-hero__ring rotate-slow" />
          <div className="auth-hero__blob float-slower" />

          <div className="auth-hero__card auth-hero__card--one float-slow">
            <div className="auth-hero__card-row">
              <span className="auth-hero__chip" />
              <div style={{ flex: 1 }}>
                <div className="auth-hero__line" style={{ width: '80%' }} />
                <div className="auth-hero__line" style={{ width: '55%' }} />
              </div>
            </div>
            <div className="auth-hero__bar"><span /></div>
          </div>

          <div className="auth-hero__card auth-hero__card--two float-slower">
            <div className="auth-hero__card-row">
              <span className="auth-hero__chip" />
              <div style={{ flex: 1 }}>
                <div className="auth-hero__line" style={{ width: '70%' }} />
              </div>
            </div>
            <div className="auth-hero__line" style={{ width: '90%', marginTop: '0.6rem' }} />
          </div>

          <div className="auth-hero__dots">
            {Array.from({ length: 9 }).map((_, i) => <span key={i} />)}
          </div>
        </div>
      </aside>

      {/* ── Form side ── */}
      <main className="auth-form-side">
        <div className="auth-card fade-in-up">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark">IB</div>
            <span className="auth-brand-name" style={{ color: 'var(--text)' }}>IntellBank</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

export default AuthLayout
