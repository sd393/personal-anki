/**
 * SM-2 spaced repetition algorithm.
 *
 * @param {{ interval: number, ease: number, repetitions: number }} card
 * @param {0 | 1 | 2} grade  0 = again, 1 = good, 2 = easy
 * @returns {{ interval: number, ease: number, repetitions: number, next_review: number, last_review: number }}
 */
export function schedule(card, grade) {
  let { interval, ease, repetitions } = card;
  const now = Date.now();

  if (grade === 0) {
    // Again
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    repetitions = 0;
  } else if (grade === 1) {
    // Good
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 3;
    else interval = Math.round(interval * ease);
    repetitions += 1;
  } else if (grade === 2) {
    // Easy
    if (repetitions === 0) interval = 2;
    else if (repetitions === 1) interval = 4;
    else interval = Math.round(interval * ease * 1.3);
    ease = Math.min(3.0, ease + 0.15);
    repetitions += 1;
  }

  return {
    interval,
    ease,
    repetitions,
    next_review: now + interval * 86400000,
    last_review: now,
  };
}
