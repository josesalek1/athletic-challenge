'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { today } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import type { Challenge } from '@/lib/types';

type HabitKind = 'done' | 'reps' | 'timed';

const TYPES: { value: HabitKind; label: string }[] = [
  { value: 'done', label: 'Done' },
  { value: 'reps', label: 'Count' },
  { value: 'timed', label: 'Time' },
];

function initialGoal(habit?: Challenge) {
  if (habit?.kind === 'reps' && habit.config.target != null) return String(habit.config.target);
  if (habit?.kind === 'timed' && habit.config.target_s != null) return String(habit.config.target_s / 60);
  return '';
}

function friendlyHabitError(error: unknown, editing: boolean) {
  const details = typeof error === 'object' && error
    ? error as { code?: string; message?: string }
    : {};
  const message = details.message ?? '';
  const permissionError = details.code === '42501'
    || details.code === 'PGRST301'
    || /row-level security|permission denied|jwt/i.test(message);

  if (permissionError) return 'Your session or permissions changed. Refresh the app and try again.';
  if (details.code === '23505') return 'That habit could not be created. Try saving it again.';
  return editing
    ? 'The habit could not be updated. Check the fields and try again.'
    : 'The habit could not be created. Check the fields and try again.';
}

export default function HabitForm({
  userId,
  habit,
}: {
  userId: string;
  habit?: Challenge;
}) {
  const supabase = createClient();
  const router = useRouter();
  const editing = Boolean(habit);
  const [name, setName] = useState(habit?.name ?? '');
  const [kind, setKind] = useState<HabitKind>((habit?.kind as HabitKind | undefined) ?? 'done');
  const [goal, setGoal] = useState(initialGoal(habit));
  const [note, setNote] = useState(habit?.config.blurb ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function saveHabit() {
    if (busy) return;
    const cleanName = name.trim();
    const cleanNote = note.trim();
    const numericGoal = goal === '' ? null : Number(goal);

    if (cleanName.length < 2 || cleanName.length > 40) {
      setFeedback('The name must be between 2 and 40 characters.');
      return;
    }
    if (cleanNote.length > 200) {
      setFeedback('The note must be 200 characters or fewer.');
      return;
    }
    if (kind !== 'done' && numericGoal != null && (!Number.isFinite(numericGoal) || numericGoal <= 0)) {
      setFeedback('The daily goal must be a positive number.');
      return;
    }
    if (kind === 'reps' && numericGoal != null && !Number.isInteger(numericGoal)) {
      setFeedback('The Count goal must be a whole number.');
      return;
    }

    const config: Challenge['config'] = {};
    if (cleanNote) config.blurb = cleanNote;
    if (kind === 'reps' && numericGoal != null) config.target = numericGoal;
    if (kind === 'timed' && numericGoal != null) config.target_s = Math.round(numericGoal * 60);

    setBusy(true);
    setFeedback('');

    const { error } = editing
      ? await supabase
          .from('challenges')
          .update({ name: cleanName, config })
          .eq('id', habit!.id)
      : await supabase
          .from('challenges')
          .insert({
            id: `h_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            name: cleanName,
            kind,
            config,
            active: true,
            sort_order: 0,
            category: 'traditional',
            started_on: today(),
            owner_id: userId,
            visibility: 'private',
          });

    setBusy(false);
    if (error) {
      setFeedback(friendlyHabitError(error, editing));
      return;
    }

    router.push('/hoy');
    router.refresh();
  }

  return (
    <main className="wrap habit-form-page">
      <p className="eyebrow">Private · only you</p>
      <h1 className="display habit-form-title">{editing ? 'Edit habit' : 'New habit'}</h1>
      <p className="muted habit-form-intro">Private habits never appear in the group report or leaderboard.</p>

      <form className="card habit-form" onSubmit={(event) => { event.preventDefault(); void saveHabit(); }}>
        <div>
          <label htmlFor="habit-name">Name</label>
          <input id="habit-name" minLength={2} maxLength={40} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Morning walk" />
          <small className="num habit-field-count">{name.length}/40</small>
        </div>

        <div>
          <label htmlFor="habit-type">Type</label>
          <select id="habit-type" value={kind} disabled={editing} onChange={(event) => { setKind(event.target.value as HabitKind); setGoal(''); }}>
            {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          {editing && <small className="habit-field-help">The type cannot be changed after creation.</small>}
        </div>

        {kind !== 'done' && (
          <div>
            <label htmlFor="habit-goal">Daily goal · optional</label>
            <input
              id="habit-goal"
              type="number"
              inputMode={kind === 'reps' ? 'numeric' : 'decimal'}
              min="0"
              step={kind === 'reps' ? '1' : '0.5'}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={kind === 'reps' ? 'Count' : 'Minutes'}
            />
            <small className="habit-field-help">{kind === 'reps' ? 'Number of repetitions.' : 'Number of minutes.'}</small>
          </div>
        )}

        <div>
          <label htmlFor="habit-note">Note · optional</label>
          <textarea id="habit-note" rows={4} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short reminder or cue" />
          <small className="num habit-field-count">{note.length}/200</small>
        </div>

        {feedback && <p className="settings-feedback" data-tone="error">{feedback}</p>}

        <div className="habit-form-actions">
          <Link href="/hoy" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn-water" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create habit'}</button>
        </div>
      </form>
    </main>
  );
}
