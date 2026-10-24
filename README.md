# Intelligent API Monitoring & Alert System

Receives API health data, detects anomalies with rules, writes human-readable alerts with Google Gemini, stores them in PostgreSQL, and shows them in a web UI.

## Requirements
- Node.js 18+
- PostgreSQL 13+ (local install, or `docker compose up -d` using the included file)
- Gemini API key from https://aistudio.google.com/apikey (optional; without it, template messages are used)

## Setup
```bash
cd backend
npm install
cp .env.example .env     # then edit DATABASE_URL and GEMINI_API_KEY
npm start
```
Open http://localhost:5000

The `alerts` table is created automatically on first start.

## Test it
With the server running:
```bash
npm run sample
```
or use the "Send test data" panel in the UI, or Postman: `POST http://localhost:5000/monitor` with a JSON array.

## Endpoints
| Method | Path | Description |
|---|---|---|
| POST | /monitor | Batch-analyse API results, store anomalies |
| GET | /alerts | Alerts, newest first (`?status=active|resolved|all&severity=critical&api_name=X`, max 500) |
| PATCH | /alerts/:id/resolve | Mark an alert resolved |
| GET / PUT | /settings | Read / save thresholds and email settings |
| POST | /settings/test-email | Send a test email to the recipients |
| POST | /settings/send-report | Send the status report now |
| GET | /settings/email-log | Last 15 emails and their result |

## Detection rules
Thresholds are edited from the dashboard (Settings page) and saved in PostgreSQL. Defaults:
- `high_latency`: response time above 2000 ms (critical above 4000 ms)
- `failed_request`: HTTP status 400 or higher (critical from 500)
- `zero_records`: fewer than 1 record
- Critical also when an API has 2+ problems at once (can be switched off)

## Design notes
- Routes -> controllers -> services -> model (modular).
- LLM only writes the message; detection is plain code.
- LLM calls run in parallel (`Promise.all`); on failure a template message is used.
- One invalid item in a batch is skipped and reported, not fatal.
- Logs: `backend/logs/`.

## Run from the project root (Express serves backend + UI)
```bash
npm run install:all
cp backend/.env.example backend/.env   # set DATABASE_URL and GEMINI_API_KEY
npm start
```

## Dashboard (internal tool for Cottage backend team)
- **Overview:** active/critical counts, APIs needing attention, latest alerts
- **Alerts:** searchable, filterable table, details panel, resolve button, CSV export
- **Run Check:** paste or load JSON and submit to `/monitor`
- Brand colors and fonts: edit the `:root` block at the top of `frontend/css/style.css`
- Logo loads from the Cottage image server; save a local copy in `frontend/` for offline use

## Email alerts and reports
1. Put the mail account in `backend/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_FROM`). Gmail needs an app password.
2. Open the dashboard, go to **Settings** and choose:
   - **Recipients** and an on/off switch for all email
   - **Instant alerts:** which severities and alert types trigger an email, and a cooldown so one outage does not send a flood
   - **Status report:** how often (hours), which severities and alert types to include, and whether to skip it when everything is healthy
3. Use **Send test email** and **Send report now** to check it works. Every email is recorded in **Email history**.

Notes: secrets stay in `.env`, everything else is stored in PostgreSQL (tables `settings`, `email_log`). The report scheduler runs inside the server, so run a single server instance. The instant-alert cooldown is kept in memory and resets when the server restarts.
