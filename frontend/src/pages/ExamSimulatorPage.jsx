import { useState } from 'react'
import { ExamService, SubmissionService } from '../services/api'

export default function ExamSimulatorPage() {
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [questionCount, setQuestionCount] = useState(5)

  const [generatedExam, setGeneratedExam] = useState(null) // This is a Document
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const handleGenerate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setGeneratedExam(null)
    setSubmitted(false)
    try {
      const res = await ExamService.generate({ projectId, title, subject, topic, difficulty, questionCount })
      setGeneratedExam(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate exam')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!generatedExam?.documentId) return
    try {
      await SubmissionService.submit(generatedExam.documentId)
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1>Exam Simulator</h1>
      <p style={{ color: '#aaa' }}>
        Generates an AI exam stored as a Document (type: "AI Generated Exam").
      </p>

      <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        <input placeholder="Project ID" value={projectId} onChange={e => setProjectId(e.target.value)} required />
        <input placeholder="Exam Title" value={title} onChange={e => setTitle(e.target.value)} />
        <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} required />
        <input placeholder="Topic (optional)" value={topic} onChange={e => setTopic(e.target.value)} />
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
          <option>Easy</option>
          <option>Medium</option>
          <option>Hard</option>
        </select>
        <input type="number" min={1} max={20} value={questionCount}
          onChange={e => setQuestionCount(Number(e.target.value))} placeholder="Number of questions" />
        <button type="submit" disabled={loading}>
          {loading ? 'Generating…' : 'Generate Exam'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {generatedExam && (
        <div style={{ border: '1px solid #444', borderRadius: 8, padding: '1.5rem' }}>
          <h2>{generatedExam.title}</h2>
          <p><strong>Type:</strong> {generatedExam.type}</p>
          <p><strong>Total Score:</strong> {generatedExam.totalScore}</p>
          <p><strong>Document ID:</strong> {generatedExam.documentId}</p>

          <h3>Questions</h3>
          {generatedExam.questions?.length === 0 && <p>No questions available.</p>}
          <ol>
            {generatedExam.questions?.map((q, i) => (
              <li key={q.questionId || i} style={{ marginBottom: 8 }}>
                <p>{q.content}</p>
                <small>Marks: {q.marks}</small>
              </li>
            ))}
          </ol>

          {!submitted ? (
            <button onClick={handleSubmit} style={{ marginTop: 16, background: '#22c55e', color: '#fff', padding: '0.5rem 1.5rem', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Submit Exam
            </button>
          ) : (
            <p style={{ color: '#22c55e', marginTop: 16 }}>✓ Exam submitted successfully!</p>
          )}
        </div>
      )}
    </div>
  )
}