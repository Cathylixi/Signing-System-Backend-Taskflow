import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

interface PdfPageProps {
  doc: PDFDocumentProxy
  pageNumber: number
  width: number
  /** Overlay content, positioned over the page (e.g. placed fields). */
  children?: ReactNode
}

export default function PdfPage({ doc, pageNumber, width, children }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [height, setHeight] = useState(width * 1.294) // US Letter until measured

  useEffect(() => {
    let cancelled = false
    let task: RenderTask | null = null

    doc.getPage(pageNumber).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const base = page.getViewport({ scale: 1 })
      const scale = width / base.width
      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * dpr })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      setHeight(base.height * scale)
      task = page.render({ canvas, viewport })
      task.promise.catch(() => {
        /* cancelled by a newer render */
      })
    })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, width])

  return (
    <div className="pdf-page" style={{ width, height }}>
      <canvas ref={canvasRef} style={{ width, height }} aria-label={`Page ${pageNumber}`} role="img" />
      {children}
    </div>
  )
}
