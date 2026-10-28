import type { SignatureRequestPayload } from '../lib/request'

export interface SendResult {
  ok: boolean
  status: number
  body: string
}

/**
 * POSTs the signature request as multipart/form-data:
 *   file    - the PDF
 *   request - JSON (SignatureRequestPayload): signers, fields, emails
 */
export async function sendSignatureRequest(
  url: string,
  file: File,
  request: SignatureRequestPayload,
): Promise<SendResult> {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('request', JSON.stringify(request))

  const res = await fetch(url, { method: 'POST', body: form })
  return { ok: res.ok, status: res.status, body: await res.text() }
}
