import { useMemo, useState } from 'react'
import { sendSignatureRequest, type SendResult } from '../api/sendRequest'
import PeopleSearch from '../components/PeopleSearch'
import { EMAIL_TEMPLATES } from '../data/emailTemplates'
import { CONFIGURED_URL, EDITABLE_URL, uploadConfigError } from '../lib/config'
import { buildRequestPayload, emailFor, signersMissingSignature, templateById } from '../lib/request'
import type { Draft, EmailContent } from '../types'

// Slide 8.

interface Props {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  onAddEmails: (emails: string[]) => void
  onFixFields: () => void
  onSent: (result: SendResult) => void
}

export function ReviewMain({ draft, update, onAddEmails }: Props) {
  const [editingId, setEditingId] = useState(draft.signers[0]?.id ?? '')
  const editing = draft.signers.find((s) => s.id === editingId) ?? draft.signers[0]
  const existing = useMemo(() => new Set(draft.signers.map((s) => s.email.toLowerCase())), [draft.signers])

  // With "apply to all" on, edits change the shared template; otherwise they
  // change only the selected signer's email.
  const source: EmailContent = draft.applyToAll
    ? draft.email
    : ((editing && draft.overrides[editing.id]) ?? draft.email)

  function edit(patch: Partial<EmailContent>) {
    if (draft.applyToAll || !editing) {
      update({ email: { ...draft.email, ...patch } })
    } else {
      update({ overrides: { ...draft.overrides, [editing.id]: { ...source, ...patch } } })
    }
  }

  function chooseTemplate(id: string) {
    const t = templateById(id)
    update({ templateId: id, email: { subject: t.subject, body: t.body }, overrides: {} })
  }

  const preview = editing ? emailFor(draft, editing) : null

  return (
    <>
      <PeopleSearch label="Add recipients" placeholder="Search people or group lists" exclude={existing} onAdd={onAddEmails} />

      <div className="review-grid">
        <label className="field">
          <span className="label">Default email template</span>
          <select className="input select" value={draft.templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            {EMAIL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">{draft.applyToAll ? 'Preview email for' : 'Edit email for'}</span>
          <select className="input select" value={editing?.id ?? ''} onChange={(e) => setEditingId(e.target.value)}>
            {draft.signers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} • {s.email}
                {!draft.applyToAll && draft.overrides[s.id] ? ' (edited)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="label">Subject line</span>
        <input className="input" value={source.subject} onChange={(e) => edit({ subject: e.target.value })} />
      </label>

      <label className="field">
        <span className="label">Email body</span>
        <textarea className="input textarea" rows={8} value={source.body} onChange={(e) => edit({ body: e.target.value })} />
        <span className="hint">
          Placeholders: {'{{firstName}}'}, {'{{name}}'}, {'{{document}}'}, {'{{dueDate}}'}. The secure signing link is added
          automatically.
        </span>
      </label>

      <label className="toggle-card">
        <input
          type="checkbox"
          checked={draft.applyToAll}
          onChange={(e) => update({ applyToAll: e.target.checked, overrides: e.target.checked ? {} : draft.overrides })}
        />
        <span>
          <strong>Apply this template to all signers</strong>
          <span>
            {draft.applyToAll
              ? "Each email fills in the signer's name and due date automatically."
              : 'Turn on to discard individual edits and use one template for everyone.'}
          </span>
        </span>
      </label>

      {preview && (
        <section className="email-preview" aria-label={`Email preview for ${editing?.name}`}>
          <p className="section-label">Preview for {editing?.name}</p>
          <p className="email-subject">{preview.subject}</p>
          <pre className="email-body">{preview.body}</pre>
        </section>
      )}
    </>
  )
}

export function ReviewAside({ draft, onFixFields, onSent }: Props) {
  const [url, setUrl] = useState(CONFIGURED_URL)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = signersMissingSignature(draft)
  const configError = uploadConfigError()
  const canSend = !!draft.file && draft.signers.length > 0 && missing.length === 0 && !configError && !!url && !sending

  async function send() {
    if (!draft.file || !canSend) return
    setSending(true)
    setError(null)
    try {
      const result = await sendSignatureRequest(url, draft.file, buildRequestPayload(draft))
      if (result.ok) onSent(result)
      else setError(`The server returned an error (HTTP ${result.status}).${result.body ? ` ${result.body.slice(0, 300)}` : ''}`)
    } catch (err) {
      // fetch only throws on network/CORS failures, not HTTP error codes
      setError(`Could not reach ${url}. Check the address and that the server allows CORS. (${String(err)})`)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="summary-card">
        <h2>Ready to send</h2>
        <div className="summary-block">
          <span>Document</span>
          <strong className="break">{draft.file?.name}</strong>
        </div>
        <hr />
        <div className="summary-row">
          <span>Recipients</span>
          <strong className="summary-num">{draft.signers.length}</strong>
        </div>
        <div className="summary-row">
          <span>Fields placed</span>
          <strong className="summary-num">{draft.fields.length}</strong>
        </div>
        <hr />
        {missing.length === 0 ? (
          <p className="status-ok">✓ Every recipient has a signature field.</p>
        ) : (
          <div className="status-missing">
            <p>
              {draft.mode === 'shared'
                ? `No signature field for: ${missing.map((s) => s.name).join(', ')}.`
                : 'The document has no signature field.'}
            </p>
            <button type="button" className="link-button" onClick={onFixFields}>
              Place fields →
            </button>
          </div>
        )}

        {EDITABLE_URL && (
          <label className="field dev-field">
            <span className="label">Upload address (dev only)</span>
            <input
              className="input"
              type="url"
              value={url}
              placeholder="http://localhost:3001/upload"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        {configError && <p className="message error">{configError}</p>}
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-block" disabled={!canSend} onClick={() => void send()}>
          {sending ? 'Sending…' : 'Send for signature'}
        </button>
      </div>
      <p className="summary-note">Each signer receives a personalized secure link.</p>
    </>
  )
}
