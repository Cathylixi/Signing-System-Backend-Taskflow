import type { ReactNode } from 'react'
import { initials, nameForEmail } from '../lib/people'
import type { DashboardPage } from '../types'
import { TopBar } from './WorkflowLayout'

const DASHBOARD_PAGES: { page: DashboardPage; label: string }[] = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'documents', label: 'My documents' },
  { page: 'sent', label: 'Sent for signature' },
  { page: 'templates', label: 'Templates' },
]

interface DashboardLayoutProps {
  page: DashboardPage
  onNavigate: (page: DashboardPage) => void
  user: string
  onSignOut: () => void
  onNewUpload: () => void
  onNewFromTemplate: () => void
  title: string
  subtitle: string
  children: ReactNode
}

export function DashboardLayout({
  page,
  onNavigate,
  user,
  onSignOut,
  onNewUpload,
  onNewFromTemplate,
  title,
  subtitle,
  children,
}: DashboardLayoutProps) {
  const name = nameForEmail(user)
  const label = DASHBOARD_PAGES.find((p) => p.page === page)?.label

  return (
    <div className="workspace">
      <TopBar
        right={
          <>
            <span className="topbar-step">{label}</span>
            <span className="topbar-count">{name}</span>
          </>
        }
      />
      <div className="workspace-body dash-body">
        <nav className="sidebar" aria-label="Workspace">
          <p className="sidebar-heading">Workspace</p>
          <ul className="steps">
            {DASHBOARD_PAGES.map((p) => (
              <li key={p.page}>
                <button
                  type="button"
                  className={`step${p.page === page ? ' current' : ''}`}
                  aria-current={p.page === page ? 'page' : undefined}
                  onClick={() => onNavigate(p.page)}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-footer">
            <div className="sidebar-profile">
              <span className="avatar sidebar-avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <span className="sidebar-profile-text">
                <strong>{name}</strong>
                <span className="sidebar-user" title={user}>
                  {user}
                </span>
              </span>
            </div>
            <button type="button" className="link-button on-dark" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </nav>

        <main className="main">
          <div className="dash-head">
            <div className="page-head">
              <h1>{title}</h1>
              <p className="subtitle">{subtitle}</p>
            </div>
            <div className="dash-actions">
              <button type="button" className="btn btn-secondary" onClick={onNewUpload}>
                New document upload
              </button>
              <button type="button" className="btn btn-secondary" onClick={onNewFromTemplate}>
                New document from template
              </button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

export interface Stat {
  label: string
  value: string | number
  warn?: boolean
}

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className="stat-row">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <dt className="stat-label">{s.label}</dt>
          <dd className={`stat-value${s.warn ? ' text-warn' : ''}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface FilterChipsProps<T extends string> {
  label: string
  options: { value: T; label: string; count: number }[]
  value: T
  onChange: (value: T) => void
}

export function FilterChips<T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label} {o.count}
        </button>
      ))}
    </div>
  )
}
