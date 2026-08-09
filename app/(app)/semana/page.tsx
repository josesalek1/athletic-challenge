import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { lastNDays, mmss, today } from '@/lib/format';
import { validChecklistDone } from '@/lib/checklist';
import { PLAN } from '@/lib/plan';
import type { Challenge, Entry } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RANGES = [7, 14, 30, 60, 90] as const;
type Range = (typeof RANGES)[number];
type View = 'me' | 'group';

type GroupCheckin = {
  user_id: string;
  challenge_id: string;
  day: string;
  goal_met: boolean;
};

type TrainingSession = {
  day: string;
  slot: string;
  done: boolean;
  distance_m: number | null;
};

type TrainingSet = {
  day: string;
  exercise_key: string;
  weight_kg: number | null;
  reps: number | null;
  seconds: number | null;
};

type SwimSession = {
  day: string;
  distance_m: number | null;
  duration_s: number | null;
};

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function valueFor(entry: Entry | undefined, challenge: Challenge) {
  if (!entry) return 0;
  if (challenge.kind === 'checklist') {
    return validChecklistDone(challenge, entry.payload.done).length;
  }
  if (challenge.kind === 'timed') return entry.payload.seconds ?? 0;
  if (challenge.kind === 'reps') return entry.payload.reps ?? 0;
  return entry.payload.ok ? 1 : 0;
}

function targetFor(challenge: Challenge) {
  if (challenge.kind === 'checklist') return challenge.config.daily_goal ?? 3;
  if (challenge.kind === 'timed') return challenge.config.target_s ?? 1;
  if (challenge.kind === 'reps') return challenge.config.target ?? 1;
  return 1;
}

function formatValue(value: number, challenge: Challenge) {
  if (challenge.kind === 'timed') return mmss(value);
  if (challenge.kind === 'checklist') return `${value}/${challenge.config.items?.length ?? 0}`;
  if (challenge.kind === 'done') return value === 1 ? 'Done' : '—';
  return `${value} reps`;
}

