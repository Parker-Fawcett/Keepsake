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

Current API routes:

- `GET /api/health` checks the database connection
- `GET /api/people` lists saved people
- `POST /api/people` creates a person
- `POST /api/notes` stores a raw note for processing
- `POST /api/imports` records an import job

The database includes users, people, notes, note-person links, facts, important dates, reminders, and imports. The current local build uses one demo user; production authentication and row-level user isolation are the next backend milestone.
