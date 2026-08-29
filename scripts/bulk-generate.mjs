// Bulk problem generator: tops every concept up to a target number of FRESH
// problems so sessions and practice pull from the bank instantly instead of
// generating on demand.
//
// Usage: node scripts/bulk-generate.mjs [--per-concept 4] [--concurrency 4]
//
// Reads ANTHROPIC_API_KEY + VITE_SUPABASE_* from .env.local. Same model
// config as the API endpoint (PROBLEM_GEN_MODEL / PROBLEM_GEN_EFFORT).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildSystemPrompt,
  buildUserPrompt,
  OutputSchema,
  toRows,
  MAX_COUNT,
} from '../api/_lib/gen-core.mjs';
import { CONCEPTS_BY_SLUG } from '../src/data/concept-graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const TARGET = Math.max(1, argVal('--per-concept', 4));
const CONCURRENCY = Math.max(1, argVal('--concurrency', 4));

if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing from .env.local');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const model = env.PROBLEM_GEN_MODEL || 'claude-opus-5';
const effort = env.PROBLEM_GEN_EFFORT || (model === 'claude-fable-5' ? 'high' : 'xhigh');

const { data: concepts, error: cErr } = await supabase.from('concepts').select('*');
if (cErr) throw cErr;
const { data: existing, error: pErr } = await supabase.from('problems').select('concept_slug, status, statement');
if (pErr) throw pErr;

const freshCount = {};
const statementsByConcept = {};
for (const p of existing) {
  if (p.status === 'fresh') freshCount[p.concept_slug] = (freshCount[p.concept_slug] || 0) + 1;
  (statementsByConcept[p.concept_slug] ||= []).push(p.statement.slice(0, 280));
}

const jobs = concepts
  .map((c) => ({ concept: c, need: Math.min(MAX_COUNT, Math.max(0, TARGET - (freshCount[c.slug] || 0))) }))
  .filter((j) => j.need > 0);

const totalWanted = jobs.reduce((n, j) => n + j.need, 0);
console.log(`${new Date().toISOString()} model=${model} effort=${effort}`);
console.log(`${jobs.length} concepts need topping up → ${totalWanted} problems (target ${TARGET} fresh each)`);

let done = 0;
let generated = 0;
let failed = 0;

async function generateFor({ concept, need }) {
  const graph = CONCEPTS_BY_SLUG[concept.slug];
  const payload = {
    concept: {
      slug: concept.slug,
      name: concept.name,
      scope: concept.scope || '',
      styles: concept.styles || [],
      encompassNames: (graph?.encompasses || []).map((e) => CONCEPTS_BY_SLUG[e.slug]?.name).filter(Boolean),
    },
    count: need,
    difficulty: 1,
    avoid: (statementsByConcept[concept.slug] || []).slice(0, 12),
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.beta.messages
        .stream({
          model,
          max_tokens: 64000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort, format: zodOutputFormat(OutputSchema) },
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: buildUserPrompt(payload) }],
        })
        .finalMessage();

      if (response.stop_reason === 'refusal') throw new Error('refused: ' + JSON.stringify(response.stop_details));
      const text = response.content.find((b) => b.type === 'text')?.text || '';
      const output = OutputSchema.parse(JSON.parse(text));
      const rows = toRows(output, concept.slug, 1);
      const { error } = await supabase.from('problems').insert(rows);
      if (error) throw error;
      generated += rows.length;
      done++;
      console.log(`[${done}/${jobs.length}] ${concept.slug}: +${rows.length}`);
      return;
    } catch (err) {
      const retryable = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError;
      if (retryable && attempt < 3) {
        const wait = 30000 * attempt;
        console.log(`  ${concept.slug}: ${err.constructor.name}, retry ${attempt}/3 in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      done++;
      failed++;
      console.error(`[${done}/${jobs.length}] ${concept.slug}: FAILED — ${err.message?.slice(0, 200)}`);
      return;
    }
  }
}

// Simple worker pool
const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      await generateFor(job);
    }
  })
);

console.log(`${new Date().toISOString()} DONE: generated ${generated} problems, ${failed} concept(s) failed`);
