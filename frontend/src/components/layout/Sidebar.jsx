import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import '../../styles/sidebar.css'

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
          <span className={`badge ${roleColor}`}>
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
            <div className="sidebar-nav-section">EDUCATOR</div>
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
    </aside>
  )
}

export default Sidebar
