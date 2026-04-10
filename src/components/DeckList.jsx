import { useState, useEffect, useRef } from 'react';
import { getDecks, createDeck, exportData, importData } from '../api.js';

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
  const fileRef = useRef(null);

  const loadDecks = async () => {
    try {
      setDecks(await getDecks());
    } catch (err) {
      showToast('Failed to load decks');
    }
  };

  useEffect(() => { loadDecks(); }, []);

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

  const handleExport = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flashcards-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported');
    } catch (err) {
      showToast('Export failed');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm(`This will replace all data with ${data.decks?.length || 0} decks and ${data.cards?.length || 0} cards. Continue?`)) return;
      await importData(data);
      showToast('Data imported');
      loadDecks();
    } catch (err) {
      showToast('Import failed: ' + err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="screen">
      <header className="header">
        <h1 className="header-title" style={{ flex: 1 }}>Flashcards</h1>
        <div className="header-actions">
          <button className="btn-icon" onClick={handleExport} title="Export">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 7l4-4 4 4M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button className="btn-icon" onClick={() => fileRef.current?.click()} title="Import">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V3M6 9l4 4 4-4M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} hidden />
        </div>
      </header>

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
