import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'

// Pages
import LoginPage from '../pages/LoginPage.jsx'
import RegisterPage from '../pages/RegisterPage.jsx'
import ForgotPasswordPage from '../pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from '../pages/ResetPasswordPage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import WorkspacePage from '../pages/WorkspacePage.jsx'
import DocumentUploadPage from '../pages/DocumentUploadPage.jsx'
import QuestionBankPage from '../pages/QuestionBankPage.jsx'
import VerificationPage from '../pages/VerificationPage.jsx'
import PredictiveAnalyticsPage from '../pages/PredictiveAnalyticsPage.jsx'
import PastYearPaperLibraryPage from '../pages/PastYearPaperLibraryPage.jsx'
import PastYearPaperQuestionsPage from '../pages/PastYearPaperQuestionsPage.jsx'
import SubjectTopicManagementPage from '../pages/SubjectTopicManagementPage.jsx'
import SubmissionsPage from '../pages/SubmissionsPage.jsx'
import EducatorAnalysisPage from '../pages/EducatorAnalysisPage.jsx'
import SubjectAnalysisPage from '../pages/SubjectAnalysisPage.jsx'
import AdminSpecializationsPage from '../pages/AdminSpecializationsPage.jsx'

/**
 * ProtectedRoute – redirects to /login if the user is not authenticated.
 */
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    // Remember where the user was headed so we can return them after login.
    return <Navigate to="/login" replace state={{ from: location }} />
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
      <Route
        path="/forgot-password"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />}
      />
      <Route
        path="/reset-password"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <ResetPasswordPage />}
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
        path="/submissions"
        element={
          <ProtectedRoute>
            <SubmissionsPage />
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
      <Route
        path="/past-year-papers"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <PastYearPaperLibraryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/past-year-papers/:pypId/questions"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <PastYearPaperQuestionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subjects-topics"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <SubjectTopicManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/class-analysis"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <EducatorAnalysisPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subject-analysis"
        element={
          <ProtectedRoute allowedRoles={['EDUCATOR', 'ADMIN']}>
            <SubjectAnalysisPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/specializations"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminSpecializationsPage />
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
