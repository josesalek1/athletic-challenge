import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { lastNDays, today } from '@/lib/format';
import type { Challenge } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RANGES = [7, 14, 30, 60, 90] as const;
type Range = (typeof RANGES)[number];

type GroupCheckin = {
  user_id: string;
  challenge_id: string;
  day: string;
  goal_met: boolean;
};
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

  const [{ data: profiles }, { data: checkins }, { data: challenges }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('group_checkins').select('user_id, challenge_id, day, goal_met')
      .gte('day', allDays[0]),
    supabase.from('challenges').select('*').eq('active', true).order('sort_order'),
  ]);

  const active = (challenges ?? []) as Challenge[];
  const all = (checkins ?? []) as GroupCheckin[];
  const byKey = new Map<string, GroupCheckin>();
  all.forEach((checkin) => {
    byKey.set(`${checkin.user_id}|${checkin.day}|${checkin.challenge_id}`, checkin);
  });

  function challengesForDay(day: string) {
    return active.filter((challenge) => !challenge.started_on || challenge.started_on <= day);
  }

  function dayProgress(userId: string, day: string) {
    const available = challengesForDay(day);
    if (!available.length) return { met: 0, total: 0, percent: 0 };
    const completed = available.filter((challenge) =>
      byKey.get(`${userId}|${day}|${challenge.id}`)?.goal_met
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
      const hasCheckin = all.some((checkin) => checkin.user_id === userId && checkin.day === day);
      if (hasCheckin) count++;
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
      <p className="eyebrow">Shared challenge activity</p>
      <div className="between week-heading">
        <h1 className="display">Group pulse</h1>
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
        Each bar is one day. Only shared goal completion is shown; exact results stay private.
      </p>
    </main>
  );
}
