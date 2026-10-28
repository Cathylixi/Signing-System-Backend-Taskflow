import { GROUPS, PEOPLE } from '../data/directory'
import type { Signer } from '../types'

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function nameForEmail(email: string): string {
  const known = PEOPLE.find((p) => p.email.toLowerCase() === email.trim().toLowerCase())
  if (known) return known.name
  const local = email.split('@')[0] ?? ''
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return parts.map((p) => p[0].toUpperCase()).slice(0, 2).join('') || '?'
}

/** Per-signer validation message, keyed by signer id. */
export function signerProblems(signers: Signer[]): Map<string, string> {
  const problems = new Map<string, string>()
  const seen = new Set<string>()
  for (const s of signers) {
    const key = s.email.trim().toLowerCase()
    if (!isEmail(s.email)) problems.set(s.id, 'Enter a valid email address.')
    else if (seen.has(key)) problems.set(s.id, 'This person is already a signer.')
    else if (!s.dueDate) problems.set(s.id, 'Choose a due date.')
    seen.add(key)
  }
  return problems
}

export interface ParsedEmails {
  valid: string[]
  invalid: string[]
  duplicates: number
}

/** Splits on commas, semicolons and new lines; dedupes case-insensitively. */
export function parseEmailList(text: string): ParsedEmails {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  let duplicates = 0
  for (const raw of text.split(/[,;\n\r\t]+/)) {
    const entry = raw.trim()
    if (!entry) continue
    if (!isEmail(entry)) {
      invalid.push(entry)
      continue
    }
    const key = entry.toLowerCase()
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    valid.push(entry)
  }
  return { valid, invalid, duplicates }
}

/** Pulls every email-looking cell out of a CSV file. */
export function emailsFromCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,;\t]/))
    .map((cell) => cell.trim().replace(/^"|"$/g, ''))
    .filter(isEmail)
}

export interface DirectoryMatch {
  kind: 'person' | 'group'
  label: string
  detail: string
  emails: string[]
}

export function searchDirectory(query: string, exclude: Set<string>, limit = 6): DirectoryMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const groups: DirectoryMatch[] = GROUPS.filter(
    (g) => g.name.toLowerCase().includes(q) || g.email.includes(q),
  ).map((g) => ({
    kind: 'group',
    label: g.name,
    detail: `${g.members.length} people · ${g.email}`,
    emails: g.members,
  }))
  const people: DirectoryMatch[] = PEOPLE.filter(
    (p) =>
      !exclude.has(p.email.toLowerCase()) &&
      (p.name.toLowerCase().includes(q) || p.email.includes(q)),
  ).map((p) => ({ kind: 'person', label: p.name, detail: p.email, emails: [p.email] }))
  return [...groups, ...people].slice(0, limit)
}
