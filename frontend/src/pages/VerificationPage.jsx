import { useState, useEffect } from 'react'
import { VerificationService } from '../services/api'

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
      const res = await VerificationService.getPending()
      setSolutions(res.data)
    } catch {
      setError('Failed to load pending solutions')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (solutionId) => {
    try {
      await VerificationService.approve(solutionId)
      setSolutions(s => s.filter(x => x.solutionId !== solutionId))
    } catch {
      console.error("Failed to approve solution")
    }
  }

  const handleReject = async (solutionId) => {
    try {
      const reason = prompt("Enter reason for rejection:") || "Does not meet verification standards"
      await VerificationService.reject(solutionId, reason)
      fetchPending()
    } catch {
      console.error("Failed to reject solution")
    }
  }

  const startEdit = (solution) => {
    setEditId(solution.solutionId)
    setEditContent(solution.content)
    setEditExplanation(solution.explanation || '')
  }

  const saveEdit = async (solutionId) => {
    try {
      await VerificationService.edit(solutionId, { content: editContent, explanation: editExplanation })
      setEditId(null)
      fetchPending()
    } catch {
      console.error("Failed to update solution changes")
    }
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
          <h3 style={{ margin: 0, grandfather: 8, marginBottom: 8 }}>
            Question: {sol.question?.content || sol.question?.questionId}
          </h3>

          {editId === sol.solutionId ? (
            <>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: '500' }}>Solution Content</label>
              <textarea rows={4} value={editContent} onChange={e => setEditContent(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }} />
              
              <label style={{ display: 'block', marginBottom: 4, fontWeight: '500' }}>Explanation</label>
              <textarea rows={2} value={editExplanation} onChange={e => setEditExplanation(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }} />
              
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => saveEdit(sol.solutionId)}>Save</button>
                <button onClick={() => setEditId(null)} style={{ background: '#333', color: '#fff', border: '1px solid #444' }}>Cancel</button>
              </div>
              <small style={{ display: 'block', color: '#aaa', marginTop: 8 }}>
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