import { supabase } from './supabase.js';
import { CONCEPTS } from '../data/concept-graph.js';
import {
  initStateUpdate,
  applyOutcome,
  applyFailure,
  trickleDown,
  buildSession,
  duePool,
} from './problem-scheduler.js';

// ── Concepts ───────────────────────────────────────

/**
 * Seed any concepts missing from the DB (first run, or after the graph
 * grows). Never touches scheduling state on existing rows.
 */
export async function ensureConceptsSeeded() {
  const { data: existing, error } = await supabase.from('concepts').select('slug');
  if (error) throw error;

  const have = new Set(existing.map((c) => c.slug));
  const missing = CONCEPTS.filter((c) => !have.has(c.slug)).map((c) => ({
    slug: c.slug,
    name: c.name,
    bucket: c.bucket,
    section: c.section,
    scope: c.scope,
    styles: c.styles,
    requires: c.requires,
    encompasses: c.encompasses,
  }));
  if (missing.length === 0) return 0;

  const { error: insErr } = await supabase.from('concepts').insert(missing);
  if (insErr) throw insErr;
  return missing.length;
}

export async function getConcepts() {
  const { data, error } = await supabase.from('concepts').select('*');
  if (error) throw error;
  // Preserve spec ordering
  const order = new Map(CONCEPTS.map((c, i) => [c.slug, i]));
  data.sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
  return data;
}

/** Diagnostic: manually classify a concept and (re)initialize its schedule. */
export async function setConceptState(slug, state) {
  const { data, error } = await supabase
    .from('concepts')
    .update(initStateUpdate(state))
    .eq('slug', slug)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Problems (bank) ────────────────────────────────

export async function getProblems(conceptSlug) {
  const { data, error } = await supabase
    .from('problems')
    .select('*')
    .eq('concept_slug', conceptSlug)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** slug -> { fresh, used } counts, for the dashboard. */
export async function getProblemCounts() {
  const { data, error } = await supabase.from('problems').select('concept_slug, status');
  if (error) throw error;
  const counts = {};
  for (const p of data) {
    const c = (counts[p.concept_slug] ||= { fresh: 0, used: 0 });
    counts[p.concept_slug][p.status === 'fresh' ? 'fresh' : 'used']++;
  }
  return counts;
}

export async function createProblem(fields) {
  const { data, error } = await supabase.from('problems').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateProblem(id, fields) {
  const { data, error } = await supabase.from('problems').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProblem(id) {
  const { error } = await supabase.from('problems').delete().eq('id', id);
  if (error) throw error;
}

// ── Session ────────────────────────────────────────

/**
 * Build today's session: due concepts within 3 days (or, when `slugs` is
 * given, exactly the user-chosen topics), greedy encompass coverage,
 * ≤3 problems, shuffled (spec §5).
 */
export async function getSession(slugs = null) {
  const concepts = await getConcepts();
  const pool = slugs ? concepts.filter((c) => slugs.includes(c.slug)) : duePool(concepts);

  const freshByConcept = {};
  if (pool.length > 0) {
    const { data: problems, error } = await supabase
      .from('problems')
      .select('*')
      .eq('status', 'fresh')
      .in('concept_slug', pool.map((c) => c.slug));
    if (error) throw error;
    for (const p of problems) (freshByConcept[p.concept_slug] ||= []).push(p);
  }

  const session = buildSession(concepts, freshByConcept, new Date(), { onlySlugs: slugs });
  return { ...session, concepts, dueCount: pool.length };
}

/**
 * Practice mode: next fresh banked problem for one concept, excluding ones
 * already worked this practice run. Returns null when the bank is empty
 * (caller generates on demand).
 */
export async function getPracticeProblem(conceptSlug, excludeIds = []) {
  let q = supabase.from('problems').select('*').eq('concept_slug', conceptSlug).eq('status', 'fresh');
  if (excludeIds.length > 0) q = q.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)];
}

// ── Grading ────────────────────────────────────────

/**
 * Record an attempt and apply all scheduling consequences (§4/§6):
 * clean → grow interval + trickle-down credit;
 * weak  → repeat interval, no trickle-down;
 * fail  → post-mortem culprit demoted, tested concept halved if blocked.
 *
 * mode 'practice' records the attempt and retires the problem but leaves
 * the review schedule untouched.
 *
 * Returns a human-readable list of scheduling changes for the UI.
 */
export async function recordAttempt({ problem, concept, outcome, culpritSlug, answerGiven, seconds, revealedEarly, mode = 'session' }) {
  const changes = [];

  const { error: attErr } = await supabase.from('attempts').insert({
    problem_id: problem.id,
    concept_slug: concept.slug,
    outcome,
    culprit_slug: outcome === 'fail' ? culpritSlug || concept.slug : null,
    answer_given: answerGiven || null,
    seconds: seconds || null,
    revealed_early: !!revealedEarly,
    mode,
  });
  if (attErr) throw attErr;

  // Every problem is single-use: retire it regardless of outcome.
  const { error: probErr } = await supabase
    .from('problems')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', problem.id);
  if (probErr) throw probErr;

  if (mode === 'practice') return changes;

  const concepts = await getConcepts();
  const bySlug = Object.fromEntries(concepts.map((c) => [c.slug, c]));
  const now = new Date();

  if (outcome === 'fail') {
    const culprit = bySlug[culpritSlug] || bySlug[concept.slug];
    const updates = applyFailure(bySlug[concept.slug], culprit, now);
    for (const [slug, fields] of Object.entries(updates)) {
      const { error } = await supabase.from('concepts').update(fields).eq('slug', slug);
      if (error) throw error;
      changes.push(
        fields.state === 'forgotten'
          ? `${bySlug[slug].name} → forgotten, due now (refresher first)`
          : `${bySlug[slug].name} → interval halved to ${Math.round(fields.interval_days)}d`
      );
    }
    return changes;
  }

  const updated = applyOutcome(bySlug[concept.slug], outcome, now);
  const { error } = await supabase.from('concepts').update(updated).eq('slug', concept.slug);
  if (error) throw error;
  changes.push(
    updated.state === 'stable'
      ? `${concept.name} graduated — stable, no longer scheduled`
      : `${concept.name} → next review in ${Math.round(updated.interval_days)}d`
  );

  if (outcome === 'clean') {
    const credits = trickleDown({ ...bySlug[concept.slug], ...updated, encompasses: bySlug[concept.slug].encompasses }, bySlug, now);
    for (const { slug, credit, due } of credits) {
      const { error: cErr } = await supabase.from('concepts').update({ due }).eq('slug', slug);
      if (cErr) throw cErr;
      const days = Math.round(credit * bySlug[slug].interval_days);
      if (days > 0) changes.push(`${bySlug[slug].name} +${days}d implicit credit`);
    }
  }

  return changes;
}

/** History: past attempts with their full problems, newest first. */
export async function getHistory(limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('attempts')
    .select('*, problems(*)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data;
}
