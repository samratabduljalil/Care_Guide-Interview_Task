# Intelligent API Monitoring & Alert System

An internal tool for **Cottage Home Care** backend engineers. It checks the results of external patient and operational APIs, detects anomalies with rules, uses **Google Gemini** to write a clear human-readable alert, stores alerts in **PostgreSQL**, shows them on a live dashboard, and emails the team.

> Submission for the Technical Interview Task: *Intelligent API Monitoring & Alert System.*
> Video walkthrough and `AI_Prompts.docx` are shared in the Drive link sent with the submission.

---

## Features

| Area | What it does |
|---|---|
| **Monitoring** | `POST /monitor` accepts a batch (array) of API results and checks every item |
| **Anomaly detection** | Slow response, failed request (HTTP error) and missing or zero records |
| **AI alerts** | Gemini writes a short alert with a likely cause. If Gemini fails, the system retries, then falls back to a template so no alert is ever lost |
| **Storage** | Alerts, dashboard settings and email history are stored in PostgreSQL |
| **REST API** | `GET /alerts` returns active anomalies, plus filters and a resolve endpoint |
| **Dashboard** | Overview with charts, alert table with search and filters, detail panel, CSV export, manual check page |
| **Settings (no code changes)** | Detection thresholds, email recipients, instant-alert rules and report schedule are all edited from the dashboard |
| **Email** | Instant email for critical alerts, plus a status report every N hours (both configurable) |
| **Reliability** | Input validation, per-item error isolation, global error handler, Winston logging |

## Tech stack

- **Backend:** Node.js 18+, Express, `pg` (PostgreSQL), Winston, Nodemailer
- **AI:** Google Gemini API (called with built-in `fetch`, no SDK)
- **Frontend:** plain HTML, CSS and JavaScript. **No framework and no chart library**; charts are hand-drawn SVG
- **Database:** PostgreSQL 13+

---

## Architecture

```
API results (JSON batch)
        |  POST /monitor
        v
 Express routes -> validation -> controller
                                    |
                    detection service (rules + thresholds from Settings)
                                    |  anomalies only
                                    v
                    LLM service (Gemini, retry, template fallback)
                                    |
                                    v
                    PostgreSQL  (alerts, settings, email_log)
                       |                 |                  |
              GET /alerts          email service      settings service
                       |           (instant + report)   (PUT /settings)
                       v                 ^                  ^
                  Dashboard         scheduler (every minute) |
                                                         Dashboard
```

**Request flow for `POST /monitor`:** validate input (bad items are skipped and reported) -> detect anomalies -> generate all AI messages in parallel -> save all alerts with one `INSERT` -> respond -> send instant email in the background.

### Folder structure

```
api-monitor/
├── backend/
│   ├── src/
│   │   ├── config/        env.js, db.js
│   │   ├── models/        Alert.js (alerts table), Settings.js (defaults, validation, tables)
│   │   ├── routes/        monitor, alerts, settings
│   │   ├── controllers/   monitor, alerts, settings
│   │   ├── services/      detection, llm, alert, settings, email, report, scheduler
│   │   ├── middlewares/   validate.js, errorHandler.js
│   │   ├── utils/         logger.js, fallbackMessage.js, emailTemplates.js
│   │   ├── app.js         Express setup (also serves the frontend)
│   │   └── server.js      startup: database, settings, scheduler, listen
│   ├── data/sample.json   example input
│   ├── scripts/sendSample.js
│   ├── logs/              log files (created automatically)
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── css/               theme.css (brand colours and fonts), style.css
│   └── js/                api.js, app.js, charts.js, settings.js
├── docker-compose.yml     optional PostgreSQL
├── package.json           root shortcuts (npm start, npm run sample)
└── README.md
```

---

## Setup

### 1. Requirements
- Node.js 18 or newer
- PostgreSQL 13 or newer (local install, or use the included Docker file)
- A Gemini API key (free): https://aistudio.google.com/apikey (optional; without it, template messages are used)
- An SMTP account for email (optional; Gmail needs an *app password*)

