'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Stopwatch from '@/components/Stopwatch';
import Checklist from '@/components/Checklist';
import RepsCounter from '@/components/RepsCounter';
import DoneToggle from '@/components/DoneToggle';
import { dayLine, waLink, isLogged } from '@/lib/share';
import type { Challenge, Entry, Payload } from '@/lib/types';
import { isNetworkFailure, queueMutation, queuedEntries, removeQueuedMutation } from '@/lib/offline';

export default function TodayBoard({
  challenges,
  entries,
  day,
  name,
  userId,
}: {
  challenges: Challenge[];
  entries: Entry[];
  day: string;
  name: string;
  userId: string;
}) {
  const supabase = createClient();
  const [local, setLocal] = useState<Record<string, Payload>>(
    Object.fromEntries(entries.map((e) => [e.challenge_id, e.payload]))
  );
  const [section, setSection] = useState(challenges[0]?.id ?? '');

  useEffect(() => {
    void queuedEntries(userId, day).then((queued) => {
      if (!queued.length) return;
      setLocal((current) => ({
        ...current,
        ...Object.fromEntries(queued.map((item) => [item.challenge_id, item.payload])),
      }));
    });
  }, [day, userId]);

  // Día N contado desde started_on: igual para todo el grupo,
  // entre quien entre y cuando entre.
  const dayNumber = useMemo(() => {
    const starts = challenges.map((c) => c.started_on).filter(Boolean) as string[];
    if (!starts.length) return 1;
    const first = starts.sort()[0];
    const ms =
      new Date(day + 'T12:00:00').getTime() - new Date(first + 'T12:00:00').getTime();
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  }, [challenges, day]);

  async function save(challengeId: string, payload: Payload) {
    setLocal((l) => ({ ...l, [challengeId]: payload }));

    const mutation = {
      id: `entry:${userId}:${day}:${challengeId}`,
      type: 'entry' as const,
      user_id: userId,
      challenge_id: challengeId,
      day,
      payload,
    };

    if (!navigator.onLine) {
      await queueMutation(mutation);
      return;
    }

    try {
      const { error } = await supabase.from('entries').upsert(
        { user_id: userId, challenge_id: challengeId, day, payload },
        { onConflict: 'user_id,challenge_id,day' }
      );
      if (error) {
        if (isNetworkFailure(error)) await queueMutation(mutation);
        else alert('Could not save that result. Try again.');
      } else await removeQueuedMutation(mutation.id);
    } catch (error) {
      if (isNetworkFailure(error)) await queueMutation(mutation);
      else alert('Could not save that result. Try again.');
    }
  }

  const current = challenges.find((c) => c.id === section);

  const results = challenges
    .map((challenge) => ({ challenge, payload: local[challenge.id] ?? {} }))
    .filter(({ payload }) => isLogged(payload));

  const line = dayLine(dayNumber, results);

  function render(c: Challenge) {
    const p = local[c.id] ?? {};
    if (c.kind === 'timed')
      return <Stopwatch challenge={c} initialSeconds={p.seconds}
                        onSave={(seconds) => save(c.id, { seconds })}
                        onClear={() => save(c.id, {})} />;
    if (c.kind === 'reps')
      return <RepsCounter challenge={c} initialReps={p.reps ?? 0}
                          onSave={(reps) => save(c.id, { reps })} />;
    if (c.kind === 'done')
      return <DoneToggle challenge={c} initialDone={Boolean(p.ok)}
                         onSave={(ok) => save(c.id, { ok })} />;
    return <Checklist challenge={c} initialDone={p.done ?? []}
                      onSave={(done) => save(c.id, { done })} />;
  }

  return (
    <main className="wrap">
      <p className="eyebrow">
        {name} ·{' '}
        {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      </p>
      <h1 className="display" style={{ fontSize: 40, margin: '8px 0 20px' }}>
        Day {dayNumber}
      </h1>

      {challenges.length === 0 ? (
        <p className="empty">
          No active challenge.
          <br />
          Turn one on in Supabase: table <code>challenges</code>, column <code>active</code>.
        </p>
      ) : (
        <>
          <div className="chips" role="tablist">
            {challenges.map((c) => (
              <button key={c.id} className="chip" role="tab"
                      data-on={c.id === section}
                      data-logged={isLogged(local[c.id])}
                      aria-selected={c.id === section}
                      onClick={() => setSection(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          {current && render(current)}

          <div className="card">
            <div className="between" style={{ marginBottom: 10 }}>
              <p className="eyebrow">Group report</p>
              <p className="num" style={{ fontSize: 12, color: 'var(--mist)' }}>
                {results.length}/{challenges.length}
              </p>
            </div>
            <p className="num" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>
              {line}
            </p>
            <a className="btn btn-water" style={{ width: '100%' }} href={waLink(line)}
               target="_blank" rel="noopener noreferrer">
              Open in WhatsApp
            </a>
            <p className="muted" style={{ marginTop: 10 }}>
              Pick the group and hit send. The text is already written.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
