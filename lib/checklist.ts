import type { Challenge } from './types';

/**
 * Keeps only real checklist items and removes duplicates from older entries.
 * The returned order always matches the challenge configuration.
 */
export function validChecklistDone(challenge: Challenge, done: string[] = []) {
  const selected = new Set(done);
  return (challenge.config.items ?? [])
    .filter((item) => selected.has(item.key))
    .map((item) => item.key);
}

