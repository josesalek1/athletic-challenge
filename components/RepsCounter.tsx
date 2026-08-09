'use client';

import { useState } from 'react';
import type { Challenge } from '@/lib/types';

export default function RepsCounter({
  challenge,
  initialReps,
  onSave,
}: {
  challenge: Challenge;
  initialReps: number;
  onSave: (reps: number) => Promise<void>;
}) {
  const target = challenge.config.target ?? 25;
  const [reps, setReps] = useState(initialReps);
  const [saved, setSaved] = useState(initialReps);
  const [saving, setSaving] = useState(false);
  const options = Array.from({ length: 201 }, (_, value) => value);

  async function save() {
    setSaving(true);
    await onSave(reps);
    setSaved(reps);
    setSaving(false);
  }

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 4 }}>
        <p className="eyebrow">{challenge.name}</p>
        <p className="num" style={{ fontSize: 12,
             color: saved >= target ? 'var(--water)' : 'var(--mist)' }}>
          goal {target}
        </p>
      </div>
      {challenge.config.blurb && (
        <p className="muted" style={{ marginBottom: 14 }}>{challenge.config.blurb}</p>
      )}

      <div className="rep-picker-wrap">
        <label htmlFor={`reps-${challenge.id}`}>Repetitions completed</label>
        <select
          id={`reps-${challenge.id}`}
          className="rep-picker num"
          value={reps}
          onChange={(event) => setReps(Number(event.target.value))}
        >
          {options.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <p className="muted">Tap the number and scroll the wheel.</p>
      </div>

      <button className="btn-rope" style={{ width: '100%', marginTop: 16 }}
              onClick={save} disabled={saving || reps === saved}>
        {reps === saved && saved > 0 ? `Saved ${saved}` : `Save ${reps}`}
      </button>
    </div>
  );
}
