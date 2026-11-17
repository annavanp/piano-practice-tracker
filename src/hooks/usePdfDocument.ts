import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState } from 'react'
import { openPdf, pageSizes, type PageSize } from '../lib/pdf'

export interface LoadedPdf {
  doc: PDFDocumentProxy
  sizes: PageSize[]
}

export function usePdfDocument(blob: Blob | undefined): LoadedPdf | null {
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null)
  useEffect(() => {
    if (!blob) return
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    void (async () => {
      const d = await openPdf(blob)
      if (cancelled) {
        await d.loadingTask.destroy()
        return
      }
      doc = d
      const sizes = await pageSizes(d)
      if (!cancelled) setLoaded({ doc: d, sizes })
    })()
    return () => {
      cancelled = true
      setLoaded(null)
      void doc?.loadingTask.destroy()
    }
  }, [blob])
  return loaded
}
