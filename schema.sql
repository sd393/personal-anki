-- Flashcards schema for Supabase
-- Paste this into the Supabase SQL editor (SQL > New query)
--
-- IMPORTANT: After running this, disable RLS on both tables:
--   1. Go to Authentication > Policies
--   2. Find "decks" and "cards" tables
--   3. Toggle RLS OFF for each (or run the ALTER TABLE commands below)

-- Create decks table
CREATE TABLE IF NOT EXISTS decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create cards table
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid REFERENCES decks(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  interval_days real DEFAULT 0,
  ease real DEFAULT 2.5,
  repetitions integer DEFAULT 0,
  next_review timestamptz DEFAULT now(),
  last_review timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster due-card lookups
CREATE INDEX IF NOT EXISTS idx_cards_deck_review ON cards(deck_id, next_review);

-- Disable RLS (single user, no auth)
ALTER TABLE decks DISABLE ROW LEVEL SECURITY;
ALTER TABLE cards DISABLE ROW LEVEL SECURITY;
