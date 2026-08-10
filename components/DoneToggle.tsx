'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Challenge } from '@/lib/types';

/* Hecho o no hecho. Sin número. */

export default function DoneToggle({
  challenge,
  initialDone,
  onSave,
  footer,
}: {
  challenge: Challenge;
  initialDone: boolean;
  onSave: (done: boolean) => Promise<void>;
  footer?: ReactNode;
}) {
  const [on, setOn] = useState(initialDone);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    await onSave(next);
    setSaving(false);
  }

  return (
    <div className="card">
      <p className="eyebrow">{challenge.name}</p>
      {challenge.config.blurb && (
        <p className="muted" style={{ margin: '8px 0 16px' }}>{challenge.config.blurb}</p>
      )}
      <button
        className={on ? 'btn-water' : 'btn-ghost'}
        style={{ width: '100%' }}
        onClick={toggle}
        disabled={saving}
        aria-pressed={on}
      >
        {on ? 'Done today ✓' : 'Mark as done'}
      </button>
      {footer}
    </div>
  );
}
