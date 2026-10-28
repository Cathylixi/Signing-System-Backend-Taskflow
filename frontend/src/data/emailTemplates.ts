import type { EmailContent } from '../types'

export interface EmailTemplate extends EmailContent {
  id: string
  name: string
}

// Placeholders: {{firstName}}, {{name}}, {{document}}, {{dueDate}}.
// The backend adds each signer's secure link when it sends the email.
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'standard',
    name: 'Standard signature request',
    subject: 'Signature requested: {{document}}',
    body:
      'Hi {{firstName}},\n\n' +
      'Please review and sign the provided {{document}} by {{dueDate}}. Use the secure link in this email to open the document and complete your signature.\n\n' +
      'Thank you,\nDocument Team',
  },
  {
    id: 'training',
    name: 'Training acknowledgment',
    subject: 'Action required: {{document}}',
    body:
      'Hi {{firstName}},\n\n' +
      'Please read {{document}} and sign to confirm you have completed this training by {{dueDate}}. Use the secure link in this email to open your copy.\n\n' +
      'Thank you,\nQuality Assurance',
  },
]

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match)
}
