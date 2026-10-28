import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import PdfPage from '../components/PdfPage'
import { TopBar } from '../components/WorkflowLayout'
import { SHARED_COLOR, signerColor, type SignerColor } from '../lib/colors'
import { newId, plural } from '../lib/format'
import { initials } from '../lib/people'
import { openPdf } from '../lib/pdf'
import { signersMissingSignature } from '../lib/request'
import type { Draft, FieldType, PlacedField, Signer } from '../types'

// Slides 6 (shared: fields per signer, colour-coded) and 7 (copies: one layout for everyone).

const FIELD_TYPES: { type: FieldType; label: string; short: string; w: number; h: number }[] = [
  { type: 'signature', label: 'Signature', short: 'Signature', w: 0.34, h: 0.055 },
  { type: 'initials', label: 'Initials', short: 'Initials', w: 0.14, h: 0.055 },
  { type: 'reason', label: 'Reason for signing', short: 'Reason', w: 0.5, h: 0.045 },
  { type: 'date', label: 'Date signed', short: 'Date signed', w: 0.2, h: 0.045 },
]
const FIELD_MIME = 'application/x-signing-field'
const MIN_W = 0.06
const MIN_H = 0.025

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

interface Props {
  draft: Draft
  update: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void
  onBack: () => void
  onContinue: () => void
}

