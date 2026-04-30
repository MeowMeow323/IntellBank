import { useState, useEffect } from 'react'
import { verificationApi } from '../services/api'

/**
 * VerificationPage – shows Solutions where isVerified = false.
 *
 * NOTE: Question does NOT have a verification status.
 *       All verification is done through the Solution.
 */
export default function VerificationPage() {
  const [solutions, setSolutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editExplanation, setEditExplanation] = useState('')

  useEffect(() => {
    fetchPending()
  }, [])

  const fetchPending = async () => {
    try {
      const res = await verificationApi.getPending()
      setSolutions(res.data)
    } catch {
      setError('Failed to load pending solutions')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (solutionId) => {
    await verificationApi.approve(solutionId)
    setSolutions(s => s.filter(x => x.solutionId !== solutionId))
  }

  const handleReject = async (solutionId) => {
    await verificationApi.reject(solutionId)
    fetchPending()
  }

  const startEdit = (solution) => {
    setEditId(solution.solutionId)
    setEditContent(solution.content)
    setEditExplanation(solution.explanation || '')
  }

  const saveEdit = async (solutionId) => {
    await verificationApi.edit(solutionId, { content: editContent, explanation: editExplanation })
    setEditId(null)
    fetchPending()
  }

  if (loading) return <p style={{ padding: '2rem' }}>Loading pending solutions…</p>
  if (error)   return <p style={{ padding: '2rem', color: 'red' }}>{error}</p>

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1>Verification Queue</h1>
      <p style={{ color: '#aaa' }}>
        Solutions where <code>isVerified = false</code>. Approve to verify, or edit before approving.
      </p>

      {solutions.length === 0 && <p>✓ No pending solutions.</p>}

      {solutions.map(sol => (
        <div key={sol.solutionId} style={{
          border: '1px solid #333', borderRadius: 8, padding: '1rem', marginBottom: '1rem'
        }}>
          <h3 style={{ margin: 0, marginBottom: 8 }}>
            Question: {sol.question?.content || sol.question?.questionId}
          </h3>

          {editId === sol.solutionId ? (
            <>
              <label>Solution Content</label>
              <textarea rows={4} value={editContent} onChange={e => setEditContent(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }} />
              <label>Explanation</label>
              <textarea rows={2} value={editExplanation} onChange={e => setEditExplanation(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }} />
              <button onClick={() => saveEdit(sol.solutionId)} style={{ marginRight: 8 }}>Save</button>
              <button onClick={() => setEditId(null)}>Cancel</button>
              <small style={{ display: 'block', color: '#aaa', marginTop: 4 }}>
                Saving will create a SolutionHistory audit record and reset isVerified.
              </small>
            </>
          ) : (
            <>
              <p><strong>Content:</strong> {sol.content}</p>
              {sol.explanation && <p><strong>Explanation:</strong> {sol.explanation}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => handleApprove(sol.solutionId)}
                  style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: 4, cursor: 'pointer' }}>
                  Approve
                </button>
                <button onClick={() => handleReject(sol.solutionId)}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: 4, cursor: 'pointer' }}>
                  Reject
                </button>
                <button onClick={() => startEdit(sol)}
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: 4, cursor: 'pointer' }}>
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
