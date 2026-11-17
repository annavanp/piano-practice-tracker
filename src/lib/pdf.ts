import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const base = import.meta.env.BASE_URL

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await blob.arrayBuffer())
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
  }).promise
}

export async function countPages(blob: Blob): Promise<number> {
  const doc = await openPdf(blob)
  try {
    return doc.numPages
  } finally {
    await doc.loadingTask.destroy()
  }
}

export interface PageSize {
  width: number
  height: number
}

/** Natural page sizes (PDF points) for every page, 0-based. */
export async function pageSizes(doc: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    sizes.push({ width: vp.width, height: vp.height })
  }
  return sizes
}

/**
 * Render a page into the canvas at `cssWidth` CSS pixels, sharp for the device pixel ratio.
 * Returns a cancel function.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false
  let task: ReturnType<pdfjs.PDFPageProxy['render']> | null = null
  const done = (async () => {
    const page = await doc.getPage(pageIndex + 1)
    if (cancelled) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const base = page.getViewport({ scale: 1 })
    const scale = cssWidth / base.width
    const viewport = page.getViewport({ scale: scale * dpr })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${(cssWidth * base.height) / base.width}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    task = page.render({ canvasContext: ctx, viewport, canvas })
    try {
      await task.promise
    } catch (err) {
      if (!(err instanceof Error && err.name === 'RenderingCancelledException')) throw err
    }
  })()
  return {
    done,
    cancel: () => {
      cancelled = true
      task?.cancel()
    },
  }
}
