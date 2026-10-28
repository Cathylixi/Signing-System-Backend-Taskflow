/**
 * shared: one document, many signers. Everyone signs the same PDF and each
 *         signer gets their own fields and deadline.
 * copies: one document per signer. Every signer gets a separate copy with the
 *         same field layout and a shared deadline (e.g. company-wide training).
 */
export type SendingMode = 'shared' | 'copies'

export type Step = 'upload' | 'signers' | 'fields' | 'review' | 'sent'

export type FieldType = 'signature' | 'initials' | 'reason' | 'date'

export interface Signer {
  id: string
  email: string
  name: string
  /** yyyy-mm-dd */
  dueDate: string
}

/** Position and size are fractions (0–1) of the page's width and height. */
export interface PlacedField {
  id: string
  type: FieldType
  page: number
  x: number
  y: number
  w: number
  h: number
  /** null in copies mode: the field appears on every signer's copy. */
  signerId: string | null
}

export interface EmailContent {
  subject: string
  body: string
}

export interface Draft {
  mode: SendingMode
  file: File | null
  pageCount: number
  signers: Signer[]
  /** Raw text of the copies-mode email list, kept so edits survive navigation. */
  emailListText: string
  sharedDueDate: string
  enforceOrder: boolean
  reminderDays: number
  fields: PlacedField[]
  templateId: string
  applyToAll: boolean
  email: EmailContent
  /** Per-signer email edits, keyed by signer id. Used when applyToAll is off. */
  overrides: Record<string, EmailContent>
}
