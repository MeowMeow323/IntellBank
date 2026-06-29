/**
 * Client-side extraction of course code, paper name, and exam session
 * from the cover page (page 1) of a past-year paper PDF.
 */
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/** Title-case a string that is currently ALL CAPS. */
function toTitleCase(str) {
  const LOWER = new Set(['of', 'and', 'the', 'in', 'to', 'for', 'a', 'an', 'with', 'at', 'by'])
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !LOWER.has(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Reads page 1 of the PDF and returns extracted metadata.
 * Any field may be an empty string when extraction finds nothing
 * (e.g. image-based/scanned PDFs have no text layer).
 */
export async function extractFromPdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)
    const content = await page.getTextContent()

    // Group text items into visual lines by y-coordinate.
    // Use 5px tolerance to handle sub-pixel differences between items on the same visual line.
    const lineMap = new Map()
    for (const item of content.items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5] / 5) * 5
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y).push({ x: item.transform[4], str: item.str })
    }

    // Sort lines top-to-bottom (PDF y-axis is bottom-up → descending y = top-to-bottom)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
    const lines = sortedYs
      .map((y) =>
        lineMap.get(y)
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((l) => l.length > 0)

    const pageText = lines.join('\n')
    console.log('[pdfExtract] Cover page text:\n', pageText.slice(0, 600))

    // ── Course code + name ──────────────────────────────────────────────────
    // Match e.g. "BMSE1003 SOFTWARE ENGINEERING" or "BITU3013 Software Project Management"
    // Case-insensitive; name is everything after the code on the same line.
    const COURSE_CODE_RE = /^([A-Z]{2,6}\d{3,4}[A-Z]?)\s+([A-Z].{3,80})$/im

    let courseCode = ''
    let courseName = ''
    for (const line of lines) {
      const m = line.match(/^([A-Za-z]{2,6}\d{3,4}[A-Za-z]?)\s+(.{4,80})$/)
      if (m) {
        courseCode = m[1].toUpperCase()
        const rawName = m[2].trim()
        // Title-case if entirely uppercase (most cover pages are)
        courseName = rawName === rawName.toUpperCase() ? toTitleCase(rawName) : rawName
        break
      }
    }
    const title = courseCode && courseName ? `${courseCode} ${courseName}` : courseCode || courseName || ''

    // ── Exam session ────────────────────────────────────────────────────────
    // The academic year (e.g. 2024/2025) and the month/semester often appear
    // on SEPARATE lines on Malaysian university cover pages, so we find each
    // independently and then combine them.

    // Find academic year — "2024/2025"
    const yearMatch = pageText.match(/(\d{4})\s*\/\s*(\d{4})/)
    const academicYear = yearMatch ? `${yearMatch[1]}/${yearMatch[2]}` : ''

    // Find the session label — month name or "Semester 1 / 2"
    // Scan lines to pick the first standalone month/semester that is NOT inside a date like "8 JANUARY 2025"
    let sessionLabel = ''
    const MONTH_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Semester\s*[12]|Sem\s*[12])\b/i
    const DATE_PREFIX_RE = /\d\s+\w+$/ // e.g. "8 JANUARY" — digit before the month

    for (const line of lines) {
      const m = line.match(MONTH_RE)
      if (!m) continue
      // Skip lines like "WEDNESDAY, 8 JANUARY 2025" where a digit precedes the month
      const before = line.slice(0, m.index).trim()
      if (DATE_PREFIX_RE.test(before)) continue
      sessionLabel = m[1].replace(/\s+/g, ' ').trim()
      break
    }

    // Normalise capitalisation
    if (sessionLabel) {
      if (/^semester/i.test(sessionLabel)) {
        sessionLabel = sessionLabel.replace(/^semester\s*/i, 'Semester ')
      } else {
        sessionLabel = sessionLabel[0].toUpperCase() + sessionLabel.slice(1).toLowerCase()
      }
    }

    const examSession = sessionLabel && academicYear
      ? `${sessionLabel} ${academicYear}`
      : academicYear || sessionLabel || ''

    console.log('[pdfExtract] Extracted:', { courseCode, courseName, examSession })
    return { courseCode, courseName, title, examSession }
  } catch (err) {
    console.error('[pdfExtract] Extraction failed:', err)
    return { courseCode: '', courseName: '', title: '', examSession: '' }
  }
}
