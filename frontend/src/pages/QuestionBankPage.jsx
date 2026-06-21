import React, { useEffect, useMemo, useState } from 'react'
import { QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import EditableQuestionContent from '../components/EditableQuestionContent.jsx'
import '../styles/question-bank.css'

const DIFFICULTY_BADGE = { Easy: 'badge-green', Medium: 'badge-amber', Hard: 'badge-red' }

const QuestionBankPage = () => {
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [subjectFilter, setSubjectFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadQuestions()
  }, [])

  const loadQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await QuestionService.getAll()
      setQuestions(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const subjects = useMemo(() => {
    const set = new Set()
    questions.forEach((q) => q.topics?.forEach((t) => set.add(t.subject)))
    return Array.from(set).sort()
  }, [questions])

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (subjectFilter && !q.topics?.some((t) => t.subject === subjectFilter)) return false
      if (search && !q.content?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [questions, subjectFilter, search])

  const handleSaveQuestion = async (questionId, newContent, newMarks) => {
    const res = await QuestionService.update(questionId, { content: newContent, marks: newMarks })
    setQuestions((prev) => prev.map((q) =>
      q.questionId === questionId ? { ...q, content: res.data.content, marks: res.data.marks } : q
    ))
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Question Bank</h1>
          <p className="page-subtitle">Browse all extracted &amp; created questions in the system</p>
        </div>

        {/* Filters */}
        <div className="filter-bar" id="question-filters">
          <select
            id="filter-subject"
            className="form-input"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            id="filter-search"
            className="form-input"
            placeholder="Search question text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setSubjectFilter(''); setSearch('') }}
          >
            Clear
          </button>
        </div>

        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          {filtered.length} of {questions.length} question(s)
        </p>

        {/* Questions List */}
        {isLoading ? (
          <div className="flex justify-center">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div>❓</div>
            <p>
              {questions.length === 0
                ? 'No questions found yet. Upload and process a past year paper to extract some.'
                : 'No questions match the current filter.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3" id="questions-list">
            {filtered.map((q) => (
              <div key={q.questionId} className="card question-card" id={`question-${q.questionId}`}>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {q.topics?.length > 0 ? (
                      // subject and difficulty are the same across every entry in
                      // q.topics (one classification call per question, shared
                      // subject_id/difficulty for all its topic matches) — show
                      // each once for the question, not once per topic.
                      <>
                        <span className="badge badge-blue">{q.topics[0].subject}</span>
                        {q.topics.map((t, i) => (
                          <span key={i} className="badge badge-purple">{t.topic}</span>
                        ))}
                        {q.topics[0].difficulty && (
                          <span className={`badge ${DIFFICULTY_BADGE[q.topics[0].difficulty] || 'badge-blue'}`}>
                            {q.topics[0].difficulty}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="badge badge-blue">Unclassified</span>
                    )}
                  </div>
                  {q.pypTitle && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      from {q.pypTitle}
                    </span>
                  )}
                </div>
                <EditableQuestionContent
                  content={q.content}
                  marks={q.marks}
                  onSave={(newContent, newMarks) => handleSaveQuestion(q.questionId, newContent, newMarks)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default QuestionBankPage
