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

      <div className="row" style={{ justifyContent: 'center', gap: 22, marginTop: 4 }}>
        <button className="btn-ghost" style={{ width: 54, height: 54, fontSize: 22 }}
                onClick={() => setReps((r) => Math.max(0, r - 1))} aria-label="One less">−</button>
        <span className="num display" style={{ fontSize: 52, minWidth: 90, textAlign: 'center' }}>
          {reps}
        </span>
        <button className="btn-ghost" style={{ width: 54, height: 54, fontSize: 22 }}
                onClick={() => setReps((r) => r + 1)} aria-label="One more">+</button>
      </div>

      <button className="btn-rope" style={{ width: '100%', marginTop: 16 }}
              onClick={save} disabled={saving || reps === saved}>
        {reps === saved && saved > 0 ? `Saved ${saved}` : `Save ${reps}`}
      </button>
    </div>
  );
}
