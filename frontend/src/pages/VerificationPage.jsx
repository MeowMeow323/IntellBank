import React, { useState, useEffect } from 'react'
import { VerificationService } from '../services/api'
import { toast } from '../store/toastStore'
import Sidebar from '../components/layout/Sidebar.jsx'
import SolutionContent from '../components/SolutionContent.jsx'
import Paginator from '../components/Paginator.jsx'
import '../styles/verification.css'

const SOL_PAGE_SIZE = 10

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

/* ── Marking-scheme tree (Question → a/b/c → i/ii/iii) ─────────────────────── */
let _mkUid = 0
const mkNode = () => ({ key: `mk${++_mkUid}`, marks: '', awarded: '', topicId: '', children: [] })

const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
const mkLabel = (depth, index) =>
  depth === 0 ? `Question ${index + 1}`
    : depth === 1 ? `${String.fromCharCode(97 + (index % 26))})`
      : depth === 2 ? `${ROMANS[index] || index + 1})`
        : `${index + 1}.`

const mkMap = (nodes, key, fn) =>
  nodes.map((n) => (n.key === key ? fn(n) : { ...n, children: mkMap(n.children, key, fn) }))
const mkRemove = (nodes, key) =>
  nodes.filter((n) => n.key !== key).map((n) => ({ ...n, children: mkRemove(n.children, key) }))
const mkLeafSum = (nodes, field) =>
  nodes.reduce((acc, n) => acc + (n.children.length ? mkLeafSum(n.children, field) : (Number(n[field]) || 0)), 0)
const mkCollect = (nodes, acc) => {
  nodes.forEach((n) => {
    if (n.children.length) mkCollect(n.children, acc)
    else if (n.topicId) {
      const a = acc[n.topicId] || { earned: 0, possible: 0 }
      a.earned += Number(n.awarded) || 0
      a.possible += Number(n.marks) || 0
      acc[n.topicId] = a
    }
  })
  return acc
}
const mkContains = (node, key) => node.key === key || node.children.some((c) => mkContains(c, key))
const mkFind = (nodes, key) => {
  for (const n of nodes) {
    if (n.key === key) return n
    const f = mkFind(n.children, key)
    if (f) return f
  }
  return null
}
// Sum of a leaf `field` under `node`, excluding one leaf — used to compute the remaining
// budget so a question's parts can never total more than 25 (for marks OR awarded).
const mkLeafFieldExcluding = (node, excludeKey, field) =>
  node.children.length === 0
    ? (node.key === excludeKey ? 0 : (Number(node[field]) || 0))
    : node.children.reduce((a, c) => a + mkLeafFieldExcluding(c, excludeKey, field), 0)