### 2. Database
Option A, Docker (easiest):
```bash
docker compose up -d
```
Option B, your own PostgreSQL: create an empty database named `api_monitor` (for example in `psql`: `CREATE DATABASE api_monitor;`).

Tables (`alerts`, `settings`, `email_log`) are **created automatically** on first start.

### 3. Install and configure
```bash
cd backend
npm install
copy .env.example .env        # Windows   (use: cp .env.example .env   on macOS/Linux)
```
Edit `backend/.env`:

| Variable | Meaning |
|---|---|
| `PORT` | Server port (default 5000) |
| `DATABASE_URL` | e.g. `postgresql://postgres:YOUR_PASSWORD@localhost:5432/api_monitor` |
| `DASHBOARD_URL` | Link placed inside emails |
| `GEMINI_API_KEY` | Your Gemini key (empty = template messages) |
| `GEMINI_MODEL` | Default `gemini-flash-latest`. Change it if Google retires or renames the model |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mail account. Secrets stay here and are never stored in the database |
| `EMAIL_TO` | Optional first-time default recipients (afterwards edit them in Settings) |

### 4. Run
```bash
npm start
```
Expected log:
```
PostgreSQL connected, alerts table ready
Settings loaded
Report scheduler started (checks every 60s)
Server running at http://localhost:5000
```
Open **http://localhost:5000** (Express serves both the API and the dashboard).

You can also run everything from the project root: `npm run install:all`, then `npm start`.

### 5. Try it
With the server running, in a second terminal (inside `backend`):
```bash
npm run sample
```
or open **Run Check** in the dashboard and press *Run Check*, or send your own request:
```bash
curl -X POST http://localhost:5000/monitor -H "Content-Type: application/json" -d @data/sample.json
```

---

## API reference

### `POST /monitor`
Body: a JSON array. Each item needs `api_name` (string, max 100 characters), `response_time_ms`, `status_code`, `records_returned` (numbers).

```json
[
  { "api_name": "PatientDataAPI", "response_time_ms": 1200, "status_code": 200, "records_returned": 50 },
  { "api_name": "AppointmentAPI", "response_time_ms": 5500, "status_code": 500, "records_returned": 0 }
]
```
Response `201`:
```json
{
  "success": true,
  "total_received": 2,
  "total_processed": 2,
  "rejected_indexes": [],
  "anomalies_found": 1,
  "alerts": [{
    "id": 1, "api_name": "AppointmentAPI",
    "issues": ["high_latency", "failed_request", "zero_records"],
    "severity": "critical",
    "message": "AppointmentAPI failed with status 500 and returned 0 records. Possible outage or data issue.",
    "ai_generated": true,
    "metrics": { "response_time_ms": 5500, "status_code": 500, "records_returned": 0 },
    "status": "active", "created_at": "2026-10-24T10:00:00.000Z"
  }]
}
```
Invalid items are skipped and listed in `rejected_indexes`; the rest of the batch is still processed.

### `GET /alerts`
Returns alerts, newest first (maximum 500). Query parameters:
`status=active|resolved|all` (default `active`), `severity=critical|warning`, `api_name=<name>`.

### `PATCH /alerts/:id/resolve`
Marks one alert as resolved.

### Settings and email endpoints
| Method | Path | Description |
|---|---|---|
| GET / PUT | `/settings` | Read or save thresholds and email settings (validated; errors returned as a list) |
| POST | `/settings/test-email` | Send a test email to the saved recipients |
| POST | `/settings/send-report` | Send the status report now |
| GET | `/settings/email-log` | Last 15 emails with sent, failed or skipped status |

---

## Detection rules (editable in Settings)

