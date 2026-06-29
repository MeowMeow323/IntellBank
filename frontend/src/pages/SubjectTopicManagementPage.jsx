import React, { useEffect, useState } from 'react'
import { MetadataService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'
import '../styles/document-upload.css'

const SubjectTopicManagementPage = () => {
  const [subjects, setSubjects] = useState([])
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [topics, setTopics] = useState([])
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true)
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)

  const [newSubjectName, setNewSubjectName] = useState('')
  const [newTopicName, setNewTopicName] = useState('')

  useEffect(() => {
    loadSubjects()
  }, [])

  useEffect(() => {
    if (selectedSubjectId) loadTopics(selectedSubjectId)
    else setTopics([])
  }, [selectedSubjectId])

  const loadSubjects = async () => {
    setIsLoadingSubjects(true)
    try {
      const res = await MetadataService.getSubjects()
      setSubjects(res.data)
      if (res.data.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(res.data[0].subjectId)
      }
    } catch {
      // TODO: handle error
    } finally {
      setIsLoadingSubjects(false)
    }
  }

  const loadTopics = async (subjectId) => {
    setIsLoadingTopics(true)
    try {
      const res = await MetadataService.getTopics(subjectId)
      setTopics(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoadingTopics(false)
    }
  }

  const handleCreateSubject = async (e) => {
    e.preventDefault()
    const names = newSubjectName.split(',').map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) return
    try {
      let lastId
      for (const name of names) {
        const res = await MetadataService.createSubject(name)
        lastId = res.data.subjectId
      }
      setNewSubjectName('')
      await loadSubjects()
      setSelectedSubjectId(lastId)
    } catch {
      // TODO: handle error
    }
  }

  const handleCreateTopic = async (e) => {
    e.preventDefault()
    if (!selectedSubjectId) return
    const names = newTopicName.split(',').map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) return
    try {
      for (const name of names) {
        await MetadataService.createTopic(selectedSubjectId, name)
      }
      setNewTopicName('')
      await loadTopics(selectedSubjectId)
    } catch {
      // TODO: handle error
    }
  }

  const handleDeleteTopic = async (topicId) => {
    try {
      await MetadataService.deleteTopic(topicId)
      await loadTopics(selectedSubjectId)
    } catch {
      // TODO: handle error
    }
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="main-content relative">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Subjects &amp; Topics</h1>
            <p className="page-subtitle">
              Define the topic names AI classification matches questions against —
              a subject needs at least one topic here before paper processing can
              tag its questions automatically.
            </p>
          </div>
        </div>

        {/* New Subject */}
        <form onSubmit={handleCreateSubject} className="flex items-center gap-3" style={{ marginBottom: '1.5rem' }}>
          <input
            type="text"
            className="input"
            placeholder="Subject name(s), comma-separated (e.g. Calculus, Physics)"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            style={{ maxWidth: '480px' }}
          />
          <button type="submit" className="btn btn-secondary">Add Subject</button>
        </form>

        {isLoadingSubjects ? (
          <div className="flex justify-center">
            <div className="spinner" />
          </div>
        ) : subjects.length === 0 ? (
          <p>No subjects yet — add one above to get started.</p>
        ) : (
          <>
            {/* Subject Selector */}
            <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <label htmlFor="subject-select"><strong>Subject:</strong></label>
              <select
                id="subject-select"
                className="input"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                style={{ maxWidth: '320px' }}
              >
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* New Topic */}
            <form onSubmit={handleCreateTopic} className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                className="input"
                placeholder="Topic name(s), comma-separated (e.g. Integration by Parts, Limits)"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                style={{ maxWidth: '480px' }}
                disabled={!selectedSubjectId}
              />
              <button type="submit" className="btn btn-secondary" disabled={!selectedSubjectId}>
                Add Topic
              </button>
            </form>

            {/* Topics List */}
            {isLoadingTopics ? (
              <div className="flex justify-center">
                <div className="spinner" />
              </div>
            ) : topics.length === 0 ? (
              <p>No topics yet for this subject — classification will fall back to keywords or "General".</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topics.map((t) => (
                  <div key={t.topicId} className="card flex justify-between items-center">
                    <span>{t.name}</span>
                    <button className="btn btn-secondary" onClick={() => handleDeleteTopic(t.topicId)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default SubjectTopicManagementPage
