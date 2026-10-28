import { useState } from 'react'
import type { SendResult } from './api/sendRequest'
import { WorkflowLayout } from './components/WorkflowLayout'
import { stepIndex } from './lib/steps'
import { EMAIL_TEMPLATES } from './data/emailTemplates'
import { isoDateFromToday, newId } from './lib/format'
import { nameForEmail, parseEmailList } from './lib/people'
import { CopiesSignersAside, CopiesSignersMain } from './pages/CopiesSignersStep'
import FieldsStep from './pages/FieldsStep'
import LoginPage from './pages/LoginPage'
import { ReviewAside, ReviewMain } from './pages/ReviewStep'
import SentPage from './pages/SentPage'
import { SharedSignersAside, SharedSignersMain } from './pages/SharedSignersStep'
import { UploadAside, UploadMain } from './pages/UploadStep'
import type { Draft, SendingMode, Signer, Step } from './types'
import './App.css'

const DEFAULT_DUE_DAYS = 7

function blankSigner(email = ''): Signer {
  return { id: newId('signer'), email, name: email ? nameForEmail(email) : '', dueDate: isoDateFromToday(DEFAULT_DUE_DAYS) }
}

function emptyDraft(): Draft {
  const template = EMAIL_TEMPLATES[0]
  return {
    mode: 'shared',
    file: null,
    pageCount: 0,
    signers: [blankSigner()],
    emailListText: '',
    sharedDueDate: isoDateFromToday(DEFAULT_DUE_DAYS),
    enforceOrder: false,
    reminderDays: 3,
    fields: [],
    templateId: template.id,
    applyToAll: true,
    email: { subject: template.subject, body: template.body },
    overrides: {},
  }
}

/** In copies mode the signer list is derived from the pasted email text. */
function syncCopiesSigners(prev: Draft, next: Draft): Draft {
  if (next.mode !== 'copies') return next
  if (prev.mode === next.mode && prev.emailListText === next.emailListText && prev.sharedDueDate === next.sharedDueDate)
    return next
  const signers = parseEmailList(next.emailListText).valid.map((email) => ({
    id: email.toLowerCase(),
    email,
    name: nameForEmail(email),
    dueDate: next.sharedDueDate,
  }))
  return { ...next, signers }
}

function App() {
  const [user, setUser] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [maxReached, setMaxReached] = useState(0)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [sent, setSent] = useState<SendResult | null>(null)

  function update(patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) {
    setDraft((d) => syncCopiesSigners(d, { ...d, ...(typeof patch === 'function' ? patch(d) : patch) }))
  }

  function go(next: Step) {
    setStep(next)
    if (next !== 'sent') setMaxReached((m) => Math.max(m, stepIndex(next)))
    window.scrollTo(0, 0)
  }

  function reset() {
    setDraft(emptyDraft())
    setStep('upload')
    setMaxReached(0)
    setSent(null)
  }

  // Switching mode keeps the people entered but clears field placement,
  // since fields mean different things in each mode.
  function setMode(mode: SendingMode) {
    if (mode === draft.mode) return
    update((d) => {
      const emails = d.mode === 'shared' ? d.signers.map((s) => s.email).filter(Boolean) : parseEmailList(d.emailListText).valid
      return mode === 'shared'
        ? { mode, fields: [], overrides: {}, signers: emails.length ? emails.map((e) => blankSigner(e)) : [blankSigner()] }
        : { mode, fields: [], overrides: {}, emailListText: emails.join('\n') }
    })
    setMaxReached((m) => Math.min(m, stepIndex('signers')))
  }

  function setFile(file: File | null, pageCount: number) {
    update({ file, pageCount, fields: [] })
    setMaxReached(0)
  }

  function addEmails(emails: string[]) {
    update((d) => {
      if (d.mode === 'copies') {
        const have = new Set(parseEmailList(d.emailListText).valid.map((e) => e.toLowerCase()))
        const added = emails.filter((e) => !have.has(e.toLowerCase()))
        const text = d.emailListText.trim()
        return { emailListText: [text, ...added].filter(Boolean).join('\n') }
      }
      const have = new Set(d.signers.map((s) => s.email.trim().toLowerCase()))
      const added = emails.filter((e) => !have.has(e.toLowerCase())).map((e) => blankSigner(e))
      // Replace the starter row if it's still empty.
      const kept = d.signers.filter((s, i) => !(d.signers.length === 1 && i === 0 && !s.email))
      return { signers: [...kept, ...added] }
    })
  }

  function removeSigner(id: string) {
    update((d) => {
      const overrides = { ...d.overrides }
      delete overrides[id]
      return {
        signers: d.signers.filter((s) => s.id !== id),
        fields: d.fields.filter((f) => f.signerId !== id),
        overrides,
      }
    })
  }

  if (!user) return <LoginPage onSignIn={setUser} />

  if (step === 'sent' && sent) {
    return (
      <SentPage
        documentName={draft.file?.name ?? 'The document'}
        signerCount={draft.signers.length}
        result={sent}
        onStartOver={reset}
      />
    )
  }

  if (step === 'fields') {
    return <FieldsStep draft={draft} update={update} onBack={() => go('signers')} onContinue={() => go('review')} />
  }

  const layout = {
    step,
    maxReached,
    onNavigate: go,
    user,
    onSignOut: () => {
      reset()
      setUser(null)
    },
  }

  if (step === 'upload') {
    const props = { draft, onModeChange: setMode, onFile: setFile, onContinue: () => go('signers') }
    return (
      <WorkflowLayout
        {...layout}
        title="Upload the PDF you need signed"
        subtitle="Choose how the document routes to signers, then upload the PDF."
        aside={<UploadAside {...props} />}
      >
        <UploadMain {...props} />
      </WorkflowLayout>
    )
  }

  if (step === 'signers') {
    if (draft.mode === 'shared') {
      const props = {
        draft,
        update,
        onAddEmails: addEmails,
        onAddBlank: () => update((d) => ({ signers: [...d.signers, blankSigner()] })),
        onRemove: removeSigner,
        onContinue: () => go('fields'),
      }
      return (
        <WorkflowLayout
          {...layout}
          title="Add signers and set individual deadlines"
          subtitle="Enter each recipient's email, then choose when their signature is due."
          aside={<SharedSignersAside {...props} />}
        >
          <SharedSignersMain {...props} />
        </WorkflowLayout>
      )
    }
    const props = { draft, update, onAddEmails: addEmails, onContinue: () => go('fields') }
    return (
      <WorkflowLayout
        {...layout}
        title="Send each signer their own copy"
        subtitle="Paste or import emails. Each person signs a separate copy, and all copies go out at once."
        aside={<CopiesSignersAside {...props} />}
      >
        <CopiesSignersMain {...props} />
      </WorkflowLayout>
    )
  }

  const props = {
    draft,
    update,
    onAddEmails: addEmails,
    onFixFields: () => go('fields'),
    onSent: (result: SendResult) => {
      setSent(result)
      go('sent')
    },
  }
  return (
    <WorkflowLayout
      {...layout}
      title="Review and send the request"
      subtitle="Choose the email template and personalize the message for each signer."
      aside={<ReviewAside {...props} />}
    >
      <ReviewMain {...props} />
    </WorkflowLayout>
  )
}

export default App
