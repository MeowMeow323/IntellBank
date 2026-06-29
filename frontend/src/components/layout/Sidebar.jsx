import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, BarChart3, Send, LogOut,
  CheckSquare, FileText, Tags, Users, ShieldCheck, TrendingUp,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import '../../styles/sidebar.css'

const ICON_SIZE = 18

const SHARED_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/questions', label: 'Question Bank', Icon: ClipboardList },
]

const STUDENT_ONLY_ITEMS = [
  { path: '/analytics',        label: 'Analytics',       Icon: BarChart3 },
  { path: '/submissions',      label: 'Submissions',     Icon: Send },
  { path: '/past-year-papers', label: 'Past Year Papers', Icon: FileText },
  { path: '/subject-analysis', label: 'Subject Analysis', Icon: TrendingUp },
]

const EDUCATOR_ITEMS = [
  { path: '/verification',     label: 'Verification',     Icon: CheckSquare },
  { path: '/class-analysis',   label: 'Class Analysis',   Icon: Users },
  { path: '/subject-analysis', label: 'Subject Analysis', Icon: TrendingUp },
  { path: '/past-year-papers', label: 'Past Year Papers', Icon: FileText },
  { path: '/subjects-topics',  label: 'Subjects & Topics', Icon: Tags },
]

const ADMIN_ITEMS = [
  { path: '/admin/specializations', label: 'Specializations', Icon: ShieldCheck },
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
        {SHARED_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="sidebar-nav-icon"><item.Icon size={ICON_SIZE} /></span>
            {item.label}
          </NavLink>
        ))}

        {!isEducatorOrAdmin() && STUDENT_ONLY_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="sidebar-nav-icon"><item.Icon size={ICON_SIZE} /></span>
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
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-nav-icon"><item.Icon size={ICON_SIZE} /></span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}

        {user?.role === 'ADMIN' && (
          <>
            <div className="sidebar-nav-section">ADMIN</div>
            {ADMIN_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                id={`nav-${item.label.toLowerCase()}`}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-nav-icon"><item.Icon size={ICON_SIZE} /></span>
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
        <span className="sidebar-nav-icon"><LogOut size={ICON_SIZE} /></span> Logout
      </button>
    </aside>
  )
}

export default Sidebar
