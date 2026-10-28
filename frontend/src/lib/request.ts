import { EMAIL_TEMPLATES, renderTemplate } from '../data/emailTemplates'
import type { Draft, EmailContent, Signer } from '../types'
import { documentTitle, formatDate } from './format'

export function emailFor(draft: Draft, signer: Signer): EmailContent {
  const source = draft.applyToAll ? draft.email : (draft.overrides[signer.id] ?? draft.email)
  const vars = {
    name: signer.name,
    firstName: signer.name.split(' ')[0] ?? signer.name,
    document: draft.file ? documentTitle(draft.file.name) : 'the document',
    dueDate: formatDate(signer.dueDate),
  }
  return { subject: renderTemplate(source.subject, vars), body: renderTemplate(source.body, vars) }
}

export function templateById(id: string) {
  return EMAIL_TEMPLATES.find((t) => t.id === id) ?? EMAIL_TEMPLATES[0]
}

/** Signers with no signature field assigned to them. */
export function signersMissingSignature(draft: Draft): Signer[] {
  if (draft.mode === 'copies') {
    return draft.fields.some((f) => f.type === 'signature') ? [] : draft.signers
  }
  return draft.signers.filter(
    (s) => !draft.fields.some((f) => f.type === 'signature' && f.signerId === s.id),
  )
}

/** JSON sent alongside the PDF. Keep in sync with the backend (see README). */
export function buildRequestPayload(draft: Draft) {
  const signerEmail = new Map(draft.signers.map((s) => [s.id, s.email]))
  return {
    mode: draft.mode,
    documentName: draft.file?.name ?? '',
    pageCount: draft.pageCount,
    enforceSigningOrder: draft.mode === 'shared' && draft.enforceOrder,
    reminderDaysBeforeDue: draft.reminderDays,
    signers: draft.signers.map((s, i) => ({
      order: i + 1,
      email: s.email,
      name: s.name,
      dueDate: s.dueDate,
      message: emailFor(draft, s),
    })),
    fields: draft.fields.map((f) => ({
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      signerEmail: f.signerId ? (signerEmail.get(f.signerId) ?? null) : null,
    })),
  }
}

export type SignatureRequestPayload = ReturnType<typeof buildRequestPayload>
