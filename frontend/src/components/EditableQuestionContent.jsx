import React, { useState } from 'react'
import QuestionContent from './QuestionContent.jsx'
import '../styles/question-content.css'

/**
 * Wraps QuestionContent with an inline edit mode — OCR (especially on dense
 * math/diagrams) won't always be perfect, so this is the manual fallback:
 * an educator can directly fix garbled text/marks rather than waiting on
 * further heuristic tuning. Saving is delegated to the parent via onSave(s)
 * (parent owns the actual API call + list-state update); this component
 * only owns the edit-mode UI and draft state.
 */
const EditableQuestionContent = ({ content, marks, originalFileUrl, onSave }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(content)
  const [draftMarks, setDraftMarks] = useState(marks ?? 1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const startEdit = () => {
    setDraftContent(content)
    setDraftMarks(marks ?? 1)
    setError('')
    setIsEditing(true)
  }

  const cancelEdit = () => {
    if (isSaving) return
    setIsEditing(false)
    setError('')
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    try {
      await onSave(draftContent, Number(draftMarks))
      setIsEditing(false)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="question-edit-form">
        <textarea
          className="input question-edit-textarea"
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={10}
          disabled={isSaving}
        />
        <div className="flex items-center gap-3" style={{ marginTop: '0.5rem' }}>
          <label className="flex items-center gap-2">
            Marks
            <input
              type="number"
              className="input"
              style={{ width: '70px' }}
              value={draftMarks}
              onChange={(e) => setDraftMarks(e.target.value)}
              min={0}
              disabled={isSaving}
            />
          </label>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={cancelEdit} disabled={isSaving}>
            Cancel
          </button>
        </div>
        {error && <p className="question-edit-error">{error}</p>}
      </div>
    )
  }

  return (
    <>
      <QuestionContent content={content} originalFileUrl={originalFileUrl} />
      <div className="flex justify-between items-center" style={{ marginTop: '0.5rem' }}>
        <span>{marks ?? 1} mark{marks !== 1 ? 's' : ''}</span>
        <button className="btn btn-secondary" onClick={startEdit}>Edit</button>
      </div>
    </>
  )
}

export default EditableQuestionContent
