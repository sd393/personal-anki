// Bulk-insert problems from a JSON file into the problem bank.
// Usage: node scripts/insert-problems.mjs path/to/problems.json
//
// JSON format — an array of:
// {
//   "concept": "backprop",           // concept slug (see src/data/concept-graph.js)
//   "style": "derive",               // compute|derive|prove|diagnose|implement|estimate
//   "difficulty": 1,                 // 1 standard, 2 escalated
//   "target_minutes": 15,
//   "statement": "markdown + $latex$ + ```code```",
//   "answer": "short-form answer (optional)",
//   "rubric": "key steps / expected form / common wrong turns",
//   "diagram_asy": "size(200); ..."  // optional — compiled to SVG here via local asy
// }
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compileAsyToSvg } from './asy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/insert-problems.mjs path/to/problems.json');
  process.exit(1);
}

const supabase = createClient(url, key);
const items = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (!Array.isArray(items)) throw new Error('JSON root must be an array of problems');

// Validate slugs against the graph before touching the DB
const { CONCEPTS_BY_SLUG } = await import('../src/data/concept-graph.js');
const bad = items.filter((p) => !CONCEPTS_BY_SLUG[p.concept]);
if (bad.length > 0) {
  console.error('Unknown concept slugs:', bad.map((p) => p.concept).join(', '));
  process.exit(1);
}

const rows = [];
for (const [i, p] of items.entries()) {
  if (!p.statement || !p.rubric) {
    console.error(`Item ${i} (${p.concept}): statement and rubric are required`);
    process.exit(1);
  }
  let diagram_svg = p.diagram_svg || null;
  if (p.diagram_asy && !diagram_svg) {
    process.stdout.write(`Compiling diagram for item ${i} (${p.concept})... `);
    try {
      diagram_svg = compileAsyToSvg(p.diagram_asy);
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.error(String(err.stderr || err.message));
      process.exit(1);
    }
  }
  rows.push({
    concept_slug: p.concept,
    statement: p.statement,
    answer: p.answer || null,
    rubric: p.rubric,
    diagram_asy: p.diagram_asy || null,
    diagram_svg,
    style: p.style || null,
    difficulty: p.difficulty || 1,
    target_minutes: p.target_minutes || 10,
  });
}

const { data, error } = await supabase.from('problems').insert(rows).select('id, concept_slug');
if (error) throw error;

console.log(`Inserted ${data.length} problems:`);
const byConcept = {};
for (const r of data) byConcept[r.concept_slug] = (byConcept[r.concept_slug] || 0) + 1;
for (const [slug, n] of Object.entries(byConcept)) console.log(`  ${slug}: ${n}`);
