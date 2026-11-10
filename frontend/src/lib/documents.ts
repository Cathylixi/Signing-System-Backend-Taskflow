import type { DocumentStatus, WorkspaceDocument } from '../data/documents'

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  'needs-signature': 'Needs my signature',
  waiting: 'Waiting on others',
  overdue: 'Overdue',
  completed: 'Completed',
}

export function needsMySignature(d: WorkspaceDocument): boolean {
  return d.role === 'signer' && d.status === 'needs-signature'
}

/** Documents I sent that not everyone has signed yet, overdue included. */
export function isOutForSignature(d: WorkspaceDocument): boolean {
  return d.role === 'sender' && d.status !== 'completed'
}

export function byDueDate(a: WorkspaceDocument, b: WorkspaceDocument): number {
  return a.dueOn.localeCompare(b.dueOn)
}

export function byNewest(a: WorkspaceDocument, b: WorkspaceDocument): number {
  return b.updatedOn.localeCompare(a.updatedOn)
}

/** "Ravi Nair", "A. Morgan, J. Lee", or "3 recipients" */
export function recipientsLabel(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return names.map(shortName).join(', ')
  return `${names.length} recipients`
}

function shortName(name: string): string {
  const [first, ...rest] = name.split(/\s+/)
  return rest.length ? `${first[0]}. ${rest.join(' ')}` : name
}

/**
 * Where a document opens for signing.
 * PLACEHOLDER: nothing handles this route yet. Point it at the signing view
 * (or the backend's secure signing link) once that exists.
 */
export function documentHref(d: WorkspaceDocument): string {
  return `#/documents/${encodeURIComponent(d.id)}`
}

/** "1 of 2" */
export function signedLabel(d: WorkspaceDocument): string {
  return `${d.signedCount} of ${d.recipients.length}`
}
