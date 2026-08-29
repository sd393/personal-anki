// Tests for the concept scheduler (spec §3–§7 logic).
// Run: npm test   (node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  initStateUpdate,
  applyOutcome,
  applyFailure,
  trickleDown,
  duePool,
  pickProblem,
  buildSession,
  timingVerdict,
} from '../src/lib/problem-scheduler.js';

const NOW = new Date('2026-08-29T12:00:00Z');
const daysFromNow = (iso) => (new Date(iso).getTime() - NOW.getTime()) / DAY_MS;
const isoDaysAgo = (d) => new Date(NOW.getTime() - d * DAY_MS).toISOString();

// ── initStateUpdate (diagnostic classification, §3) ─────────────

test('retained starts at 30 days', () => {
  const u = initStateUpdate('retained', NOW);
  assert.equal(u.interval_days, 30);
  assert.ok(Math.abs(daysFromNow(u.due) - 30) < 0.01);
});

test('shaky starts at 7 days', () => {
  const u = initStateUpdate('shaky', NOW);
  assert.equal(u.interval_days, 7);
  assert.ok(Math.abs(daysFromNow(u.due) - 7) < 0.01);
});

test('forgotten is due immediately with no last_reviewed', () => {
  const u = initStateUpdate('forgotten', NOW);
  assert.equal(daysFromNow(u.due), 0);
  assert.equal(u.last_reviewed, null);
});

test('unknown clears the schedule', () => {
  const u = initStateUpdate('unknown', NOW);
  assert.equal(u.due, null);
  assert.equal(u.interval_days, null);
});

test('bogus state falls back to unknown', () => {
  assert.equal(initStateUpdate('garbage', NOW).state, 'unknown');
});

// ── applyOutcome (§4) ───────────────────────────────────────────

test('clean pass multiplies interval by 2.5', () => {
  const u = applyOutcome({ state: 'retained', interval_days: 30, strength: 1, long_streak: 0 }, 'clean', NOW);
  assert.equal(u.interval_days, 75);
  assert.equal(u.strength, 2);
  assert.ok(Math.abs(daysFromNow(u.due) - 75) < 0.01);
});

test('clean pass on a forgotten concept restores at 7 days', () => {
  const u = applyOutcome({ state: 'forgotten', interval_days: 7, strength: 0, long_streak: 0 }, 'clean', NOW);
  assert.equal(u.state, 'retained');
  assert.equal(u.interval_days, 7);
  assert.equal(u.strength, 1);
});

test('clean pass with null interval does not produce NaN', () => {
  const u = applyOutcome({ state: 'retained', interval_days: null, strength: 0, long_streak: 0 }, 'clean', NOW);
  assert.ok(Number.isFinite(u.interval_days));
});

test('graduation: 3rd consecutive long clean pass → stable, unscheduled', () => {
  const u = applyOutcome({ state: 'retained', interval_days: 100, strength: 5, long_streak: 2 }, 'clean', NOW);
  assert.equal(u.state, 'stable');
  assert.equal(u.due, null);
});

test('short-interval clean pass resets the long streak, no graduation', () => {
  const u = applyOutcome({ state: 'retained', interval_days: 50, strength: 5, long_streak: 2 }, 'clean', NOW);
  assert.equal(u.state, 'retained');
  assert.equal(u.long_streak, 0);
  assert.notEqual(u.due, null);
});

test('weak pass repeats the interval without growth', () => {
  const u = applyOutcome({ state: 'retained', interval_days: 20, strength: 2, long_streak: 1 }, 'weak', NOW);
  assert.equal(u.interval_days, 20);
  assert.equal(u.strength, 2);
  assert.equal(u.long_streak, 0);
  assert.ok(Math.abs(daysFromNow(u.due) - 20) < 0.01);
});

test('weak pass on forgotten promotes only to shaky', () => {
  const u = applyOutcome({ state: 'forgotten', interval_days: 7, strength: 0, long_streak: 0 }, 'weak', NOW);
  assert.equal(u.state, 'shaky');
});

