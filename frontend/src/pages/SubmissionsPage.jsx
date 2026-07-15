import React, { useEffect, useState } from 'react'
import { SubmissionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import { toast } from '../store/toastStore'
import '../styles/submissions.css'

// Status → badge styling + human label
const STATUS_META = {
  PENDING:  { cls: 'badge-amber',  label: 'Pending Review' },
  GRADED:   { cls: 'badge-green',  label: 'Graded' },
  RETURNED: { cls: 'badge-gray',   label: 'Returned' },
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '—' }
}

const SubmissionsPage = () => {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [review, setReview] = useState(null)       // SubmissionReview shown in modal
  const [reviewLoading, setReviewLoading] = useState(false)
  const [withdrawTarget, setWithdrawTarget] = useState(null)  // submissionId pending withdraw confirm
  const [withdrawing, setWithdrawing] = useState(false)

  useEffect(() => { loadSubmissions() }, [])

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const res = await SubmissionService.getMine()
      setSubmissions(res.data || [])
      setError(null)
    } catch {
      setError('Failed to load your submissions.')
    } finally {
      setLoading(false)
    }
  }

  // Withdraw a still-pending submission (frees the one-active-submission slot).
  // Opens a confirm modal first; confirmWithdraw does the actual call.
  const confirmWithdraw = async () => {
    if (!withdrawTarget) return
    setWithdrawing(true)
    try {
      await SubmissionService.unsubmit(withdrawTarget)
      setWithdrawTarget(null)
      await loadSubmissions()
    } catch (err) {
      toast(err?.response?.data?.message || 'Could not withdraw this submission.', 'error')
    } finally {
      setWithdrawing(false)
    }
  }

  // Open the "view reviewed answers" modal for a graded submission
  const openReview = async (id) => {
    setReviewLoading(true)
    setReview({ loading: true })
    try {
      const res = await SubmissionService.reviewMine(id)
      setReview(res.data)
    } catch {
      setReview(null)
      toast('Could not load the reviewed answers.', 'error')
    } finally {
      setReviewLoading(false)
    }
  }

  const hasActive = submissions.some((s) => s.status !== 'RETURNED')

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">My Submissions</h1>
          <p className="page-subtitle">
            Track your submitted practice papers. You can hold one active submission at a time —
            it must be graded &amp; returned (or withdrawn) before submitting another.
          </p>
        </div>

        {hasActive && (
          <div className="sub-banner">
            You currently have an active submission. Withdraw it or wait for it to be returned
            before submitting a new paper.
          </div>
        )}

        <div className="card">
          {loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading submissions…</p>
          ) : error ? (
            <p style={{ color: '#ef4444' }}>{error}</p>
          ) : submissions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>
              No submissions yet. Generate a practice paper in your workspace and submit it for review.
            </p>
          ) : (
            <table className="sub-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Score</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const meta = STATUS_META[s.status] || { cls: 'badge-gray', label: s.status }
                  return (
                    <tr key={s.submissionId}>
                      <td>
                        <div className="sub-doc-title">{s.document?.title || 'Untitled paper'}</div>
                        <div className="sub-doc-sub">Submitted {fmtDate(s.document?.createdAt)}</div>
                      </td>
                      <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {s.status === 'GRADED' || s.status === 'RETURNED'
                          ? `${s.marks ?? 0} / 100`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {(s.status === 'GRADED' || s.status === 'RETURNED') && (
                          <button className="sub-btn sub-btn-view" onClick={() => openReview(s.submissionId)}>
                            View Reviewed
                          </button>
                        )}
                        {s.status === 'PENDING' && (
                          <button className="sub-btn sub-btn-undo" onClick={() => setWithdrawTarget(s.submissionId)}>
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* ── Reviewed answers modal ─────────────────────────────────────────── */}
      {review && (
        <div className="sub-modal-overlay" onClick={() => setReview(null)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            {reviewLoading || review.loading ? (
              <p style={{ color: 'var(--color-text-muted)' }}>Loading reviewed answers…</p>
            ) : (
              <>
                <div className="sub-modal-head">
                  <div>
                    <h2 style={{ margin: 0 }}>{review.documentTitle}</h2>
                    <span className="sub-doc-sub">Reviewed by educator</span>
                  </div>
                  <div className="sub-modal-score">{review.marks ?? 0}<span> / 100</span></div>
                </div>

                {/* Topics assessed in this paper */}
                {review.questions?.length > 0 && (
                  <div className="sub-topics">
                    <div className="sub-topics-label">Topics assessed</div>
                    <div className="sub-topics-chips">
                      {[...new Set(review.questions.flatMap((q) => q.topics || []))].map((t) => (
                        <span key={t} className="sub-chip">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-topic mastery + educator feedback */}
                {review.topicFeedback?.length > 0 && (
                  <div className="sub-feedback">
                    <div className="sub-topics-label">Educator feedback by topic</div>
                    {review.topicFeedback.map((tf) => (
                      <div key={tf.topicId} className="sub-feedback-row">
                        <div className="sub-feedback-head">
                          <span className="sub-feedback-topic">{tf.topicName}</span>
                          <span className={`badge ${
                            tf.masteryLevel === 'Beginner' ? 'badge-red'
                              : tf.masteryLevel === 'Intermediate' ? 'badge-amber' : 'badge-green'}`}>
                            {tf.masteryLevel}
                          </span>
                        </div>
                        {tf.comment
                          ? <p className="sub-feedback-comment">“{tf.comment}”</p>
                          : <p className="sub-feedback-comment sub-feedback-empty">No comment.</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-question educator feedback */}
                {(() => {
                  let qf = []
                  try { qf = review.questionFeedback ? JSON.parse(review.questionFeedback) : [] } catch { qf = [] }
                  return qf.length > 0 ? (
                    <div className="sub-feedback">
                      <div className="sub-topics-label">Educator feedback by question</div>
                      {qf.map((q, i) => (
                        <div key={i} className="sub-feedback-row">
                          <div className="sub-feedback-head">
                            <span className="sub-feedback-topic">{q.question}</span>
                          </div>
                          <p className="sub-feedback-comment">“{q.feedback}”</p>
                        </div>
                      ))}
                    </div>
                  ) : null
                })()}

                {/* The answered paper, rendered read-only */}
                <div className="sub-answers" dangerouslySetInnerHTML={{ __html: review.documentContent || '' }} />

                <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                  <button className="sub-btn sub-btn-view" onClick={() => setReview(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Withdraw confirmation modal ────────────────────────────────────── */}
      {withdrawTarget && (
        <div className="sub-modal-overlay" onClick={() => !withdrawing && setWithdrawTarget(null)}>
          <div className="sub-modal" style={{ width: 'min(440px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 0.5rem' }}>Withdraw submission?</h2>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              This removes the paper from the educator's queue and frees you to submit another. You can re-submit it later.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button className="sub-btn sub-btn-view" disabled={withdrawing} onClick={() => setWithdrawTarget(null)}>Cancel</button>
              <button className="sub-btn sub-btn-undo" disabled={withdrawing} onClick={confirmWithdraw}>
                {withdrawing ? 'Withdrawing…' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default SubmissionsPage
