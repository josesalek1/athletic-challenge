'use client';

import { useState } from 'react';
import type { Challenge } from '@/lib/types';

export default function Checklist({
  challenge,
  initialDone,
  onSave,
}: {
  challenge: Challenge;
  initialDone: string[];
  onSave: (done: string[]) => Promise<void>;
}) {
  const items = challenge.config.items ?? [];
  const goal = challenge.config.daily_goal ?? 3;

  const [done, setDone] = useState<string[]>(initialDone);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setDone((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await onSave(done);
    setSaving(false);
    setDirty(false);
  }

  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 4 }}>
        <p className="eyebrow">{challenge.name}</p>
        <p className="num" style={{ fontSize: 12,
             color: done.length >= goal ? 'var(--water)' : 'var(--mist)' }}>
          {done.length}/{goal} today
        </p>
      </div>
      {challenge.config.blurb && (
        <p className="muted" style={{ marginBottom: 14 }}>{challenge.config.blurb}</p>
      )}

      <div className="stack">
        {items.map((item, i) => {
          const on = done.includes(item.key);
          const newGroup = item.group && item.group !== items[i - 1]?.group;
          return (
            <div key={item.key}>
              {newGroup && (
                <p className="eyebrow" style={{ margin: '10px 0 8px' }}>{item.group}</p>
              )}
              <button className="check" data-on={on}
                      aria-pressed={on} onClick={() => toggle(item.key)}>
                <span className="check-n">{on ? '✓' : item.n}</span>
                <span className="check-body">
                  {item.name}
                  <span className="check-hint">{item.hint}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <button className="btn-rope" style={{ width: '100%', marginTop: 14 }}
              onClick={save} disabled={!dirty || saving}>
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
}
