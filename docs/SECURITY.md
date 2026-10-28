# Security Notes

Things to address as the project moves past local testing. Most real enforcement belongs in the backend: the browser UI can always be bypassed by calling the API directly.

## Current frontend

_Last reviewed 2026-10-21. `npm audit`: 0 vulnerabilities._

- [x] **`VITE_*` env vars are public.** They are compiled into the JavaScript bundle. Never put Azure connection strings, storage keys, or API secrets in frontend `.env` files. Secrets live only on the backend.
  - *Status:* OK. The only variable is `VITE_UPLOAD_URL`, which isn't secret. `.env` / `.env.*` files are gitignored (except `.env.example`), and so is `sample_documents/`. Recheck whenever a new variable is added.
- [ ] **Client-side PDF checks are UX only.** The type, size and header checks in `frontend/src/lib/pdf.ts` can be skipped. The backend must re-validate type (check the `%PDF` file header, not just the extension or MIME type), size, and filename.
  - *Status:* Frontend side done: it now also checks the `%PDF-` file header. **Backend still open**: this item stays unchecked until the API validates uploads itself.
- [x] **Echo server is dev-only.** `frontend/scripts/echo-server.mjs` allows CORS from any origin. Never deploy it or copy its CORS setup into the real API.
  - *Status:* OK. It isn't part of the Vite build; confirmed by checking `dist/`. It now listens on `127.0.0.1` only, so other machines on the network can't reach it (previously it listened on every network interface).
- [x] **Lock the upload address for production.** The editable address field is a dev convenience. In production builds it should be fixed so users can't be tricked into sending documents elsewhere.
  - *Status:* Done. The address field only appears in dev builds (`npm run dev`), on the Review & send step. Production builds always use `VITE_UPLOAD_URL`, refuse to upload if it isn't set, and require `https://`.
- [x] **Keep server output escaped.** React escapes the response text shown after an upload. Don't switch to `dangerouslySetInnerHTML`.
  - *Status:* OK. There is no `dangerouslySetInnerHTML` or `innerHTML` in `src/`. Server responses and file names are rendered as plain text.

## Project-wide (highest priority first)

### 1. Authentication
Currently anyone who can reach the API can upload.

> **Decision needed:** the sign-in template (slide 1) uses a separate username and password for this workspace. That means storing and protecting passwords ourselves (hashing, lockout, resets). Microsoft sign-in (below) avoids all of that. The current sign-in page is a placeholder: dev builds accept any password and production builds refuse to sign in.

- [ ] Use the company's Microsoft Entra ID (Azure AD) sign-in. SharePoint users are already signed in.
- [ ] Frontend obtains a token for the user (SPFx `AadHttpClient`, or MSAL if the app is embedded instead).
- [ ] Backend validates the token on every request: signature, issuer, audience, and tenant.

### 2. Authorization
- [ ] The backend determines who is acting from the token, never from IDs in the request body. Otherwise, changing `signerId=5` to `6` lets someone sign as a coworker.
- [ ] Check that the user is allowed to view or sign that specific document on every request.
- [ ] Links in reminder emails expire, work only once, and still require sign-in. They must not grant access on their own.

### 3. Signature integrity and audit trail
A signature only means something if the document can't change underneath it.
- [ ] Store a SHA-256 hash of the PDF when it's sent and at each signature. Keep each signed version.
- [ ] Keep an append-only audit log: who did what, when, from what IP address, and against which document hash.
- [ ] Ask legal/compliance what's required for signatures to hold up (in the US: ESIGN Act and UETA).

### 4. Azure storage and database
- [ ] Keep Blob Storage containers private, with public access disabled.
- [ ] If SAS URLs are used, make them short-lived and scoped to a single file.
- [ ] Backend authenticates to Azure with a managed identity instead of connection strings. Put any remaining secrets in Key Vault.
- [ ] Use parameterized queries only, to prevent SQL injection.

### 5. Untrusted PDFs
- [ ] Consider Microsoft Defender for Storage to scan uploads for malware.
- [x] Render PDFs with pdf.js in the signature-placement UI. It doesn't run scripts embedded in PDFs.
  - *Status:* Done (pdfjs-dist 6). Pages are drawn to a canvas only; no annotation or form layer is rendered. Keep pdfjs-dist updated, since it parses untrusted files.
- [ ] Serve uploaded files with `Content-Disposition: attachment`. Don't serve them inline from the app's own origin.

### 6. API hardening
- [ ] HTTPS everywhere.
- [ ] CORS restricted to the SharePoint site's origin.
- [ ] Limit upload sizes and per-user request rates.

### 7. Reminder emails
- [ ] Send from the company domain with consistent formatting. These emails look exactly like the phishing emails staff are trained to ignore.
- [ ] Link to the SharePoint site, never to a login page.

### 8. Housekeeping
- [ ] Don't commit Postman collections or environments that contain tokens.
- [ ] Run `npm audit` periodically.
- [ ] Don't test with real sensitive documents.

## Open decision

**SPFx web part vs. standalone app embedded in SharePoint.** This decides how sign-in works. SPFx provides the user's token almost for free. An embedded app needs MSAL added. Items 1–3 affect the backend and database design, so settle them before the backend grows.
