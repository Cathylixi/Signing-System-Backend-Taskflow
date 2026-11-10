import { useState } from 'react'
import { FilterChips } from '../components/DashboardLayout'
import { DOCUMENTS, type WorkspaceDocument } from '../data/documents'
import { STATUS_LABELS, byNewest, documentHref, isOutForSignature, needsMySignature } from '../lib/documents'
import { formatShortDate } from '../lib/format'

// Slide 3 of sample_uis_04NOV2026_post_meeting.pptx.

export type DocumentFilter = 'all' | 'needs' | 'waiting' | 'completed'

const FILTERS: { value: DocumentFilter; label: string; match: (d: WorkspaceDocument) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'needs', label: 'Needs my signature', match: needsMySignature },
  { value: 'waiting', label: 'Waiting on others', match: isOutForSignature },
  { value: 'completed', label: 'Completed', match: (d) => d.status === 'completed' },
]

const PAGE_SIZE = 6

export default function MyDocumentsPage({ initialFilter }: { initialFilter: DocumentFilter }) {
  const [filter, setFilter] = useState(initialFilter)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const q = query.trim().toLowerCase()
  const searched = DOCUMENTS.filter((d) => !q || d.title.toLowerCase().includes(q))
  const match = FILTERS.find((f) => f.value === filter)?.match ?? (() => true)
  const rows = searched.filter(match).sort(byNewest)
  const shown = showAll ? rows : rows.slice(0, PAGE_SIZE)

  return (
    <>
      <div className="list-toolbar">
        <input
          type="search"
          className="input list-search"
          placeholder="Search documents"
          aria-label="Search documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterChips
          label="Filter documents"
          options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: searched.filter(f.match).length }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <section className="panel" aria-label="Documents">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>My role</th>
                <th>Status</th>
                <th>Updated</th>
                <th className="align-end">Due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id}>
                  <td className="doc-name">
                    <a className="doc-link" href={documentHref(d)}>
                      {d.title}
                    </a>
                  </td>
                  <td>{d.role === 'signer' ? 'Signer' : 'Sender'}</td>
                  <td className={`status-text status-${d.status}`}>{STATUS_LABELS[d.status]}</td>
                  <td>{formatShortDate(d.updatedOn)}</td>
                  <td className="align-end">{formatShortDate(d.dueOn)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No documents match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="list-foot">
        <p className="list-note">
          Showing {shown.length} of {rows.length} documents, newest first.
        </p>
        {rows.length > PAGE_SIZE && (
          <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : 'View more →'}
          </button>
        )}
      </div>
    </>
  )
}
