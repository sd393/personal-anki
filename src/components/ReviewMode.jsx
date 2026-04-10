import { useState, useEffect } from 'react';
import { getDueCards, reviewCard } from '../lib/api.js';

export default function ReviewMode({ deckId, deckName, navigate, showToast }) {
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getDueCards(deckId)
      .then((data) => {
        setCards(data);
        setLoading(false);
        if (data.length === 0) setDone(true);
      })
      .catch(() => {
        showToast('Failed to load review cards');
        setLoading(false);
        setDone(true);
      });
  }, [deckId, showToast]);

  const handleGrade = async (grade) => {
    try {
      await reviewCard(cards[index].id, grade);
      if (index + 1 >= cards.length) {
        setDone(true);
      } else {
        setIndex(index + 1);
        setShowBack(false);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <header className="header">
          <button className="btn-icon" onClick={() => navigate('deck', { deckId })}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h1 className="header-title">Review</h1>
          <div style={{ width: 36 }} />
        </header>
        <div className="center-message">Loading...</div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="screen">
        <header className="header">
          <div style={{ width: 36 }} />
          <h1 className="header-title">Review Complete</h1>
          <div style={{ width: 36 }} />
        </header>
        <div className="review-done">
          <div className="review-done-icon">&#10003;</div>
          <p className="review-done-text">
            {cards.length === 0
              ? 'No cards due for review!'
              : `You reviewed ${cards.length} card${cards.length === 1 ? '' : 's'}.`}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('deck', { deckId })}>
            Back to Deck
          </button>
        </div>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="screen">
      <header className="header">
        <button className="btn-icon" onClick={() => navigate('deck', { deckId })}>Exit</button>
        <h1 className="header-title">{deckName || 'Review'}</h1>
        <span className="review-counter">{index + 1} / {cards.length}</span>
      </header>

      <div className="review-card" onClick={() => !showBack && setShowBack(true)}>
        <div className="review-card-label">{showBack ? 'Answer' : 'Question'}</div>
        <div className="review-card-text">{showBack ? card.back : card.front}</div>
        {!showBack && <div className="review-card-hint">Tap to reveal</div>}
      </div>

      {showBack ? (
        <div className="review-grades">
          <button className="btn btn-again" onClick={() => handleGrade(0)}>Again</button>
          <button className="btn btn-good" onClick={() => handleGrade(1)}>Good</button>
          <button className="btn btn-easy" onClick={() => handleGrade(2)}>Easy</button>
        </div>
      ) : (
        <button className="btn btn-primary review-show-btn" onClick={() => setShowBack(true)}>
          Show Answer
        </button>
      )}
    </div>
  );
}
