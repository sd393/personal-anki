import { supabase } from './supabase.js';
import { CONCEPTS_BY_SLUG } from '../data/concept-graph.js';

/**
 * Ask the server to generate fresh problems for one concept, then insert
 * them into the bank. The Anthropic key lives server-side only.
 *
 * Difficulty follows §7: escalate at strength 2+ unless the concept is
 * being restored from forgotten.
 */
export async function generateProblemsForConcept(concept, { count = 2 } = {}) {
  const difficulty = concept.state !== 'forgotten' && (concept.strength || 0) >= 2 ? 2 : 1;

  // Recent statements for this concept so the model avoids near-duplicates.
  const { data: recent } = await supabase
    .from('problems')
    .select('statement')
    .eq('concept_slug', concept.slug)
    .order('created_at', { ascending: false })
    .limit(12);

  const graph = CONCEPTS_BY_SLUG[concept.slug];
  const encompassNames = (graph?.encompasses || [])
    .map((e) => CONCEPTS_BY_SLUG[e.slug]?.name)
    .filter(Boolean);

  const res = await fetch('/api/generate-problems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      concept: {
        slug: concept.slug,
        name: concept.name,
        scope: concept.scope,
        styles: concept.styles || [],
        encompassNames,
      },
      count,
      difficulty,
      avoid: (recent || []).map((p) => p.statement.slice(0, 280)),
    }),
  });

  if (!res.ok) {
    let msg = `Generation failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }

  const { problems } = await res.json();
  const { data, error } = await supabase.from('problems').insert(problems).select();
  if (error) throw error;
  return data;
}

/** Generate one problem each for several concepts, in parallel. */
export async function generateForConcepts(concepts, { count = 1 } = {}) {
  const results = await Promise.allSettled(
    concepts.map((c) => generateProblemsForConcept(c, { count }))
  );
  const inserted = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? concepts[i].name : null))
    .filter(Boolean);
  return { inserted, failed };
}
