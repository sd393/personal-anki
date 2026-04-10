# Flashcard App — Claude Code Prompt

Build me a simple, personal spaced-repetition flashcard web app. This is for my use only — no auth, no multi-user support. I want it deployed so I can use it on both desktop and my phone.

## Tech Stack

- **Frontend:** React (Vite), single-page app, mobile-first responsive design
- **Backend:** Express.js with a SQLite database (via `better-sqlite3`) for persistent storage
- **Deployment-ready:** Give me a single `npm run dev` to start both frontend and backend locally. Structure it so I can easily deploy to a free tier (Railway, Render, Fly.io, etc.)

## Data Model

SQLite with two tables:

**decks**
- `id` (text, primary key, UUID)
- `name` (text)
- `color` (text, hex color)
- `created_at` (integer, unix ms)

**cards**
- `id` (text, primary key, UUID)
- `deck_id` (text, foreign key → decks.id)
- `front` (text)
- `back` (text)
- `interval` (real, days, default 0)
- `ease` (real, default 2.5)
- `repetitions` (integer, default 0)
- `next_review` (integer, unix ms, default 0)
- `last_review` (integer, unix ms, nullable)
- `created_at` (integer, unix ms)

## API Endpoints

REST API, all JSON:

- `GET /api/decks` — list all decks with card count and due count
- `POST /api/decks` — create deck `{ name, color }`
- `PATCH /api/decks/:id` — update deck (rename, change color) `{ name?, color? }`
- `DELETE /api/decks/:id` — delete deck and all its cards
- `GET /api/decks/:id/cards` — list all cards in a deck
- `POST /api/decks/:id/cards` — create card `{ front, back }`
- `PATCH /api/cards/:id` — update card `{ front?, back? }`
- `DELETE /api/cards/:id` — delete card
- `GET /api/decks/:id/review` — get all due cards (where `next_review <= now`), shuffled
- `POST /api/cards/:id/review` — submit a review grade `{ grade }` (0=again, 1=good, 2=easy), server calculates new schedule and updates the card

## Spaced Repetition (SM-2, server-side)

Implement this in the `POST /api/cards/:id/review` handler:

```
if grade == 0 (again):
  interval = 1 day
  ease = max(1.3, ease - 0.2)
  repetitions = 0
if grade == 1 (good):
  if repetitions == 0: interval = 1
  else if repetitions == 1: interval = 3
  else: interval = round(interval * ease)
  repetitions += 1
if grade == 2 (easy):
  if repetitions == 0: interval = 2
  else if repetitions == 1: interval = 4
  else: interval = round(interval * ease * 1.3)
  ease = min(3.0, ease + 0.15)
  repetitions += 1

next_review = now + interval * 86400000
last_review = now
```

## UI — Screens & Features

The app has only a few views. Keep the UI minimal and clean — no unnecessary chrome. Mobile-first, works well on phone screens.

### 1. Home (Deck List)
- Shows all decks as colored cards
- Each card shows: deck name, card count, due count
- If cards are due, show a play button that goes straight to review
- "New Deck" button at the bottom
- Export (download all data as JSON) and Import (upload JSON to restore) buttons in the header

### 2. Deck View
- Header: back button, deck name (tappable to rename — inline edit or modal), review button with due count
- "Add Card" button at the top
- List of all cards showing front/back preview
- Each card row has edit and delete buttons
- "Delete Deck" button at the bottom (with confirmation)
- Ability to rename the deck (tap deck name or an edit icon) — PATCH to `/api/decks/:id`

### 3. Review Mode
- Shows one card at a time, front side first
- Tap/click "Show Answer" to reveal back
- Three grade buttons: Again (red), Good (blue), Easy (green)
- Progress counter: "3 / 12"
- When done, show a completion screen with count reviewed and a "Back to Deck" button
- "Exit" button in header to leave review early

### 4. Add Card
- Simple form: front (textarea), back (textarea), "Add Card" button
- Clear fields after adding, show a toast confirmation
- Stay on the add screen so I can add multiple cards quickly

### 5. Edit Card
- Same as add card but pre-filled, with a "Save" button
- Delete button in the header

## Design Guidelines

- Use a neutral warm palette: off-white background (`#FAF9F6`), clean card surfaces
- Support dark mode via `prefers-color-scheme` media query
- Deck colors are user-chosen from a preset palette of ~12 soft colors
- Rounded corners (16px for cards, 12px for buttons/inputs)
- Use DM Sans from Google Fonts
- Toast notifications for confirmations (card added, deleted, etc.)
- No external UI library — just CSS. Keep it simple.

## Export/Import

- `GET /api/export` — returns the full database as JSON `{ decks: [...], cards: [...] }`
- `POST /api/import` — accepts the same format, merges or replaces all data (I'll use replace — wipe and re-insert)

## File Structure

```
flashcards/
├── server/
│   ├── index.js          # Express server, serves API + static frontend
│   ├── db.js             # SQLite setup, migrations, helper queries
│   └── scheduler.js      # SM-2 algorithm
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── api.js            # fetch wrappers for all API calls
│   └── components/
│       ├── DeckList.jsx
│       ├── DeckView.jsx
│       ├── ReviewMode.jsx
│       ├── CardForm.jsx   # used for both add and edit
│       └── Toast.jsx
├── index.html
├── vite.config.js         # proxy /api to Express in dev
├── package.json
└── README.md
```

## Deployment: Railway

This will be deployed on Railway. Keep it simple:

- SQLite file stored at `/data/flashcards.db` — use the env var `DB_PATH` with fallback to `./data/flashcards.db` for local dev
- On Railway, I'll attach a persistent volume mounted at `/data` so the DB survives redeploys
- Create the DB directory automatically if it doesn't exist
- In production, Express serves the built Vite frontend from `dist/`
- Listen on `process.env.PORT` (Railway sets this automatically), fallback to `3000` for local dev
- Add a `Dockerfile` for Railway:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV DB_PATH=/data/flashcards.db
EXPOSE 3000
CMD ["npm", "start"]
```

**package.json scripts:**
- `"dev"` — runs Vite dev server + Express concurrently
- `"build"` — runs `vite build`
- `"start"` — runs `node server/index.js` (serves API + static `dist/`)

## Important Notes

- No authentication. Single user. Just me.
- Keep dependencies minimal: express, better-sqlite3, uuid, vite, react, react-dom, concurrently
