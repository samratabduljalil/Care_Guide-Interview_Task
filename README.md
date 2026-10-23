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

## Detection rules
- `high_latency`: response_time_ms > 2000 (critical above 4000)
- `failed_request`: status_code >= 400 (critical for 5xx)
- `zero_records`: records_returned < 1
- Critical if 5xx, very slow, or 2+ issues together.

## Design notes
- Routes -> controllers -> services -> model (modular).
- LLM only writes the message; detection is plain code.
- LLM calls run in parallel (`Promise.all`); on failure a template message is used.
- One invalid item in a batch is skipped and reported, not fatal.
- Logs: `backend/logs/`.
- Optional email: set `EMAIL_ENABLED=true` and SMTP values in `.env`.

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
