import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export const MAX_SIZE_MB = 25

/** Call `.destroy()` on the returned task when done to free the worker. */
export async function openPdf(file: File): Promise<PDFDocumentLoadingTask> {
  return getDocument({ data: await file.arrayBuffer() })
}

export type PdfCheck = { ok: true; pageCount: number } | { ok: false; error: string }

// UX check only: the backend must re-validate, since this can be bypassed.
export async function checkPdf(file: File): Promise<PdfCheck> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return { ok: false, error: 'Only PDF documents can be uploaded.' }
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return { ok: false, error: `File is larger than ${MAX_SIZE_MB} MB.` }
  if ((await file.slice(0, 5).text()) !== '%PDF-')
    return { ok: false, error: 'This file is not a valid PDF.' }
  const task = await openPdf(file)
  try {
    const doc = await task.promise
    return { ok: true, pageCount: doc.numPages }
  } catch {
    return { ok: false, error: 'This PDF could not be opened. It may be damaged or password-protected.' }
  } finally {
    void task.destroy()
  }
}
