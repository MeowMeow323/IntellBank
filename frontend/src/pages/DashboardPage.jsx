import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { ProjectService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

import '../styles/global.css'
import '../styles/modals.css'

const DashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [newProject, setNewProject] = useState({ projectName: '', description: '', subject: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

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

  const formatProjectDate = (dateString) => {
    if (!dateString) return 'Unknown date'
    const parsedDate = new Date(dateString)
    return isNaN(parsedDate.getTime()) ? 'Recent' : parsedDate.toLocaleDateString()
  }

  return (
    <div className="page-layout">
      <Sidebar />
      
      <main className="main-content">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {user?.fullName || user?.username} 👋</p>
          </div>
          <button
            id="create-project-btn"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            + New Project
          </button>
        </div>

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
              <h3 style={{ marginBottom: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ Delete Project?
              </h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                Are you sure you want to delete <strong>{projectToDelete.projectName}</strong>? This will permanently erase this project along with all containing generated exam questions and raw documents. This cannot be undone.
              </p>

              {errorMessage && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.75rem', borderRadius: '6px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: '1.4' }}>
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

        {/* Projects Core Grid Layout */}
        {isLoading ? (
          <div className="flex justify-center" style={{ padding: '4rem' }}>
            <div className="spinner" />
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <h3>No projects yet</h3>
            <p>Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid-3" id="projects-grid">
            {projects.map((project) => (
              <div
                key={project.projectId}
                className="card project-card"
                id={`project-${project.projectId}`}
                onClick={() => navigate(`/workspace/${project.projectId}`)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div className="project-card-icon" style={{ marginBottom: 0 }}>
                    {project.subject?.[0] || project.projectName?.[0] || 'P'}
                  </div>
                  
                  <button
                    type="button"
                    title="Delete Project"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToDelete(project);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>

                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                  {project.projectName}
                </h3>
                
                {project.subject && (
                  <div className="flex">
                    <span className="badge badge-blue" style={{ marginBottom: '0.75rem' }}>
                      {project.subject}
                    </span>
                  </div>
                )}
                
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', flex: 1 }}>
                  {project.description || 'No description'}
                </p>
                
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Created {formatProjectDate(project.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default DashboardPage