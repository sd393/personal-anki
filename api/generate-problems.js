// POST /api/generate-problems — generates fresh problems for ONE concept
// using the Claude API. Runs server-side only: the API key never reaches
// the browser. The client inserts the returned rows into Supabase itself.
//
// Body: { concept: {slug, name, scope, styles, encompassNames}, count, difficulty, avoid: [statements] }
// Env:  ANTHROPIC_API_KEY (required)
//       PROBLEM_GEN_MODEL  — default claude-opus-5 (set claude-fable-5 for the Mythos-class model)
//       PROBLEM_GEN_EFFORT — default xhigh on Opus, high on Fable
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  parseRequest,
  buildSystemPrompt,
  buildUserPrompt,
  OutputSchema,
  toRows,
} from './_lib/gen-core.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
  }

  const parsed = parseRequest(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { concept, count, difficulty, avoid } = parsed;

  const model = process.env.PROBLEM_GEN_MODEL || 'claude-opus-5';
  const effort = process.env.PROBLEM_GEN_EFFORT || (model === 'claude-fable-5' ? 'high' : 'xhigh');

  const client = new Anthropic();

  try {
    // Stream to avoid HTTP timeouts on long generations; we only need the
    // final message, not incremental events.
    const response = await client.beta.messages
      .stream({
        model,
        max_tokens: 32000,
        // Server-side refusal fallbacks (recommended default for Opus 5 / Fable 5)
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort,
          format: zodOutputFormat(OutputSchema),
        },
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt({ concept, count, difficulty, avoid }) }],
      })
      .finalMessage();

    if (response.stop_reason === 'refusal') {
      console.error('Generation refused', response.stop_details);
      return res.status(502).json({ error: 'The model declined this request' });
    }

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const output = OutputSchema.parse(JSON.parse(text));
    return res.status(200).json({
      problems: toRows(output, concept.slug, difficulty),
      model: response.model,
    });
  } catch (err) {
    // Detailed error server-side only; vague message to the client.
    console.error('generate-problems failed:', err);
    const status = err?.status === 429 ? 429 : 502;
    return res.status(status).json({
      error: status === 429 ? 'Rate limited — try again in a minute' : 'Generation failed — check server logs',
    });
  }
}
