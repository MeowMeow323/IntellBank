import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes.jsx'
import Toasts from './components/Toasts.jsx'
import useSessionTimeout from './utils/useSessionTimeout.js'
// global.css is already loaded via main.jsx → index.css (@import); no need to import it twice.

function App() {
  // Enforce the 90-minute inactivity logout across the whole authenticated app.
  useSessionTimeout()

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toasts />
    </BrowserRouter>
  )
}

export default App
