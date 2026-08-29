/**
 * Concept-level scheduler for the problem-review system.
 * Implements review-system-spec §3 (states), §4 (intervals + trickle-down
 * credit), §5 (session construction) and §6 (grading outcomes).
 *
 * All functions are pure: they take concept rows (as stored in Supabase)
 * and return field updates; the API layer persists them.
 */

export const DAY_MS = 86400000;

// §4 base intervals (review mode — savings effect)
export const RESTORED_INTERVAL = 7;   // after a forgotten concept passes
export const SHAKY_INTERVAL = 7;
export const RETAINED_INTERVAL = 30;  // marked retained at diagnostic
export const CLEAN_MULTIPLIER = 2.5;
export const CULPRIT_INTERVAL = 7;
export const GRADUATION_INTERVAL = 90; // 3 consecutive clean passes at >= this → stable
export const GRADUATION_STREAK = 3;

const iso = (d) => new Date(d).toISOString();
const addDays = (now, days) => iso(now.getTime() + days * DAY_MS);

/**
 * §3 — Manually classify a concept (the diagnostic phase).
 * Returns the full scheduling reset for the chosen state.
 */
export function initStateUpdate(state, now = new Date()) {
  switch (state) {
    case 'retained':
      return { state, interval_days: RETAINED_INTERVAL, strength: 0, long_streak: 0, due: addDays(now, RETAINED_INTERVAL), last_reviewed: iso(now) };
    case 'shaky':
      return { state, interval_days: SHAKY_INTERVAL, strength: 0, long_streak: 0, due: addDays(now, SHAKY_INTERVAL), last_reviewed: iso(now) };
    case 'forgotten':
      // Due immediately: gets a refresher + fresh problem next session.
      return { state, interval_days: RESTORED_INTERVAL, strength: 0, long_streak: 0, due: iso(now), last_reviewed: null };
    case 'unknown':
    default:
      return { state: 'unknown', interval_days: null, strength: 0, long_streak: 0, due: null, last_reviewed: null };
  }
}

/**
 * §4/§6 — Apply a clean or weak pass to the concept that was explicitly
 * tested. Fails go through applyFailure instead.
 */
export function applyOutcome(concept, outcome, now = new Date()) {
  const base = { last_reviewed: iso(now) };

  if (outcome === 'clean') {
    if (concept.state === 'forgotten') {
      // Restored: post-relearn interval starts at 7 days, not 1–2.
      return { ...base, state: 'retained', interval_days: RESTORED_INTERVAL, strength: 1, long_streak: 0, due: addDays(now, RESTORED_INTERVAL) };
    }
    const prevInterval = concept.interval_days || RESTORED_INTERVAL;
    const longStreak = prevInterval >= GRADUATION_INTERVAL ? (concept.long_streak || 0) + 1 : 0;
    if (longStreak >= GRADUATION_STREAK) {
      // Graduated: stop scheduling; implicit credit checks can still demote it.
      return { ...base, state: 'stable', interval_days: prevInterval * CLEAN_MULTIPLIER, strength: (concept.strength || 0) + 1, long_streak: longStreak, due: null };
    }
    const interval = prevInterval * CLEAN_MULTIPLIER;
    return { ...base, state: 'retained', interval_days: interval, strength: (concept.strength || 0) + 1, long_streak: longStreak, due: addDays(now, interval) };
  }

  // Weak pass: repeat the interval, no growth, no trickle-down (caller enforces).
  const interval = concept.interval_days || SHAKY_INTERVAL;
  const state = concept.state === 'forgotten' ? 'shaky' : concept.state;
  return { ...base, state, interval_days: interval, strength: concept.strength || 0, long_streak: 0, due: addDays(now, interval) };
}

/**
 * §6 post-mortem — one culprit per failure.
 * Returns { [slug]: updateFields } for every concept touched.
 */
export function applyFailure(failedConcept, culpritConcept, now = new Date()) {
  const updates = {};

  // The culprit is demoted and becomes due immediately (refresher + retry).
  updates[culpritConcept.slug] = {
    state: 'forgotten',
    interval_days: CULPRIT_INTERVAL,
    strength: 0,
    long_streak: 0,
    due: iso(now),
  };

  if (culpritConcept.slug !== failedConcept.slug) {
    // Failure was purely the culprit's fault: the tested concept is
    // intact-but-blocked — halve its interval, keep its state/strength.
    const interval = Math.max(1, (failedConcept.interval_days || SHAKY_INTERVAL) / 2);
    updates[failedConcept.slug] = {
      interval_days: interval,
      long_streak: 0,
      due: addDays(now, interval),
      last_reviewed: iso(now),
    };
  }

  return updates;
}

