// One-shot: port decks from the local Anki desktop app into the web app.
// Usage:
//   1. cp ~/Library/Application\ Support/Anki2/User\ 1/collection.anki2* /tmp/anki_port/
//   2. node scripts/port-anki-decks.mjs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.
// Ports card text (HTML stripped to plain text) AND scheduling state
// (interval, ease, repetitions, next review date) so review progress carries over.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = '/tmp/anki_port/collection.anki2';

// ── Env ────────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Read Anki collection ───────────────────────────
function sql(query) {
  return JSON.parse(execFileSync('sqlite3', ['-json', DB, query], { encoding: 'utf8' }) || '[]');
}

const crt = sql('SELECT crt FROM col;')[0].crt; // collection creation, epoch seconds
const ankiDecks = sql('SELECT id, name FROM decks;');
const clozeMids = new Set(sql("SELECT id FROM notetypes WHERE name LIKE '%Cloze%';").map((r) => r.id));
const cards = sql(
  'SELECT c.id AS cid, c.did, c.type, c.due, c.ivl, c.factor, c.reps, n.mid, n.flds FROM cards c JOIN notes n ON c.nid = n.id;'
);
const lastReview = new Map(
  sql('SELECT cid, MAX(id) AS ms FROM revlog GROUP BY cid;').map((r) => [r.cid, r.ms])
);

// ── HTML -> plain text ─────────────────────────────
function clean(html) {
  return html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(div|p|pre|ul|ol|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::[^}]*)?\}\}/g;

function toFrontBack(card) {
  const fields = card.flds.split('\x1f');
  if (clozeMids.has(card.mid)) {
    const text = fields[0];
    const extra = clean(fields[1] || '');
    let back = clean(text.replace(CLOZE, '$1'));
    if (extra) back += `\n\n${extra}`;
    return { front: clean(text.replace(CLOZE, '[...]')), back };
  }
  return { front: clean(fields[0] || ''), back: clean(fields[1] || '') };
}

// ── Anki scheduling -> web app SM-2 fields ─────────
function toSchedule(card) {
  const now = new Date();
  const last = lastReview.has(card.cid) ? new Date(lastReview.get(card.cid)).toISOString() : null;

  if (card.type === 2) {
    // Mature review card: due is days since collection creation day
    return {
      interval_days: card.ivl,
      ease: Math.min(3.0, Math.max(1.3, card.factor / 1000)),
      repetitions: Math.max(card.reps, 2),
      next_review: new Date((crt + card.due * 86400) * 1000).toISOString(),
      last_review: last,
    };
  }
  if (card.type === 1 || card.type === 3) {
    // (Re)learning card: due is epoch seconds when > ~2001, else treat as due now
    const due = card.due > 1e9 ? new Date(card.due * 1000) : now;
    return { interval_days: 0, ease: 2.5, repetitions: 0, next_review: due.toISOString(), last_review: last };
  }
  // New card
  return { interval_days: 0, ease: 2.5, repetitions: 0, next_review: now.toISOString(), last_review: null };
}

// ── Port ───────────────────────────────────────────
const DECK_COLORS = ['#34D399', '#A78BFA', '#FB923C', '#FBBF24', '#E879F9', '#94A3B8'];

const existing = await rest('decks?select=name');
const existingNames = new Set(existing.map((d) => d.name));
const clashes = ankiDecks.filter((d) => existingNames.has(d.name));
if (clashes.length) {
  console.error(`Aborting: deck(s) already exist in the web app: ${clashes.map((d) => d.name).join(', ')}`);
  process.exit(1);
}

let colorIdx = 0;
for (const deck of ankiDecks) {
  const color = DECK_COLORS[colorIdx++ % DECK_COLORS.length];
  const [created] = await rest('decks', { method: 'POST', body: JSON.stringify({ name: deck.name, color }) });
  const deckCards = cards.filter((c) => c.did === deck.id);

  const rows = deckCards
    .map((c) => ({ deck_id: created.id, ...toFrontBack(c), ...toSchedule(c) }))
    .filter((r) => r.front.length > 0);

  for (let i = 0; i < rows.length; i += 100) {
    await rest('cards', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 100)) });
  }
  console.log(`${deck.name}: created (${color}), ${rows.length}/${deckCards.length} cards inserted`);
}
console.log('Done.');
