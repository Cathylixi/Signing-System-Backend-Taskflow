import { useRef, useState, type DragEvent } from 'react'
import { formatSize, plural } from '../lib/format'
import { MAX_SIZE_MB, checkPdf } from '../lib/pdf'
import type { Draft, SendingMode } from '../types'

interface UploadStepProps {
  draft: Draft
  onModeChange: (mode: SendingMode) => void
  onFile: (file: File | null, pageCount: number) => void
  onContinue: () => void
}

const MODES: { mode: SendingMode; title: string; detail: string; summary: string }[] = [
  {
    mode: 'shared',
    title: 'One document',
    detail: 'to many signers',
    summary: 'One document, many signers',
  },
  {
    mode: 'copies',
    title: 'One document',
    detail: 'to one signer each, sent all at once',
    summary: 'Separate copy for each signer',
  },
]

export function UploadMain({ draft, onModeChange, onFile }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setChecking(true)
    setError(null)
    const result = await checkPdf(file)
    setChecking(false)
    if (inputRef.current) inputRef.current.value = ''
    if (!result.ok) return setError(result.error)
    onFile(file, result.pageCount)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files[0])
  }

  return (
    <>
      <section className="section">
        <h2 className="section-label" id="mode-label">
          Sending mode
        </h2>
        <div className="mode-options" role="radiogroup" aria-labelledby="mode-label">
          {MODES.map((m) => (
            <label key={m.mode} className={`mode-card${draft.mode === m.mode ? ' selected' : ''}`}>
              <input
                type="radio"
                name="mode"
                value={m.mode}
                checked={draft.mode === m.mode}
                onChange={() => onModeChange(m.mode)}
              />
              <span>
                <strong>{m.title}</strong>
                <span>{m.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Document</h2>
        <div
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <svg className="dropzone-icon" viewBox="0 0 48 40" aria-hidden="true">
            <path
              d="M14 32H11a9 9 0 0 1-1-17.9A12 12 0 0 1 33.3 11 8 8 0 0 1 37 32h-3M24 36V20m0 0-6 6m6-6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="dropzone-text">
            <strong>{checking ? 'Checking PDF…' : 'Drag and drop a PDF here'}</strong>
            <span>PDF only, up to {MAX_SIZE_MB} MB</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            Upload PDF
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>

        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}

        {draft.file && (
          <div className="file-row">
            <span className="pdf-badge">PDF</span>
            <span className="file-row-text">
              <strong>{draft.file.name}</strong>
              <span>
                {plural(draft.pageCount, 'page')} • {formatSize(draft.file.size)}
              </span>
            </span>
            <span className="pill success">Ready</span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${draft.file.name}`}
              onClick={() => onFile(null, 0)}
            >
              ×
            </button>
          </div>
        )}
      </section>
    </>
  )
}

export function UploadAside({ draft, onContinue }: UploadStepProps) {
  const mode = MODES.find((m) => m.mode === draft.mode)!
  return (
    <>
      <div className="summary-card">
        <h2>Upload summary</h2>
        <div className="summary-row">
          <span>Documents</span>
          <strong className="summary-num">{draft.file ? 1 : 0}</strong>
        </div>
        <hr />
        <div className="summary-block">
          <span>Sending mode</span>
          <strong>{mode.summary}</strong>
        </div>
        <hr />
        <div className="summary-block">
          <span>Accepted files</span>
          <span className="summary-value">PDF, up to {MAX_SIZE_MB} MB</span>
        </div>
        <button type="button" className="btn btn-secondary btn-block" disabled={!draft.file} onClick={onContinue}>
          Continue
        </button>
      </div>
      <p className="summary-note">The PDF stays on this device until you send the request.</p>
    </>
  )
}
