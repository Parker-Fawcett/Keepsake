# Keepsake

Keepsake is a relationship-aware notes app. Paste or speak messy notes and it organizes the people, dates, preferences, memories, and reminders inside them.

## Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Open the local address printed by the development command (normally `http://localhost:5173`). Do not open `index.html` directly—the source app needs the local development server.

## Prototype scope

- Today dashboard with people and timely relationship nudges
- Upcoming relationship calendar
- Searchable person cards and editable person details
- Manual person creation
- Messy-note capture and a classification review flow
- Browser speech recognition when supported
- Three-step onboarding with an initial note dump and contact import
- Phone contact, LinkedIn Connections CSV, and Facebook export entry points

## Backend

The app now runs through a small Express server with a server-only Neon Postgres connection. Copy `.env.example` to `.env.local`, add the Neon connection string, and run the migration before starting the app.

```bash
npm test          # backend + helper unit tests (no live database needed)
npm run worker    # deliver due reminders once (cron-friendly)
```

Current API routes:

- `GET /api/health` checks the database connection and extraction mode
- `POST /api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me` for email/password sessions
- `GET /api/people` lists saved people, `POST /api/people` creates one (optional email/phone)
- `GET /api/people/:id/details` returns a person's facts, dates, reminders, and linked notes
- `POST /api/notes` stores a raw note and runs extraction
- `POST /api/extract/preview` runs extraction without saving (powers the review screen)
- `POST /api/notes/:id/confirm` materializes reviewed people, facts, dates, and reminders
- `POST /api/imports/review` previews duplicates, `POST /api/imports/confirm` executes the import, `POST /api/imports` records a count-only job
- `GET /api/reminders/upcoming` lists scheduled future reminders
- `POST /api/push-tokens`, `DELETE /api/push-tokens` register device tokens for delivery

Notes without `OPENAI_API_KEY` use local heuristics; with a key they use the model and fall back to local on any error. The delivery worker sends due reminders through the server log, or a `KEEPSAKE_WEBHOOK_URL` when set; native push slots into `server/notify.js` once provider credentials exist.

The database includes users, sessions, people, notes, note-person links, facts, important dates, reminders, device tokens, and imports. Routes fall back to a demo owner when signed out; creator-owned checks and request rate limits guard every endpoint.
