import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PastYearPaperService, QuestionService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import EditableQuestionContent from '../components/EditableQuestionContent.jsx'
import '../styles/document-upload.css'

const STATUS_COLORS = {
  UPLOADED: 'badge-blue',
  PROCESSING: 'badge-amber',
  PROCESSED: 'badge-green',
  FAILED: 'badge-red',
}

const DIFFICULTY_BADGE = { Easy: 'badge-green', Medium: 'badge-amber', Hard: 'badge-red' }

// Encodes which original "Question N" a stored row came from and which
// sub-part (e.g. "c-ii") — see paper_processing_service.py's
// `q_text = f"[QPART:{block_idx}:{label}]\n" + q_text`. Stripped before
// display; re-attached on save so editing a row doesn't silently drop it
// from its group on the next load. Content without this prefix (legacy
// rows from before this marker existed) falls back to being its own
// standalone group, numbered sequentially — no crash, just ungrouped.
const QPART_RE = /^\[QPART:(\d+):([^\]]*)\]\n?/

const parseQPart = (content) => {
  const m = content?.match(QPART_RE)
  if (!m) return { groupNum: null, label: '', stripped: content || '' }
  return { groupNum: parseInt(m[1], 10), label: m[2], stripped: content.slice(m[0].length) }
}

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

  const handleSaveQuestion = async (questionId, newContent, newMarks) => {
    // newContent is whatever the user edited in the (already-stripped)
    // textarea — re-attach this row's [QPART:...] marker (if it had one)
    // before saving, so editing content doesn't silently drop it from its
    // group on the next page load.
    const original = questions.find((q) => q.questionId === questionId)
    const { groupNum, label } = parseQPart(original?.content)
    const contentToSave = groupNum !== null ? `[QPART:${groupNum}:${label}]\n${newContent}` : newContent

    const res = await QuestionService.update(questionId, { content: contentToSave, marks: newMarks })
    setQuestions((prev) => prev.map((q) =>
      q.questionId === questionId ? { ...q, content: res.data.content, marks: res.data.marks } : q
    ))
  }

  // Group rows back under their original "Question N" using the parsed
  // marker — preserves insertion order (questions already come back
  // ordered by question_id, which process_paper() inserts in document
  // order). Marker-less rows (legacy data) become their own single-row group.
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
          <div className="flex flex-col gap-5">
            {groups.map((group, gi) => {
              // Subject/topics are shared across every sub-part of a group
              // (one classification call per original question) — shown
              // once on the group header. Difficulty genuinely varies per
              // sub-part now (that's the whole point of splitting to this
              // granularity), so it's shown per row instead.
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
