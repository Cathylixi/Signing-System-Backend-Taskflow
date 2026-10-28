# Document Signing Tool -- FrontEnd

Internal tool for collecting signatures on PDF documents. Hosted from SharePoint, with documents and signing status stored in Azure. Users upload a PDF, place signature fields, send it to colleagues to sign, and get reminders when signatures are overdue.

## Layout

| Folder      | Contents                              |
| ----------- | ------------------------------------- |
| `frontend/` | React + TypeScript (Vite) web client  |
| `backend/`  | Node.js API (to be added)             |
| `docs/`     | Project notes, including [security checklist](docs/SECURITY.md) |

## Frontend

From the repo root:

```sh
npm run install:frontend   # first time only
npm run dev                # http://localhost:5173
```

(Or `cd frontend` and use `npm install` / `npm run dev` there.)

The upload address defaults to `VITE_UPLOAD_URL`. Copy `frontend/.env.example` to `frontend/.env.local` to set it. In dev builds you can also edit it on the Review & send step.

To test without the real backend, run `npm run echo` in a second terminal. It starts a stand-in server on `http://localhost:3001/upload` that reports what it received.

### Screens

Built from the templates in `docs/sample_uis_21OCT2026.pptx`. The sending mode chosen on the upload step decides which branch the workflow takes:

| Step | One document, many signers (`shared`) | One document per signer (`copies`) |
| --- | --- | --- |
| Sign in | Slide 1 | Slide 1 |
| 1. Upload | Slide 3 | Slide 3 |
| 2. Add signers | Slide 4: each signer has their own deadline; optional signing order | Slide 5: paste, search or import a CSV of emails; one shared deadline |
| 3. Place fields | Slide 6: fields assigned per signer, colour-coded | Slide 7: one layout used on every copy |
| 4. Review & send | Slide 8 | Slide 8 |

Slide 2 (status tracking) is on hold per the 21 Oct meeting notes. It will become an admin page.

**Placeholders still to replace:**
- **Sign-in:** not connected. Dev builds accept any password; production builds refuse to sign in.
- **People and group search:** uses mock data in `frontend/src/data/directory.ts`.
- **Email templates:** in `frontend/src/data/emailTemplates.ts`.

### Upload contract

**Send for signature** sends `POST <upload address>` as `multipart/form-data` with two fields:

- **`file`**: the PDF.
- **`request`**: JSON describing the request (built in `frontend/src/lib/request.ts`):

```jsonc
{
  "mode": "shared",                 // or "copies"
  "documentName": "Vendor_Agreement.pdf",
  "pageCount": 2,
  "enforceSigningOrder": true,      // shared mode only
  "reminderDaysBeforeDue": 3,
  "signers": [
    {
      "order": 1,
      "email": "alex.morgan@company.com",
      "name": "Alex Morgan",
      "dueDate": "2026-11-03",
      "message": { "subject": "…", "body": "…" }  // placeholders already filled in
    }
  ],
  "fields": [
    {
      "type": "signature",          // signature | initials | reason | date
      "page": 1,
      "x": 0.13, "y": 0.32, "width": 0.34, "height": 0.055,  // fractions of the page, from its top-left corner
      "signerEmail": "alex.morgan@company.com"               // null in copies mode = on every copy
    }
  ]
}
```

The backend is expected to add each signer's secure signing link to their email. Any 2xx response counts as success. Because the frontend and API run on different origins, the backend must send CORS headers.
# LLX TaskFlow MVP -- Backend

TaskFlow is a non-technical internal website for creating company tasks, sending email notifications, tracking employee completion, and reminding only the people who are still pending.

## What is implemented

- Dashboard with active-task, completion, pending-person, and overdue totals
- Searchable task list and status filters
- Task creation form with recipients, due date, link, priority, and reminder policy
- Draft review before publication
- Initial email immediately when a task is created
- Individual employee completion tracking
- Manual reminders to pending recipients
- Automatic business-day reminder evaluation
- Completed/cancelled task history
- Cosmos DB persistence and notification-event audit records
- Entra/App Service Authentication header validation
- Power Automate email adapter, with optional legacy Microsoft Graph adapter
- Browser-only preview mode that starts with zero tasks

## Architecture

```text
Administrator website
        |
        | HTTPS /api/*
        v
Azure Function App (managed identity)
  - validates users and task data
  - writes task state to Cosmos DB
  - checks reminders once per hour, sends only at the configured local hour
        |                         |
        v                         v
Azure Cosmos DB             Power Automate HTTP flow
tasks, recipients,          Office 365 Outlook connection
events, audit data          sends as xi.li@quantive.bio
```

The browser never receives a Cosmos key or a Power Automate flow URL. Both remain server-side in Azure Function settings.

## Project layout

```text
function_app.py              HTTP APIs and reminder timer
shared/                      Models, Cosmos repository, auth, and mail adapters
web/                         Responsive TaskFlow website
tests/                       Business-rule and integration-adapter tests
database/                    Cosmos record examples and notes
docs/                        Planning documents
local.settings.example.json  Safe local settings template
SETUP_GUIDE.md               Exact cloud connection and deployment steps
```

## Preview the website locally

```powershell
cd "C:\Users\Xi.Li\Desktop\Email Notification MVP\web"
python -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/?demo=1`. Preview mode starts empty, stores any tasks you create only in that browser's local storage, and never sends mail.

## Run the tests

```powershell
cd "C:\Users\Xi.Li\Desktop\Email Notification MVP"
.\.venv\Scripts\python.exe -m pytest -q
node --check .\web\assets\app.js
```

## Production configuration

Required Azure Function application settings:

```text
APP_ENV=production
ALLOW_LOCAL_ANONYMOUS=false
TENANT_ID=default
TASK_TIMEZONE=America/New_York
REMINDER_RUN_HOUR=9
MAX_RECIPIENTS_PER_TASK=50
COSMOS_ENDPOINT=https://llx-signing-cosmos-120a.documents.azure.com:443/
COSMOS_DATABASE_NAME=NotificationSystem
COSMOS_CONTAINER_NAME=records
MAIL_PROVIDER=power_automate
POWER_AUTOMATE_FLOW_URL=<secret URL from the HTTP-triggered flow>
ADMIN_EMAILS=xi.li@quantive.bio
```

Never commit `local.settings.json`, a Cosmos connection string, or the Power Automate flow URL.
