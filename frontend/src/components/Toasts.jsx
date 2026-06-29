import React from 'react'
import useToastStore from '../store/toastStore'

const COLORS = {
  error:   '#dc2626',
  success: '#16a34a',
  info:    '#334155',
}

/** Global toast container — mount once near the app root. */
export default function Toasts() {
  const { toasts, removeToast } = useToastStore()
  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 4000,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => removeToast(t.id)}
          style={{
            padding: '10px 14px', borderRadius: 8, color: '#fff',
            background: COLORS[t.type] || COLORS.info,
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)', cursor: 'pointer',
            fontSize: '0.88rem', lineHeight: 1.4,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
