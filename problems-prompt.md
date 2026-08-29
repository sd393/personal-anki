# Problem Generation Prompt

Use this prompt with Claude/ChatGPT to generate fresh problems for the review system,
then insert them with `node scripts/insert-problems.mjs problems.json`.

Paste everything below the line, plus the relevant concept entries from
`~/Downloads/review-system-spec.md` §2 (or `src/data/concept-graph.js`), plus a list of
how many problems you want per concept and at what difficulty.

---

You are generating review problems for a spaced-repetition system for someone
re-learning ML math they once knew. Every problem is used exactly once, so
generate fresh, never-seen problems each time.

For each requested concept, output problems as a JSON array with this schema:

```json
[
  {
    "concept": "backprop",
    "style": "derive",
    "difficulty": 1,
    "target_minutes": 15,
    "statement": "...",
    "answer": "...",
    "rubric": "...",
    "diagram_asy": "size(200); ... (optional)"
  }
]
```

Rules:

1. **Never name the concept in the statement.** Diagnosing which tool applies is
   part of the exercise. No titles like "Backprop practice". The statement should
   read like an exam question with zero metadata.
2. **Test the concept's Scope** line, not adjacent trivia. Match the requested
   `style`: `compute` (hand calculation), `derive` (from first principles),
   `prove` (proof or counterexample), `diagnose` (explain a scenario/failure/plot),
   `implement` (short numpy/pytorch from scratch), `estimate` (Fermi-style
   magnitude/scaling).
3. **Difficulty 1** = standard, single concept in focus, easy-to-moderate.
   **Difficulty 2** = escalated: longer derivations, adversarial variants, chains
   2–3 of the concept's encompassed skills in one problem.
4. **Formatting**: statements/answers/rubrics are markdown. Inline math `$...$`,
   display math `$$...$$` (KaTeX-compatible — no `\begin{align}`, use `\begin{aligned}`
   inside `$$`). Code in fenced blocks with a language tag (```python).
5. **Diagrams**: only when they genuinely help (geometry, gridworlds, computational
   graphs, plots to diagnose). Use plain 2D Asymptote: `size(200);` first, standard
   `draw`/`label`/`dot`/`arrow` only, LaTeX in labels is fine. No imports beyond
   `graph` if needed. Keep it self-contained and compilable by `asy -f svg`.
6. **Rubric** (hidden until after the attempt) must contain, as markdown sections:
   - **Key steps** — the 3–6 steps a correct solution passes through
   - **Expected form** — what the final answer should look like
   - **Common wrong turns** — 2–3 realistic mistakes and what they signal
   The rubric is what the learner self-grades against: clean pass = correct,
   unaided, within 1.5× target time; weak pass = correct but slow/hinted;
   fail = wrong or gave up.
7. **`answer`** is the short-form final result (a number, expression, or 1–2
   sentence claim). For derive/prove/diagnose problems where no short answer
   exists, give the 1–2 sentence "destination" the work should arrive at.
8. **`target_minutes`**: realistic solving time for someone who once knew this —
   typically 5–10 for compute/estimate, 10–20 for derive/prove/implement.

Output ONLY the JSON array, no commentary.
