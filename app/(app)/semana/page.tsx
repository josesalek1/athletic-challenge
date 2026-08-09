import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { lastNDays, today } from '@/lib/format';
import { validChecklistDone } from '@/lib/checklist';
import type { Challenge, Entry } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RANGES = [7, 14, 30, 60, 90] as const;
type Range = (typeof RANGES)[number];

function met(entry: Entry | undefined, challenge: Challenge) {
  if (!entry) return false;
  const payload = entry.payload;
  if (challenge.kind === 'checklist') {
    return validChecklistDone(challenge, payload.done).length >=
      (challenge.config.daily_goal ?? 3);
  }
  if (challenge.kind === 'timed') {
    return (payload.seconds ?? 0) >= (challenge.config.target_s ?? 1);
  }
  if (challenge.kind === 'reps') {
    return (payload.reps ?? 0) >= (challenge.config.target ?? 1);
  }
  return Boolean(payload.ok);
}
function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export default async function Week({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const requested = Number((await searchParams).days);
  const range: Range = RANGES.includes(requested as Range) ? requested as Range : 7;
  const allDays = lastNDays(90);
  const days = allDays.slice(-range);
  const currentDay = today();
  const supabase = await createClient();

  const [{ data: profiles }, { data: entries }, { data: challenges }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('entries').select('*').gte('day', allDays[0]),
    supabase.from('challenges').select('*').eq('active', true).order('sort_order'),
  ]);

  const active = (challenges ?? []) as Challenge[];
  const all = (entries ?? []) as Entry[];
  const byKey = new Map<string, Entry>();
  all.forEach((entry) => {
    byKey.set(`${entry.user_id}|${entry.day}|${entry.challenge_id}`, entry);
  });

  function challengesForDay(day: string) {
    return active.filter((challenge) => !challenge.started_on || challenge.started_on <= day);
  }

  function dayProgress(userId: string, day: string) {
    const available = challengesForDay(day);
    if (!available.length) return { met: 0, total: 0, percent: 0 };
    const completed = available.filter((challenge) =>
      met(byKey.get(`${userId}|${day}|${challenge.id}`), challenge)
    ).length;
    return {
      met: completed,
      total: available.length,
      percent: Math.round((completed / available.length) * 100),
    };
  }

  function streak(userId: string) {
    let count = 0;
    for (let index = allDays.length - 1; index >= 0; index--) {
      const day = allDays[index];
      const hasEntry = all.some((entry) => entry.user_id === userId && entry.day === day);
      if (hasEntry) count++;
      else if (day !== currentDay) break;
    }
    return count;
  }

  const leaderboard = (profiles ?? []).map((profile) => {
    const timeline = days.map((day) => dayProgress(profile.id, day));
    const completed = timeline.reduce((sum, item) => sum + item.met, 0);
    const possible = timeline.reduce((sum, item) => sum + item.total, 0);
    return {
      ...profile,
      timeline,
      completed,
      possible,
      percent: possible ? Math.round((completed / possible) * 100) : 0,
      streak: streak(profile.id),
    };
  }).sort((a, b) =>
    b.percent - a.percent || b.streak - a.streak || a.display_name.localeCompare(b.display_name)
  );

  return (
    <main className="wrap week-page">
      <p className="eyebrow">Group progress</p>
      <div className="between week-heading">
        <h1 className="display">Leaderboard</h1>
        <span className="range-label num">{range} days</span>
      </div>

      <nav className="range-picker" aria-label="Leaderboard period">
        {RANGES.map((value) => (
          <Link key={value} href={`/semana?days=${value}`}
                className="range-option" data-on={range === value}>
            {value}
          </Link>
        ))}
      </nav>

      {leaderboard.length === 0 ? (
        <p className="empty">Nobody has joined the group yet.</p>
      ) : (
        <div className="leaderboard-list">
          {leaderboard.map((person, index) => (
            <article className="leader-card" key={person.id}>
              <div className="leader-summary">
                <span className="leader-rank num">{index + 1}</span>
                <div className="leader-person">
                  <h2>{person.display_name}</h2>
                  <p className="muted">
                    {person.completed}/{person.possible} goals · {person.streak} day streak
                  </p>
                </div>
                <strong className="leader-score num">{person.percent}%</strong>
              </div>

              <div className="progress-chart"
                   style={{ gridTemplateColumns: `repeat(${range}, minmax(0, 1fr))` }}
                   aria-label={`${person.display_name}: ${person.percent}% completion`}>
                {person.timeline.map((item, dayIndex) => (
                  <i key={days[dayIndex]}
                     title={`${shortDate(days[dayIndex])}: ${item.met}/${item.total}`}
                     data-today={days[dayIndex] === currentDay}
                     style={{ height: `${item.percent ? Math.max(item.percent, 12) : 7}%` }} />
                ))}
              </div>
              <div className="chart-axis num">
                <span>{shortDate(days[0])}</span>
                <span>Today</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="muted week-note">
        Each bar is one day. Height shows the share of daily goals completed.
      </p>
    </main>
  );
}
