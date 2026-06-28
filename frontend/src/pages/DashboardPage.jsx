import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Folder, Trash2, Pencil, FolderKanban, ClipboardList, Send, BarChart3,
  CheckSquare, FileText, Tags, AlertTriangle,
} from 'lucide-react'
import useAuthStore from '../store/authStore'
import { ProjectService, QuestionService, SubmissionService, AnalyticsService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

import '../styles/global.css'
import '../styles/modals.css'

const DashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isEducator = user?.role === 'EDUCATOR' || user?.role === 'ADMIN'

  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [newProject, setNewProject] = useState({ projectName: '', description: '', subject: '' })
  const [creating, setCreating] = useState(false)
  const [stats, setStats] = useState({ questions: '—', submissions: '—', mastery: '—' })

  // Inline project rename
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameCancel = useRef(false)

  const commitProjectRename = async (project) => {
    const val = renameValue.trim()
    setRenamingId(null)
    if (!val || val === project.projectName) return
    try {
      await ProjectService.update(project.projectId, { projectName: val })
      setProjects((prev) => prev.map((p) =>
        p.projectId === project.projectId ? { ...p, projectName: val } : p))
    } catch (err) {
      console.error('Failed to rename project:', err)
    }
  }

  useEffect(() => {
    if (!isEducator) { loadProjects(); loadStats() }
    else setIsLoading(false)
  }, [])

  // Read-only summary metrics — resilient: any failing fetch just stays "—".
  const loadStats = async () => {
    const [qRes, sRes, mRes] = await Promise.allSettled([
      QuestionService.getAll(),
      SubmissionService.getMine(),
      AnalyticsService.getMyMastery(),
    ])
    const next = { questions: '—', submissions: '—', mastery: '—' }
    if (qRes.status === 'fulfilled') next.questions = (qRes.value.data || []).length
    if (sRes.status === 'fulfilled') next.submissions = (sRes.value.data || []).length
    if (mRes.status === 'fulfilled') {
      const rows = mRes.value.data || []
      if (rows.length) {
        const avg = Math.round(rows.reduce((a, r) => a + (r.score || 0), 0) / rows.length)
        next.mastery = `${avg}%`
      }
    }
    setStats(next)
  }

  const loadProjects = async () => {
    setIsLoading(true)
    try {
      const res = await ProjectService.getAll()
      setProjects(res.data)
    } catch (err) {
      console.error("Failed to fetch folders:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await ProjectService.create({
        projectName: newProject.projectName,
        description: newProject.description,
        subject: newProject.subject,
      })
      setShowCreate(false)
      setNewProject({ projectName: '', description: '', subject: '' })
      await loadProjects()
    } catch (error) {
      console.error("Failed to create folder project:", error)
    } finally {
      setCreating(false)
    }
  }

  // ── Permanent Backend Project Drop Request ───────────────────────────
  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return
    setDeleting(true)
    setErrorMessage('')
    
    try {
      // ✅ Pure and simple: Let the backend handle deleting dependent sub-collections
      await ProjectService.delete(projectToDelete.projectId)
      setProjectToDelete(null)
      await loadProjects()
    } catch (error) {
      console.error("Failed to delete folder project:", error)
      setErrorMessage(error.response?.data?.message || 'Server encountered an error while trying to safely delete this project.')
    } finally {
      setDeleting(false)
    }
  }

  // Returns "MMM D, YYYY" or null (so the caller can omit the line entirely).
  const formatProjectDate = (dateString) => {
    if (!dateString) return null
    const parsedDate = new Date(dateString)
    if (isNaN(parsedDate.getTime())) return null
    return parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="page-layout">
      <Sidebar />
      
      <main className="main-content">
        <div className="page-header flex justify-between items-center">
          <div>
            <div className="section-label page-eyebrow">
              <span className="section-label__dot" />
              <span className="section-label__text">{isEducator ? 'Educator Workspace' : 'Your Workspace'}</span>
            </div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {user?.fullName || user?.username}</p>
          </div>
          {!isEducator && (
            <button
              id="create-project-btn"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={18} /> New Project
            </button>
          )}
        </div>

        {/* Stats summary row (students) */}
        {!isEducator && (
          <div className="stats-row">
            {[
              { label: 'Total projects', value: projects.length, Icon: FolderKanban },
              { label: 'Questions in bank', value: stats.questions, Icon: ClipboardList },
              { label: 'Submissions', value: stats.submissions, Icon: Send },
              { label: 'Avg mastery', value: stats.mastery, Icon: BarChart3 },
            ].map((s) => (
              <div className="stat-card" key={s.label}>
                <div className="stat-icon"><s.Icon size={20} /></div>
                <div>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Project Modal Layer */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: '1.25rem' }}>Create New Project</h3>
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input
                    id="project-name"
                    className="form-input"
                    placeholder="e.g. Physics Year 3"
                    value={newProject.projectName}
                    onChange={(e) => setNewProject({ ...newProject, projectName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input
                    id="project-subject"
                    className="form-input"
                    placeholder="e.g. Physics"
                    value={newProject.subject}
                    onChange={(e) => setNewProject({ ...newProject, subject: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    id="project-description"
                    className="form-textarea"
                    rows="3"
                    placeholder="Brief description..."
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  />
                </div>
                <div className="flex-row gap-3" style={{ marginTop: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Project Delete Confirmation Modal */}
        {projectToDelete && (
          <div className="modal-overlay" onClick={() => { setProjectToDelete(null); setErrorMessage(''); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
              <h3 style={{ marginBottom: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} /> Delete Project?
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                Are you sure you want to delete <strong>{projectToDelete.projectName}</strong>? This will permanently erase this project along with all containing generated exam questions and raw documents. This cannot be undone.
              </p>

              {errorMessage && (
                <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', padding: '0.75rem', borderRadius: '6px', color: '#991B1B', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                  {errorMessage}
                </div>
              )}

              <div className="flex-row justify-end gap-3">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setProjectToDelete(null); setErrorMessage(''); }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete Project'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Educator landing — no projects API call */}
        {isEducator && (
          <div className="project-grid">
            {[
              { Icon: CheckSquare, label: 'Verification Queue', desc: 'Grade student submissions and verify AI-generated solutions.', path: '/verification' },
              { Icon: FileText, label: 'Past Year Papers', desc: 'Upload and manage past year examination papers for practice.', path: '/past-year-papers' },
              { Icon: Tags, label: 'Subjects & Topics', desc: 'Manage subjects and topics used across the question bank.', path: '/subjects-topics' },
              { Icon: ClipboardList, label: 'Question Bank', desc: 'Browse and manage all questions in the system.', path: '/questions' },
            ].map((card) => (
              <div
                key={card.path}
                className="card project-card"
                onClick={() => navigate(card.path)}
              >
                <div className="project-card-icon"><card.Icon size={20} /></div>
                <h3 className="project-card-title">{card.label}</h3>
                <p className="project-card-desc">{card.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Student projects grid */}
        {!isEducator && (isLoading ? (
          <div className="flex justify-center" style={{ padding: '4rem' }}>
            <div className="spinner" />
          </div>
        ) : projects.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon"><Folder size={28} /></div>
            <h3>No projects yet</h3>
            <p>Create your first project to start building practice papers.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Project
            </button>
          </div>
        ) : (
          <div className="project-grid" id="projects-grid">
            {projects.map((project) => {
              const created = formatProjectDate(project.createdAt)
              return (
                <div
                  key={project.projectId}
                  className="card project-card"
                  id={`project-${project.projectId}`}
                  onClick={() => navigate(`/workspace/${project.projectId}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="project-card-icon" style={{ marginBottom: 0 }}>
                      <Folder size={20} />
                    </div>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button
                        type="button"
                        className="card-delete"
                        title="Rename Project"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(project.projectId);
                          setRenameValue(project.projectName || '');
                        }}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        type="button"
                        className="card-delete"
                        title="Delete Project"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {renamingId === project.projectId ? (
                    <input
                      autoFocus
                      className="project-rename-input"
                      value={renameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                        else if (e.key === 'Escape') { renameCancel.current = true; e.currentTarget.blur() }
                      }}
                      onBlur={() => {
                        if (renameCancel.current) { renameCancel.current = false; setRenamingId(null); return }
                        commitProjectRename(project)
                      }}
                    />
                  ) : (
                    <h3 className="project-card-title">{project.projectName}</h3>
                  )}

                  {project.subject && (
                    <div className="flex">
                      <span className="badge badge-blue" style={{ marginBottom: '0.75rem' }}>
                        {project.subject}
                      </span>
                    </div>
                  )}

                  {project.description && (
                    <p className="project-card-desc">{project.description}</p>
                  )}

                  {created && (
                    <div className="project-card-meta">Created {created}</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </main>
    </div>
  )
}

export default DashboardPage