import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/questions', label: 'Question Bank', icon: '📋' },
  { path: '/analytics', label: 'Analytics', icon: '📊' },
  { path: '/exam', label: 'Exam Simulator', icon: '📝' },
]

const EDUCATOR_ITEMS = [
  { path: '/verification', label: 'Verification', icon: '✅' },
]

const Sidebar = () => {
  const navigate = useNavigate()
  const { user, logout, isEducatorOrAdmin } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleColor = {
    STUDENT: 'badge-blue',
    EDUCATOR: 'badge-purple',
    ADMIN: 'badge-red',
  }[user?.role] || 'badge-blue'

  return (
    <aside className="sidebar" id="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">IB</div>
        <span className="sidebar-brand-text">IntellBank</span>
      </div>

      {/* User Info */}
      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {user?.fullName?.[0] || user?.username?.[0] || 'U'}
        </div>
        <div>
          <div className="sidebar-username">{user?.fullName || user?.username}</div>
          <span className={`badge ${roleColor}`} style={{ fontSize: '0.7rem' }}>
            {user?.role}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-section">MAIN</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {isEducatorOrAdmin() && (
          <>
            <div className="sidebar-nav-section" style={{ marginTop: '1rem' }}>EDUCATOR</div>
            {EDUCATOR_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                id={`nav-${item.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <button
        id="logout-btn"
        className="sidebar-logout"
        onClick={handleLogout}
      >
        <span>🚪</span> Logout
      </button>

      <style>{`
        .sidebar {
          width: 240px;
          min-height: 100vh;
          background: var(--color-bg-secondary);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          padding: 1.5rem 1rem;
          flex-shrink: 0;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.75rem;
        }
        .sidebar-logo {
          width: 36px;
          height: 36px;
          background: var(--gradient-primary);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.9rem;
          color: #fff;
          flex-shrink: 0;
        }
        .sidebar-brand-text {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 1.1rem;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .sidebar-user {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem;
          background: var(--color-bg-card);
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
          margin-bottom: 1.5rem;
        }
        .sidebar-avatar {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.9rem;
          color: #fff;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        .sidebar-username {
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 0.2rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 130px;
        }
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .sidebar-nav-section {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--color-text-muted);
          padding: 0.25rem 0.75rem;
          margin-bottom: 0.25rem;
        }
        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text-secondary);
          text-decoration: none;
          transition: all var(--transition-fast);
          border: 1px solid transparent;
        }
        .sidebar-nav-item:hover {
          color: var(--color-text-primary);
          background: var(--color-bg-hover);
        }
        .sidebar-nav-item.active {
          color: var(--color-accent-blue);
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.25);
        }
        .sidebar-nav-icon { font-size: 1rem; }
        .sidebar-logout {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text-secondary);
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-top: 1rem;
          width: 100%;
          text-align: left;
        }
        .sidebar-logout:hover {
          color: var(--color-accent-rose);
          background: rgba(244, 63, 94, 0.08);
          border-color: rgba(244, 63, 94, 0.2);
        }
      `}</style>
    </aside>
  )
}

export default Sidebar
