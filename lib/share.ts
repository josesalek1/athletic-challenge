import type { Challenge, Payload } from './types';
import { validChecklistDone } from './checklist';
import { mmss } from './format';

// Único lugar donde se compone el mensaje para el grupo.
export function dayLine(
  dayNumber: number,
  results: { challenge: Challenge; payload: Payload }[]
) {
  const parts = results
    .filter(({ challenge }) => challenge.visibility === 'group')
    .map(({ challenge, payload }) => {
      if (challenge.kind === 'timed' && payload.seconds) {
        return `${challenge.name} ${mmss(payload.seconds)}`;
      }
      if (challenge.kind === 'reps' && payload.reps) {
        return `${challenge.name} x${payload.reps}`;
      }
      if (challenge.kind === 'done' && payload.ok) {
        return challenge.name;
      }
      if (challenge.kind === 'checklist' && payload.done?.length) {
        const items = challenge.config.items ?? [];
        const done = validChecklistDone(challenge, payload.done);
        const count = `${done.length}/${items.length}`;

        if (challenge.config.share === 'count') {
          return done.length === items.length
            ? `${challenge.name} ✓`
            : `${challenge.name} ${count}`;
        }

        const names = done
          .map((k) => items.find((i) => i.key === k))
          .filter(Boolean)
          .sort((a, b) => a!.n - b!.n)
          .map((i) => i!.name);
        return `${names.join(' · ')} (${count})`;
      }
      return null;
    });

  const body = parts.filter(Boolean).join(' | ');
  return body ? `Day ${dayNumber} ✅ ${body}` : `Day ${dayNumber} — nothing logged`;
}

export function waLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function isLogged(p: Payload | undefined) {
  if (!p) return false;
  return Boolean(p.seconds || p.reps || p.done?.length || p.ok);
}
