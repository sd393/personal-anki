import { useState, useEffect, useRef } from 'react';
import { getCards, getDecks, renameDeck, deleteDeck, deleteCard, updateCard } from '../lib/api.js';

export default function DeckView({ deckId, navigate, showToast }) {
  const [deck, setDeck] = useState(null);
  const [allDecks, setAllDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [editing, setEditing] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [movingCard, setMovingCard] = useState(null);
  const nameRef = useRef(null);

  const loadData = async () => {
    try {
      const [decks, cardList] = await Promise.all([getDecks(), getCards(deckId)]);
      const d = decks.find((dk) => dk.id === deckId);
      if (d) {
        setDeck(d);
        setDeckName(d.name);
      }
      setAllDecks(decks);
      setCards(cardList);
    } catch (err) {
      showToast('Error loading deck');
    }
  };

  useEffect(() => { loadData(); }, [deckId]);

  useEffect(() => {
    if (editing && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editing]);

  const handleRename = async () => {
    setEditing(false);
    const trimmed = deckName.trim();
    if (!trimmed || trimmed === deck.name) {
      setDeckName(deck.name);
      return;
    }
    try {
      await renameDeck(deckId, trimmed);
      setDeck({ ...deck, name: trimmed });
      showToast('Deck renamed');
    } catch (err) {
      showToast('Error renaming deck');
      setDeckName(deck.name);
    }
  };

  const handleDeleteDeck = async () => {
    if (!confirm(`Delete "${deck.name}" and all its cards?`)) return;
    try {
      await deleteDeck(deckId);
      showToast('Deck deleted');
      navigate('home');
    } catch (err) {
      showToast('Error deleting deck');
    }
  };

  const handleMoveCard = async (targetDeck) => {
    const card = movingCard;
    setMovingCard(null);
    try {
      await updateCard(card.id, { deck_id: targetDeck.id });
      setCards(cards.filter((c) => c.id !== card.id));
      showToast(`Moved to "${targetDeck.name}"`);
    } catch (err) {
      showToast('Error moving card');
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!confirm('Delete this card?')) return;
    try {
      await deleteCard(cardId);
      setCards(cards.filter((c) => c.id !== cardId));
      showToast('Card deleted');
    } catch (err) {
      showToast('Error deleting card');
    }
  };

  if (!deck) {
    return (
      <div className="screen">
        <div className="center-message">Loading...</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('home')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {editing ? (
          <input
            ref={nameRef}
            className="header-title-input"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditing(false); setDeckName(deck.name); } }}
          />
        ) : (
          <h1 className="header-title header-title-editable" onClick={() => setEditing(true)}>
            {deck.name}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 6, opacity: 0.5 }}><path d="M10 1.5l2.5 2.5M1.5 12.5l.5-2.5L9.5 2.5 12 5l-7.5 7.5-2.5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </h1>
        )}
        {deck.due_count > 0 && (
          <button className="btn btn-sm btn-review" onClick={() => navigate('review', { deckId, deckName: deck.name })}>
            Review ({deck.due_count})
          </button>
        )}
      </header>

      <button className="btn btn-primary btn-block" onClick={() => navigate('addCard', { deckId })} style={{ marginBottom: 16 }}>
        + Add Card
      </button>

      {cards.length === 0 ? (
        <div className="center-message">No cards yet. Add your first card!</div>
      ) : (
        <div className="card-list">
          {cards.map((card) => (
            <div key={card.id} className="card-row">
              <div className="card-row-content" onClick={() => navigate('editCard', { deckId, card })}>
                <div className="card-row-front">{card.front}</div>
                <div className="card-row-back">{card.back}</div>
              </div>
              <div className="card-row-actions">
                <button className="btn-icon btn-sm" title="Move to another deck" onClick={() => setMovingCard(card)}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M13 3l4 4-4 4M17 7H7M7 17l-4-4 4-4M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button className="btn-icon btn-sm" onClick={() => navigate('editCard', { deckId, card })}>
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M10 1.5l2.5 2.5M1.5 12.5l.5-2.5L9.5 2.5 12 5l-7.5 7.5-2.5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button className="btn-icon btn-sm btn-danger" onClick={() => handleDeleteCard(card.id)}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6v10a1 1 0 001 1h6a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-danger-text btn-block" onClick={handleDeleteDeck} style={{ marginTop: 24 }}>
        Delete Deck
      </button>

      {movingCard && (
        <div className="modal-overlay" onClick={() => setMovingCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Move card to…</h2>
            <p className="move-card-preview">{movingCard.front}</p>
            <div className="deck-pick-list">
              {allDecks.filter((d) => d.id !== deckId).length === 0 ? (
                <p className="session-note">No other decks — create one first.</p>
              ) : (
                allDecks
                  .filter((d) => d.id !== deckId)
                  .map((d) => (
                    <button key={d.id} className="deck-pick-row" onClick={() => handleMoveCard(d)}>
                      <span className="deck-pick-dot" style={{ background: d.color }} />
                      <span className="deck-pick-name">{d.name}</span>
                      <span className="deck-pick-count">{d.card_count} cards</span>
                    </button>
                  ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setMovingCard(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
