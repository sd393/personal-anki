// One-shot: insert Giftly cards #16-26 into the existing "Giftly" deck.
// Usage: node scripts/insert-giftly-cards.mjs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

const supabase = createClient(url, key);

const cards = [
  ['What percentage of online reviews are fake or ungenuine?', '30% — Capital One, March 2026'],
  ['How accurately can humans spot fake AI-written reviews?', '50.8% — basically a coin flip. arXiv "Hidden Persuaders" paper, 2025'],
  ['How much did Amazon spend fighting fake reviews in 2024?', '$500M and 8,000 employees'],
  ['How many fake reviews did Amazon still block in 2024 despite that spend?', '275 million'],
  ["What percentage of consumers say they don't trust AI shopping agents yet?", '83% — IBM, January 2026'],
  ['How many shopping queries does ChatGPT handle per day?', '50 million'],
  ['How big is the US retail media market in 2026?', '$72 billion'],
  ["What's the year-over-year growth rate of AI-sourced retail traffic?", '1,200%'],
  ['What does McKinsey project the agentic commerce market will be worth by 2030?', '$3–5 trillion'],
  ['What did the Columbia and Yale paper (August 2025) find about AI shopping agents?', 'Different AI agents pick different products from the same query'],
  ['What happens when sellers tweak product descriptions to target AI buyers?', 'They see measurable market-share gains'],
];

const { data: decks, error: deckErr } = await supabase.from('decks').select('id, name');
if (deckErr) throw deckErr;

console.log('Decks found:', decks.map((d) => d.name));

const giftly = decks.find((d) => d.name.toLowerCase().includes('giftly'));
if (!giftly) {
  console.error('No deck matching "Giftly" found. Available decks above.');
  process.exit(1);
}
console.log(`Using deck "${giftly.name}" (${giftly.id})`);

const rows = cards.map(([front, back]) => ({ deck_id: giftly.id, front, back }));

const { data, error } = await supabase.from('cards').insert(rows).select('id, front');
if (error) throw error;

console.log(`Inserted ${data.length} cards:`);
data.forEach((c) => console.log(`  ${c.id}  ${c.front}`));
