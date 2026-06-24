import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PastYearPaperService, QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import EditableQuestionContent from '../components/EditableQuestionContent.jsx'
import QuestionContent from '../components/QuestionContent.jsx'
import SolutionContent from '../components/SolutionContent.jsx'
import useSolutionGenerationStore from '../store/solutionGenerationStore.js'
import '../styles/document-upload.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

const DIFFICULTY_BADGE = { Easy: 'badge-green', Medium: 'badge-amber', Hard: 'badge-red' }

const QPART_RE = /^\[QPART:(\d+):([^\]]*)\]\n?/

const parseQPart = (content) => {
  const m = content?.match(QPART_RE)
  if (!m) return { groupNum: null, label: '', stripped: content || '' }
  return { groupNum: parseInt(m[1], 10), label: m[2], stripped: content.slice(m[0].length) }
}

// Collapsible solution panel shown beneath each sub-question
const SolutionPanel = ({ solution }) => {
  const [open, setOpen] = useState(false)
  if (!solution) return null

  return (
    <div style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--color-border, #e2e8f0)', paddingTop: '0.6rem' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.85rem', fontWeight: 600,
          color: 'var(--color-text-secondary, #64748b)',
        }}
      >
        <span style={{ fontSize: '0.7rem' }}>{open ? '▼' : '▶'}</span>
        Model Solution
        <span className={`badge ${solution.isVerified ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
          {solution.isVerified ? 'Verified' : 'Pending Review'}
        </span>
      </button>

      {open && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.75rem 1rem',
          background: 'var(--color-bg-tertiary, #f1f5f9)',
          borderRadius: '6px',
          borderLeft: '3px solid var(--color-primary, #6366f1)',
        }}>
          <SolutionContent content={solution.content} />
          {solution.explanation && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-secondary, #64748b)', fontWeight: 600 }}>
                Marking Criteria
              </summary>
              <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-secondary, #64748b)' }}>
                <SolutionContent content={solution.explanation} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

const PastYearPaperQuestionsPage = () => {
  const { pypId } = useParams()
  const navigate = useNavigate()

  const [paper, setPaper] = useState(null)
  const [questions, setQuestions] = useState([])
  const [solutions, setSolutions] = useState({})   // { [questionId]: { content, explanation, isVerified } }
  const [isLoading, setIsLoading] = useState(true)
  const [isReprocessing, setIsReprocessing] = useState(false)
  // { [questionId]: 'loading' | 'error' }  — tracks per-question generate state
  const [questionGenerating, setQuestionGenerating] = useState({})

  const { generate, isGenerating, getResult, clearResult } = useSolutionGenerationStore()
  const isGeneratingThis = isGenerating(pypId)
  const generateResult   = getResult(pypId)

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
      await loadSolutions()
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const loadSolutions = async () => {
    try {
      const res = await PastYearPaperService.getSolutions(pypId)
      const map = {}
      for (const s of res.data) {
        map[s.questionId] = s
      }
      setSolutions(map)
    } catch {
      // non-fatal — page still works without solutions
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

  const handleGenerateSolutions = () => {
    generate(pypId)
  }

  // Reload solutions when generation finishes so they appear inline immediately
  useEffect(() => {
    if (!isGeneratingThis && generateResult && !generateResult.error) {
      loadSolutions()
    }
  }, [isGeneratingThis])

  const handleGenerateSingleSolution = async (questionId) => {
    setQuestionGenerating((prev) => ({ ...prev, [questionId]: 'loading' }))
    try {
      const res = await PastYearPaperService.generateSingleSolution(questionId)
      setSolutions((prev) => ({ ...prev, [questionId]: res.data }))
      setQuestionGenerating((prev) => { const n = { ...prev }; delete n[questionId]; return n })
    } catch (err) {
      setQuestionGenerating((prev) => ({ ...prev, [questionId]: 'error' }))
    }
  }

  const handleSaveQuestion = async (questionId, newContent, newMarks) => {
    const original = questions.find((q) => q.questionId === questionId)
    const { groupNum, label } = parseQPart(original?.content)
    const contentToSave = groupNum !== null ? `[QPART:${groupNum}:${label}]\n${newContent}` : newContent

    const res = await QuestionService.update(questionId, { content: contentToSave, marks: newMarks })
    setQuestions((prev) => prev.map((q) =>
      q.questionId === questionId ? { ...q, content: res.data.content, marks: res.data.marks } : q
    ))
  }

  // Group rows back under their original "Question N"
  const groups = []
  const groupByNum = new Map()
  for (const q of questions) {
    const { groupNum, label, stripped } = parseQPart(q.content)
    const entry = { ...q, label, stripped }
    if (groupNum === null) {
      groups.push({ groupNum: null, items: [entry] })
      continue
    }
    if (!groupByNum.has(groupNum)) {
      const g = { groupNum, items: [] }
      groupByNum.set(groupNum, g)
      groups.push(g)
    }
    groupByNum.get(groupNum).items.push(entry)
  }

  const canGenerate = paper?.status === 'PROCESSED' && !isGeneratingThis

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
            {paper?.status === 'PROCESSED' && (
              <button
                className="btn btn-primary"
                onClick={handleGenerateSolutions}
                disabled={!canGenerate}
                id="generate-solutions-btn"
              >
                {isGeneratingThis ? 'Generating...' : 'Generate Solutions'}
              </button>
            )}
          </div>
        </div>

        {/* Generation result banner */}
        {generateResult && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              background: generateResult.error ? 'var(--color-danger-bg, #fef2f2)' : 'var(--color-success-bg, #f0fdf4)',
              border: `1px solid ${generateResult.error ? 'var(--color-danger, #dc2626)' : 'var(--color-success, #16a34a)'}`,
              color: generateResult.error ? 'var(--color-danger, #dc2626)' : 'var(--color-success, #15803d)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            {generateResult.error ? (
              <span>Error: {generateResult.error}</span>
            ) : (
              <span>
                {generateResult.generated} solution{generateResult.generated !== 1 ? 's' : ''} generated
                {generateResult.skipped > 0 && ` · ${generateResult.skipped} already had solutions`}
                {generateResult.failed > 0 && ` · ${generateResult.failed} failed`}
                {' — pending educator verification'}
              </span>
            )}
            <button
              onClick={() => clearResult(pypId)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center">
            <div className="spinner" />
          </div>
        ) : questions.length === 0 ? (
          <p>No questions found for this paper yet.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group, gi) => {
              const repTopics = group.items[0]?.topics
              return (
                <div key={group.groupNum ?? `solo-${gi}`} className="card" id={`question-group-${group.groupNum ?? gi}`}>
                  <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>
                      Question {group.groupNum ?? gi + 1}
                    </p>
                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      {repTopics?.length > 0 ? (
                        <>
                          <span className="badge badge-blue">{repTopics[0].subject}</span>
                          {repTopics.map((t, j) => (
                            <span key={j} className="badge badge-purple">{t.topic}</span>
                          ))}
                        </>
                      ) : (
                        <span className="badge badge-blue">Unclassified</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {group.items.map((q) => (
                      <div key={q.questionId} className="card" id={`question-${q.questionId}`} style={{ background: 'var(--color-bg-secondary, #f8f9fa)' }}>
                        {q.label && (
                          <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                              ({q.label})
                            </span>
                            {q.topics?.[0]?.difficulty && (
                              <span className={`badge ${DIFFICULTY_BADGE[q.topics[0].difficulty] || 'badge-blue'}`}>
                                {q.topics[0].difficulty}
                              </span>
                            )}
                          </div>
                        )}
                        <EditableQuestionContent
                          content={q.stripped}
                          marks={q.marks}
                          originalFileUrl={paper?.fileUrl}
                          onSave={(newContent, newMarks) => handleSaveQuestion(q.questionId, newContent, newMarks)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}
                            disabled={questionGenerating[q.questionId] === 'loading'}
                            onClick={() => handleGenerateSingleSolution(q.questionId)}
                          >
                            {questionGenerating[q.questionId] === 'loading'
                              ? 'Generating...'
                              : solutions[q.questionId]
                                ? 'Regenerate Solution'
                                : 'Generate Solution'}
                          </button>
                          {questionGenerating[q.questionId] === 'error' && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-danger, #dc2626)' }}>
                              Failed — check terminal for error
                            </span>
                          )}
                        </div>
                        <SolutionPanel solution={solutions[q.questionId]} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default PastYearPaperQuestionsPage
