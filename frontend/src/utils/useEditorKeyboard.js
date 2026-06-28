import { useCallback } from 'react'

/**
 * useEditorKeyboard.js
 * Keyboard shortcut logic for the workspace page editor.
 */
export function useEditorKeyboard({
    pageRefs,
    contentH,
    pagesLength,
    setPages,
    reflowPage,
    triggerSave,
    recalcStats,
    setShowFind,
    focusedPage,
    onUndo,
    onRedo,
}) {
    const focusPage = useCallback((pageIdx) => {
        setTimeout(() => {
            const el = pageRefs.current[pageIdx]?.current
            if (!el) return
            el.focus()
            // Place cursor at start of page
            try {
                const range = document.createRange()
                range.setStart(el, 0)
                range.collapse(true)
                window.getSelection().removeAllRanges()
                window.getSelection().addRange(range)
            } catch {
                // fallback: do nothing
            }
            focusedPage.current = pageIdx
        }, 30)
    }, [pageRefs, focusedPage])

    const makeOnKeyDown = useCallback((pageIdx) => (e) => {
        const ctrl = e.ctrlKey || e.metaKey
        const shift = e.shiftKey
        const key = e.key
        const el = pageRefs.current[pageIdx]?.current

        // ── Ctrl+Enter → new page after current ──────────────────────────
        if (ctrl && key === 'Enter') {
            e.preventDefault()
            setPages(prev => {
                const next = [...prev]
                next.splice(pageIdx + 1, 0, '<p><br></p>')
                return next
            })
            focusPage(pageIdx + 1)
            return
        }

        // ── Ctrl+Shift+Z → redo (common alternative) ──────────────────────────
        if (ctrl && shift && key.toLowerCase() === 'z') {
            e.preventDefault()
            onRedo?.()
            return
        }

        // ── Ctrl shortcuts ────────────────────────────────────────────────────
        if (ctrl && !shift) {
            switch (key.toLowerCase()) {
                case 'z':
                    // Document-level snapshot undo (native execCommand undo is wiped
                    // whenever the app reprograms innerHTML during pagination).
                    e.preventDefault()
                    onUndo?.()
                    return
                case 'y':
                    e.preventDefault()
                    onRedo?.()
                    return
                case 'b':
                    e.preventDefault()
                    document.execCommand('bold')
                    return
                case 'i':
                    e.preventDefault()
                    document.execCommand('italic')
                    return
                case 'u':
                    e.preventDefault()
                    document.execCommand('underline')
                    return
                case 'f':
                    e.preventDefault()
                    setShowFind(true)
                    return
                default:
                    break
            }
        }

        // ── Shift+Enter → soft line break ────────────────────────────────────
        if (shift && key === 'Enter') {
            e.preventDefault()
            document.execCommand('insertLineBreak')
            return
        }

        // ── Tab → indent 4 spaces ─────────────────────────────────────────────
        if (key === 'Tab') {
            e.preventDefault()
            document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
            return
        }

        // ── Backspace at start of page → merge into previous page ────────────
        if (key === 'Backspace' && !ctrl && el && pageIdx > 0) {
            const sel = window.getSelection()
            if (sel?.rangeCount) {
                const range = sel.getRangeAt(0)
                if (range.collapsed) {
                    // Check cursor is at position 0 of this page
                    const preRange = document.createRange()
                    preRange.selectNodeContents(el)
                    preRange.setEnd(range.startContainer, range.startOffset)
                    if (preRange.toString().length === 0) {
                        e.preventDefault()
                        const prevEl = pageRefs.current[pageIdx - 1]?.current
                        if (!prevEl) return

                        const prevLen = prevEl.innerText.length

                        // Move all nodes from this page to end of previous page
                        if (prevEl.innerHTML === '<p><br></p>') prevEl.innerHTML = ''
                        const fragment = document.createDocumentFragment()
                        while (el.firstChild) fragment.appendChild(el.firstChild)
                        prevEl.appendChild(fragment)

                        // Remove this page
                        setPages(prev => {
                            const next = prev.filter((_, i) => i !== pageIdx)
                            return next.length ? next : ['<p><br></p>']
                        })

                        // Place cursor at the join point in previous page
                        setTimeout(() => {
                            prevEl.focus()
                            try {
                                const walker = document.createTreeWalker(prevEl, NodeFilter.SHOW_TEXT)
                                let counted = 0, targetNode = null, targetOffset = 0, node
                                while ((node = walker.nextNode())) {
                                    if (counted + node.length >= prevLen) {
                                        targetNode = node
                                        targetOffset = prevLen - counted
                                        break
                                    }
                                    counted += node.length
                                }
                                if (targetNode) {
                                    const r = document.createRange()
                                    r.setStart(targetNode, targetOffset)
                                    r.collapse(true)
                                    sel.removeAllRanges()
                                    sel.addRange(r)
                                } else {
                                    // Fallback: cursor at end
                                    const r = document.createRange()
                                    r.selectNodeContents(prevEl)
                                    r.collapse(false)
                                    sel.removeAllRanges()
                                    sel.addRange(r)
                                }
                            } catch {
                                const r = document.createRange()
                                r.selectNodeContents(prevEl)
                                r.collapse(false)
                                sel.removeAllRanges()
                                sel.addRange(r)
                            }
                            focusedPage.current = pageIdx - 1
                        }, 30)
                        return
                    }
                }
            }
        }

        // ── Enter at a full page → jump cursor to next page ──────────────────
        // Note: actual node overflow is handled by reflowOnType in onInput.
        // This just moves the cursor so the user keeps typing on the next page.
        if (key === 'Enter' && !ctrl && !shift && el) {
            if (el.scrollHeight >= contentH + 20) {
                e.preventDefault()
                setPages(prev => {
                    if (prev[pageIdx + 1] !== undefined) return prev
                    return [...prev, '<p><br></p>']
                })
                focusPage(pageIdx + 1)
                return
            }
        }

        recalcStats()
        triggerSave()
    }, [
        contentH, pagesLength, pageRefs, setPages,
        reflowPage, triggerSave, recalcStats,
        setShowFind, focusedPage, focusPage, onUndo, onRedo,
    ])

    return { makeOnKeyDown }
}