import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes.jsx'
import Toasts from './components/Toasts.jsx'
// global.css is already loaded via main.jsx → index.css (@import); no need to import it twice.

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toasts />
    </BrowserRouter>
  )
}

export default App