// One node in the marking tree. Top-level questions are locked at 25 marks each and
// carry a feedback box; sub-parts are freely added/removed. Parents show the running
// sub-total (a top-level question warns when its parts don't add up to 25).
function MarkNode({ node, depth, index, topics, disabled, onField, onAdd, onRemove }) {
  const isLeaf = node.children.length === 0
  const isTop = depth === 0
  const subPossible = mkLeafSum([node], 'marks')
  const subAwarded = mkLeafSum([node], 'awarded')
  const badSum = isTop && !isLeaf && subPossible !== 25

  return (
    <div className="mk-node" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className={`mk-row ${isTop ? 'mk-q' : ''}`}>
        <span className="mk-label">{mkLabel(depth, index)}</span>
        {isLeaf ? (
          <>
            <input type="number" min="0" className="mk-num" placeholder="0" title="Marks awarded"
              value={node.awarded} disabled={disabled}
              onChange={(e) => onField(node.key, 'awarded', e.target.value)} />
            <span className="mk-slash">/</span>
            {isTop ? (
              <span className="mk-fixed" title="Each question is worth 25">25</span>
            ) : (
              <input type="number" min="0" className="mk-num" placeholder="max" title="Marks available"
                value={node.marks} disabled={disabled}
                onChange={(e) => onField(node.key, 'marks', e.target.value)} />
            )}
            <select className="mk-topic" value={node.topicId} disabled={disabled}
              onChange={(e) => onField(node.key, 'topicId', e.target.value)}>
              <option value="">— topic —</option>
              {topics.map((t) => <option key={t.topicId} value={t.topicId}>{t.name}</option>)}
            </select>
          </>
        ) : (
          <span className={`mk-sum ${badSum ? 'mk-bad' : ''}`}>
            {subAwarded} / {subPossible}{isTop ? ' (of 25)' : ''}
          </span>
        )}
        {!disabled && (
          <span className="mk-btns">
            <button type="button" className="mk-btn" title="Add sub-part" onClick={() => onAdd(node.key)}>＋</button>
            {!isTop && <button type="button" className="mk-btn mk-del" title="Remove" onClick={() => onRemove(node.key)}>✕</button>}
          </span>
        )}
      </div>

      {isTop && (
        <textarea className="mk-feedback vf-textarea" rows={2} disabled={disabled}
          placeholder={`Feedback on ${mkLabel(0, index)}…`}
          value={node.feedback || ''}
          onChange={(e) => onField(node.key, 'feedback', e.target.value)} />
      )}

      {node.children.map((c, i) => (
        <MarkNode key={c.key} node={c} depth={depth + 1} index={i} topics={topics}
          disabled={disabled} onField={onField} onAdd={onAdd} onRemove={onRemove} />
      ))}
    </div>
  )
}