| Issue | Default rule | Severity |
|---|---|---|
| `high_latency` | Response time above 2000 ms | Critical above 4000 ms |
| `failed_request` | HTTP status 400 or higher | Critical from 500 |
| `zero_records` | Fewer than 1 record returned | Warning |

An alert is also **critical** when an API has two or more problems at the same time (this can be switched off). Changes apply to new checks immediately; existing alerts are not recalculated.

## Email alerts and reports

Open **Settings** in the dashboard:

- **Email recipients:** on/off switch, up to 20 addresses, *Send test email*.
- **Instant alerts:** which severities and alert types trigger an email (critical only by default), and a cooldown (default 30 minutes) so one outage does not flood the inbox. Matching alerts from one check are sent together in a single email.
- **Status report:** send every 1 to 168 hours (default 2), choose included severities and alert types, optionally skip when there are no active alerts. The report shows active, critical and warning counts, APIs affected, alert types, the latest alerts, and how many are new or resolved since the last report. *Send report now* is available for testing.
- **Email history:** every email is recorded with its result.

## Dashboard

- **Overview:** counters with trend lines, alerts over time (24 hours or 7 days), severity donut, issue types, most affected APIs, APIs needing attention, latest alerts.
- **Alerts:** search and filters, detail panel, *Mark as resolved*, export to CSV.
- **Run Check:** paste or load JSON and submit it manually.
- **Settings:** all thresholds and email options.
- **Theme:** brand colours and fonts live in `frontend/css/theme.css`. Edit that one file to match the company site exactly.

---

## Key design decisions

1. **Rules detect, the LLM only writes.** Detection is fast, free and predictable; an AI outage can never hide a real problem.
2. **Retry then fallback.** Temporary Gemini errors (503, 429, timeouts) are retried up to 3 times; after that a template message is used. The `ai_generated` column records which one was used.
3. **Built for batches.** Items are validated individually, AI calls run in parallel (`Promise.all`) and alerts are inserted with one query.
4. **Settings in the database, secrets in `.env`.** The team can change behaviour without redeploying, and passwords never reach the database or browser.
5. **Email safety.** Instant emails use a cooldown, every email is logged, SMTP errors never break `/monitor`, and API names are escaped in emails and pages.
6. **Modular layers** (routes, controllers, services, models) so a part such as the LLM provider can be replaced by editing one file.

## Testing notes

The project was exercised with a real PostgreSQL database, a fake SMTP server and a headless browser. Checks covered detection, batch handling, instant email and cooldown, scheduled reports, settings validation, SMTP failure handling and the dashboard pages. The live Gemini API and a real mail provider were **not** part of those tests, so please run *Send test email* and one batch with your own keys before a demo. The Gemini retry logic was tested against a simulated server.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `PostgreSQL connection failed` | Wrong `DATABASE_URL`, PostgreSQL not running, or database `api_monitor` not created |
| `EADDRINUSE` | Port already used; change `PORT` in `.env` |
| Alerts show "Template message" | `GEMINI_API_KEY` empty or wrong, or Gemini unreachable. Look for `Gemini failed` in the logs. Check `GEMINI_MODEL` if you see HTTP 404 |
| Gemini timeouts | Network or firewall blocks `generativelanguage.googleapis.com`; try another network or VPN, and Node 20+ |
| "Mail server not set up" in Settings | Add `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` to `.env` and restart |
| `npm audit` warns about nodemailer | Use `nodemailer@^10.2.1` (already set in `package.json`) |

## Known limitations and next steps

- **No login:** anyone who can open the dashboard can change settings. Add authentication before real use.
- **Single instance:** the report scheduler runs inside the server, and the instant-alert cooldown is kept in memory (resets on restart). For several instances, move scheduling to a job queue.
- Alerts are pushed to `/monitor`; automatic polling of live APIs, pagination beyond 500 alerts and automated tests are future work.

## AI usage

AI assistance (Claude) was used for code generation, prompt design and logic building. Every prompt is documented in `AI_Prompts.docx`, submitted with this project.