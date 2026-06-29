import React from 'react'

/**
 * Generic page-number bar.
 * Props: page (1-based), totalPages, onChange(newPage)
 * Renders nothing when totalPages <= 1.
 */
export default function Paginator({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce((acc, n, idx, arr) => {
      if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
      acc.push(n)
      return acc
    }, [])

  const btnBase = { padding: '0.3rem 0.65rem', fontSize: '0.82rem' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
      <button className="btn btn-secondary" style={btnBase}
        onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
        ← Prev
      </button>

      {pages.map((n, i) =>
        n === '…'
          ? <span key={`gap-${i}`} style={{ padding: '0 0.2rem', color: 'var(--color-text-muted)' }}>…</span>
          : <button key={n} className="btn btn-secondary" style={{
              ...btnBase,
              fontWeight: n === page ? 700 : 400,
              background:   n === page ? 'var(--gradient-primary)' : undefined,
              color:        n === page ? '#fff' : undefined,
              borderColor:  n === page ? 'transparent' : undefined,
            }}
            onClick={() => onChange(n)}>
            {n}
          </button>
      )}

      <button className="btn btn-secondary" style={btnBase}
        onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
        Next →
      </button>

      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginLeft: '0.4rem' }}>
        Page {page} of {totalPages}
      </span>
    </div>
  )
}
