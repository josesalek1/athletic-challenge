'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLAN, PROGRESSION, type Exercise } from '@/lib/plan';
import { mmss } from '@/lib/format';

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

export default function TrainingDay({
  slotKey,
  day,
  todaySets,
  history,
  done,
}: {
  slotKey: string;
  day: string;
  todaySets: SetRow[];
  history: SetRow[];
  done: boolean;
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const value = Number(f.reps) || null;

    const { error } = await supabase.from('training_sets').upsert(
      {
        user_id: user.id,
        day,
        slot: slot.key,
        exercise_key: ex.key,
        set_index: i,
        weight_kg: ex.noLoad || !f.weight ? null : Number(f.weight),
        reps: ex.timed ? null : value,
        seconds: ex.timed ? value : null,
      },
      { onConflict: 'user_id,day,slot,exercise_key,set_index' }
    );

    if (error) alert('Could not save that set.');
  }

  async function finish() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('training_sessions').upsert(
      { user_id: user.id, day, slot: slot.key, done: true },
      { onConflict: 'user_id,day,slot' }
    );

    setBusy(false);
    if (error) { alert('Could not close the session.'); return; }
    setFinished(true);
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Private · only you</p>
      <h1 className="display" style={{ fontSize: 34, margin: '8px 0 6px' }}>{slot.name}</h1>
      <p className="muted" style={{ marginBottom: 16 }}>{slot.intent}</p>

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
        <div className="card">
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
