// Compile diagrams for problems that have Asymptote source but no SVG yet
// (e.g. problems authored in the in-app form, where asy can't run).
// Usage: node scripts/compile-diagrams.mjs

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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { data: pending, error } = await supabase
  .from('problems')
  .select('id, concept_slug, diagram_asy')
  .not('diagram_asy', 'is', null)
  .is('diagram_svg', null);
if (error) throw error;

if (pending.length === 0) {
  console.log('No diagrams to compile.');
  process.exit(0);
}

let ok = 0;
for (const p of pending) {
  process.stdout.write(`${p.id} (${p.concept_slug})... `);
  try {
    const svg = compileAsyToSvg(p.diagram_asy);
    const { error: upErr } = await supabase.from('problems').update({ diagram_svg: svg }).eq('id', p.id);
    if (upErr) throw upErr;
    console.log('ok');
    ok++;
  } catch (err) {
    console.log('FAILED: ' + String(err.stderr || err.message).split('\n')[0]);
  }
}
console.log(`Compiled ${ok}/${pending.length} diagrams.`);
