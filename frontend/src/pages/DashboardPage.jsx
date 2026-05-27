import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { ProjectService } from '../services/api'
import Sidebar from '../components/layout/Sidebar.jsx'

const DashboardPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newProject, setNewProject] = useState({ name: '', description: '', subject: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    setIsLoading(true)
    try {
      const res = await ProjectService.getAll()
      setProjects(res.data)
    } catch {
      // TODO: handle error
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await ProjectService.create(newProject)
      setShowCreate(false)
      setNewProject({ name: '', description: '', subject: '' })
      await loadProjects()
    } catch {
      // TODO: handle error
    } finally {
      setCreating(false)
    }
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

        {/* Create Project Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
                Create New Project
              </h3>
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input
                    id="project-name"
                    className="form-input"
                    placeholder="e.g. Physics Year 3"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
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
                    placeholder="Brief description..."
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  />
                </div>
                <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Projects Grid */}
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
                key={project.id}
                className="card project-card"
                id={`project-${project.id}`}
                onClick={() => navigate(`/workspace/${project.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="project-card-icon">
                  {project.subject?.[0] || project.name?.[0] || 'P'}
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  {project.name}
                </h3>
                {project.subject && (
                  <span className="badge badge-blue" style={{ marginBottom: '0.75rem' }}>
                    {project.subject}
                  </span>
                )}
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', flex: 1 }}>
                  {project.description || 'No description'}
                </p>
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex;
          align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.2s ease;
        }
        .modal-content {
          background: var(--color-bg-card); border: 1px solid var(--color-border);
          border-radius: var(--radius-xl); padding: 2rem; width: 100%; max-width: 480px;
        }
        .project-card { display: flex; flex-direction: column; cursor: pointer; }
        .project-card-icon {
          width: 48px; height: 48px; background: var(--gradient-primary);
          border-radius: var(--radius-md); display: flex; align-items: center;
          justify-content: center; font-size: 1.25rem; font-weight: 700;
          color: #fff; margin-bottom: 1rem; text-transform: uppercase;
        }
        .empty-state {
          text-align: center; padding: 5rem 2rem;
          color: var(--color-text-secondary);
        }
        .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .empty-state h3 { font-size: 1.25rem; color: var(--color-text-primary); margin-bottom: 0.5rem; }
      `}</style>
    </div>
  )
}

export default DashboardPage
