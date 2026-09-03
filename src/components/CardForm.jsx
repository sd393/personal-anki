import { useState, useEffect } from 'react';
import { createCard, updateCard, deleteCard, getDecks } from '../lib/api.js';

export default function CardForm({ deckId, card, navigate, showToast }) {
  const isEdit = !!card;
  const [front, setFront] = useState(card?.front || '');
  const [back, setBack] = useState(card?.back || '');
  const [targetDeckId, setTargetDeckId] = useState(card?.deck_id || deckId);
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getDecks().then(setDecks).catch(() => {});
  }, [isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setLoading(true);
    try {
      if (isEdit) {
        const moved = targetDeckId !== card.deck_id;
        await updateCard(card.id, { front: front.trim(), back: back.trim(), deck_id: targetDeckId });
        showToast(moved ? `Card moved to "${decks.find((d) => d.id === targetDeckId)?.name || 'deck'}"` : 'Card updated');
        navigate('deck', { deckId: targetDeckId });
      } else {
        await createCard(deckId, front.trim(), back.trim());
        showToast('Card added');
        setFront('');
        setBack('');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this card?')) return;
    try {
      await deleteCard(card.id);
      showToast('Card deleted');
      navigate('deck', { deckId });
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('deck', { deckId })}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="header-title">{isEdit ? 'Edit Card' : 'Add Card'}</h1>
        {isEdit && (
          <button className="btn-icon btn-danger" onClick={handleDelete}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M8 6V4h4v2M6 6v10a1 1 0 001 1h6a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </header>

      <form className="card-form" onSubmit={handleSubmit}>
        {isEdit && decks.length > 1 && (
          <label className="form-label">
            Deck
            <select className="form-input" value={targetDeckId} onChange={(e) => setTargetDeckId(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="form-label">
          Front
          <textarea
            className="form-textarea"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Question or prompt..."
            rows={4}
            autoFocus
          />
        </label>
        <label className="form-label">
          Back
          <textarea
            className="form-textarea"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Answer..."
            rows={4}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading || !front.trim() || !back.trim()}>
          {isEdit ? 'Save' : 'Add Card'}
        </button>
      </form>
    </div>
  );
}
