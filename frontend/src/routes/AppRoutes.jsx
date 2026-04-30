import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

// Pages
import LoginPage from '../pages/LoginPage.jsx'
import RegisterPage from '../pages/RegisterPage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import WorkspacePage from '../pages/WorkspacePage.jsx'
import DocumentUploadPage from '../pages/DocumentUploadPage.jsx'
import QuestionBankPage from '../pages/QuestionBankPage.jsx'
import VerificationPage from '../pages/VerificationPage.jsx'
import PredictiveAnalyticsPage from '../pages/PredictiveAnalyticsPage.jsx'
import ExamSimulatorPage from '../pages/ExamSimulatorPage.jsx'

/**
 * ProtectedRoute – redirects to /login if the user is not authenticated.
 */
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Role-based access control
  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

/**
 * AppRoutes – defines the full routing structure.
 */
const AppRoutes = () => {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      {/* ── Public Routes ── */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
      />

      {/* ── Protected Routes (all authenticated users) ── */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace/:projectId"
        element={
          <ProtectedRoute>
            <WorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents/:projectId"
        element={
          <ProtectedRoute>
            <DocumentUploadPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/questions"
        element={
          <ProtectedRoute>
            <QuestionBankPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <PredictiveAnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exam"
        element={
          <ProtectedRoute>
            <ExamSimulatorPage />
          </ProtectedRoute>
        }
      />

      {/* ── Restricted Routes (EDUCATOR and ADMIN only) ── */}
      <Route
        path="/verification"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <VerificationPage />
          </ProtectedRoute>
        }
      />

      {/* ── Redirects ── */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
