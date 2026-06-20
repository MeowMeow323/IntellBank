import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PastYearPaperService, QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/document-upload.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

const DIFFICULTY_BADGE = { Easy: 'badge-green', Medium: 'badge-amber', Hard: 'badge-red' }

const PastYearPaperQuestionsPage = () => {
  const { pypId } = useParams()
  const navigate = useNavigate()

  const [paper, setPaper] = useState(null)
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReprocessing, setIsReprocessing] = useState(false)

  useEffect(() => {
    loadAll()
  }, [pypId])

  const loadAll = async () => {
    setIsLoading(true)
    try {
      const [papersRes, questionsRes] = await Promise.all([
        PastYearPaperService.getAll(),
        QuestionService.getByPyp(pypId),
      ])
      setPaper(papersRes.data.find((p) => p.pypId === pypId) || null)
      setQuestions(questionsRes.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const handleReprocess = async () => {
    setIsReprocessing(true)
    try {
      await PastYearPaperService.process(pypId)
    } catch {
      // fall through — reload will reflect the real outcome either way
    } finally {
      await loadAll()
      setIsReprocessing(false)
    }
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header flex justify-between items-center">
          <div>
            <button className="btn btn-secondary" onClick={() => navigate('/past-year-papers')} style={{ marginBottom: '0.75rem' }}>
              ← Back to Library
            </button>
            <h1 className="page-title">{paper?.title || 'Extracted Questions'}</h1>
            <p className="page-subtitle">
              {isLoading ? 'Loading...' : `${questions.length} question(s) extracted`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {paper?.status && (
              <span className={`badge ${STATUS_COLORS[paper.status] || 'badge-blue'}`}>
                {paper.status}
              </span>
            )}
            {paper?.fileUrl && (
              <a className="btn btn-secondary" href={paper.fileUrl} target="_blank" rel="noopener noreferrer">
                View Original File
              </a>
            )}
            <button className="btn btn-secondary" onClick={handleReprocess} disabled={isReprocessing}>
              {isReprocessing ? 'Processing...' : 'Reprocess'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center">
            <div className="spinner" />
          </div>
        ) : questions.length === 0 ? (
          <p>No questions found for this paper yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {questions.map((q, i) => (
              <div key={q.questionId} className="card" id={`question-${q.questionId}`}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>
                    Question {i + 1} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>({q.marks ?? 1} marks)</span>
                  </p>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {q.topics?.length > 0 ? (
                      q.topics.map((t, j) => (
                        <React.Fragment key={j}>
                          <span className="badge badge-blue">{t.subject}</span>
                          <span className="badge badge-purple">{t.topic}</span>
                          {t.difficulty && (
                            <span className={`badge ${DIFFICULTY_BADGE[t.difficulty] || 'badge-blue'}`}>
                              {t.difficulty}
                            </span>
                          )}
                        </React.Fragment>
                      ))
                    ) : (
                      <span className="badge badge-blue">Unclassified</span>
                    )}
                  </div>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '1rem' }}>
                  {q.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default PastYearPaperQuestionsPage