function SubmissionGrading() {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')       // 'list' | 'grade'
  const [activeId, setActiveId] = useState(null)
  const [review, setReview] = useState(null)
  const [tree, setTree] = useState([])           // marking-scheme tree (Q → a/b/c → i/ii/iii)
  const [comments, setComments] = useState({})   // { topicId: feedback }
  const [result, setResult] = useState(null)     // GradeResult after grading

  // List controls
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [sortDir, setSortDir] = useState('desc') // by submitted date

  useEffect(() => { loadQueue() }, [])

  const loadQueue = async () => {
    setLoading(true)
    try {
      const res = await VerificationService.getSubmissionQueue()
      setQueue(res.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const openSubmission = async (id) => {
    setActiveId(id); setReview(null); setResult(null); setTree([]); setComments({}); setView('grade')
    try {
      const res = await VerificationService.reviewSubmission(id)
      setReview(res.data)
      // Locked structure: exactly 4 questions × 25 = 100 marks. Pre-fill saved feedback.
      let qf = []
      try { qf = res.data.questionFeedback ? JSON.parse(res.data.questionFeedback) : [] } catch { qf = [] }
      setTree(Array.from({ length: 4 }, (_, i) => ({ ...mkNode(), marks: 25, feedback: qf[i]?.feedback || '' })))
      // Pre-fill any existing per-topic comments (keyed by topicId).
      const initComments = {}
        ; (res.data.topicFeedback || []).forEach((tf) => {
          if (tf.comment) initComments[tf.topicId] = tf.comment
        })
      setComments(initComments)
    } catch { toast('Failed to load submission.', 'error'); setView('list') }
  }

  const backToList = () => {
    setView('list'); setActiveId(null); setReview(null); setResult(null)
    loadQueue()
  }

  const setComment = (topicId, value) =>
    setComments((c) => ({ ...c, [topicId]: value }))

  // ── Marking-tree operations ──
  const setNodeField = (key, field, value) => setTree((t) => {
    if (field === 'marks' || field === 'awarded') {
      let v = Number(value)
      if (Number.isNaN(v) || v < 0) v = 0
      const root = t.find((q) => mkContains(q, key))
      if (field === 'marks') {
        // Cap so this question's parts can't total more than 25 marks.
        if (root) {
          const budget = Math.max(0, 25 - mkLeafFieldExcluding(root, key, 'marks'))
          if (v > budget) v = budget
        }
      } else {
        // Awarded can't push the question's awarded total past 25, nor exceed this
        // part's own available marks (when a max is set).
        if (root) {
          const budget = Math.max(0, 25 - mkLeafFieldExcluding(root, key, 'awarded'))
          if (v > budget) v = budget
        }
        const node = mkFind(t, key)
        if (node && Number(node.marks) > 0 && v > Number(node.marks)) v = Number(node.marks)
      }
      return mkMap(t, key, (n) => ({ ...n, [field]: v }))
    }
    return mkMap(t, key, (n) => ({ ...n, [field]: value }))
  })
  const addChild = (key) => setTree((t) => mkMap(t, key, (n) => ({ ...n, children: [...n.children, mkNode()] })))
  const removeNode = (key) => setTree((t) => mkRemove(t, key))   // sub-parts only (top-level is locked)

  const totalAwarded = mkLeafSum(tree, 'awarded')
  const totalPossible = mkLeafSum(tree, 'marks')

  // Each question must be ≤ 25 marks (both awarded and available) — block saving otherwise.
  const overQuestions = tree
    .map((q, i) => ({ n: i + 1, possible: mkLeafSum([q], 'marks'), awarded: mkLeafSum([q], 'awarded') }))
    .filter((x) => x.possible > 25 || x.awarded > 25)
  const hasOverBudget = overQuestions.length > 0

  // Topics actually assigned in the tree — one feedback box each.
  const usedTopics = Object.keys(mkCollect(tree, {}))
    .map((tid) => (review?.availableTopics || []).find((t) => t.topicId === tid))
    .filter(Boolean)

  const saveGrade = async () => {
    if (hasOverBudget) {
      toast(`Question${overQuestions.length > 1 ? 's' : ''} ${overQuestions.map((o) => o.n).join(', ')} exceed 25 marks. Fix before saving.`, 'error')
      return
    }
    const agg = mkCollect(tree, {})
    const topics = {}
    Object.entries(agg).forEach(([topicId, v]) => {
      topics[topicId] = { earned: v.earned, possible: v.possible, comment: comments[topicId] || '' }
    })
    const questionFeedback = tree
      .map((q, i) => ({ question: `Question ${i + 1}`, feedback: (q.feedback || '').trim() }))
      .filter((x) => x.feedback)
    try {
      const res = await VerificationService.gradeSubmission(activeId, { totalAwarded, totalPossible, topics, questionFeedback })
      setResult(res.data)
      loadQueue()
      toast('Grade saved.', 'success')
    } catch (err) { toast(err?.response?.data?.message || 'Failed to save grade.', 'error') }
  }

  const returnToStudent = async () => {
    try {
      await VerificationService.returnSubmission(activeId)
      backToList()
    } catch { toast('Failed to return submission.', 'error') }
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
                <p className="pa-sub" style={{ marginTop: 0 }}>
                  4 questions × 25 = 100 marks. Award marks per part, choose the topic each part assesses,
                  add/remove sub-parts (a/b/c, then i/ii/iii), and leave feedback per question.
                </p>
                <div className="mk-tree">
                  {tree.map((q, i) => (
                    <MarkNode key={q.key} node={q} depth={0} index={i}
                      topics={review.availableTopics || []}
                      disabled={review.status === 'RETURNED'}
                      onField={setNodeField} onAdd={addChild} onRemove={removeNode} />
                  ))}
                </div>

                {/* Per-topic feedback — one box per topic actually marked, shown to the student */}
                {usedTopics.length > 0 && (
                  <div className="vf-topic-comments">
                    <h4 className="vf-comments-title">Topic feedback</h4>
                    <p className="vf-comments-hint">
                      A comment per topic you marked — the student sees it on their reviewed paper.
                    </p>
                    {usedTopics.map((t) => (
                      <div key={t.topicId} className="vf-topic-comment">
                        <label className="vf-chip vf-chip-topic">{t.name}</label>
                        <textarea
                          rows={2}
                          className="vf-textarea"
                          placeholder={`Feedback on "${t.name}"…`}
                          value={comments[t.topicId] ?? ''}
                          disabled={review.status === 'RETURNED'}
                          onChange={(e) => setComment(t.topicId, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="vf-total">
                  <span style={{ color: 'var(--color-text-muted)' }}>Total awarded</span>
                  <span className="vf-total-num">{totalAwarded} / {totalPossible}</span>
                </div>

                {hasOverBudget && review.status !== 'RETURNED' && (
                  <p className="mk-warn">
                    ⚠ Question{overQuestions.length > 1 ? 's' : ''} {overQuestions.map((o) => o.n).join(', ')} exceed 25 marks. Reduce the sub-part marks to 25 or less before saving.
                  </p>
                )}
                <div className="vf-actions">
                  {review.status === 'RETURNED' ? (
                    <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>
                      ↩ Returned to the student — this submission is final and can no longer be graded.
                    </span>
                  ) : (
                    <>
                      <button className="vf-btn vf-btn-grade" onClick={saveGrade} disabled={hasOverBudget}>Save Grade</button>
                      {review.status === 'GRADED' && (
                        <button className="vf-btn vf-btn-return" onClick={returnToStudent}>Return to Student</button>
                      )}
                    </>
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
  const [page, setPage] = useState(1)
  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')       // ALL | PENDING | APPROVED
  const [subjectFilter, setSubjectFilter] = useState('ALL')
  const [difficultyFilter, setDifficultyFilter] = useState('ALL')
  const [approveTarget, setApproveTarget] = useState(null)      // the solution shown in the approve modal

  useEffect(() => { fetchPending() }, [])

  const fetchPending = async () => {
    setLoading(true)
    try {
      const res = await VerificationService.getPending()
      setSolutions(res.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const confirmApprove = async () => {
    if (!approveTarget) return
    try {
      await VerificationService.approve(approveTarget.solutionId)
      setApproveTarget(null)
      await fetchPending()
      toast('Solution approved.', 'success')
    } catch { toast('Failed to approve.', 'error') }
  }

  const openReject = (id) => { setRejectId(id); setRejectReason('') }
  const confirmReject = async () => {
    const reason = rejectReason.trim() || 'Does not meet verification standards'
    try {
      await VerificationService.reject(rejectId, reason)
      setRejectId(null)
      fetchPending()
      toast('Solution rejected.', 'success')
    } catch { toast('Failed to reject.', 'error') }
  }

  const startEdit = (sol) => { setEditId(sol.solutionId); setEditContent(sol.content); setEditExplanation(sol.explanation || '') }

  const saveEdit = async (id) => {
    try { await VerificationService.edit(id, { content: editContent, explanation: editExplanation }); setEditId(null); fetchPending() }
    catch { toast('Failed to save edit.', 'error') }
  }

  if (loading) return <p className="vf-empty">Loading AI solutions…</p>
  if (solutions.length === 0) return <p className="vf-empty">✓ No AI solutions to review.</p>

  // Filter options derived from the loaded solutions.
  const subjects = [...new Set(solutions.map((s) => s.subject).filter(Boolean))].sort()
  const difficulties = [...new Set(solutions.map((s) => s.difficulty).filter(Boolean))].sort()

  const visible = solutions
    .filter((s) => statusFilter === 'ALL'
      || (statusFilter === 'APPROVED' ? s.isVerified : !s.isVerified))
    .filter((s) => subjectFilter === 'ALL' || s.subject === subjectFilter)
    .filter((s) => difficultyFilter === 'ALL' || s.difficulty === difficultyFilter)

  const safePage    = Math.min(page, Math.max(1, Math.ceil(visible.length / SOL_PAGE_SIZE)))
  const totalPages  = Math.max(1, Math.ceil(visible.length / SOL_PAGE_SIZE))
  const pagedSols   = visible.slice((safePage - 1) * SOL_PAGE_SIZE, safePage * SOL_PAGE_SIZE)

  const onFilter = (setter) => (e) => { setter(e.target.value); setPage(1) }

  return (
    <div className="card">
      <div className="vf-toolbar">
        <select className="vf-filter" value={statusFilter} onChange={onFilter(setStatusFilter)}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
        </select>
        <select className="vf-filter" value={subjectFilter} onChange={onFilter(setSubjectFilter)}>
          <option value="ALL">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="vf-filter" value={difficultyFilter} onChange={onFilter(setDifficultyFilter)}>
          <option value="ALL">All difficulties</option>
          {difficulties.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
          {visible.length} solution{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="vf-empty">No solutions match your filters.</p>
      ) : pagedSols.map((sol) => (
        <div key={sol.solutionId} className="vf-sol" >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
            <div className="vf-queue-title">
              Question: {stripHtml(sol.question?.content || sol.question?.questionId || '')}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className={`badge ${sol.isVerified ? 'badge-green' : 'badge-amber'}`}>
                {sol.isVerified ? 'Approved' : 'Pending'}
              </span>
              {sol.subject && <span className="vf-chip">{sol.subject}</span>}
              {sol.difficulty && <span className="vf-chip">{sol.difficulty}</span>}
            </div>
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
              <div className="vf-sol-section">
                <span className="vf-sol-label">Content</span>
                <SolutionContent content={sol.content} />
              </div>
              {sol.explanation && (
                <div className="vf-sol-section">
                  <span className="vf-sol-label">Explanation</span>
                  <SolutionContent content={sol.explanation} />
                </div>
              )}
              <div className="vf-actions">
                {sol.isVerified ? (
                  <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: '0.88rem' }}>
                    🔒 Approved — this solution is verified and locked.
                  </span>
                ) : (
                  <>
                    <button className="vf-btn vf-btn-approve" onClick={() => setApproveTarget(sol)}>Approve</button>
                    <button className="vf-btn vf-btn-reject" onClick={() => openReject(sol.solutionId)}>Reject</button>
                    <button className="vf-btn vf-btn-edit" onClick={() => startEdit(sol)}>Edit</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <Paginator page={safePage} totalPages={totalPages} onChange={p => { setPage(p); window.scrollTo(0, 0) }} />

      {/* ── Reject-reason modal ──────────────────────────────────────────── */}
      {rejectId && (
        <div className="sub-modal-overlay" onClick={() => setRejectId(null)}>
          <div className="sub-modal" style={{ width: 'min(460px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 0.5rem' }}>Reject solution</h2>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              Optionally give a reason (saved for audit). Leave blank to use the default.
            </p>
            <textarea
              rows={3}
              className="vf-textarea"
              placeholder="Reason for rejection…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
              <button className="vf-btn vf-btn-return" onClick={() => setRejectId(null)}>Cancel</button>
              <button className="vf-btn vf-btn-reject" onClick={confirmReject}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve confirmation modal (shows the solution being approved) ─── */}
      {approveTarget && (
        <div className="sub-modal-overlay" onClick={() => setApproveTarget(null)}>
          <div className="sub-modal" style={{ width: 'min(760px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 0.35rem' }}>Approve this solution?</h2>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 0.9rem', lineHeight: 1.5 }}>
              Approving marks it verified. This is <strong>final</strong> — an approved solution can't be reverted or edited.
            </p>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              {approveTarget.subject && <span className="vf-chip">{approveTarget.subject}</span>}
              {approveTarget.difficulty && <span className="vf-chip">{approveTarget.difficulty}</span>}
            </div>
            <div className="vf-sol-section">
              <span className="vf-sol-label">Question</span>
              <p style={{ margin: 0 }}>{stripHtml(approveTarget.question?.content || '')}</p>
            </div>
            <div className="vf-sol-section">
              <span className="vf-sol-label">Solution</span>
              <SolutionContent content={approveTarget.content} />
            </div>
            {approveTarget.explanation && (
              <div className="vf-sol-section">
                <span className="vf-sol-label">Explanation</span>
                <SolutionContent content={approveTarget.explanation} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
              <button className="vf-btn vf-btn-return" onClick={() => setApproveTarget(null)}>Cancel</button>
              <button className="vf-btn vf-btn-approve" onClick={confirmApprove}>Approve</button>
            </div>
          </div>
        </div>
      )}
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
