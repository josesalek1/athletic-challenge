'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Stopwatch from '@/components/Stopwatch';
import Checklist from '@/components/Checklist';
import RepsCounter from '@/components/RepsCounter';
import DoneToggle from '@/components/DoneToggle';
import { dayLine, waLink, isLogged } from '@/lib/share';
import type { Campaign, Challenge, Entry, Payload } from '@/lib/types';
import { isNetworkFailure, queueMutation, queuedEntries, removeQueuedMutation } from '@/lib/offline';

export default function TodayBoard({
  challenges,
  campaign,
  entries,
  day,
  name,
  userId,
}: {
  challenges: Challenge[];
  campaign: Campaign | null;
  entries: Entry[];
  day: string;
  name: string;
  userId: string;
}) {
  const supabase = createClient();
  const [local, setLocal] = useState<Record<string, Payload>>(
    Object.fromEntries(entries.map((e) => [e.challenge_id, e.payload]))
  );
  const groupChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.visibility === 'group'),
    [challenges]
  );
  const [habits, setHabits] = useState(() =>
    challenges.filter((challenge) => challenge.visibility === 'private')
  );
  const [groupSection, setGroupSection] = useState(groupChallenges[0]?.id ?? '');
  const [habitSection, setHabitSection] = useState(habits[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [habitFeedback, setHabitFeedback] = useState('');

  useEffect(() => {
    void queuedEntries(userId, day).then((queued) => {
      if (!queued.length) return;
      setLocal((current) => ({
        ...current,
        ...Object.fromEntries(queued.map((item) => [item.challenge_id, item.payload])),
      }));
    });
  }, [day, userId]);

  // El día de campaña es común al grupo y parte de su fecha inicial.
  const dayNumber = useMemo(() => {
    if (!campaign) return 1;
    const ms =
      new Date(day + 'T12:00:00').getTime() - new Date(campaign.starts_on + 'T12:00:00').getTime();
    return Math.min(campaign.duration_days, Math.max(1, Math.floor(ms / 86400000) + 1));
  }, [campaign, day]);

  const campaignLive = Boolean(campaign && day >= campaign.starts_on && day <= campaign.ends_on);
  const campaignState = !campaign
    ? 'missing'
    : day < campaign.starts_on ? 'upcoming' : day > campaign.ends_on ? 'finished' : 'live';
  const daysUntilStart = campaign && campaignState === 'upcoming'
    ? Math.max(1, Math.ceil(
        (new Date(`${campaign.starts_on}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) / 86400000
      ))
    : 0;
  const campaignDayLabel = !campaign
    ? 'No active campaign'
    : campaignState === 'upcoming'
      ? daysUntilStart === 1 ? 'Starts tomorrow' : `Starts in ${daysUntilStart} days`
      : campaignState === 'finished'
        ? 'Campaign complete'
        : `Day ${dayNumber} of ${campaign.duration_days}`;

  async function save(challengeId: string, payload: Payload) {
    if (!campaignLive && groupChallenges.some((challenge) => challenge.id === challengeId)) return;
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

  const currentGroup = groupChallenges.find((challenge) => challenge.id === groupSection);
  const currentHabit = habits.find((challenge) => challenge.id === habitSection);

  const results = groupChallenges
    .map((challenge) => ({ challenge, payload: local[challenge.id] ?? {} }))
    .filter(({ payload }) => isLogged(payload));

  const line = dayLine(dayNumber, results);

  async function deleteHabit(habit: Challenge) {
    if (busy) return;
    const confirmed = window.confirm(
      `Delete “${habit.name}”? Its complete history will be permanently lost.`
    );
    if (!confirmed) return;

    setBusy(true);
    setHabitFeedback('');
    const { error } = await supabase.from('challenges').delete().eq('id', habit.id);
    setBusy(false);

    if (error) {
      setHabitFeedback('The habit could not be deleted. Refresh the app and try again.');
      return;
    }

    const remaining = habits.filter((item) => item.id !== habit.id);
    setHabits(remaining);
    setHabitSection((current) => current === habit.id ? remaining[0]?.id ?? '' : current);
    setLocal((current) => {
      const next = { ...current };
      delete next[habit.id];
      return next;
    });
    setHabitFeedback('Habit deleted.');
  }

  function habitActions(habit: Challenge) {
    return (
      <div className="habit-card-actions">
        <Link className="btn btn-ghost" href={`/hoy/habits/${habit.id}`}>Edit habit</Link>
        <button className="btn-ghost" disabled={busy} onClick={() => deleteHabit(habit)}>Delete habit</button>
      </div>
    );
  }

  function render(c: Challenge, footer?: ReactNode) {
    const p = local[c.id] ?? {};
    if (c.kind === 'timed')
      return <Stopwatch challenge={c} initialSeconds={p.seconds}
                        onSave={(seconds) => save(c.id, { seconds })}
                        onClear={() => save(c.id, {})} footer={footer} />;
    if (c.kind === 'reps')
      return <RepsCounter challenge={c} initialReps={p.reps ?? 0}
                          onSave={(reps) => save(c.id, { reps })} footer={footer} />;
    if (c.kind === 'done')
      return <DoneToggle challenge={c} initialDone={Boolean(p.ok)}
                         onSave={(ok) => save(c.id, { ok })} footer={footer} />;
    return <Checklist challenge={c} initialDone={p.done ?? []}
                      onSave={(done) => save(c.id, { done })} footer={footer} />;
  }

  return (
    <main className="wrap">
      <p className="eyebrow">
        {name} ·{' '}
        {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      </p>
      <h1 className="display today-title">
        {campaign?.name ?? 'Athletic Challenge'} <span>· {campaignDayLabel}</span>
      </h1>

      {campaign && (
        <section className="campaign-summary" data-state={campaignState}>
          <div className="between">
            <strong>{campaignState === 'live' ? 'Active campaign' : campaignState === 'upcoming' ? 'Upcoming campaign' : 'Campaign complete'}</strong>
            <span className="num">{campaign.starts_on} → {campaign.ends_on}</span>
          </div>
          {campaign.description && <p>{campaign.description}</p>}
        </section>
      )}

      <section className="today-section" aria-labelledby="group-challenge-heading">
        <p className="eyebrow today-section-label" id="group-challenge-heading">Group challenge</p>
        {!campaign ? (
          <p className="empty">There is no active campaign. Ask an administrator to activate one.</p>
        ) : groupChallenges.length === 0 ? (
          <p className="empty">
            This campaign has no active activities.
            <br />
            Ask an administrator to activate one from the Admin panel.
          </p>
        ) : (
          <>
            {!campaignLive && (
              <p className="campaign-readonly-notice">
                {campaignState === 'upcoming'
                  ? `${campaignDayLabel}. Activities are visible and open for logging on ${campaign.starts_on}.`
                  : `Campaign complete. Activities are read-only; history remains available in Progress.`}
              </p>
            )}
            <div className="chips" role="tablist" aria-label="Group challenge activities">
              {groupChallenges.map((challenge) => (
                <button key={challenge.id} className="chip" role="tab"
                        data-on={challenge.id === groupSection}
                        data-logged={isLogged(local[challenge.id])}
                        aria-selected={challenge.id === groupSection}
                        onClick={() => setGroupSection(challenge.id)}>
                  {challenge.name}
                </button>
              ))}
            </div>

            {currentGroup && (
              <fieldset className="campaign-readonly" disabled={!campaignLive} aria-label={campaignLive ? undefined : 'Campaign activity in read-only mode'}>
                {render(currentGroup)}
              </fieldset>
            )}

            {campaignLive && <div className="card">
              <div className="between" style={{ marginBottom: 10 }}>
                <p className="eyebrow">Group report</p>
                <p className="num" style={{ fontSize: 12, color: 'var(--mist)' }}>
                  {results.length}/{groupChallenges.length}
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
            </div>}
          </>
        )}
      </section>

      <section className="today-section habit-section" aria-labelledby="my-habits-heading">
        <div className="between today-section-heading">
          <p className="eyebrow today-section-label" id="my-habits-heading">My habits</p>
          <Link className="btn btn-water new-habit-link" href="/hoy/habits/new">+ New habit</Link>
        </div>

        {habits.length === 0 ? (
          <p className="empty">Create a private daily habit. Only you can see its results.</p>
        ) : (
          <>
            <div className="chips" role="tablist" aria-label="My private habits">
              {habits.map((habit) => (
                <button key={habit.id} className="chip" role="tab"
                        data-on={habit.id === habitSection}
                        data-logged={isLogged(local[habit.id])}
                        aria-selected={habit.id === habitSection}
                        onClick={() => setHabitSection(habit.id)}>
                  {habit.name}
                </button>
              ))}
            </div>

            {currentHabit && render(currentHabit, habitActions(currentHabit))}
          </>
        )}

        {habitFeedback && (
          <p className="settings-feedback" data-tone={habitFeedback === 'Habit deleted.' ? 'success' : 'error'}>
            {habitFeedback}
          </p>
        )}
      </section>
    </main>
  );
}
