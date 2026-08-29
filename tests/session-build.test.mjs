// Tests for AI-first session construction: concepts are chosen by coverage
// regardless of the bank; entries without a banked problem get problem: null
// (the session screen generates those).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession } from '../src/lib/problem-scheduler.js';

const NOW = new Date('2026-08-29T12:00:00Z');
const mk = (slug, over = {}) => ({
  slug,
  state: 'shaky',
  due: NOW.toISOString(),
  interval_days: 7,
  strength: 0,
  encompasses: [],
  ...over,
});

test('concepts with no banked problems are still chosen, with problem null', () => {
  const s = buildSession([mk('a'), mk('b')], {}, NOW);
  assert.equal(s.entries.length, 2);
  assert.ok(s.entries.every((e) => e.problem === null));
  assert.equal(s.toGenerate, 2);
});

test('banked fresh problems are used when available', () => {
  const s = buildSession([mk('a')], { a: [{ id: 'p1', difficulty: 1 }] }, NOW);
  assert.equal(s.entries[0].problem.id, 'p1');
  assert.equal(s.toGenerate, 0);
});

test('coverage still drives selection even with an empty bank', () => {
  const concepts = [
    mk('backprop', { encompasses: [{ slug: 'chain-rule', weight: 0.6 }, { slug: 'matrix-calc', weight: 0.6 }] }),
    mk('chain-rule'),
    mk('matrix-calc'),
  ];
  const s = buildSession(concepts, {}, NOW);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].concept.slug, 'backprop');
  assert.deepEqual(s.entries[0].covered.sort(), ['chain-rule', 'matrix-calc']);
});

test('cap and overflow unchanged', () => {
  const s = buildSession(['a', 'b', 'c', 'd', 'e'].map((x) => mk(x)), {}, NOW);
  assert.equal(s.entries.length, 3);
  assert.equal(s.overflow.length, 2);
});

test('empty pool yields an empty session', () => {
  assert.deepEqual(buildSession([], {}, NOW), { entries: [], overflow: [], toGenerate: 0 });
});

test('mixed: banked problem counts against toGenerate only where missing', () => {
  const s = buildSession([mk('a'), mk('b')], { a: [{ id: 'p1', difficulty: 1 }] }, NOW);
  assert.equal(s.entries.length, 2);
  assert.equal(s.toGenerate, 1);
});
