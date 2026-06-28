import React, { useState, useEffect } from 'react'
import { VerificationService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/verification.css'

export default function VerificationPage() {
  const [tab, setTab] = useState('submissions') // 'submissions' | 'solutions'

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Verification</h1>
          <p className="page-subtitle">Grade student submissions and verify AI-generated solutions</p>
        </div>

        <div className="vf-tabs">
          <button className={`vf-tab ${tab === 'submissions' ? 'active' : ''}`} onClick={() => setTab('submissions')}>
            Student Submissions
          </button>
          <button className={`vf-tab ${tab === 'solutions' ? 'active' : ''}`} onClick={() => setTab('solutions')}>
            AI Solutions
          </button>
        </div>

        {tab === 'submissions' ? <SubmissionGrading /> : <SolutionVerification />}
      </main>
    </div>
  )
}

/* ─────────────────────────── Submission Grading ─────────────────────────── */
// Status → badge class + label for the queue list.
const SUB_STATUS = {
  PENDING:  { cls: 'badge-amber', label: 'Pending' },
  GRADED:   { cls: 'badge-green', label: 'Graded' },
  RETURNED: { cls: 'badge-gray',  label: 'Returned' },
}

const fmtSubDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '—' }
}

function SubmissionGrading() {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')       // 'list' | 'grade'
  const [activeId, setActiveId] = useState(null)
  const [review, setReview] = useState(null)
  const [marks, setMarks] = useState({})         // { questionId: number }
  const [comments, setComments] = useState({})   // { topicName: feedback }
  const [result, setResult] = useState(null)     // GradeResult after grading

  // List controls
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [sortDir, setSortDir] = useState('desc') // by submitted date

  useEffect(() => { loadQueue() }, [])

  // Distinct topics across the paper — the educator writes one comment per topic.
  const reviewTopics = [...new Set((review?.questions || []).flatMap((q) => q.topics || []))]

  const loadQueue = async () => {
    setLoading(true)
    try {
      const res = await VerificationService.getSubmissionQueue()
      setQueue(res.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const openSubmission = async (id) => {
    setActiveId(id); setReview(null); setResult(null); setMarks({}); setComments({}); setView('grade')
    try {
      const res = await VerificationService.reviewSubmission(id)
      setReview(res.data)
      // pre-zero every question
      const init = {}
        ; (res.data.questions || []).forEach((q) => { init[q.questionId] = 0 })
      setMarks(init)
      // pre-fill any existing per-topic comments
      const initComments = {}
        ; (res.data.topicFeedback || []).forEach((tf) => {
          if (tf.comment) initComments[tf.topicName] = tf.comment
        })
      setComments(initComments)
    } catch { alert('Failed to load submission.'); setView('list') }
  }

  const backToList = () => {
    setView('list'); setActiveId(null); setReview(null); setResult(null)
    loadQueue()
  }

  const setComment = (topicName, value) =>
    setComments((c) => ({ ...c, [topicName]: value }))

  const total = Object.values(marks).reduce((a, b) => a + (Number(b) || 0), 0)
  const maxTotal = (review?.questions || []).reduce((a, q) => a + (q.marks || 0), 0)

  const setMark = (qid, value, max) => {
    let v = Number(value)
    if (Number.isNaN(v) || v < 0) v = 0
    if (v > max) v = max
    setMarks((m) => ({ ...m, [qid]: v }))
  }

  const saveGrade = async () => {
    try {
      const res = await VerificationService.gradeSubmission(activeId, marks, comments)
      setResult(res.data)
      loadQueue()
    } catch { alert('Failed to save grade.') }
  }

  const returnToStudent = async () => {
    try {
      await VerificationService.returnSubmission(activeId)
      backToList()
    } catch { alert('Failed to return submission.') }
  }

  // ── Derived list: subject options + filtered/searched/sorted rows ──
  const subjects = [...new Set(queue.map((s) => s.subject).filter(Boolean))].sort()
  const visible = queue
    .filter((s) => statusFilter === 'ALL' || s.status === statusFilter)
    .filter((s) => subjectFilter === 'ALL' || s.subject === subjectFilter)
    .filter((s) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (s.title || '').toLowerCase().includes(q) || (s.studentName || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const av = a.submittedAt || '', bv = b.submittedAt || ''
      if (av === bv) return 0
      return sortDir === 'desc' ? (av < bv ? 1 : -1) : (av < bv ? -1 : 1)
    })

  // ── Grading view ──────────────────────────────────────────────────────────
  if (view === 'grade') {
    return (
      <div className="card">
        <button className="vf-back" onClick={backToList}>← Back to submissions</button>
        {!review ? (
          <p className="vf-empty">Loading submission…</p>
        ) : (
          <div className="vf-grade-grid">
            {/* Source: the student's answered paper */}
            <div className="vf-pane">
              <h3 className="vf-queue-title" style={{ marginBottom: '0.6rem' }}>Answered Paper — {review.studentName}</h3>
              <div className="vf-source" dangerouslySetInnerHTML={{ __html: review.documentContent || '' }} />
            </div>

            {/* Marks per question */}
            <div className="vf-pane">
              <h3 className="vf-queue-title" style={{ marginBottom: '0.6rem' }}>Award Marks</h3>
              <div className="vf-pane-scroll">
                {review.questions.map((q, i) => (
                  <div key={q.questionId} className="vf-grade-q">
                    <div className="vf-q-head">
                      <div className="vf-q-content"><strong>Q{i + 1}.</strong> {stripHtml(q.content).slice(0, 220)}</div>
                      <div className="vf-mark-box">
                        <input type="number" className="vf-mark-input" min={0} max={q.marks}
                          value={marks[q.questionId] ?? 0}
                          onChange={(e) => setMark(q.questionId, e.target.value, q.marks)} />
                        <span style={{ color: 'var(--color-text-muted)' }}>/ {q.marks}</span>
                      </div>
                    </div>
                    {q.topics?.length > 0 && (
                      <div className="vf-q-topics">
                        {q.topics.map((t) => <span key={t} className="vf-chip">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}

                {/* Per-topic feedback — one comment box per topic, shown to the student */}
                {reviewTopics.length > 0 && (
                  <div className="vf-topic-comments">
                    <h4 className="vf-comments-title">Topic Feedback</h4>
                    <p className="vf-comments-hint">
                      A question's marks are split evenly across its topics. Add a comment per topic — the student sees it on their reviewed paper.
                    </p>
                    {reviewTopics.map((t) => (
                      <div key={t} className="vf-topic-comment">
                        <label className="vf-chip vf-chip-topic">{t}</label>
                        <textarea
                          rows={2}
                          className="vf-textarea"
                          placeholder={`Feedback on "${t}"…`}
                          value={comments[t] ?? ''}
                          onChange={(e) => setComment(t, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="vf-total">
                  <span style={{ color: 'var(--color-text-muted)' }}>Auto-calculated total</span>
                  <span className="vf-total-num">{total} / {maxTotal}</span>
                </div>

                <div className="vf-actions">
                  <button className="vf-btn vf-btn-grade" onClick={saveGrade}>Save Grade</button>
                  {review.status === 'GRADED' && (
                    <button className="vf-btn vf-btn-return" onClick={returnToStudent}>Return to Student</button>
                  )}
                </div>

                {/* Per-topic weakness breakdown returned by the grade endpoint */}
                {result && (
                  <div className="vf-breakdown">
                    <strong>Topic mastery updated (student weakness profile):</strong>
                    {result.topics.map((t) => (
                      <div key={t.topicId} className="vf-bd-row">
                        <div style={{ flex: 1 }}>
                          <span>{t.topicName} — {t.earned}/{t.possible}</span>
                          {t.comment && <div className="vf-bd-comment">"{t.comment}"</div>}
                        </div>
                        <span className={`badge ${t.percentage < 50 ? 'badge-red' : t.percentage < 70 ? 'badge-amber' : 'badge-green'}`}>
                          {t.percentage}% · {t.mastery}
                        </span>
                      </div>
                    ))}
                    <div className="vf-actions">
                      <button className="vf-btn vf-btn-return" onClick={returnToStudent}>Return to Student</button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
        )}
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="vf-toolbar">
        <input
          className="vf-search"
          placeholder="Search by paper or student…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="vf-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="GRADED">Graded</option>
          <option value="RETURNED">Returned</option>
        </select>
        <select className="vf-filter" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="ALL">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="vf-sort" onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}>
          Submitted {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {loading ? (
        <p className="vf-empty">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="vf-empty">{queue.length === 0 ? '✓ No submissions yet.' : 'No submissions match your filters.'}</p>
      ) : (
        <table className="vf-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Student</th>
              <th>Subject</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Score</th>
              <th>Submitted</th>
              <th aria-label="actions"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const meta = SUB_STATUS[s.status] || { cls: 'badge-gray', label: s.status }
              return (
                <tr key={s.submissionId} className="vf-row" onClick={() => openSubmission(s.submissionId)}>
                  <td><div className="vf-row-title">{s.title || 'Untitled paper'}</div></td>
                  <td>{s.studentName || '—'}</td>
                  <td>{s.subject || '—'}</td>
                  <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {s.status === 'GRADED' || s.status === 'RETURNED' ? (s.marks ?? 0) : '—'}
                  </td>
                  <td>{fmtSubDate(s.submittedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="vf-btn vf-btn-grade"
                      onClick={(e) => { e.stopPropagation(); openSubmission(s.submissionId) }}>
                      {s.status === 'PENDING' ? 'Grade' : 'Review'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ─────────────────────── AI Solution Verification ───────────────────────── */
function SolutionVerification() {
  const [solutions, setSolutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editExplanation, setEditExplanation] = useState('')

  useEffect(() => { fetchPending() }, [])

  const fetchPending = async () => {
    setLoading(true)
    try {
      const res = await VerificationService.getPending()
      setSolutions(res.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const approve = async (id) => {
    try { await VerificationService.approve(id); setSolutions((s) => s.filter((x) => x.solutionId !== id)) }
    catch { alert('Failed to approve.') }
  }

  const reject = async (id) => {
    const reason = prompt('Enter reason for rejection:') || 'Does not meet verification standards'
    try { await VerificationService.reject(id, reason); fetchPending() } catch { alert('Failed to reject.') }
  }

  const startEdit = (sol) => { setEditId(sol.solutionId); setEditContent(sol.content); setEditExplanation(sol.explanation || '') }

  const saveEdit = async (id) => {
    try { await VerificationService.edit(id, { content: editContent, explanation: editExplanation }); setEditId(null); fetchPending() }
    catch { alert('Failed to save edit.') }
  }

  if (loading) return <p className="vf-empty">Loading pending solutions…</p>
  if (solutions.length === 0) return <p className="vf-empty">✓ No solutions pending verification.</p>

  return (
    <div className="card">
      {solutions.map((sol) => (
        <div key={sol.solutionId} className="vf-sol">
          <div className="vf-queue-title" style={{ marginBottom: '0.5rem' }}>
            Question: {stripHtml(sol.question?.content || sol.question?.questionId || '')}
          </div>
          {editId === sol.solutionId ? (
            <>
              <textarea rows={4} className="vf-textarea" value={editContent} onChange={(e) => setEditContent(e.target.value)} />
              <textarea rows={2} className="vf-textarea" value={editExplanation} onChange={(e) => setEditExplanation(e.target.value)} />
              <div className="vf-actions">
                <button className="vf-btn vf-btn-grade" onClick={() => saveEdit(sol.solutionId)}>Save</button>
                <button className="vf-btn vf-btn-return" onClick={() => setEditId(null)}>Cancel</button>
              </div>
              <small style={{ color: 'var(--color-text-muted)' }}>Saving writes a SolutionHistory record and resets verification.</small>
            </>
          ) : (
            <>
              <p><strong>Content:</strong> {sol.content}</p>
              {sol.explanation && <p><strong>Explanation:</strong> {sol.explanation}</p>}
              <div className="vf-actions">
                <button className="vf-btn vf-btn-approve" onClick={() => approve(sol.solutionId)}>Approve</button>
                <button className="vf-btn vf-btn-reject" onClick={() => reject(sol.solutionId)}>Reject</button>
                <button className="vf-btn vf-btn-edit" onClick={() => startEdit(sol)}>Edit</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// Strip HTML tags for compact question previews in the grading list.
function stripHtml(html) {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim()
}
