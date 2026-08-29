import { useState, useEffect } from 'react';
import { getDecks, createDeck } from '../lib/api.js';
import { getConcepts } from '../lib/problems-api.js';
import { duePool } from '../lib/problem-scheduler.js';

const COLORS = [
  '#F87171', '#FB923C', '#FBBF24', '#A3E635',
  '#34D399', '#22D3EE', '#60A5FA', '#818CF8',
  '#A78BFA', '#E879F9', '#FB7185', '#94A3B8',
];

export default function DeckList({ navigate, showToast }) {
  const [decks, setDecks] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [problemsDue, setProblemsDue] = useState(0);

  const loadDecks = async () => {
    try {
      setDecks(await getDecks());
    } catch (err) {
      showToast('Failed to load decks');
    }
  };

  useEffect(() => {
    loadDecks();
    // Tolerate a missing concepts table (schema-problems.sql not run yet)
    getConcepts().then((c) => setProblemsDue(duePool(c).length)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createDeck(newName.trim(), newColor);
      setNewName('');
      setNewColor(COLORS[0]);
      setShowNew(false);
      showToast('Deck created');
      loadDecks();
    } catch (err) {
      showToast('Error creating deck');
    }
  };

  return (
    <div className="screen">
      <header className="header">
        <h1 className="header-title" style={{ flex: 1 }}>Flashcards</h1>
      </header>

      <div className="deck-card problems-entry" onClick={() => navigate('problems')}>
        <div className="deck-card-name">Problem Review</div>
        <div className="deck-card-stats">
          Concept-scheduled problems
          {problemsDue > 0 && <span className="deck-card-due"> &middot; {problemsDue} concept{problemsDue === 1 ? '' : 's'} due</span>}
        </div>
      </div>

      {decks.length === 0 && !showNew ? (
        <div className="center-message">No decks yet. Create one to get started!</div>
      ) : (
        <div className="deck-grid">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="deck-card"
              style={{ borderLeftColor: deck.color }}
              onClick={() => navigate('deck', { deckId: deck.id })}
            >
              <div className="deck-card-name">{deck.name}</div>
              <div className="deck-card-stats">
                {deck.card_count} card{deck.card_count !== 1 ? 's' : ''}
                {deck.due_count > 0 && (
                  <span className="deck-card-due"> &middot; {deck.due_count} due</span>
                )}
              </div>
              {deck.due_count > 0 && (
                <button
                  className="btn btn-sm btn-play"
                  onClick={(e) => { e.stopPropagation(); navigate('review', { deckId: deck.id, deckName: deck.name }); }}
                >
                  &#9654; Review
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2 className="modal-title">New Deck</h2>
            <input
              className="form-input"
              placeholder="Deck name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${newColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>Create</button>
            </div>
          </form>
        </div>
      )}

      <button className="fab" onClick={() => setShowNew(true)}>+</button>
    </div>
  );
}