// ── applyFailure (post-mortem, §6) ──────────────────────────────

test('failing with self as culprit demotes only the concept', () => {
  const failed = { slug: 'ppo', interval_days: 40, state: 'retained' };
  const updates = applyFailure(failed, failed, NOW);
  assert.deepEqual(Object.keys(updates), ['ppo']);
  assert.equal(updates.ppo.state, 'forgotten');
  assert.equal(updates.ppo.interval_days, 7);
  assert.equal(daysFromNow(updates.ppo.due), 0);
});

test('failing due to an encompassed culprit halves the tested concept', () => {
  const failed = { slug: 'ppo', interval_days: 40, state: 'retained' };
  const culprit = { slug: 'matrix-calc', interval_days: 60, state: 'retained' };
  const updates = applyFailure(failed, culprit, NOW);
  assert.equal(updates['matrix-calc'].state, 'forgotten');
  assert.equal(updates['matrix-calc'].interval_days, 7);
  assert.equal(updates.ppo.interval_days, 20);
  assert.equal(updates.ppo.state, undefined); // intact-but-blocked: state untouched
});

test('halving a null interval stays finite and ≥ 1', () => {
  const failed = { slug: 'x', interval_days: null };
  const updates = applyFailure(failed, { slug: 'y', interval_days: 10 }, NOW);
  assert.ok(updates.x.interval_days >= 1);
});

// ── trickleDown (§4 fractional implicit repetition) ─────────────

const mkY = (slug, over = {}) => ({
  slug,
  state: 'retained',
  interval_days: 10,
  last_reviewed: isoDaysAgo(10),
  due: NOW.toISOString(),
  ...over,
});

test('full-weight credit at full timing discount pushes due by weight×interval', () => {
  const x = { slug: 'x', encompasses: [{ slug: 'a', weight: 0.6 }] };
  const updates = trickleDown(x, { a: mkY('a') }, NOW);
  assert.equal(updates.length, 1);
  // reviewed 10 days ago, interval 10 → discount 1 → push 0.6 × 10 = 6d
  assert.ok(Math.abs(daysFromNow(updates[0].due) - 6) < 0.01);
});

test('early implicit rep counts for little (timing discount)', () => {
  const x = { slug: 'x', encompasses: [{ slug: 'a', weight: 0.6 }] };
  const updates = trickleDown(x, { a: mkY('a', { last_reviewed: isoDaysAgo(2) }) }, NOW);
  // discount 2/10 = 0.2 → push 0.6 × 0.2 × 10 = 1.2d
  assert.ok(Math.abs(daysFromNow(updates[0].due) - 1.2) < 0.01);
});

test('no credit for stable, forgotten, unknown, unscheduled, or missing concepts', () => {
  const x = {
    slug: 'x',
    encompasses: [
      { slug: 'stable1', weight: 0.6 },
      { slug: 'forgot1', weight: 0.6 },
      { slug: 'unknown1', weight: 0.6 },
      { slug: 'nointerval', weight: 0.6 },
      { slug: 'ghost', weight: 0.6 },
    ],
  };
  const updates = trickleDown(x, {
    stable1: mkY('stable1', { state: 'stable', due: null }),
    forgot1: mkY('forgot1', { state: 'forgotten' }),
    unknown1: mkY('unknown1', { state: 'unknown' }),
    nointerval: mkY('nointerval', { interval_days: null }),
  }, NOW);
  assert.equal(updates.length, 0);
});

test('concept reviewed this instant gets zero credit', () => {
  const x = { slug: 'x', encompasses: [{ slug: 'a', weight: 0.6 }] };
  const updates = trickleDown(x, { a: mkY('a', { last_reviewed: NOW.toISOString() }) }, NOW);
  assert.equal(updates.length, 0);
});

// ── duePool + buildSession (§5) ─────────────────────────────────

const mkConcept = (slug, over = {}) => ({
  slug,
  state: 'retained',
  due: NOW.toISOString(),
  interval_days: 10,
  strength: 0,
  encompasses: [],
  ...over,
});

