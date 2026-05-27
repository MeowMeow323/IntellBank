import React, { useEffect, useState } from 'react'
import { QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

const DIFFICULTY_BADGE = { EASY: 'badge-green', MEDIUM: 'badge-amber', HARD: 'badge-red' }

const QuestionBankPage = () => {
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({ subject: '', topic: '' })

  useEffect(() => {
    loadQuestions()
  }, [])

  const loadQuestions = async (params = {}) => {
    setIsLoading(true)
    try {
      const res = await QuestionService.getAll(params)
      setQuestions(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilter = (e) => {
    e.preventDefault()
    const params = {}
    if (filters.subject) params.subject = filters.subject
    if (filters.topic) params.topic = filters.topic
    loadQuestions(params)
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Question Bank</h1>
          <p className="page-subtitle">Browse and manage all questions in the system</p>
        </div>

        {/* Filters */}
        <form className="filter-bar" onSubmit={handleFilter} id="question-filters">
          <input
            id="filter-subject"
            className="form-input"
            placeholder="Filter by subject..."
            value={filters.subject}
            onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
            style={{ maxWidth: '200px' }}
          />
          <input
            id="filter-topic"
            className="form-input"
            placeholder="Filter by topic..."
            value={filters.topic}
            onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
            style={{ maxWidth: '200px' }}
          />
          <button type="submit" className="btn btn-secondary">Apply Filters</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setFilters({ subject: '', topic: '' }); loadQuestions() }}
          >
            Clear
          </button>
        </form>

        {/* Questions List */}
        {isLoading ? (
          <div className="flex justify-center" style={{ padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : questions.length === 0 ? (
          <div className="empty-state">
            <div>❓</div>
            <p>No questions found. Upload documents or create questions manually.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3" id="questions-list">
            {questions.map((q) => (
              <div key={q.id} className="card question-card" id={`question-${q.id}`}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                  <div className="flex gap-2">
                    {q.subject && <span className="badge badge-blue">{q.subject}</span>}
                    {q.topic && <span className="badge badge-purple">{q.topic}</span>}
                    {q.difficulty && (
                      <span className={`badge ${DIFFICULTY_BADGE[q.difficulty] || 'badge-blue'}`}>
                        {q.difficulty}
                      </span>
                    )}
                  </div>
                  <span className={`badge ${q.verificationStatus === 'VERIFIED' ? 'badge-green' : q.verificationStatus === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>
                    {q.verificationStatus}
                  </span>
                </div>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>{q.questionText}</p>
                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {q.marks} mark{q.marks !== 1 ? 's' : ''} · {q.sourceType?.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        .filter-bar { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .question-card { transition: transform 0.15s ease; }
        .question-card:hover { transform: translateX(4px); }
        .empty-state { text-align: center; padding: 4rem; color: var(--color-text-secondary); font-size: 1rem; }
        .empty-state div { font-size: 2.5rem; margin-bottom: 1rem; }
      `}</style>
    </div>
  )
}

export default QuestionBankPage
