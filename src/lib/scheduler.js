/**
 * SM-2 spaced repetition algorithm.
 *
 * @param {{ interval_days: number, ease: number, repetitions: number }} card
 * @param {0 | 1 | 2} grade  0 = again, 1 = good, 2 = easy
 * @returns {{ interval_days: number, ease: number, repetitions: number, next_review: string, last_review: string }}
 */
export function schedule(card, grade) {
  let { interval_days, ease, repetitions } = card;
  const now = new Date();

  if (grade === 0) {
    // Again
    interval_days = 1;
    ease = Math.max(1.3, ease - 0.2);
    repetitions = 0;
  } else if (grade === 1) {
    // Good
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 3;
    else interval_days = Math.round(interval_days * ease);
    repetitions += 1;
  } else if (grade === 2) {
    // Easy
    if (repetitions === 0) interval_days = 2;
    else if (repetitions === 1) interval_days = 4;
    else interval_days = Math.round(interval_days * ease * 1.3);
    ease = Math.min(3.0, ease + 0.15);
    repetitions += 1;
  }

  const next_review = new Date(now.getTime() + interval_days * 86400000).toISOString();
  const last_review = now.toISOString();

  return { interval_days, ease, repetitions, next_review, last_review };
}
