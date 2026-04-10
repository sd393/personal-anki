# Flashcard App — Claude Code Prompt

Build me a simple, personal spaced-repetition flashcard web app. This is for my use only — no auth, no multi-user support. I want to deploy it on Vercel and use Supabase for the database so my cards sync across devices (phone + laptop).

## Tech Stack

- **Frontend:** React (Vite), single-page app, mobile-first responsive design
- **Database:** Supabase (Postgres). All reads/writes go directly from the frontend using `@supabase/supabase-js` — no backend needed.
- **Deployment:** Vercel as a static site. No serverless functions, no API routes.
- **Environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — set in Vercel's dashboard and `.env.local` for dev.

## Supabase Schema

Generate a `schema.sql` file I can paste into the Supabase SQL editor:

**decks**
- `id` uuid primary key default `gen_random_uuid()`
- `name` text not null
- `color` text not null
- `created_at` timestamptz default `now()`

**cards**
- `id` uuid primary key default `gen_random_uuid()`
- `deck_id` uuid references decks(id) on delete cascade
- `front` text not null
- `back` text not null
- `interval_days` real default 0
- `ease` real default 2.5
- `repetitions` integer default 0
- `next_review` timestamptz default `now()`
- `last_review` timestamptz
- `created_at` timestamptz default `now()`

Since this is single-user with no auth, disable RLS on both tables. Add a note in the SQL file reminding me to do this in the Supabase dashboard.

## Data Access (supabase.js)

Create a `src/lib/supabase.js` that initializes the Supabase client, then a `src/lib/api.js` with simple async functions wrapping Supabase queries:

- `getDecks()` — fetch all decks, each with card count and due count (use a Postgres function or fetch cards and count client-side — whichever is simpler)
- `createDeck(name, color)`
- `renameDeck(id, name)`
- `updateDeckColor(id, color)`
- `deleteDeck(id)` — cascade deletes cards
- `getCards(deckId)` — all cards in a deck
- `createCard(deckId, front, back)`
- `updateCard(id, { front, back })`
- `deleteCard(id)`
- `getDueCards(deckId)` — cards where `next_review <= now`, shuffled client-side
- `reviewCard(id, grade)` — fetch the card, run SM-2 client-side, then update the card with new schedule

## Spaced Repetition (SM-2, client-side)

Implement in `src/lib/scheduler.js`:

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

next_review = now + interval days
last_review = now
```

Returns an object with the updated fields to pass directly to `supabase.from('cards').update(...)`.

## UI — Screens & Features

Keep the UI minimal and clean. Mobile-first, works well on phone screens.

### 1. Home (Deck List)
- Shows all decks as colored cards
- Each card shows: deck name, card count, due count
- If cards are due, show a play button that goes straight to review
- "New Deck" button at the bottom

### 2. Deck View
- Header: back button, deck name (tappable to rename via inline edit), review button with due count
- "Add Card" button at the top
- List of all cards showing front/back preview
- Each card row has edit and delete buttons
- "Delete Deck" button at the bottom (with confirmation)

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

## File Structure

```
flashcards/
├── schema.sql                 # Supabase SQL — paste into SQL editor
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── lib/
│   │   ├── supabase.js        # Supabase client init
│   │   ├── api.js             # All data access functions
│   │   └── scheduler.js       # SM-2 algorithm
│   └── components/
│       ├── DeckList.jsx
│       ├── DeckView.jsx
│       ├── ReviewMode.jsx
│       ├── CardForm.jsx        # Used for both add and edit
│       └── Toast.jsx
├── index.html
├── vite.config.js
├── .env.local.example          # Template with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
├── package.json
└── README.md
```

## Important Notes

- No authentication. Single user. Just me. Disable RLS.
- No serverless functions — everything talks to Supabase directly from the browser.
- Keep dependencies minimal: `@supabase/supabase-js`, `vite`, `react`, `react-dom`
- README should include: setup steps for Supabase (create project, run schema.sql, disable RLS, copy URL + anon key), local dev, and Vercel deployment.