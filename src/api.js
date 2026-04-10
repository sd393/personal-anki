const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Decks
export const getDecks = () => request('/decks');
export const createDeck = (name, color) => request('/decks', { method: 'POST', body: JSON.stringify({ name, color }) });
export const updateDeck = (id, data) => request(`/decks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteDeck = (id) => request(`/decks/${id}`, { method: 'DELETE' });

// Cards
export const getCards = (deckId) => request(`/decks/${deckId}/cards`);
export const createCard = (deckId, front, back) => request(`/decks/${deckId}/cards`, { method: 'POST', body: JSON.stringify({ front, back }) });
export const updateCard = (id, data) => request(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCard = (id) => request(`/cards/${id}`, { method: 'DELETE' });

// Review
export const getReviewCards = (deckId) => request(`/decks/${deckId}/review`);
export const submitReview = (cardId, grade) => request(`/cards/${cardId}/review`, { method: 'POST', body: JSON.stringify({ grade }) });

// Export / Import
export const exportData = () => request('/export');
export const importData = (data) => request('/import', { method: 'POST', body: JSON.stringify(data) });
