-- Problems / concept-review schema for Supabase
-- Paste this into the Supabase SQL editor (SQL > New query), same as schema.sql.
--
-- The review system schedules CONCEPTS, not problems (see review-system-spec).
-- Problems are a bank of fresh, single-use exercises attached to a concept.
-- The concept graph itself is seeded automatically by the app on first visit
-- to the Problems screen (from src/data/concept-graph.js).

-- Concept graph + per-concept scheduling state
CREATE TABLE IF NOT EXISTS concepts (
  slug text PRIMARY KEY,
  name text NOT NULL,
  bucket text NOT NULL,
  section text NOT NULL,
  scope text NOT NULL DEFAULT '',
  styles text[] NOT NULL DEFAULT '{}',
  requires text[] NOT NULL DEFAULT '{}',
  -- [{ "slug": "eigen", "weight": 0.6 }, ...]  weight 0.6 = full, 0.3 = partial
  encompasses jsonb NOT NULL DEFAULT '[]',
  -- unknown | forgotten | shaky | retained | stable
  state text NOT NULL DEFAULT 'unknown',
  interval_days real,
  strength integer NOT NULL DEFAULT 0,      -- consecutive clean passes
  long_streak integer NOT NULL DEFAULT 0,   -- consecutive clean passes at interval >= 90d
  last_reviewed timestamptz,
  due timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Problem bank: every problem is used at most once, then retired
CREATE TABLE IF NOT EXISTS problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_slug text NOT NULL REFERENCES concepts(slug) ON DELETE CASCADE,
  statement text NOT NULL,          -- markdown + $latex$ + ```code fences```
  diagram_asy text,                 -- asymptote source (compiled offline)
  diagram_svg text,                 -- rendered svg shown in the UI
  answer text,                      -- short-form expected answer, shown on reveal
  rubric text NOT NULL,             -- key steps / expected form / common wrong turns
  target_minutes real NOT NULL DEFAULT 10,
  difficulty integer NOT NULL DEFAULT 1,  -- 1 = standard, 2 = escalated (strength 2+)
  style text,                       -- compute | derive | prove | diagnose | implement | estimate
  status text NOT NULL DEFAULT 'fresh',   -- fresh | used
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Attempt log (drives the post-mortem history and lets bad grades be audited)
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid REFERENCES problems(id) ON DELETE SET NULL,
  concept_slug text NOT NULL REFERENCES concepts(slug) ON DELETE CASCADE,
  outcome text NOT NULL,            -- clean | weak | fail
  culprit_slug text,                -- concept blamed by the post-mortem (fails only)
  answer_given text,
  seconds integer,
  revealed_early boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_problems_concept_status ON problems(concept_slug, status);
CREATE INDEX IF NOT EXISTS idx_concepts_due ON concepts(due);
CREATE INDEX IF NOT EXISTS idx_attempts_concept ON attempts(concept_slug, created_at);

-- Single user, no auth (matches existing decks/cards setup)
ALTER TABLE concepts DISABLE ROW LEVEL SECURITY;
ALTER TABLE problems DISABLE ROW LEVEL SECURITY;
ALTER TABLE attempts DISABLE ROW LEVEL SECURITY;
