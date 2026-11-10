import { StatRow } from '../components/DashboardLayout'
import { DOCUMENTS } from '../data/documents'
import { byDueDate, documentHref, isOutForSignature, needsMySignature, signedLabel } from '../lib/documents'
import { formatShortDate } from '../lib/format'
import type { DashboardPage } from '../types'
import type { DocumentFilter } from './MyDocumentsPage'

// Slide 2 of sample_uis_04NOV2026_post_meeting.pptx.

const LIST_SIZE = 4

interface Props {
  onNavigate: (page: DashboardPage, filter?: DocumentFilter) => void
}

export default function DashboardHome({ onNavigate }: Props) {
  const awaiting = DOCUMENTS.filter(needsMySignature).sort(byDueDate)
  const out = DOCUMENTS.filter(isOutForSignature).sort(byDueDate)
  const nextDue = awaiting[0]?.dueOn

  return (
    <>
      <StatRow
        stats={[
          { label: 'Out for signature', value: out.length },
          { label: 'Awaiting my signature', value: awaiting.length },
          { label: 'My next due date', value: nextDue ? formatShortDate(nextDue) : '—' },
        ]}
      />

      <div className="panel-grid">
        <section className="panel" aria-labelledby="awaiting-heading">
          <div className="panel-head">
            <h2 id="awaiting-heading">Awaiting my signature</h2>
            <button type="button" className="link-button" onClick={() => onNavigate('documents', 'needs')}>
              Sign next →
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>From</th>
                  <th className="align-end">Due</th>
                </tr>
              </thead>
              <tbody>
                {awaiting.slice(0, LIST_SIZE).map((d) => (
                  <tr key={d.id}>
                    <td className="doc-name">
                      <a className="doc-link" href={documentHref(d)}>
                        {d.title}
                      </a>
                    </td>
                    <td>{d.from}</td>
                    <td className={`align-end${d.dueOn === nextDue ? ' text-warn' : ''}`}>{formatShortDate(d.dueOn)}</td>
                  </tr>
                ))}
                {awaiting.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      Nothing is waiting on you.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="out-heading">
          <div className="panel-head">
            <h2 id="out-heading">Out for signature</h2>
            <button type="button" className="link-button" onClick={() => onNavigate('sent')}>
              View all {out.length} →
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Signed</th>
                  <th className="align-end">Due</th>
                </tr>
              </thead>
              <tbody>
                {out.slice(0, LIST_SIZE).map((d) => (
                  <tr key={d.id}>
                    <td className="doc-name">{d.title}</td>
                    <td>{signedLabel(d)}</td>
                    <td className={`align-end${d.status === 'overdue' ? ' text-warn' : ''}`}>{formatShortDate(d.dueOn)}</td>
                  </tr>
                ))}
                {out.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      You have no documents out for signature.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="list-note">Lists show the {LIST_SIZE} documents with the nearest due dates.</p>
    </>
  )
}
