# Keepsake

Keepsake is a relationship-aware notes app. Paste or speak messy notes and it organizes the people, dates, preferences, memories, and reminders inside them.

## Run locally

```bash
npm install
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

The current parsing experience is a local interaction prototype. Production classification, authentication, encrypted storage, and push notification scheduling will be added behind service boundaries in the next phase.
