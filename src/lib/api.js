import { supabase } from './supabase.js';
import { schedule } from './scheduler.js';

// ── Decks ──────────────────────────────────────────

export async function getDecks() {
  const now = new Date().toISOString();

  const { data: decks, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });
  if (deckErr) throw deckErr;

  const { data: cards, error: cardErr } = await supabase
    .from('cards')
    .select('id, deck_id, next_review');
  if (cardErr) throw cardErr;

  return decks.map((deck) => {
    const deckCards = cards.filter((c) => c.deck_id === deck.id);
    return {
      ...deck,
      card_count: deckCards.length,
      due_count: deckCards.filter((c) => c.next_review <= now).length,
    };
  });
}

export async function createDeck(name, color) {
  const { data, error } = await supabase
    .from('decks')
    .insert({ name, color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameDeck(id, name) {
  const { data, error } = await supabase
    .from('decks')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDeckColor(id, color) {
  const { data, error } = await supabase
    .from('decks')
    .update({ color })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDeck(id) {
  const { error } = await supabase.from('decks').delete().eq('id', id);
  if (error) throw error;
}

// ── Cards ──────────────────────────────────────────

export async function getCards(deckId) {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCard(deckId, front, back) {
  const { data, error } = await supabase
    .from('cards')
    .insert({ deck_id: deckId, front, back })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCard(id, fields) {
  const { data, error } = await supabase
    .from('cards')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCard(id) {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}

// ── Review ─────────────────────────────────────────

export async function getDueCards(deckId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('deck_id', deckId)
    .lte('next_review', now);
  if (error) throw error;

  // Shuffle (Fisher-Yates)
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }
  return data;
}

export async function reviewCard(id, grade) {
  const { data: card, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const updates = schedule(card, grade);

  const { data, error } = await supabase
    .from('cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