/**
 * §4 — Fractional implicit repetition (trickle-down credit).
 * Only called on a clean pass of `passedConcept`. One hop only.
 * Returns [{ slug, due }] — pushed-forward due dates for encompassed concepts.
 */
export function trickleDown(passedConcept, conceptsBySlug, now = new Date()) {
  const updates = [];
  for (const { slug, weight } of passedConcept.encompasses || []) {
    const y = conceptsBySlug[slug];
    if (!y) continue;
    // No schedule to push (never scheduled, graduated, or awaiting explicit restore).
    if (!y.due || !y.interval_days || !y.last_reviewed) continue;
    if (y.state === 'stable' || y.state === 'forgotten' || y.state === 'unknown') continue;

    const daysSince = (now.getTime() - new Date(y.last_reviewed).getTime()) / DAY_MS;
    const timingDiscount = Math.min(1, Math.max(0, daysSince / y.interval_days));
    const credit = weight * timingDiscount;
    if (credit <= 0) continue;

    updates.push({
      slug,
      credit,
      due: iso(new Date(y.due).getTime() + credit * y.interval_days * DAY_MS),
    });
  }
  return updates;
}

/** Concepts eligible for a session: scheduled and due within the horizon. */
export function duePool(concepts, now = new Date(), horizonDays = 3) {
  const cutoff = now.getTime() + horizonDays * DAY_MS;
  return concepts.filter(
    (c) =>
      c.due &&
      new Date(c.due).getTime() <= cutoff &&
      ['forgotten', 'shaky', 'retained'].includes(c.state)
  );
}

/**
 * §7 — Difficulty tied to strength; forgotten/post-refresher problems stay easy.
 */
export function pickProblem(concept, freshProblems) {
  if (!freshProblems || freshProblems.length === 0) return null;
  const wantEscalated = concept.state !== 'forgotten' && (concept.strength || 0) >= 2;
  const preferred = freshProblems.filter((p) =>
    wantEscalated ? p.difficulty >= 2 : p.difficulty <= 1
  );
  const pool = preferred.length > 0 ? preferred : freshProblems;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * §5 — Greedy session construction.
 *
 * Concepts are chosen purely by coverage of the due pool; a banked fresh
 * problem is used when one exists, otherwise `problem` is null and the
 * session screen AI-generates one before the session starts.
 *
 * @param {Array} concepts            all concept rows
 * @param {Object} freshByConcept     slug -> array of fresh problem rows
 * @returns {{ entries: [{concept, problem|null, covered}], overflow: string[], toGenerate: number }}
 *   entries  — problems for this session, shuffled, never labeled in the UI
 *   overflow — due concepts beyond the session cap (roll to the next session)
 */
export function buildSession(concepts, freshByConcept, now = new Date(), { cap = 3, horizonDays = 3, onlySlugs = null } = {}) {
  // onlySlugs: user-chosen topics — include them regardless of state or due
  // date; otherwise the pool is whatever the schedule says is due.
  const pool = onlySlugs
    ? concepts.filter((c) => onlySlugs.includes(c.slug))
    : duePool(concepts, now, horizonDays);
  const poolSlugs = new Set(pool.map((c) => c.slug));
  const entries = [];

  const coverage = (c) => {
    let n = 0;
    for (const enc of c.encompasses || []) if (poolSlugs.has(enc.slug)) n++;
    return n;
  };

  while (poolSlugs.size > 0 && entries.length < cap) {
    const candidates = pool.filter((c) => poolSlugs.has(c.slug));
    if (candidates.length === 0) break;

    // Most coverage of other due concepts; tie-break most overdue.
    candidates.sort((a, b) => {
      const cov = coverage(b) - coverage(a);
      if (cov !== 0) return cov;
      return new Date(a.due) - new Date(b.due);
    });
    const chosen = candidates[0];
    const problem = pickProblem(chosen, freshByConcept[chosen.slug]); // null → generate

    const covered = (chosen.encompasses || [])
      .filter((enc) => poolSlugs.has(enc.slug))
      .map((enc) => enc.slug);

    entries.push({ concept: chosen, problem, covered });
    poolSlugs.delete(chosen.slug);
    for (const slug of covered) poolSlugs.delete(slug);
  }

  const overflow = pool.filter((c) => poolSlugs.has(c.slug)).map((c) => c.slug);

  // Interleave: random order, never labeled with the concept.
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  return { entries, overflow, toGenerate: entries.filter((e) => !e.problem).length };
}

/** Grading helper: suggested outcome from timing (§6). */
export function timingVerdict(seconds, targetMinutes) {
  if (!targetMinutes || !seconds) return null;
  return seconds <= targetMinutes * 60 * 1.5 ? 'within' : 'over';
}
