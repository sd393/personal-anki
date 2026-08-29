// Shared logic for the problem-generation endpoint.
// Underscore-prefixed dirs under api/ are not exposed as routes.
import { z } from 'zod';

// One concept per request keeps each function call's latency bounded;
// the client fans out across concepts.
export const MAX_COUNT = 3;
export const MAX_AVOID = 12;
export const MAX_AVOID_CHARS = 280;

export const ProblemSchema = z.object({
  style: z.enum(['compute', 'derive', 'prove', 'diagnose', 'implement', 'estimate']),
  target_minutes: z.number().min(1).max(60),
  statement: z.string().min(20),
  answer: z.string().min(1),
  rubric: z.string().min(40),
  diagram_asy: z.string().nullable(),
});

export const OutputSchema = z.object({
  problems: z.array(ProblemSchema).min(1).max(MAX_COUNT),
});

/** Validate/clamp the request body. Returns { error } or { concept, count, difficulty, avoid }. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'Missing JSON body' };
  const c = body.concept;
  if (!c || typeof c.slug !== 'string' || typeof c.name !== 'string') {
    return { error: 'concept must include slug and name' };
  }
  const count = Math.min(MAX_COUNT, Math.max(1, Math.round(Number(body.count) || 1)));
  const difficulty = Number(body.difficulty) === 2 ? 2 : 1;
  const avoid = (Array.isArray(body.avoid) ? body.avoid : [])
    .filter((s) => typeof s === 'string')
    .slice(0, MAX_AVOID)
    .map((s) => s.slice(0, MAX_AVOID_CHARS));
  return {
    concept: {
      slug: c.slug,
      name: String(c.name).slice(0, 200),
      scope: String(c.scope || '').slice(0, 500),
      styles: (Array.isArray(c.styles) ? c.styles : []).slice(0, 6).map(String),
      encompassNames: (Array.isArray(c.encompassNames) ? c.encompassNames : []).slice(0, 10).map(String),
    },
    count,
    difficulty,
    avoid,
  };
}

export function buildSystemPrompt() {
  return `You generate review problems for a spaced-repetition system used by one learner who is re-learning ML math they once knew. Every problem is used exactly once, so each must be fresh and never-seen.

Formatting rules for statement, answer, and rubric:
- Markdown. Inline math $...$, display math $$...$$ — KaTeX-compatible only (no \\begin{align}; use \\begin{aligned} inside $$). Code in fenced blocks with a language tag.
- NEVER name the concept being tested anywhere in the statement. Diagnosing which tool applies is part of the exercise. No titles or metadata.
- The rubric is hidden until after the attempt and must contain markdown sections: **Key steps** (3–6 steps a correct solution passes through), **Expected form** (what the final answer looks like), **Common wrong turns** (2–3 realistic mistakes and what they signal).
- answer is the short-form final result (a number, expression, or 1–2 sentence claim). For derive/prove/diagnose problems, give the 1–2 sentence destination the work should arrive at.
- target_minutes: realistic for someone who once knew this — typically 5–10 for compute/estimate, 10–20 for derive/prove/implement.
- Diagrams: strongly prefer problems that need no diagram (they cannot be rendered immediately). Set diagram_asy to null unless a diagram is truly essential; if essential, provide plain 2D Asymptote starting with size(200); using only draw/label/dot/arrow, compilable by asy -f svg.`;
}

export function buildUserPrompt({ concept, count, difficulty, avoid }) {
  const lines = [
    `Generate ${count} problem${count === 1 ? '' : 's'} testing this concept:`,
    '',
    `Concept: ${concept.name}`,
    concept.scope ? `Scope (what problems should test): ${concept.scope}` : null,
    concept.styles.length ? `Allowed styles for this concept: ${concept.styles.join(', ')} — pick the best fit per problem (vary them if generating several).` : null,
    concept.encompassNames.length
      ? `Skills implicitly exercised (fine to require them in service of the main concept): ${concept.encompassNames.join(', ')}`
      : null,
    '',
    difficulty === 2
      ? 'Difficulty: escalated — longer derivations, adversarial variants, or chaining 2–3 of the implicit skills in one problem.'
      : 'Difficulty: standard — single concept in focus, easy-to-moderate.',
  ].filter((l) => l !== null);

  if (avoid.length > 0) {
    lines.push('', 'The learner has already seen problems beginning with the following — produce something clearly different in setup and numbers:');
    for (const a of avoid) lines.push(`- ${a.replace(/\n/g, ' ')}`);
  }
  return lines.join('\n');
}

/** Turn validated model output into rows ready for the problems table. */
export function toRows(output, conceptSlug, difficulty) {
  return output.problems.map((p) => ({
    concept_slug: conceptSlug,
    statement: p.statement.trim(),
    answer: p.answer.trim(),
    rubric: p.rubric.trim(),
    diagram_asy: p.diagram_asy ? p.diagram_asy.trim() : null,
    diagram_svg: null,
    style: p.style,
    difficulty,
    target_minutes: p.target_minutes,
  }));
}
