// Tests for topic-scoped session construction (onlySlugs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession } from '../src/lib/problem-scheduler.js';

const NOW = new Date('2026-08-29T12:00:00Z');
const FUTURE = new Date(NOW.getTime() + 30 * 86400000).toISOString();
const mk = (slug, over = {}) => ({
  slug,
  state: 'shaky',
  due: NOW.toISOString(),
  interval_days: 7,
  strength: 0,
  encompasses: [],
  ...over,
});

test('onlySlugs restricts the pool to chosen topics', () => {
  const s = buildSession([mk('a'), mk('b'), mk('c')], {}, NOW, { onlySlugs: ['a', 'c'] });
  assert.deepEqual(s.entries.map((e) => e.concept.slug).sort(), ['a', 'c']);
});

test('chosen topics are included even when not due or not scheduled', () => {
  const concepts = [
    mk('notdue', { due: FUTURE, state: 'retained' }),
    mk('stable1', { state: 'stable', due: null }),
    mk('unknown1', { state: 'unknown', due: null }),
  ];
  const s = buildSession(concepts, {}, NOW, { onlySlugs: ['notdue', 'stable1', 'unknown1'] });
  assert.equal(s.entries.length, 3);
});

test('without onlySlugs the due filter still applies', () => {
  const s = buildSession([mk('a'), mk('later', { due: FUTURE })], {}, NOW);
  assert.deepEqual(s.entries.map((e) => e.concept.slug), ['a']);
});

test('onlySlugs still respects the session cap and coverage greediness', () => {
  const concepts = [
    mk('big', { encompasses: [{ slug: 'x', weight: 0.6 }, { slug: 'y', weight: 0.6 }] }),
    mk('x'), mk('y'), mk('z'), mk('w'), mk('v'),
  ];
  const s = buildSession(concepts, {}, NOW, { onlySlugs: ['big', 'x', 'y', 'z', 'w', 'v'] });
  assert.equal(s.entries.length, 3);
  assert.ok(s.entries.some((e) => e.concept.slug === 'big'));
  // big covers x and y, so they never get their own entries
  assert.ok(!s.entries.some((e) => ['x', 'y'].includes(e.concept.slug)));
});

test('empty selection yields an empty session', () => {
  const s = buildSession([mk('a')], {}, NOW, { onlySlugs: [] });
  assert.equal(s.entries.length, 0);
});
