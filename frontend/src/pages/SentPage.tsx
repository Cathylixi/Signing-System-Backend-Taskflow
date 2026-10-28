import type { SendResult } from '../api/sendRequest'
import { TopBar } from '../components/WorkflowLayout'
import { plural } from '../lib/format'

interface Props {
  documentName: string
  signerCount: number
  result: SendResult
  onStartOver: () => void
}

export default function SentPage({ documentName, signerCount, result, onStartOver }: Props) {
  return (
    <div className="workspace">
      <TopBar />
      <main className="sent">
        <div className="sent-card">
          <span className="sent-icon" aria-hidden="true">
            ✓
          </span>
          <h1>Request sent</h1>
          <p className="subtitle">
            {documentName} was sent to {plural(signerCount, 'signer')}. They'll get an email with a secure link, and
            reminders before their due date.
          </p>
          {import.meta.env.DEV && result.body && (
            <details className="dev-response">
              <summary>Server response (HTTP {result.status})</summary>
              <pre>{result.body}</pre>
            </details>
          )}
          <button type="button" className="btn btn-primary" onClick={onStartOver}>
            Start a new request
          </button>
        </div>
      </main>
    </div>
  )
}