function formatTotal(value: number, challenge: Challenge) {
  if (challenge.kind === 'timed') return mmss(value);
  if (challenge.kind === 'checklist') return `${value} practices`;
  if (challenge.kind === 'done') return plural(value, 'session');
  return `${value} reps`;
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; view?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.days);
  const range: Range = RANGES.includes(requested as Range) ? requested as Range : 7;
  const view: View = params.view === 'group' ? 'group' : 'me';
  const allDays = lastNDays(90);
  const days = allDays.slice(-range);
  const currentDay = today();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: profiles },
    { data: checkins },
    { data: challenges },
    { data: entries },
    { data: trainingSessions },
    { data: trainingSets },
    { data: swimSessions },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('active', true).order('display_name'),
    supabase.from('group_checkins').select('user_id, challenge_id, day, goal_met')
      .gte('day', allDays[0]),
    supabase.from('challenges').select('*').eq('active', true).order('sort_order'),
    supabase.from('entries').select('user_id, challenge_id, day, payload')
      .eq('user_id', user!.id).gte('day', allDays[0]),
    supabase.from('training_sessions').select('day, slot, done, distance_m')
      .gte('day', allDays[0]),
    supabase.from('training_sets').select('day, exercise_key, weight_kg, reps, seconds')
      .gte('day', allDays[0]),
    supabase.from('swim_sessions').select('day, distance_m, duration_s')
      .gte('day', allDays[0]),
  ]);

  const active = (challenges ?? []) as Challenge[];
  const privateEntries = (entries ?? []) as Entry[];
  const shared = (checkins ?? []) as GroupCheckin[];
  const periodEntries = privateEntries.filter((entry) => days.includes(entry.day));
  const periodCheckins = shared.filter((checkin) => days.includes(checkin.day));
  const byPrivateKey = new Map(periodEntries.map((entry) => [
    `${entry.day}|${entry.challenge_id}`,
    entry,
  ]));
  const bySharedKey = new Map(shared.map((checkin) => [
    `${checkin.user_id}|${checkin.day}|${checkin.challenge_id}`,
    checkin,
  ]));

  function availableChallenges(day: string) {
    return active.filter((challenge) => !challenge.started_on || challenge.started_on <= day);
  }

  const challengeProgress = active.map((challenge) => {
    const target = targetFor(challenge);
    const timeline = days.map((day) => {
      const value = valueFor(byPrivateKey.get(`${day}|${challenge.id}`), challenge);
      return {
        day,
        value,
        percent: Math.min(100, Math.round((value / target) * 100)),
      };
    });
    const values = timeline.map((item) => item.value).filter((value) => value > 0);
    const goalDays = timeline.filter((item) => item.value >= target).length;
    const possibleDays = days.filter((day) => !challenge.started_on || challenge.started_on <= day).length;
    const latest = [...timeline].reverse().find((item) => item.value > 0)?.value ?? 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    const midpoint = Math.max(1, Math.floor(timeline.length / 2));
    const firstAverage = timeline.slice(0, midpoint).reduce((sum, item) => sum + item.value, 0) / midpoint;
    const recent = timeline.slice(midpoint);
    const recentAverage = recent.reduce((sum, item) => sum + item.value, 0) / Math.max(1, recent.length);
    const direction = recentAverage > firstAverage ? 'up' : recentAverage < firstAverage ? 'down' : 'steady';

    return {
      challenge,
      timeline,
      goalDays,
      possibleDays,
      activeDays: values.length,
      latest,
      total,
      best: values.length ? Math.max(...values) : 0,
      direction,
    };
  });

  const periodTraining = ((trainingSessions ?? []) as TrainingSession[])
    .filter((session) => days.includes(session.day) && session.done);
  const periodSets = ((trainingSets ?? []) as TrainingSet[])
    .filter((set) => days.includes(set.day));
  const periodSwims = ((swimSessions ?? []) as SwimSession[])
    .filter((session) => days.includes(session.day));
  const strengthSlots = new Set(PLAN.filter((slot) => slot.kind === 'strength').map((slot) => slot.key));
  const swimSlots = new Map(PLAN.filter((slot) => slot.kind === 'swim').map((slot) => [
    slot.key,
    slot.sets?.reduce((sum, set) => sum + set.meters, 0) ?? 0,
  ]));
  const strengthDone = periodTraining.filter((session) => strengthSlots.has(session.slot)).length;
  const plannedSwimDone = periodTraining.filter((session) => swimSlots.has(session.slot));
  const detailedSwimDays = new Set(periodSwims.map((session) => session.day));
  const swimDistance = plannedSwimDone.reduce((sum, session) =>
    sum + (detailedSwimDays.has(session.day) ? 0 : session.distance_m ?? swimSlots.get(session.slot) ?? 0), 0
  ) + periodSwims.reduce((sum, session) => sum + (session.distance_m ?? 0), 0);
  const swimDuration = periodSwims.reduce((sum, session) => sum + (session.duration_s ?? 0), 0);
  const swimSessionCount = new Set([
    ...plannedSwimDone.map((session) => session.day),
    ...periodSwims.map((session) => session.day),
  ]).size;
  const trainingVolume = Math.round(periodSets.reduce((sum, set) =>
    sum + ((set.weight_kg ?? 0) * (set.reps ?? 0)), 0
  ));
  const trainingDays = new Set([
    ...periodTraining.map((session) => session.day),
    ...periodSets.map((set) => set.day),
  ]).size;

  function groupDayProgress(userId: string, day: string) {
    const available = availableChallenges(day);
    if (!available.length) return { met: 0, total: 0, percent: 0, checked: 0 };
    const checkinsForDay = available
      .map((challenge) => bySharedKey.get(`${userId}|${day}|${challenge.id}`))
      .filter(Boolean) as GroupCheckin[];
    const met = checkinsForDay.filter((checkin) => checkin.goal_met).length;
    return {
      met,
      total: available.length,
      checked: checkinsForDay.length,
      percent: Math.round((met / available.length) * 100),
    };
  }

  function streak(userId: string) {
    let count = 0;
    for (let index = allDays.length - 1; index >= 0; index--) {
      const day = allDays[index];
      const hasCheckin = shared.some((checkin) => checkin.user_id === userId && checkin.day === day);
      if (hasCheckin) count++;
      else if (day !== currentDay) break;
    }
    return count;
  }

  const memberStats = (profiles ?? []).map((profile) => {
    const timeline = days.map((day) => groupDayProgress(profile.id, day));
    const met = timeline.reduce((sum, item) => sum + item.met, 0);
    const possible = timeline.reduce((sum, item) => sum + item.total, 0);
    const activeDays = timeline.filter((item) => item.checked > 0).length;
    return {
      ...profile,
      met,
      possible,
      activeDays,
      percent: possible ? Math.round((met / possible) * 100) : 0,
      streak: streak(profile.id),
    };
  });

  const groupTimeline = days.map((day) => {
    const activeMembers = new Set(periodCheckins.filter((checkin) => checkin.day === day)
      .map((checkin) => checkin.user_id)).size;
    return {
      day,
      activeMembers,
      percent: profiles?.length ? Math.round((activeMembers / profiles.length) * 100) : 0,
    };
  });
  const groupGoalRate = periodCheckins.length
    ? Math.round((periodCheckins.filter((checkin) => checkin.goal_met).length / periodCheckins.length) * 100)
    : 0;
  const activeMemberDays = groupTimeline.reduce((sum, item) => sum + item.activeMembers, 0);
  const possibleMemberDays = (profiles?.length ?? 0) * days.length;
  const groupParticipation = possibleMemberDays
    ? Math.round((activeMemberDays / possibleMemberDays) * 100)
    : 0;
  const challengePulse = active.map((challenge) => {
    const rows = periodCheckins.filter((checkin) => checkin.challenge_id === challenge.id);
    const members = new Set(rows.map((row) => row.user_id)).size;
    const met = rows.filter((row) => row.goal_met).length;
    return {
      challenge,
      members,
      checkins: rows.length,
      rate: rows.length ? Math.round((met / rows.length) * 100) : 0,
    };
  });

  return (
    <main className="wrap progress-page">
      <p className="eyebrow">Progress and consistency</p>
      <div className="between progress-heading">
        <h1 className="display">{view === 'me' ? 'My progress' : 'Group pulse'}</h1>
        <span className="range-label num">{range} days</span>
      </div>

      <nav className="view-picker" aria-label="Progress view">
        <Link href={`/semana?view=me&days=${range}`} data-on={view === 'me'}>
          My progress
          <small>Private</small>
        </Link>
        <Link href={`/semana?view=group&days=${range}`} data-on={view === 'group'}>
          Group pulse
          <small>Shared</small>
        </Link>
      </nav>

      <nav className="range-picker" aria-label="Progress period">
        {RANGES.map((value) => (
          <Link key={value} href={`/semana?view=${view}&days=${value}`}
                className="range-option" data-on={range === value}>
            {value}
          </Link>
        ))}
      </nav>

      {view === 'me' ? (
        <>
          <section className="insight-strip" aria-label="Personal overview">
            <div><strong className="num">{challengeProgress.reduce((sum, item) => sum + item.activeDays, 0)}</strong><span>logged results</span></div>
            <div><strong className="num">{trainingDays}</strong><span>training days</span></div>
            <div><strong className="num">{challengeProgress.reduce((sum, item) => sum + item.goalDays, 0)}</strong><span>goals met</span></div>
          </section>

          <div className="section-heading">
            <div><p className="eyebrow">Daily challenges</p><h2>Exact results</h2></div>
            <span className="privacy-pill">Only you</span>
          </div>

          <div className="challenge-insights">
            {challengeProgress.map((item) => (
              <article className="insight-card" key={item.challenge.id}>
                <div className="between insight-title">
                  <div>
                    <h3>{item.challenge.name}</h3>
                    <p className="muted">
                      {item.goalDays}/{item.possibleDays} goal days · {plural(item.activeDays, 'entry', 'entries')}
                    </p>
                  </div>
                  <span className="trend-mark" data-direction={item.direction} aria-label={`${item.direction} trend`}>
                    {item.direction === 'up' ? '↗' : item.direction === 'down' ? '↘' : '→'}
                  </span>
                </div>

                <div className="personal-chart" style={{ gridTemplateColumns: `repeat(${range}, minmax(0, 1fr))` }}>
                  {item.timeline.map((point) => (
                    <i key={point.day} title={`${shortDate(point.day)}: ${formatValue(point.value, item.challenge)}`}
                       data-today={point.day === currentDay}
                       data-empty={point.value === 0}
                       style={{ height: `${point.value ? Math.max(point.percent, 10) : 5}%` }} />
                  ))}
                </div>
                <div className="chart-axis num"><span>{shortDate(days[0])}</span><span>Today</span></div>

                <div className="metric-row">
                  <div><span>Latest</span><strong className="num">{formatValue(item.latest, item.challenge)}</strong></div>
                  <div><span>Best</span><strong className="num">{formatValue(item.best, item.challenge)}</strong></div>
                  <div>
                    <span>{item.challenge.kind === 'done' ? 'Completed' : 'Period total'}</span>
                    <strong className="num">{formatTotal(item.total, item.challenge)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">Training plan</p><h2>Private training</h2></div>
            <span className="privacy-pill">Only you</span>
          </div>

          <div className="training-insights">
            <article className="insight-card compact-insight">
              <p className="eyebrow">Strength</p>
              <strong className="big-metric num">{strengthDone}</strong>
              <p className="muted">completed sessions</p>
              <div className="metric-row two">
                <div><span>Sets logged</span><strong className="num">{periodSets.length}</strong></div>
                <div><span>Volume</span><strong className="num">{trainingVolume.toLocaleString('en-GB')} kg</strong></div>
              </div>
            </article>
            <article className="insight-card compact-insight">
              <p className="eyebrow">Swimming</p>
              <strong className="big-metric num">{(swimDistance / 1000).toFixed(swimDistance ? 1 : 0)} km</strong>
              <p className="muted">distance completed</p>
              <div className="metric-row two">
                <div><span>Sessions</span><strong className="num">{swimSessionCount}</strong></div>
                <div><span>Recorded time</span><strong className="num">{swimDuration ? mmss(swimDuration) : '—'}</strong></div>
              </div>
            </article>
          </div>

          <p className="muted progress-note">
            Your repetitions, times, selected Yogic practices, weights and swim details are private.
          </p>
        </>
      ) : (
        <>
          <section className="insight-strip" aria-label="Group overview">
            <div><strong className="num">{groupParticipation}%</strong><span>daily participation</span></div>
            <div><strong className="num">{groupGoalRate}%</strong><span>shared goals met</span></div>
            <div><strong className="num">{profiles?.length ?? 0}</strong><span>active members</span></div>
          </section>

          <article className="insight-card group-trend-card">
            <div className="between insight-title">
              <div><p className="eyebrow">Momentum</p><h2>Members checking in</h2></div>
              <strong className="num">{groupParticipation}%</strong>
            </div>
            <div className="personal-chart group-chart" style={{ gridTemplateColumns: `repeat(${range}, minmax(0, 1fr))` }}>
              {groupTimeline.map((point) => (
                <i key={point.day} title={`${shortDate(point.day)}: ${point.activeMembers}/${profiles?.length ?? 0} members`}
                   data-today={point.day === currentDay}
                   data-empty={point.activeMembers === 0}
                   style={{ height: `${point.activeMembers ? Math.max(point.percent, 10) : 5}%` }} />
              ))}
            </div>
            <div className="chart-axis num"><span>{shortDate(days[0])}</span><span>Today</span></div>
          </article>

          <div className="section-heading">
            <div><p className="eyebrow">By challenge</p><h2>What is working</h2></div>
          </div>
          <div className="pulse-list">
            {challengePulse.map((item) => (
              <article className="pulse-row" key={item.challenge.id}>
                <div className="between">
                  <div><h3>{item.challenge.name}</h3><p className="muted">{item.members}/{profiles?.length ?? 0} members checked in</p></div>
                  <strong className="num">{item.rate}%</strong>
                </div>
                <div className="rate-track"><i style={{ width: `${item.rate}%` }} /></div>
                <p className="num pulse-caption">{item.checkins} shared check-ins · goal-met rate</p>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">Members</p><h2>Consistency</h2></div>
          </div>
          <div className="member-grid">
            {memberStats.map((person) => (
              <article className="member-card" key={person.id}>
                <div className="between">
                  <h3>{person.display_name}</h3>
                  <strong className="num">{person.percent}%</strong>
                </div>
                <p className="muted">{person.activeDays}/{range} active days · {plural(person.streak, 'day')} streak</p>
              </article>
            ))}
          </div>

          <p className="muted progress-note">
            Group insights use check-ins and goal completion only. Exact repetitions, times and selections stay private.
          </p>
        </>
      )}
    </main>
  );
}
