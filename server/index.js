import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import { schedule } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In production, serve the built Vite frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

// ── Decks ──────────────────────────────────────────────

app.get('/api/decks', (_req, res) => {
  const decks = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM cards WHERE deck_id = d.id) AS card_count,
      (SELECT COUNT(*) FROM cards WHERE deck_id = d.id AND next_review <= ?) AS due_count
    FROM decks d
    ORDER BY d.created_at DESC
  `).all(Date.now());
  res.json(decks);
});

app.post('/api/decks', (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'name and color are required' });

  const id = uuidv4();
  const created_at = Date.now();
  db.prepare('INSERT INTO decks (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, name, color, created_at);
  res.status(201).json({ id, name, color, created_at });
});

app.patch('/api/decks/:id', (req, res) => {
  const { name, color } = req.body;
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(req.params.id);
  if (!deck) return res.status(404).json({ error: 'deck not found' });

  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }
  if (updates.length === 0) return res.json(deck);

  values.push(req.params.id);
  db.prepare(`UPDATE decks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ...deck, ...(name !== undefined && { name }), ...(color !== undefined && { color }) });
});

app.delete('/api/decks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'deck not found' });
  res.json({ ok: true });
});

// ── Cards ──────────────────────────────────────────────

app.get('/api/decks/:id/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(cards);
});

app.post('/api/decks/:id/cards', (req, res) => {
  const { front, back } = req.body;
  if (!front || !back) return res.status(400).json({ error: 'front and back are required' });

  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);
  if (!deck) return res.status(404).json({ error: 'deck not found' });

  const id = uuidv4();
  const created_at = Date.now();
  db.prepare(`
    INSERT INTO cards (id, deck_id, front, back, interval, ease, repetitions, next_review, last_review, created_at)
    VALUES (?, ?, ?, ?, 0, 2.5, 0, 0, NULL, ?)
  `).run(id, req.params.id, front, back, created_at);
  res.status(201).json({ id, deck_id: req.params.id, front, back, interval: 0, ease: 2.5, repetitions: 0, next_review: 0, last_review: null, created_at });
});

app.patch('/api/cards/:id', (req, res) => {
  const { front, back } = req.body;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'card not found' });

  const updates = [];
  const values = [];
  if (front !== undefined) { updates.push('front = ?'); values.push(front); }
  if (back !== undefined) { updates.push('back = ?'); values.push(back); }
  if (updates.length === 0) return res.json(card);

  values.push(req.params.id);
  db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ...card, ...(front !== undefined && { front }), ...(back !== undefined && { back }) });
});

app.delete('/api/cards/:id', (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'card not found' });
  res.json({ ok: true });
});

// ── Review ─────────────────────────────────────────────

app.get('/api/decks/:id/review', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE deck_id = ? AND next_review <= ?').all(req.params.id, Date.now());
  // Shuffle using Fisher-Yates
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  res.json(cards);
});

app.post('/api/cards/:id/review', (req, res) => {
  const { grade } = req.body;
  if (grade === undefined || ![0, 1, 2].includes(grade)) {
    return res.status(400).json({ error: 'grade must be 0, 1, or 2' });
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'card not found' });

  const updated = schedule(card, grade);
  db.prepare(`
    UPDATE cards SET interval = ?, ease = ?, repetitions = ?, next_review = ?, last_review = ?
    WHERE id = ?
  `).run(updated.interval, updated.ease, updated.repetitions, updated.next_review, updated.last_review, req.params.id);

  res.json({ ...card, ...updated });
});

// ── Export / Import ────────────────────────────────────

app.get('/api/export', (_req, res) => {
  const decks = db.prepare('SELECT * FROM decks').all();
  const cards = db.prepare('SELECT * FROM cards').all();
  res.json({ decks, cards });
});

app.post('/api/import', (req, res) => {
  const { decks, cards } = req.body;
  if (!Array.isArray(decks) || !Array.isArray(cards)) {
    return res.status(400).json({ error: 'decks and cards arrays are required' });
  }

  const importData = db.transaction(() => {
    db.prepare('DELETE FROM cards').run();
    db.prepare('DELETE FROM decks').run();

    const insertDeck = db.prepare('INSERT INTO decks (id, name, color, created_at) VALUES (?, ?, ?, ?)');
    for (const d of decks) {
      insertDeck.run(d.id, d.name, d.color, d.created_at);
    }

    const insertCard = db.prepare(`
      INSERT INTO cards (id, deck_id, front, back, interval, ease, repetitions, next_review, last_review, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of cards) {
      insertCard.run(c.id, c.deck_id, c.front, c.back, c.interval, c.ease, c.repetitions, c.next_review, c.last_review, c.created_at);
    }
  });

  importData();
  res.json({ ok: true, decks: decks.length, cards: cards.length });
});

// SPA fallback — serve index.html for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
