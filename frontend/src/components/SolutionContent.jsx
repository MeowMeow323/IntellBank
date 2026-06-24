import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

/**
 * Renders LLM-generated solution content — standard Markdown + LaTeX math.
 * Uses react-markdown so headings, lists, bold, code blocks all render correctly.
 * KaTeX handles $...$ inline and $$...$$ block math via remark-math + rehype-katex.
 */
const SolutionContent = ({ content }) => {
  if (!content) return null

  return (
    <div className="solution-content">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.75rem 0 0.35rem' }}>{children}</h3>,
          h2: ({ children }) => <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.65rem 0 0.3rem' }}>{children}</h4>,
          h3: ({ children }) => <h5 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0.6rem 0 0.25rem' }}>{children}</h5>,
          h4: ({ children }) => <h6 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0.5rem 0 0.2rem' }}>{children}</h6>,
          p:  ({ children }) => <p style={{ margin: '0.35rem 0', lineHeight: 1.6 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0.35rem 0 0.35rem 1.25rem', padding: 0 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0.35rem 0 0.35rem 1.25rem', padding: 0 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '0.2rem 0', lineHeight: 1.6 }}>{children}</li>,
          code: ({ inline, children }) =>
            inline
              ? <code style={{ background: 'var(--color-bg-tertiary, #e2e8f0)', padding: '0.1em 0.35em', borderRadius: '3px', fontSize: '0.85em', fontFamily: 'monospace' }}>{children}</code>
              : <pre style={{ background: 'var(--color-bg-tertiary, #1e293b)', color: '#e2e8f0', padding: '0.75rem 1rem', borderRadius: '6px', overflowX: 'auto', fontSize: '0.85rem', margin: '0.5rem 0' }}><code>{children}</code></pre>,
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: '3px solid var(--color-primary, #6366f1)', margin: '0.5rem 0', paddingLeft: '0.75rem', color: 'var(--color-text-secondary, #64748b)' }}>
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--color-border, #e2e8f0)', margin: '0.75rem 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default SolutionContent
