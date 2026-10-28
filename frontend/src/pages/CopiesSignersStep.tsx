import { useMemo, useRef, useState } from 'react'
import PeopleSearch from '../components/PeopleSearch'
import { plural } from '../lib/format'
import { emailsFromCsv, parseEmailList } from '../lib/people'
import type { Draft } from '../types'
import { ReminderSelect } from './ReminderSelect'

// Slide 5: one document per signer, all sent at once (e.g. company-wide training).

interface Props {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  onAddEmails: (emails: string[]) => void
  onContinue: () => void
}

export function CopiesSignersMain({ draft, update, onAddEmails }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const parsed = parseEmailList(draft.emailListText)
  const existing = useMemo(
    () => new Set(parseEmailList(draft.emailListText).valid.map((e) => e.toLowerCase())),
    [draft.emailListText],
  )

  async function importCsv(file: File | undefined) {
    if (!file) return
    const emails = emailsFromCsv(await file.text())
    if (fileRef.current) fileRef.current.value = ''
    if (emails.length === 0) return setImportNote(`No email addresses found in ${file.name}.`)
    onAddEmails(emails)
    setImportNote(`Imported ${plural(emails.length, 'email')} from ${file.name}.`)
  }

  return (
    <>
      <section className="section">
        <h2 className="section-label">Document</h2>
        <span className="doc-chip">
          <span className="pdf-badge small">PDF</span>
          {draft.file?.name}
        </span>
      </section>

      <PeopleSearch label="Add people or groups" exclude={existing} onAdd={onAddEmails} />

      <div className="copies-grid">
        <div className="field">
          <label className="label" htmlFor="email-list">
            Signer email list
          </label>
          <textarea
            id="email-list"
            className="input textarea"
            rows={7}
            value={draft.emailListText}
            placeholder={'alex.morgan@company.com, jamie.lee@company.com\npriya.shah@company.com'}
            onChange={(e) => update({ emailListText: e.target.value })}
          />
          <p className="hint">Separate emails with commas, semicolons or new lines.</p>
          <div className="parse-status">
            <span className="pill success">{plural(parsed.valid.length, 'valid email')} detected</span>
            {parsed.duplicates > 0 && <span className="pill neutral">{plural(parsed.duplicates, 'duplicate')} ignored</span>}
          </div>
          {parsed.invalid.length > 0 && (
            <p className="field-error">
              Not valid: {parsed.invalid.slice(0, 5).join(', ')}
              {parsed.invalid.length > 5 && ` and ${parsed.invalid.length - 5} more`}
            </p>
          )}
        </div>

        <div className="copies-side">
          <label className="field">
            <span className="label">Signature due (all signers)</span>
            <input
              className="input"
              type="date"
              value={draft.sharedDueDate}
              onChange={(e) => update({ sharedDueDate: e.target.value })}
            />
          </label>
          <div className="field">
            <span className="label">Or import a file</span>
            <button type="button" className="btn btn-outline btn-block" onClick={() => fileRef.current?.click()}>
              Import CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => void importCsv(e.target.files?.[0])}
            />
            <p className="hint">{importNote ?? 'One email per row. Save Excel sheets as CSV first.'}</p>
          </div>
        </div>
      </div>

      <div className="note-row">
        <strong>Separate copies</strong>
        <span>Signers never see each other's copies.</span>
      </div>
    </>
  )
}

export function CopiesSignersAside({ draft, update, onContinue }: Props) {
  const parsed = parseEmailList(draft.emailListText)
  const count = parsed.valid.length
  const canContinue = count > 0 && parsed.invalid.length === 0 && !!draft.sharedDueDate
  return (
    <>
      <div className="summary-card">
        <h2>Routing summary</h2>
        <div className="summary-row">
          <span>Recipients</span>
          <strong className="summary-num">{count}</strong>
        </div>
        <hr />
        <div className="summary-row">
          <span>Documents</span>
          <strong className="summary-num">1</strong>
        </div>
        <div className="summary-row">
          <span>Signature requests</span>
          <strong className="summary-num">{count}</strong>
        </div>
        <hr />
        <ReminderSelect value={draft.reminderDays} onChange={(reminderDays) => update({ reminderDays })} />
        <button type="button" className="btn btn-secondary btn-block" disabled={!canContinue} onClick={onContinue}>
          Continue
        </button>
        {parsed.invalid.length > 0 && <p className="hint">Fix or remove invalid entries to continue.</p>}
      </div>
      <p className="summary-note">Deadlines can be edited before sending.</p>
    </>
  )
}
