import React from 'react'
import TeX from '@matejmazur/react-katex'
import 'katex/dist/katex.min.css'
import '../styles/question-content.css'

// Matches, in document order, any of the inline markers the OCR pipeline
// emits: [SCENARIO]...[/SCENARIO], [TABLE]...[/TABLE] (pipe-delimited rows),
// [DIAGRAM: path], and $$...$$ block math. Capture groups line up 1:1 with
// the alternatives. Single-$ inline math is deliberately NOT matched here —
// it's handled per-paragraph in renderTextSegment so it flows inline with
// surrounding prose instead of breaking out into its own block.
const MARKER_RE = /\[SCENARIO\]([\s\S]*?)\[\/SCENARIO\]|\[TABLE\]([\s\S]*?)\[\/TABLE\]|\[DIAGRAM:\s*([^\]]+)\]|\$\$([\s\S]*?)\$\$/g

const INLINE_MATH_RE = /\$([^$\n]+?)\$/g

// pix2tex output is frequently invalid/garbled LaTeX (it's heuristic-detected
// math-region OCR, not guaranteed-correct) — KaTeX throws on parse failure,
// so every render must supply renderError or one bad expression crashes the
// whole question list.
const mathRenderError = (raw) => () => (
  <span className="question-math-error" title="Could not render this as math">{raw}</span>
)

// Heuristic: does this paragraph look like a code listing rather than prose?
// Tuned against real OCR output (Scanner/System.out/if/int-style snippets).
function looksLikeCode(text) {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return false
  const codeHits = lines.filter((l) =>
    /[{};]|^\s*(if|else|for|while|int|float|double|class|public|private|function|def|return)\b|Scanner|System\.(out|in)/i.test(l)
  ).length
  return codeHits / lines.length >= 0.4
}

// Splits a paragraph's text on inline $...$ math spans, rendering KaTeX
// inline alongside the surrounding plain text instead of as separate blocks.
function renderInlineMath(text, key) {
  const parts = []
  let last = 0
  let m
  let i = 0
  while ((m = INLINE_MATH_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <TeX key={`${key}-m${i++}`} math={m[1].trim()} renderError={mathRenderError(`$${m[1]}$`)} />
    )
    last = INLINE_MATH_RE.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function renderTable(raw, key) {
  const rows = raw
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split('|').map((c) => c.trim()))

  if (rows.length === 0) return null
  const [header, ...body] = rows

  return (
    <table className="question-table" key={key}>
      <thead>
        <tr>{header.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => <td key={j}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderTextSegment(text, key) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return paragraphs.map((p, i) =>
    looksLikeCode(p) ? (
      <pre className="question-code" key={`${key}-${i}`}><code>{p}</code></pre>
    ) : (
      <p className="question-paragraph" key={`${key}-${i}`}>{renderInlineMath(p, `${key}-${i}`)}</p>
    )
  )
}

/**
 * Renders question content with its OCR markers turned into real elements:
 * scenario callout box, HTML table, code block, KaTeX-rendered math (inline
 * $...$ and block $$...$$), and a diagram placeholder (image hosting for
 * cropped diagrams isn't wired up yet — see CLAUDE.md — so this links back
 * to the original PDF instead of a broken <img>).
 */
const QuestionContent = ({ content, originalFileUrl }) => {
  if (!content) return null

  const nodes = []
  let lastIndex = 0
  let match
  let idx = 0

  while ((match = MARKER_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderTextSegment(content.slice(lastIndex, match.index), `t${idx++}`))
    }

    const [, scenario, table, diagramPath, blockMath] = match
    if (scenario !== undefined) {
      nodes.push(
        <div className="question-scenario" key={`s${idx++}`}>
          <p className="question-scenario-label">Context / Scenario</p>
          {renderTextSegment(scenario.trim(), `sc${idx}`)}
        </div>
      )
    } else if (table !== undefined) {
      nodes.push(renderTable(table.trim(), `tb${idx++}`))
    } else if (diagramPath !== undefined) {
      nodes.push(
        <div className="question-diagram-placeholder" key={`d${idx++}`}>
          📊 Diagram in original PDF
          {originalFileUrl && (
            <>
              {' — '}
              <a href={originalFileUrl} target="_blank" rel="noopener noreferrer">view original</a>
            </>
          )}
        </div>
      )
    } else if (blockMath !== undefined) {
      nodes.push(
        <TeX
          key={`bm${idx++}`}
          math={blockMath.trim()}
          block
          renderError={mathRenderError(`$$${blockMath}$$`)}
        />
      )
    }

    lastIndex = MARKER_RE.lastIndex
  }

  if (lastIndex < content.length) {
    nodes.push(...renderTextSegment(content.slice(lastIndex), `t${idx++}`))
  }

  return <div className="question-content">{nodes}</div>
}

export default QuestionContent
