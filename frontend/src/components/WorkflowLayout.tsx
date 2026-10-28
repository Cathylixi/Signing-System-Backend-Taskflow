import type { ReactNode } from 'react'
import { WORKFLOW_STEPS, stepIndex } from '../lib/steps'
import type { Step } from '../types'

interface TopBarProps {
  center?: ReactNode
  right?: ReactNode
}

export function TopBar({ center, right }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="brand">Document workspace</span>
      <div className="topbar-center">{center}</div>
      <div className="topbar-right">{right}</div>
    </header>
  )
}

interface WorkflowLayoutProps {
  step: Step
  maxReached: number
  onNavigate: (step: Step) => void
  user: string
  onSignOut: () => void
  title: string
  subtitle: string
  aside?: ReactNode
  children: ReactNode
}

export function WorkflowLayout({
  step,
  maxReached,
  onNavigate,
  user,
  onSignOut,
  title,
  subtitle,
  aside,
  children,
}: WorkflowLayoutProps) {
  const current = stepIndex(step)
  const meta = WORKFLOW_STEPS[current]

  return (
    <div className="workspace">
      <TopBar
        right={
          <>
            <span className="topbar-step">{meta.header}</span>
            <span className="topbar-count">
              Step {current + 1} of {WORKFLOW_STEPS.length}
            </span>
          </>
        }
      />
      <div className="workspace-body">
        <nav className="sidebar" aria-label="Workflow">
          <p className="sidebar-heading">Workflow</p>
          <ol className="steps">
            {WORKFLOW_STEPS.map((s, i) => (
              <li key={s.step}>
                <button
                  type="button"
                  className={`step${i === current ? ' current' : ''}`}
                  aria-current={i === current ? 'step' : undefined}
                  disabled={i > maxReached}
                  onClick={() => onNavigate(s.step)}
                >
                  <span className="step-num">{i + 1}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
          <div className="sidebar-footer">
            <span className="sidebar-user" title={user}>
              {user}
            </span>
            <button type="button" className="link-button on-dark" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </nav>

        <main className="main">
          <div className="page-head">
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          {children}
        </main>

        {aside && <aside className="summary">{aside}</aside>}
      </div>
    </div>
  )
}
