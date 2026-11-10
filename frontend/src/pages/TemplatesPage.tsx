import { useState } from 'react'
import { FilterChips } from '../components/DashboardLayout'
import { TEMPLATES, type DocumentTemplate, type TemplateCategory } from '../data/documents'
import { formatShortDate, plural } from '../lib/format'

// Slide 5 of sample_uis_04NOV2026_post_meeting.pptx.

/** "New document from template" focuses this field. */
export const TEMPLATE_SEARCH_ID = 'template-search'

type CategoryFilter = 'all' | TemplateCategory

const CATEGORIES: TemplateCategory[] = ['Legal', 'HR', 'Finance']

export default function TemplatesPage() {
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const searched = TEMPLATES.filter((t) => !q || t.name.toLowerCase().includes(q))
  const shown = searched.filter((t) => category === 'all' || t.category === category)

  // PLACEHOLDER: template PDFs and their saved fields need the backend.
  function chooseTemplate(t: DocumentTemplate) {
    setNotice(`Templates aren't connected yet. To send ${t.name} now, choose New document upload and upload its PDF.`)
  }

  return (
    <>
      <div className="list-toolbar">
        <input
          id={TEMPLATE_SEARCH_ID}
          type="search"
          className="input list-search"
          placeholder="Search templates"
          aria-label="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterChips
          label="Filter templates by category"
          options={[
            { value: 'all' as CategoryFilter, label: 'All', count: searched.length },
            ...CATEGORIES.map((c) => ({ value: c, label: c, count: searched.filter((t) => t.category === c).length })),
          ]}
          value={category}
          onChange={setCategory}
        />
      </div>

      {notice && (
        <p className="message info" role="status">
          {notice}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="list-note">No templates match.</p>
      ) : (
        <div className="template-grid">
          {shown.map((t) => (
            <article key={t.id} className="template-card">
              <div className="template-head">
                <span className="template-badge" aria-hidden="true">
                  {t.abbreviation}
                </span>
                <div>
                  <h2>{t.name}</h2>
                  <p className="template-category">{t.category}</p>
                </div>
              </div>
              <div>
                <p>
                  {plural(t.fieldCount, 'field')} · {plural(t.signerCount, 'signer')}
                </p>
                <p className="template-usage">
                  Used {plural(t.timesUsed, 'time')}, last {formatShortDate(t.lastUsedOn)}
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-block" onClick={() => chooseTemplate(t)}>
                Use template
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