export default function FieldsStep({ draft, update, onBack, onContinue }: Props) {
  const shared = draft.mode === 'shared'
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [activeSignerId, setActiveSignerId] = useState(draft.signers[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(640)

  useEffect(() => {
    if (!draft.file) return
    let task: PDFDocumentLoadingTask | null = null
    let cancelled = false
    openPdf(draft.file)
      .then((t) => {
        task = t
        if (cancelled) void t.destroy()
        return t.promise
      })
      .then((d) => {
        if (!cancelled) setDoc(d)
      })
      .catch(() => {
        if (!cancelled) setLoadError('The PDF could not be displayed.')
      })
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [draft.file])

  useLayoutEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setPageWidth(Math.min(Math.floor(entry.contentRect.width) - 48, 760)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const signerIndex = new Map(draft.signers.map((s, i) => [s.id, i]))
  const activeSigner = draft.signers.find((s) => s.id === activeSignerId) ?? draft.signers[0]
  const activeColor = signerColor(activeSigner ? (signerIndex.get(activeSigner.id) ?? 0) : 0)
  const selected = draft.fields.find((f) => f.id === selectedId) ?? null
  const missing = signersMissingSignature(draft)

  const colorFor = (f: PlacedField): SignerColor =>
    f.signerId ? signerColor(signerIndex.get(f.signerId) ?? 0) : SHARED_COLOR

  function setFields(fn: (fields: PlacedField[]) => PlacedField[]) {
    update((d) => ({ fields: fn(d.fields) }))
  }

  function patchField(id: string, patch: Partial<PlacedField>) {
    setFields((fields) => fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFields((fields) => fields.filter((f) => f.id !== id))
    setSelectedId(null)
  }

  /** Vertical centre of the part of the page currently on screen, as a page fraction. */
  function visibleCenterY(): number {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return 0.5
    const top = Math.max(rect.top, 0)
    const bottom = Math.min(rect.bottom, window.innerHeight)
    return bottom > top ? ((top + bottom) / 2 - rect.top) / rect.height : 0.5
  }

  function goToPage(n: number) {
    setPage(n)
    setSelectedId(null)
  }

  function addField(type: FieldType, cx?: number, cy?: number) {
    const spec = FIELD_TYPES.find((t) => t.type === type)!
    // Clicked (not dropped): stack in rows around the visible centre so repeated adds don't overlap.
    const row = (draft.fields.filter((f) => f.page === page).length % 5) - 2
    const x = clamp((cx ?? 0.5) - spec.w / 2, 0, 1 - spec.w)
    const y = clamp((cy ?? visibleCenterY() + row * 0.075) - spec.h / 2, 0, 1 - spec.h)
    const field: PlacedField = {
      id: newId('field'),
      type,
      page,
      x,
      y,
      w: spec.w,
      h: spec.h,
      signerId: shared ? (activeSigner?.id ?? null) : null,
    }
    setFields((fields) => [...fields, field])
    setSelectedId(field.id)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    const type = e.dataTransfer.getData(FIELD_MIME) as FieldType
    if (!type) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    addField(type, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
  }

  function startPointer(e: PointerEvent<HTMLElement>, field: PlacedField, kind: 'move' | 'resize') {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelectedId(field.id)
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...field }
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const move = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width
      const dy = (ev.clientY - startY) / rect.height
      if (kind === 'move') {
        patchField(field.id, { x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) })
      } else {
        patchField(field.id, { w: clamp(start.w + dx, MIN_W, 1 - start.x), h: clamp(start.h + dy, MIN_H, 1 - start.y) })
      }
    }
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  function onFieldKey(e: KeyboardEvent<HTMLDivElement>, f: PlacedField) {
    const step = e.shiftKey ? 0.02 : 0.005
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeField(f.id)
    } else if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      patchField(f.id, { x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) })
    }
  }

  function fieldLabel(f: PlacedField): string {
    const spec = FIELD_TYPES.find((t) => t.type === f.type)!
    if (!f.signerId) {
      if (f.type === 'signature') return 'Signature • All signers'
      if (f.type === 'reason') return 'Reason • Entered by each signer'
      return spec.short
    }
    const signer = draft.signers.find((s) => s.id === f.signerId)
    if (!signer) return spec.short
    if (f.type === 'initials' || f.type === 'date') return `${spec.short} ${initials(signer.name)}`
    return `${spec.short} • ${signer.name}`
  }

  const countsFor = (signer: Signer | null) =>
    FIELD_TYPES.map((t) => ({
      ...t,
      count: draft.fields.filter((f) => f.type === t.type && (signer ? f.signerId === signer.id : true)).length,
    }))

  const canContinue = missing.length === 0

  return (
    <div className="workspace">
      <TopBar
        center={<span className="topbar-doc">{draft.file?.name}</span>}
        right={
          <button type="button" className="btn btn-primary btn-small" disabled={!canContinue} onClick={onContinue}>
            Review &amp; send
          </button>
        }
      />
      <div className="workspace-body fields-body">
        <aside className="palette">
          <h2 className="section-label">Fields</h2>
          <p className="hint">Drag a field onto the PDF, or click to add it to this page.</p>
          <ul className="palette-list">
            {FIELD_TYPES.map((t) => (
              <li key={t.type}>
                <button
                  type="button"
                  className="palette-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(FIELD_MIME, t.type)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => addField(t.type)}
                  style={
                    shared && activeSigner
                      ? { borderColor: signerColor(signerIndex.get(activeSigner.id) ?? 0).border }
                      : undefined
                  }
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>

          <hr />
          <h2 className="section-label">Field settings</h2>

          {shared ? (
            <>
              <label className="summary-heading" htmlFor="assigned-recipient">
                Assigned recipient
              </label>
              <div className="recipient-select">
                {activeSigner && (
                  <span className="avatar" style={{ background: activeColor.bg, color: activeColor.fg, borderColor: activeColor.border }} aria-hidden="true">
                    {initials(activeSigner.name)}
                  </span>
                )}
                <select
                  id="assigned-recipient"
                  className="input select"
                  style={{ borderColor: activeColor.border }}
                  value={activeSigner?.id ?? ''}
                  onChange={(e) => setActiveSignerId(e.target.value)}
                >
                  {draft.signers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {missing.includes(s) ? '(needs signature)' : '✓'}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">New fields are assigned to this person.</p>
            </>
          ) : (
            <>
              <p className="summary-heading">Applies to</p>
              <div className="recipient">
                <span className="avatar" style={{ background: SHARED_COLOR.bg, color: SHARED_COLOR.fg, borderColor: SHARED_COLOR.border }}>
                  {draft.signers.length}
                </span>
                <span className="recipient-name">All {plural(draft.signers.length, 'signer')}</span>
              </div>
            </>
          )}

          {selected && (
            <div className="selected-field">
              <p className="summary-heading">Selected field</p>
              <p>{FIELD_TYPES.find((t) => t.type === selected.type)!.label}</p>
              {shared && (
                <label className="field">
                  <span className="label">Assigned to</span>
                  <select
                    className="input select"
                    value={selected.signerId ?? ''}
                    onChange={(e) => patchField(selected.id, { signerId: e.target.value })}
                  >
                    {draft.signers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="link-button danger" onClick={() => removeField(selected.id)}>
                Remove field
              </button>
            </div>
          )}

          <p className="summary-heading">{shared ? `Fields for ${activeSigner?.name ?? '—'}` : 'Fields on each copy'}</p>
          <dl className="field-counts">
            {countsFor(shared ? (activeSigner ?? null) : null).map((t) => (
              <div key={t.type}>
                <dt>
                  {t.short}
                  {t.type === 'signature' && <span className="required"> (required)</span>}
                </dt>
                <dd>{t.count}</dd>
              </div>
            ))}
          </dl>

          {canContinue ? (
            <p className="status-ok">
              {shared ? 'All required fields placed' : `One placement used on all ${plural(draft.signers.length, 'copy', 'copies')}`}
            </p>
          ) : (
            <p className="status-missing">
              {shared
                ? `Needs a signature field: ${missing.map((s) => s.name).join(', ')}`
                : 'Add at least one signature field.'}
            </p>
          )}

          <button type="button" className="btn btn-secondary btn-block" disabled={!canContinue} onClick={onContinue}>
            Save placement
          </button>

          <button type="button" className="link-button back-link" onClick={onBack}>
            ← Back to signers
          </button>
        </aside>

        <main className="main fields-main" ref={viewerRef}>
          <div className="page-head">
            <h1>{shared ? 'Place every required field directly on the PDF' : 'Place one set of fields for every signer'}</h1>
            <p className="subtitle">
              {shared
                ? 'Select a recipient, then drag and resize each field.'
                : "Fields placed here appear on each signer's separate copy."}
            </p>
          </div>

          {draft.pageCount > 1 && (
            <nav className="pager" aria-label="Pages">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                ‹
              </button>
              <span aria-live="polite">
                Page {page} of {draft.pageCount}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next page"
                disabled={page >= draft.pageCount}
                onClick={() => goToPage(page + 1)}
              >
                ›
              </button>
            </nav>
          )}

          {loadError && <p className="message error">{loadError}</p>}
          {doc && (
            <PdfPage doc={doc} pageNumber={page} width={pageWidth}>
              <div
                ref={overlayRef}
                className="field-overlay"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(FIELD_MIME)) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                  }
                }}
                onDrop={onDrop}
                onPointerDown={() => setSelectedId(null)}
              >
                {draft.fields
                  .filter((f) => f.page === page)
                  .map((f) => {
                    const c = colorFor(f)
                    const isSelected = f.id === selectedId
                    return (
                      <div
                        key={f.id}
                        className={`placed-field${isSelected ? ' selected' : ''}`}
                        style={{
                          left: `${f.x * 100}%`,
                          top: `${f.y * 100}%`,
                          width: `${f.w * 100}%`,
                          height: `${f.h * 100}%`,
                          color: c.fg,
                          background: c.bg,
                          borderColor: c.border,
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${fieldLabel(f)}. Arrow keys move, Delete removes.`}
                        onPointerDown={(e) => startPointer(e, f, 'move')}
                        onFocus={() => setSelectedId(f.id)}
                        onKeyDown={(e) => onFieldKey(e, f)}
                      >
                        <span className="placed-label">{fieldLabel(f)}</span>
                        {isSelected && (
                          <>
                            <button
                              type="button"
                              className="placed-delete"
                              aria-label="Remove field"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => removeField(f.id)}
                            >
                              ×
                            </button>
                            <span
                              className="placed-resize"
                              style={{ background: c.border }}
                              aria-hidden="true"
                              onPointerDown={(e) => startPointer(e, f, 'resize')}
                            />
                          </>
                        )}
                      </div>
                    )
                  })}
              </div>
            </PdfPage>
          )}
        </main>
      </div>
    </div>
  )
}
