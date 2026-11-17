import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { renderPage, type PageSize } from '../lib/pdf'

interface Props {
  doc: PDFDocumentProxy
  pageIndex: number
  size: PageSize
  cssWidth: number
  /** Stop re-rendering bitmaps while a pinch is in progress. */
  settled: boolean
  children?: ReactNode
  onElement?: (pageIndex: number, el: HTMLDivElement | null) => void
}

/**
 * One page of the score. Renders lazily when near the viewport, re-renders when the width
 * settles after a zoom, and frees its bitmap when far off-screen.
 */
export function PdfPage({ doc, pageIndex, size, cssWidth, settled, children, onElement }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [rendered, setRendered] = useState(false)
  const cssHeight = (cssWidth * size.height) / size.width

  useEffect(() => {
    onElement?.(pageIndex, wrapRef.current)
    return () => onElement?.(pageIndex, null)
  }, [onElement, pageIndex])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const scrollRoot = el.closest('.score')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setNear(e.isIntersecting)
      },
      { root: scrollRoot, rootMargin: '150% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!near) {
      // Free the bitmap but keep the CSS box so layout does not jump.
      canvas.width = 0
      canvas.height = 0
      setRendered(false)
      return
    }
    if (!settled) return
    const job = renderPage(doc, pageIndex, canvas, cssWidth)
    void job.done.then(() => setRendered(true)).catch(() => undefined)
    return () => job.cancel()
  }, [doc, pageIndex, cssWidth, near, settled])

  return (
    <div ref={wrapRef} className="page" data-page={pageIndex} style={{ width: cssWidth, height: cssHeight }}>
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight }} />
      {!rendered && <div className="placeholder">Page {pageIndex + 1}</div>}
      <div className="overlay">{children}</div>
    </div>
  )
}
