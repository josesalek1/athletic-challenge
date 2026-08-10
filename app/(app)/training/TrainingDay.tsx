'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLAN, PROGRESSION, type Exercise } from '@/lib/plan';
import { mmss } from '@/lib/format';
import {
  hasQueuedTrainingSession,
  isNetworkFailure,
  queueMutation,
  queuedSwimSession,
  queuedTrainingSets,
  removeQueuedMutation,
} from '@/lib/offline';

type SetRow = {
  id?: string;
  day: string;
  slot: string;
  exercise_key: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  seconds: number | null;
};

type SwimRow = {
  distance_m: number | null;
  duration_s: number | null;
  stroke: string | null;
  rpe: number | null;
  notes: string | null;
};

export default function TrainingDay({
  slotKey,
  day,
  todaySets,
  history,
  done,
  userId,
  todaySwim,
}: {
  slotKey: string;
  day: string;
  todaySets: SetRow[];
  history: SetRow[];
  done: boolean;
  userId: string;
  todaySwim: SwimRow | null;
}) {
  const supabase = createClient();
  const slot = PLAN.find((s) => s.key === slotKey)!;

  const [sets, setSets] = useState<Record<string, { weight: string; reps: string }>>(() =>
    Object.fromEntries(
      todaySets.map((s) => [
        `${s.exercise_key}:${s.set_index}`,
        {
          weight: s.weight_kg != null ? String(s.weight_kg) : '',
          reps: s.seconds != null ? String(s.seconds) : s.reps != null ? String(s.reps) : '',
        },
      ])
    )
  );
  const [finished, setFinished] = useState(done);
  const [busy, setBusy] = useState(false);
  const [swim, setSwim] = useState({
    distance: todaySwim?.distance_m ? String(todaySwim.distance_m) : '',
    duration: todaySwim?.duration_s ? String(Math.round(todaySwim.duration_s / 60)) : '',
    stroke: todaySwim?.stroke ?? 'Mixed',
    rpe: todaySwim?.rpe ? String(todaySwim.rpe) : '',
    notes: todaySwim?.notes ?? '',
  });
  const [swimFeedback, setSwimFeedback] = useState('');

  useEffect(() => {
    void Promise.all([
      queuedTrainingSets(userId, day, slot.key),
      hasQueuedTrainingSession(userId, day, slot.key),
      queuedSwimSession(userId, day),
    ]).then(([pendingSets, pendingSession, pendingSwim]) => {
      if (pendingSets.length) {
        setSets((current) => ({
          ...current,
          ...Object.fromEntries(pendingSets.map((set) => [
            `${set.exercise_key}:${set.set_index}`,
            {
              weight: set.weight_kg != null ? String(set.weight_kg) : '',
              reps: set.seconds != null ? String(set.seconds) : set.reps != null ? String(set.reps) : '',
            },
          ])),
        }));
      }
      if (pendingSession) setFinished(true);
      if (pendingSwim && slot.kind === 'swim') setSwim({
        distance: pendingSwim.distance_m ? String(pendingSwim.distance_m) : '',
        duration: pendingSwim.duration_s ? String(Math.round(pendingSwim.duration_s / 60)) : '',
        stroke: pendingSwim.stroke ?? 'Mixed',
        rpe: pendingSwim.rpe ? String(pendingSwim.rpe) : '',
        notes: pendingSwim.notes ?? '',
      });
    });
  }, [day, slot.key, userId]);

  // La última vez que hiciste cada ejercicio: la referencia para progresar.
  const lastTime = useMemo(() => {
    const out: Record<string, SetRow[]> = {};
    const seenDay: Record<string, string> = {};
    for (const row of history) {
      const k = row.exercise_key;
      if (!seenDay[k]) seenDay[k] = row.day;
      if (row.day !== seenDay[k]) continue;
      (out[k] ??= []).push(row);
    }
    Object.values(out).forEach((rows) => rows.sort((a, b) => a.set_index - b.set_index));
    return out;
  }, [history]);

  function field(ex: Exercise, i: number) {
    return sets[`${ex.key}:${i}`] ?? { weight: '', reps: '' };
  }

  function update(ex: Exercise, i: number, patch: Partial<{ weight: string; reps: string }>) {
    setSets((s) => ({
      ...s,
      [`${ex.key}:${i}`]: { ...field(ex, i), ...patch },
    }));
  }

  async function saveSet(ex: Exercise, i: number) {
    const f = field(ex, i);
    if (!f.reps && !f.weight) return;
    const value = Number(f.reps) || null;
    const mutation = {
      id: `training_set:${userId}:${day}:${slot.key}:${ex.key}:${i}`,
      type: 'training_set' as const,
      user_id: userId,
      day,
      slot: slot.key,
      exercise_key: ex.key,
      set_index: i,
      weight_kg: ex.noLoad || !f.weight ? null : Number(f.weight),
      reps: ex.timed ? null : value,
      seconds: ex.timed ? value : null,
    };

    if (!navigator.onLine) {
      await queueMutation(mutation);
      return;
    }

    try {
      const { error } = await supabase.from('training_sets').upsert({
        user_id: mutation.user_id,
        day: mutation.day,
        slot: mutation.slot,
        exercise_key: mutation.exercise_key,
        set_index: mutation.set_index,
        weight_kg: mutation.weight_kg,
        reps: mutation.reps,
        seconds: mutation.seconds,
      }, { onConflict: 'user_id,day,slot,exercise_key,set_index' });
      if (error) {
        if (isNetworkFailure(error)) await queueMutation(mutation);
        else alert('Could not save that set.');
      } else await removeQueuedMutation(mutation.id);
    } catch (error) {
      if (isNetworkFailure(error)) await queueMutation(mutation);
      else alert('Could not save that set.');
    }
  }

  async function saveSwim() {
    const distance = Math.max(0, Number(swim.distance) || 0);
    const minutes = Math.max(0, Number(swim.duration) || 0);
    if (!distance) {
      setSwimFeedback('Enter the distance completed.');
      return;
    }
    const mutation = {
      id: `swim_session:${userId}:${day}`,
      type: 'swim_session' as const,
      user_id: userId,
      day,
      distance_m: distance,
      duration_s: minutes ? Math.round(minutes * 60) : null,
      stroke: swim.stroke || null,
      rpe: swim.rpe ? Math.min(10, Math.max(1, Number(swim.rpe))) : null,
      notes: swim.notes.trim() || null,
    };
    setBusy(true);
    setSwimFeedback('');
    if (!navigator.onLine) {
      await queueMutation(mutation);
      setBusy(false);
      setSwimFeedback('Saved offline · waiting to sync.');
      return;
    }
    try {
      const { error } = await supabase.from('swim_sessions').upsert({
        user_id: mutation.user_id, day: mutation.day, distance_m: mutation.distance_m,
        duration_s: mutation.duration_s, stroke: mutation.stroke, rpe: mutation.rpe, notes: mutation.notes,
      }, { onConflict: 'user_id,day' });
      if (error) {
        if (isNetworkFailure(error)) {
          await queueMutation(mutation);
          setSwimFeedback('Saved offline · waiting to sync.');
        } else setSwimFeedback('Could not save this swim.');
      } else {
        await removeQueuedMutation(mutation.id);
        setSwimFeedback('Swim saved.');
      }
    } catch (error) {
      if (isNetworkFailure(error)) {
        await queueMutation(mutation);
        setSwimFeedback('Saved offline · waiting to sync.');
      } else setSwimFeedback('Could not save this swim.');
    }
    setBusy(false);
  }

  async function finish() {
    setBusy(true);
    const mutation = {
      id: `training_session:${userId}:${day}:${slot.key}`,
      type: 'training_session' as const,
      user_id: userId,
      day,
      slot: slot.key,
      done: true,
    };

    if (!navigator.onLine) {
      await queueMutation(mutation);
      setBusy(false);
      setFinished(true);
      return;
    }

    try {
      const { error } = await supabase.from('training_sessions').upsert(
        { user_id: userId, day, slot: slot.key, done: true },
        { onConflict: 'user_id,day,slot' }
      );
      if (error) {
        if (isNetworkFailure(error)) await queueMutation(mutation);
        else { setBusy(false); alert('Could not close the session.'); return; }
      } else await removeQueuedMutation(mutation.id);
    } catch (error) {
      if (isNetworkFailure(error)) await queueMutation(mutation);
      else { setBusy(false); alert('Could not close the session.'); return; }
    }

    setBusy(false);
    setFinished(true);
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Private · only you</p>
      <h1 className="display" style={{ fontSize: 34, margin: '8px 0 6px' }}>{slot.name}</h1>
      <p className="muted" style={{ marginBottom: 16 }}>{slot.intent}</p>
      <Link href="/videos" className="btn btn-ghost" style={{ width: '100%', marginBottom: 16 }}>
        Exercise technique library
      </Link>

      <div className="chips">
        {PLAN.filter((s) => s.kind !== 'rest').map((s) => (
          <a key={s.key} href={`/training?slot=${s.key}`} className="chip"
             data-on={s.key === slot.key}>
            {s.name.split(' · ')[0]}
          </a>
        ))}
      </div>

      {slot.note && (
        <div className="card" style={{ borderColor: 'var(--rope)' }}>
          <p className="muted">{slot.note}</p>
        </div>
      )}

      {slot.kind === 'rest' && (
        <p className="empty">Rest day. Walk, move a little, and eat enough.</p>
      )}

      {slot.kind === 'swim' && (
        <div className="card swim-log-card">
          {slot.sets!.map((s) => (
            <div key={s.label} className="between"
                 style={{ padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</p>
                <p className="muted" style={{ marginTop: 2 }}>{s.detail}</p>
              </div>
              <p className="num" style={{ fontSize: 14, color: 'var(--water)' }}>{s.meters} m</p>
            </div>
          ))}
          <div className="between" style={{ paddingTop: 12 }}>
            <p className="eyebrow">Total</p>
            <p className="num" style={{ fontSize: 16 }}>
              {slot.sets!.reduce((a, b) => a + b.meters, 0)} m
            </p>
          </div>
          <div className="swim-log-form">
            <p className="eyebrow">Log actual swim</p>
            <div className="swim-fields">
              <div><label>Distance · m</label><input inputMode="numeric" type="number" min="0" value={swim.distance} onChange={(event) => setSwim((value) => ({ ...value, distance: event.target.value }))} /></div>
              <div><label>Duration · min</label><input inputMode="decimal" type="number" min="0" step="0.5" value={swim.duration} onChange={(event) => setSwim((value) => ({ ...value, duration: event.target.value }))} /></div>
              <div><label>Style</label><select value={swim.stroke} onChange={(event) => setSwim((value) => ({ ...value, stroke: event.target.value }))}><option>Mixed</option><option>Freestyle</option><option>Breaststroke</option><option>Backstroke</option><option>Butterfly</option></select></div>
              <div><label>Effort · 1–10</label><input inputMode="numeric" type="number" min="1" max="10" value={swim.rpe} onChange={(event) => setSwim((value) => ({ ...value, rpe: event.target.value }))} /></div>
              <div className="swim-notes"><label>Notes</label><textarea rows={2} maxLength={300} value={swim.notes} onChange={(event) => setSwim((value) => ({ ...value, notes: event.target.value }))} /></div>
            </div>
            <button className="btn-water" disabled={busy} onClick={saveSwim}>{busy ? 'Saving…' : 'Save swim details'}</button>
            {swimFeedback && <p className="muted settings-feedback">{swimFeedback}</p>}
          </div>
        </div>
      )}

      {slot.kind === 'strength' &&
        slot.exercises!.map((ex) => {
          const prev = lastTime[ex.key] ?? [];
          return (
            <div key={ex.key} className="card">
              <div className="between">
                <p style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>{ex.name}</p>
                <p className="num" style={{ fontSize: 12, color: 'var(--mist)' }}>
                  {ex.sets} × {ex.reps}{ex.perSide ? '/side' : ''}
                </p>
              </div>
              <p className="check-hint">{ex.cue}</p>
              <details className="movement-guide">
                <summary>How to do it</summary>
                <p className="muted">{ex.how}</p>
              </details>

              {prev.length > 0 && (
                <p className="num" style={{ fontSize: 11, color: 'var(--water)', marginBottom: 10 }}>
                  Last time ·{' '}
                  {prev
                    .map((p) =>
                      p.seconds != null
                        ? mmss(p.seconds)
                        : `${p.weight_kg ? p.weight_kg + 'kg ' : ''}${p.reps ?? '–'}`
                    )
                    .join('  ')}
                </p>
              )}

              <div className="stack">
                {Array.from({ length: ex.sets }).map((_, idx) => {
                  const i = idx + 1;
                  const f = field(ex, i);
                  const filled = Boolean(f.reps);
                  return (
                    <div key={i} className="row" style={{ gap: 8 }}>
                      <span className="check-n" data-filled={filled}
                            style={{ flex: '0 0 30px',
                                     borderColor: filled ? 'var(--water)' : 'var(--line)',
                                     color: filled ? 'var(--water)' : 'var(--mist)' }}>
                        {i}
                      </span>
                      {!ex.noLoad && !ex.timed && (
                        <input inputMode="decimal" placeholder="kg" value={f.weight}
                               onChange={(e) => update(ex, i, { weight: e.target.value })}
                               onBlur={() => saveSet(ex, i)}
                               style={{ flex: 1, textAlign: 'right' }} />
                      )}
                      <input inputMode="numeric"
                             placeholder={ex.timed ? 'sec' : 'reps'} value={f.reps}
                             onChange={(e) => update(ex, i, { reps: e.target.value })}
                             onBlur={() => saveSet(ex, i)}
                             style={{ flex: 1, textAlign: 'right' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      {slot.kind !== 'rest' && (
        <>
          <button className={finished ? 'btn-ghost' : 'btn-rope'}
                  style={{ width: '100%', marginBottom: 12 }}
                  onClick={finish} disabled={busy || finished}>
            {finished ? 'Session complete ✓' : 'Finish session'}
          </button>
          <p className="muted" style={{ paddingBottom: 10 }}>{PROGRESSION}</p>
        </>
      )}
    </main>
  );
}
