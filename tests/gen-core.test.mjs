// Tests for the problem-generation endpoint's pure logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequest,
  buildSystemPrompt,
  buildUserPrompt,
  OutputSchema,
  toRows,
  MAX_COUNT,
  MAX_AVOID,
} from '../api/_lib/gen-core.mjs';

const CONCEPT = { slug: 'backprop', name: 'Backpropagation', scope: 'gradients', styles: ['derive'], encompassNames: ['Matrix calculus'] };

test('rejects missing body and missing concept', () => {
  assert.ok(parseRequest(null).error);
  assert.ok(parseRequest({}).error);
  assert.ok(parseRequest({ concept: { slug: 'x' } }).error); // no name
});

test('count is clamped to 1..MAX_COUNT and defaults to 1', () => {
  assert.equal(parseRequest({ concept: CONCEPT, count: 0 }).count, 1);
  assert.equal(parseRequest({ concept: CONCEPT, count: 99 }).count, MAX_COUNT);
  assert.equal(parseRequest({ concept: CONCEPT }).count, 1);
  assert.equal(parseRequest({ concept: CONCEPT, count: 'lots' }).count, 1);
});

test('difficulty is 1 unless exactly 2', () => {
  assert.equal(parseRequest({ concept: CONCEPT, difficulty: 2 }).difficulty, 2);
  assert.equal(parseRequest({ concept: CONCEPT, difficulty: 3 }).difficulty, 1);
  assert.equal(parseRequest({ concept: CONCEPT }).difficulty, 1);
});

test('avoid list drops non-strings, truncates, and caps length', () => {
  const avoid = [123, 'ok', 'x'.repeat(1000), ...Array(20).fill('pad')];
  const parsed = parseRequest({ concept: CONCEPT, avoid });
  assert.ok(parsed.avoid.length <= MAX_AVOID);
  assert.ok(parsed.avoid.every((s) => typeof s === 'string' && s.length <= 280));
});

test('prompts carry the key instructions', () => {
  assert.match(buildSystemPrompt(), /NEVER name the concept/);
  const user = buildUserPrompt({ concept: CONCEPT, count: 2, difficulty: 2, avoid: ['old problem'] });
  assert.match(user, /Backpropagation/);
  assert.match(user, /escalated/);
  assert.match(user, /old problem/);
});

test('OutputSchema accepts valid problems and rejects bad ones', () => {
  const good = {
    problems: [{
      style: 'derive',
      target_minutes: 15,
      statement: 'A statement long enough to pass the minimum.',
      answer: '42',
      rubric: 'A rubric that is long enough to pass the forty character minimum, yes.',
      diagram_asy: null,
    }],
  };
  assert.ok(OutputSchema.parse(good));
  assert.throws(() => OutputSchema.parse({ problems: [] }));
  assert.throws(() => OutputSchema.parse({ problems: [{ ...good.problems[0], style: 'vibe' }] }));
});

test('toRows maps to problems-table shape with trimming and null svg', () => {
  const rows = toRows({
    problems: [{
      style: 'compute', target_minutes: 8,
      statement: '  padded statement  ', answer: ' 7 ',
      rubric: ' r '.repeat(20), diagram_asy: 'size(200);',
    }],
  }, 'svd', 2);
  assert.equal(rows[0].concept_slug, 'svd');
  assert.equal(rows[0].statement, 'padded statement');
  assert.equal(rows[0].answer, '7');
  assert.equal(rows[0].difficulty, 2);
  assert.equal(rows[0].diagram_svg, null);
  assert.equal(rows[0].diagram_asy, 'size(200);');
});
