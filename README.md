# LLX TaskFlow MVP

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
