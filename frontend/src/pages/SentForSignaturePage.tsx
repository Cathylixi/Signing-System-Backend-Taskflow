import { useState } from 'react'
import { StatRow } from '../components/DashboardLayout'
import { DOCUMENTS, type WorkspaceDocument } from '../data/documents'
import { byDueDate, byNewest, isOutForSignature, recipientsLabel, signedLabel } from '../lib/documents'
import { formatShortDate } from '../lib/format'

// Slide 4 of sample_uis_04NOV2026_post_meeting.pptx.

function progress(d: WorkspaceDocument): string {
  if (d.status === 'overdue') return 'Overdue'
  if (d.status === 'completed') return 'Completed'
  return `${signedLabel(d)} signed`
}

export default function SentForSignaturePage() {
  const [showCompleted, setShowCompleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const sent = DOCUMENTS.filter((d) => d.role === 'sender')
  const open = sent.filter(isOutForSignature).sort(byDueDate)
  const completed = sent.filter((d) => d.status === 'completed').sort(byNewest)
  const overdue = open.filter((d) => d.status === 'overdue').length
  const rows = showCompleted ? completed : open

  // PLACEHOLDER: reminders need the backend; nothing is sent yet.
  function remind(d: WorkspaceDocument) {
    setNotice(`Reminders aren't connected yet, so nothing was sent to ${recipientsLabel(d.recipients)}.`)
  }

  return (
    <>
      <StatRow
        stats={[
          { label: 'In progress', value: open.length },
          { label: 'Overdue', value: overdue, warn: overdue > 0 },
          { label: 'Completed', value: completed.length },
        ]}
      />

      {notice && (
        <p className="message info" role="status">
          {notice}
        </p>
      )}

      <section className="panel" aria-label={showCompleted ? 'Completed documents' : 'Documents in progress'}>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Recipients</th>
                <th>Progress</th>
                <th>Sent</th>
                <th>Due</th>
                <th className="align-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="doc-name">{d.title}</td>
                  <td>{recipientsLabel(d.recipients)}</td>
                  <td className={`status-text status-${d.status}`}>{progress(d)}</td>
                  <td>{formatShortDate(d.sentOn)}</td>
                  <td className={d.status === 'overdue' ? 'text-warn' : undefined}>{formatShortDate(d.dueOn)}</td>
                  <td className="align-end">
                    {d.status === 'completed' ? (
                      '—'
                    ) : (
                      <button type="button" className="link-button" onClick={() => remind(d)}>
                        Remind
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    {showCompleted ? 'No completed documents yet.' : 'Nothing is out for signature.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="list-foot">
        <p className="list-note">
          {showCompleted
            ? 'Completed documents, newest first.'
            : 'Sorted by due date. Reminders send the existing email template.'}
        </p>
        <button type="button" className="link-button" onClick={() => setShowCompleted((v) => !v)}>
          {showCompleted ? 'View in progress →' : 'View completed →'}
        </button>
      </div>
    </>
  )
}