test('duePool includes the 3-day horizon, excludes stable/unknown/unscheduled', () => {
  const pool = duePool([
    mkConcept('now'),
    mkConcept('soon', { due: new Date(NOW.getTime() + 2 * DAY_MS).toISOString() }),
    mkConcept('later', { due: new Date(NOW.getTime() + 5 * DAY_MS).toISOString() }),
    mkConcept('stable', { state: 'stable' }),
    mkConcept('unknown', { state: 'unknown', due: null }),
    mkConcept('unscheduled', { due: null }),
  ], NOW);
  assert.deepEqual(pool.map((c) => c.slug).sort(), ['now', 'soon']);
});

test('greedy coverage: one encompassing problem clears three due concepts', () => {
  const concepts = [
    mkConcept('backprop', { encompasses: [{ slug: 'chain-rule', weight: 0.6 }, { slug: 'matrix-calc', weight: 0.6 }] }),
    mkConcept('chain-rule'),
    mkConcept('matrix-calc'),
  ];
  const fresh = {
    backprop: [{ id: 1, difficulty: 1 }],
    'chain-rule': [{ id: 2, difficulty: 1 }],
    'matrix-calc': [{ id: 3, difficulty: 1 }],
  };
  const s = buildSession(concepts, fresh, NOW);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].concept.slug, 'backprop');
  assert.deepEqual(s.entries[0].covered.sort(), ['chain-rule', 'matrix-calc']);
  assert.equal(s.missing.length, 0);
});

test('session caps at 3 problems, overflow rolls forward', () => {
  const concepts = ['a', 'b', 'c', 'd', 'e'].map((s) => mkConcept(s));
  const fresh = Object.fromEntries(concepts.map((c) => [c.slug, [{ id: c.slug, difficulty: 1 }]]));
  const s = buildSession(concepts, fresh, NOW);
  assert.equal(s.entries.length, 3);
  assert.equal(s.overflow.length, 2);
});

test('due concepts without fresh problems are reported missing', () => {
  const s = buildSession([mkConcept('a')], {}, NOW);
  assert.equal(s.entries.length, 0);
  assert.deepEqual(s.missing, ['a']);
});

test('a concept covered by another does not need its own problem', () => {
  const concepts = [
    mkConcept('x', { encompasses: [{ slug: 'y', weight: 0.6 }] }),
    mkConcept('y'), // no fresh problems, but covered by x
  ];
  const s = buildSession(concepts, { x: [{ id: 1, difficulty: 1 }] }, NOW);
  assert.equal(s.entries.length, 1);
  assert.equal(s.missing.length, 0);
});

test('empty pool builds an empty session', () => {
  const s = buildSession([], {}, NOW);
  assert.deepEqual(s, { entries: [], missing: [], overflow: [] });
});

// ── pickProblem (§7 difficulty progression) ─────────────────────

test('strength 2+ prefers escalated problems', () => {
  const p = pickProblem(mkConcept('a', { strength: 2 }), [{ difficulty: 1 }, { difficulty: 2 }]);
  assert.equal(p.difficulty, 2);
});

test('forgotten concepts always get standard problems', () => {
  const p = pickProblem(mkConcept('a', { state: 'forgotten', strength: 5 }), [{ difficulty: 1 }, { difficulty: 2 }]);
  assert.equal(p.difficulty, 1);
});

test('falls back to whatever exists when preferred difficulty is absent', () => {
  const p = pickProblem(mkConcept('a', { strength: 3 }), [{ difficulty: 1 }]);
  assert.equal(p.difficulty, 1);
});

test('no fresh problems → null', () => {
  assert.equal(pickProblem(mkConcept('a'), []), null);
  assert.equal(pickProblem(mkConcept('a'), null), null);
});

// ── timingVerdict (§6) ──────────────────────────────────────────

test('timing verdict: 1.5× target is the clean-pass boundary', () => {
  assert.equal(timingVerdict(899, 10), 'within');
  assert.equal(timingVerdict(901, 10), 'over');
  assert.equal(timingVerdict(null, 10), null);
  assert.equal(timingVerdict(120, null), null);
});
