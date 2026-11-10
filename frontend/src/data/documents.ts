// MOCK DATA: stands in for the document and template lists the backend will
// provide (e.g. GET /api/documents, GET /api/templates). Replace once those
// endpoints exist. Dates are yyyy-mm-dd.

export type DocumentRole = 'signer' | 'sender'

/**
 * needs-signature: someone sent it to me and I haven't signed.
 * waiting:         I sent it and not everyone has signed.
 * overdue:         I sent it and the due date passed before everyone signed.
 */
export type DocumentStatus = 'needs-signature' | 'waiting' | 'overdue' | 'completed'

export interface WorkspaceDocument {
  id: string
  title: string
  role: DocumentRole
  status: DocumentStatus
  /** Who sent it to me (signer role only). */
  from?: string
  /** Who I sent it to (sender role only). */
  recipients: string[]
  signedCount: number
  sentOn: string
  updatedOn: string
  dueOn: string
}

export const DOCUMENTS: WorkspaceDocument[] = [
  { id: 'doc-01', title: 'Vendor NDA, Brightline', role: 'signer', status: 'needs-signature', from: 'Alex Morgan', recipients: [], signedCount: 0, sentOn: '2026-10-31', updatedOn: '2026-10-31', dueOn: '2026-11-04' },
  { id: 'doc-02', title: 'Q4 statement of work', role: 'signer', status: 'needs-signature', from: 'Jamie Lee', recipients: [], signedCount: 0, sentOn: '2026-10-30', updatedOn: '2026-10-30', dueOn: '2026-11-06' },
  { id: 'doc-03', title: 'Data processing addendum', role: 'signer', status: 'needs-signature', from: 'Priya Shah', recipients: [], signedCount: 0, sentOn: '2026-10-29', updatedOn: '2026-10-29', dueOn: '2026-11-10' },
  { id: 'doc-04', title: 'Offer letter, R. Chen', role: 'signer', status: 'needs-signature', from: 'HR Team', recipients: [], signedCount: 0, sentOn: '2026-10-28', updatedOn: '2026-10-28', dueOn: '2026-11-14' },

  { id: 'doc-05', title: 'Supplier code of conduct', role: 'sender', status: 'overdue', recipients: ['Ravi Nair'], signedCount: 0, sentOn: '2026-10-12', updatedOn: '2026-10-12', dueOn: '2026-10-30' },
  { id: 'doc-06', title: 'Master services agreement', role: 'sender', status: 'waiting', recipients: ['Alex Morgan', 'Jamie Lee'], signedCount: 1, sentOn: '2026-10-20', updatedOn: '2026-10-30', dueOn: '2026-11-05' },
  { id: 'doc-07', title: 'Consulting agreement', role: 'sender', status: 'waiting', recipients: ['Dana Wu'], signedCount: 0, sentOn: '2026-10-28', updatedOn: '2026-10-29', dueOn: '2026-11-07' },
  { id: 'doc-08', title: 'Equipment lease', role: 'sender', status: 'waiting', recipients: ['Sam Wright', 'Taylor Brooks', 'Jordan Kim'], signedCount: 2, sentOn: '2026-10-22', updatedOn: '2026-10-26', dueOn: '2026-11-12' },
  { id: 'doc-09', title: 'Partner referral terms', role: 'sender', status: 'waiting', recipients: ['Sonia Patel', 'Lena Kim'], signedCount: 0, sentOn: '2026-10-30', updatedOn: '2026-10-30', dueOn: '2026-11-18' },
  { id: 'doc-10', title: 'Quality manual acknowledgment', role: 'sender', status: 'waiting', recipients: ['Marcus Chen', 'Priya Shah', 'Dana Ortiz', 'Casey Nguyen'], signedCount: 1, sentOn: '2026-10-24', updatedOn: '2026-10-27', dueOn: '2026-11-21' },

  { id: 'doc-11', title: 'Contractor agreement, M. Ortiz', role: 'signer', status: 'completed', from: 'HR Team', recipients: [], signedCount: 0, sentOn: '2026-10-23', updatedOn: '2026-10-27', dueOn: '2026-10-28' },
  { id: 'doc-12', title: 'Annual compliance attestation', role: 'signer', status: 'completed', from: 'Quality Assurance', recipients: [], signedCount: 0, sentOn: '2026-10-14', updatedOn: '2026-10-20', dueOn: '2026-10-31' },
  { id: 'doc-13', title: 'Vendor invoice approval', role: 'sender', status: 'completed', recipients: ['Jordan Kim'], signedCount: 1, sentOn: '2026-10-15', updatedOn: '2026-10-21', dueOn: '2026-10-24' },
  { id: 'doc-14', title: 'Office lease renewal', role: 'sender', status: 'completed', recipients: ['Taylor Brooks', 'Sam Wright'], signedCount: 2, sentOn: '2026-10-08', updatedOn: '2026-10-16', dueOn: '2026-10-20' },
]

export type TemplateCategory = 'Legal' | 'HR' | 'Finance'

export interface DocumentTemplate {
  id: string
  name: string
  /** Shown in the template's badge. */
  abbreviation: string
  category: TemplateCategory
  fieldCount: number
  signerCount: number
  timesUsed: number
  lastUsedOn: string
}

export const TEMPLATES: DocumentTemplate[] = [
  { id: 'tpl-nda', name: 'Mutual NDA', abbreviation: 'NDA', category: 'Legal', fieldCount: 6, signerCount: 2, timesUsed: 24, lastUsedOn: '2026-10-31' },
  { id: 'tpl-sow', name: 'Statement of work', abbreviation: 'SOW', category: 'Legal', fieldCount: 11, signerCount: 2, timesUsed: 15, lastUsedOn: '2026-10-30' },
  { id: 'tpl-ca', name: 'Consulting terms', abbreviation: 'CA', category: 'Legal', fieldCount: 9, signerCount: 2, timesUsed: 8, lastUsedOn: '2026-10-28' },
  { id: 'tpl-ol', name: 'Offer letter', abbreviation: 'OL', category: 'HR', fieldCount: 7, signerCount: 1, timesUsed: 12, lastUsedOn: '2026-10-27' },
  { id: 'tpl-co', name: 'Contractor intake', abbreviation: 'CO', category: 'HR', fieldCount: 10, signerCount: 1, timesUsed: 5, lastUsedOn: '2026-10-20' },
  { id: 'tpl-vpt', name: 'Vendor payments', abbreviation: 'VPT', category: 'Finance', fieldCount: 5, signerCount: 2, timesUsed: 3, lastUsedOn: '2026-10-14' },
]
