import { useMemo } from 'react'
import PeopleSearch from '../components/PeopleSearch'
import { signerColor } from '../lib/colors'
import { formatDate } from '../lib/format'
import { nameForEmail, signerProblems } from '../lib/people'
import type { Draft, Signer } from '../types'
import { ReminderSelect } from './ReminderSelect'

// Slide 4: one document, many signers, each with their own deadline.

interface Props {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  onAddEmails: (emails: string[]) => void
  onAddBlank: () => void
  onRemove: (id: string) => void
  onContinue: () => void
}

export function SharedSignersMain({ draft, update, onAddEmails, onAddBlank, onRemove }: Props) {
  const problems = signerProblems(draft.signers)
  const existing = useMemo(
    () => new Set(draft.signers.map((s) => s.email.trim().toLowerCase())),
    [draft.signers],
  )

  function edit(id: string, patch: Partial<Signer>) {
    update({
      signers: draft.signers.map((s) => {
        if (s.id !== id) return s
        const next = { ...s, ...patch }
        if (patch.email !== undefined) next.name = nameForEmail(patch.email)
        return next
      }),
    })
  }

  return (
    <>
      <PeopleSearch label="Find people or groups" exclude={existing} onAdd={onAddEmails} />

      <div className="signer-list">
        {draft.signers.map((s, i) => {
          const color = signerColor(i)
          const problem = problems.get(s.id)
          const touched = s.email !== ''
          return (
            <fieldset key={s.id} className="signer">
              <legend className="section-label">
                <span className="color-dot" style={{ background: color.border }} aria-hidden="true" />
                Signer {String(i + 1).padStart(2, '0')}
              </legend>
              <div className="signer-grid">
                <label className="field">
                  <span className="label">Email address</span>
                  <input
                    className="input"
                    type="email"
                    value={s.email}
                    placeholder="name@company.com"
                    aria-invalid={touched && !!problem}
                    onChange={(e) => edit(s.id, { email: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Signature due</span>
                  <input
                    className="input"
                    type="date"
                    value={s.dueDate}
                    onChange={(e) => edit(s.id, { dueDate: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button signer-remove"
                  aria-label={`Remove signer ${i + 1}`}
                  disabled={draft.signers.length === 1}
                  onClick={() => onRemove(s.id)}
                >
                  ×
                </button>
              </div>
              {touched && problem && <p className="field-error">{problem}</p>}
            </fieldset>
          )
        })}
      </div>

      <div className="signer-actions">
        <button type="button" className="btn btn-outline" onClick={onAddBlank}>
          + Add another signer
        </button>
        <label className="toggle-row">
          <span>
            <strong>Enforce signing order</strong>
            <span>Signers receive the document one at a time.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={draft.enforceOrder}
            onChange={(e) => update({ enforceOrder: e.target.checked })}
          />
        </label>
      </div>
    </>
  )
}

export function SharedSignersAside({ draft, update, onContinue }: Props) {
  const problems = signerProblems(draft.signers)
  const canContinue = draft.signers.length > 0 && problems.size === 0
  return (
    <>
      <div className="summary-card">
        <h2>Routing summary</h2>
        <div className="summary-row">
          <span>Recipients</span>
          <strong className="summary-num">{draft.signers.length}</strong>
        </div>
        <ol className="route-list">
          {draft.signers.map((s, i) => (
            <li key={s.id}>
              <span className="route-num" style={{ color: signerColor(i).border }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>
                <span className="route-name">{s.name || 'New signer'}</span>
                <span className="route-due">Due {formatDate(s.dueDate)}</span>
              </span>
            </li>
          ))}
        </ol>
        <hr />
        <ReminderSelect value={draft.reminderDays} onChange={(reminderDays) => update({ reminderDays })} />
        <button type="button" className="btn btn-secondary btn-block" disabled={!canContinue} onClick={onContinue}>
          Continue
        </button>
      </div>
      <p className="summary-note">Deadlines can be edited before sending.</p>
    </>
  )
}
