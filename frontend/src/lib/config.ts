// Production builds always send to the configured endpoint; only dev builds let
// the address be edited (for pointing at the echo server, Postman mocks, etc.).
export const EDITABLE_URL = import.meta.env.DEV
export const CONFIGURED_URL = import.meta.env.VITE_UPLOAD_URL ?? ''

export function uploadConfigError(): string | null {
  if (EDITABLE_URL) return null
  if (!CONFIGURED_URL) return 'Upload address is not configured (VITE_UPLOAD_URL).'
  if (!CONFIGURED_URL.startsWith('https://')) return 'Upload address must use HTTPS.'
  return null
}
