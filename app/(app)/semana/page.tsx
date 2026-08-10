import Link from 'next/link';
import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';
import { daysEndingAt, mmss, today } from '@/lib/format';
import { validChecklistDone } from '@/lib/checklist';
import { PLAN } from '@/lib/plan';
import { classifyTrend, hasThreeConsecutiveDeclines, movingAverage, percentChange as precisePercentChange, trendDirection } from '@/lib/trends';
import type { BodyMetric, Campaign, Challenge, Entry } from '@/lib/types';

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
  stroke: string | null;
  rpe: number | null;
  notes: string | null;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function changePercent(current: number, previous: number, lowerIsBetter = false) {
  if (!previous) return null;
  const raw = ((current - previous) / previous) * 100;
  return Math.round(lowerIsBetter ? -raw : raw);
}

function signedPercent(value: number | null) {
  if (value == null) return 'Not enough data';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function pacePer100(distance: number, duration: number) {
  return distance > 0 && duration > 0 ? Math.round((duration / distance) * 100) : 0;
}

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

function formatAverageValue(value: number, challenge: Challenge) {
  if (!value) return '—';
  if (challenge.kind === 'timed') return mmss(Math.round(value));
  if (challenge.kind === 'checklist') return `${value.toFixed(1)}/${challenge.config.items?.length ?? 0}`;
  if (challenge.kind === 'done') return `${Math.round(value * 100)}%`;
  return `${value.toFixed(1)} reps`;
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; view?: string; challenge?: string; campaign?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.days);
  const range: Range = RANGES.includes(requested as Range) ? requested as Range : 7;
  const view: View = params.view === 'group' ? 'group' : 'me';
  const actualToday = today();
  const supabase = await createClient();
  await supabase.auth.getUser();
  const trendDays = daysEndingAt(actualToday, 30);
  const trendPreviousAnchorDate = new Date(`${trendDays[0]}T12:00:00`);
  trendPreviousAnchorDate.setDate(trendPreviousAnchorDate.getDate() - 1);
  const trendPreviousDays = daysEndingAt(trendPreviousAnchorDate.toISOString().slice(0, 10), 30);
  const trendStart = trendPreviousDays[0];

  const { data: campaignRows } = await supabase
    .from('campaigns')
    .select('*')
    .order('starts_on', { ascending: false });
  const campaigns = (campaignRows ?? []) as Campaign[];
  const campaign = campaigns.find((item) => item.id === params.campaign)
    ?? campaigns.find((item) => item.active)
    ?? campaigns[0];
  const anchorDay = campaign
    ? actualToday < campaign.starts_on
      ? campaign.starts_on
      : actualToday > campaign.ends_on ? campaign.ends_on : actualToday
    : actualToday;
  const campaignDays = campaign
    ? daysEndingAt(campaign.ends_on, campaign.duration_days).filter((day) => day <= anchorDay)
    : daysEndingAt(anchorDay, 180);
  const days = daysEndingAt(anchorDay, range)
    .filter((day) => !campaign || (day >= campaign.starts_on && day <= campaign.ends_on));
  const previousAnchorDate = new Date(`${days[0] ?? anchorDay}T12:00:00`);
  previousAnchorDate.setDate(previousAnchorDate.getDate() - 1);
  const previousAnchor = previousAnchorDate.toISOString().slice(0, 10);
  const previousDays = daysEndingAt(previousAnchor, range)
    .filter((day) => !campaign || day >= campaign.starts_on);
  const allDays = campaignDays.length ? campaignDays : [anchorDay];
  const historyStart = [allDays[0], trendStart].sort()[0];
  const currentDay = anchorDay;
  const axisEndLabel = currentDay === actualToday ? 'Today' : shortDate(currentDay);

  const [
    { data: profiles },
    { data: checkins },
    { data: challenges },
    { data: habits },
    { data: entries },
    { data: trainingSessions },
    { data: trainingSets },
    { data: swimSessions },
    { data: bodyMetrics },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('active', true).order('display_name'),
    supabase.from('group_checkins').select('user_id, challenge_id, day, goal_met')
      .gte('day', allDays[0]),
    campaign
      ? supabase.from('challenges').select('*').eq('campaign_id', campaign.id).eq('visibility', 'group').order('sort_order')
      : Promise.resolve({ data: [] }),
    supabase.from('challenges').select('*').eq('visibility', 'private').eq('active', true).order('sort_order'),
    supabase.from('entries').select('user_id, challenge_id, day, payload'),
    supabase.from('training_sessions').select('day, slot, done, distance_m')
      .gte('day', historyStart),
    supabase.from('training_sets').select('day, exercise_key, weight_kg, reps, seconds'),
    supabase.from('swim_sessions').select('day, distance_m, duration_s, stroke, rpe, notes'),
    supabase.from('body_metrics').select('user_id, day, weight_kg, waist_cm, note').gte('day', trendStart),
  ]);

  const active = (challenges ?? []) as Challenge[];
  const privateHabits = (habits ?? []) as Challenge[];
  const privateBodyMetrics = (bodyMetrics ?? []) as BodyMetric[];
  const activityIds = new Set(active.map((challenge) => challenge.id));
  const privateEntries = (entries ?? []) as Entry[];
  const shared = ((checkins ?? []) as GroupCheckin[])
    .filter((checkin) => activityIds.has(checkin.challenge_id));
  const periodEntries = privateEntries.filter((entry) => days.includes(entry.day));
  const previousEntries = privateEntries.filter((entry) => previousDays.includes(entry.day));
  const periodCheckins = shared.filter((checkin) => days.includes(checkin.day));
  const byPrivateKey = new Map(periodEntries.map((entry) => [
    `${entry.day}|${entry.challenge_id}`,
    entry,
  ]));
  const byPreviousKey = new Map(previousEntries.map((entry) => [
    `${entry.day}|${entry.challenge_id}`,
    entry,
  ]));
  const byAllPrivateKey = new Map(privateEntries.map((entry) => [
    `${entry.day}|${entry.challenge_id}`,
    entry,
  ]));
  const bySharedKey = new Map(shared.map((checkin) => [
    `${checkin.user_id}|${checkin.day}|${checkin.challenge_id}`,
    checkin,
  ]));

  function availableChallenges(day: string) {
    if (campaign && (day < campaign.starts_on || day > campaign.ends_on)) return [];
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
    const previousValues = previousDays
      .map((day) => valueFor(byPreviousKey.get(`${day}|${challenge.id}`), challenge))
      .filter((value) => value > 0);
    const historicValues = privateEntries
      .filter((entry) => entry.challenge_id === challenge.id)
      .map((entry) => valueFor(entry, challenge))
      .filter((value) => value > 0);
    const goalDays = timeline.filter((item) => item.value >= target).length;
    const possibleDays = days.filter((day) => !challenge.started_on || challenge.started_on <= day).length;
    const latest = [...timeline].reverse().find((item) => item.value > 0)?.value ?? 0;
    const currentAverage = average(values);
    const previousAverage = average(previousValues);
    const change = changePercent(currentAverage, previousAverage);
    const trendDataDays = new Set([
      ...periodEntries.filter((entry) => entry.challenge_id === challenge.id).map((entry) => entry.day),
      ...previousEntries.filter((entry) => entry.challenge_id === challenge.id).map((entry) => entry.day),
    ]).size;
    const enoughTrendData = trendDataDays >= 7 && values.length > 0 && previousValues.length > 0;
    const historicBest = historicValues.length ? Math.max(...historicValues) : 0;
    let goalStreak = 0;
    for (let index = allDays.length - 1; index >= 0; index--) {
      const streakDay = allDays[index];
      const streakValue = valueFor(byAllPrivateKey.get(`${streakDay}|${challenge.id}`), challenge);
      if (streakValue >= target) goalStreak++;
      else if (streakDay !== actualToday) break;
    }
    const trendLabel = !enoughTrendData || change == null
      ? 'Not enough data'
      : change > 2 ? 'Improving' : change < -2 ? 'Declining' : 'Holding steady';
    const insight = !values.length
      ? `No ${challenge.name} result has been logged in this period yet.`
      : !enoughTrendData
      ? 'At least seven logged days across both periods are required for a trend.'
      : previousValues.length
      ? change === 0
        ? `Your ${challenge.name} average stayed steady versus the previous ${range} days.`
        : `Your ${challenge.name} average ${change! > 0 ? 'increased' : 'decreased'} by ${Math.abs(change!)}% versus the previous ${range} days.`
      : `You logged ${values.length} ${values.length === 1 ? 'result' : 'results'} in this period. A prior-period comparison is not available.`;

    const practiceCounts = challenge.kind === 'checklist'
      ? (challenge.config.items ?? []).map((item) => ({
          ...item,
          count: periodEntries.filter((entry) => entry.challenge_id === challenge.id && entry.payload.done?.includes(item.key)).length,
        })).sort((a, b) => b.count - a.count)
      : [];

    return {
      challenge,
      timeline,
      goalDays,
      possibleDays,
      activeDays: values.length,
      latest,
      best: historicBest,
      average: currentAverage,
      previousAverage,
      change,
      insight,
      practiceCounts,
      goalStreak,
      trendLabel,
    };
  });
  const challengeEntryCount = challengeProgress.reduce((sum, item) => sum + item.activeDays, 0);
  const goalsAchieved = challengeProgress.reduce((sum, item) => sum + item.goalDays, 0);
  const goalRate = challengeEntryCount ? Math.round((goalsAchieved / challengeEntryCount) * 100) : 0;

  const requestedChallenge = params.challenge ?? 'all';
  const selectedChallenge = active.some((challenge) => challenge.id === requestedChallenge)
    ? requestedChallenge
    : 'all';
  const visibleChallenges = selectedChallenge === 'all'
    ? challengeProgress
    : challengeProgress.filter((item) => item.challenge.id === selectedChallenge);

  const habitEntries = privateEntries.filter((entry) =>
    privateHabits.some((habit) => habit.id === entry.challenge_id)
  );
  const habitTrendProgress = privateHabits.map((habit) => {
    const currentHabitDays = trendDays.filter((day) => !habit.started_on || day >= habit.started_on);
    const previousHabitDays = trendPreviousDays.filter((day) => !habit.started_on || day >= habit.started_on);
    const rows = habitEntries.filter((entry) => entry.challenge_id === habit.id);
    const byDay = new Map(rows.map((entry) => [entry.day, entry]));
    const currentRows = rows.filter((entry) => trendDays.includes(entry.day));
    const previousRows = rows.filter((entry) => trendPreviousDays.includes(entry.day));
    const currentValues = currentHabitDays.map((day) => valueFor(byDay.get(day), habit));
    const previousValues = previousHabitDays.map((day) => valueFor(byDay.get(day), habit));
    const currentAverage = average(currentValues);
    const previousAverage = average(previousValues);
    const rawChange = precisePercentChange(currentAverage, previousAverage);
    const dataDays = new Set([...currentRows, ...previousRows].map((entry) => entry.day)).size;
    const enoughData = dataDays >= 7 && currentRows.length > 0 && previousRows.length > 0;
    const label = habit.kind === 'done'
      ? null
      : classifyTrend(rawChange, 10, enoughData);
    const completion = currentHabitDays.length
      ? Math.round((currentValues.filter((value) => value > 0).length / currentHabitDays.length) * 100)
      : 0;
    let currentStreak = 0;
    const streakDays = daysEndingAt(actualToday, Math.max(365, rows.length + 30));
    for (let index = streakDays.length - 1; index >= 0; index--) {
      const streakDay = streakDays[index];
      if (valueFor(byDay.get(streakDay), habit) > 0) currentStreak++;
      else if (streakDay !== actualToday) break;
    }
    const roundedChange = rawChange == null ? null : Math.round(rawChange);
    const insight = label === null
      ? `${habit.name} was completed on ${completion}% of the last 30 days.`
      : label === 'Not enough data'
        ? 'At least seven logged days across both periods are required for a trend.'
        : `${habit.name} daily average ${roundedChange! >= 0 ? 'up' : 'down'} ${Math.abs(roundedChange!)}% over the last 30 days.`;

    return {
      habit,
      currentAverage,
      completion,
      currentStreak,
      change: roundedChange,
      label,
      insight,
    };
  });

  const weightRows = privateBodyMetrics.filter((metric) => metric.weight_kg != null);
  const smoothedWeight = movingAverage(weightRows, (metric) => metric.weight_kg!, 7);
  const currentWeightRows = weightRows.filter((metric) => trendDays.includes(metric.day));
  const previousWeightRows = weightRows.filter((metric) => trendPreviousDays.includes(metric.day));
  const currentWeightAverages = smoothedWeight.filter((point) => trendDays.includes(point.day));
  const previousWeightAverages = smoothedWeight.filter((point) => trendPreviousDays.includes(point.day));
  const currentWeightAverage = average(currentWeightAverages.map((point) => point.value));
  const previousWeightAverage = average(previousWeightAverages.map((point) => point.value));
  const weightRawChange = precisePercentChange(currentWeightAverage, previousWeightAverage);
  const weightTrendChange = precisePercentChange(currentWeightAverage, previousWeightAverage, true);
  const weightEnoughData = currentWeightRows.length > 0
    && previousWeightRows.length > 0
    && new Set(weightRows.map((metric) => metric.day)).size >= 7
    && currentWeightAverages.length > 0
    && previousWeightAverages.length > 0;
  const weightTrendLabel = classifyTrend(weightTrendChange, 1, weightEnoughData);
  const roundedWeightChange = weightRawChange == null ? null : Math.round(weightRawChange * 10) / 10;
  const weightInsight = weightTrendLabel === 'Not enough data'
    ? 'At least seven weight measurements across both periods are required for a trend.'
    : `7-day average weight ${roundedWeightChange! >= 0 ? 'up' : 'down'} ${Math.abs(roundedWeightChange!)}% over the last 30 days.`;

  const periodTraining = ((trainingSessions ?? []) as TrainingSession[])
    .filter((session) => days.includes(session.day) && session.done);
  const periodSets = ((trainingSets ?? []) as TrainingSet[])
    .filter((set) => days.includes(set.day));
  const trendCurrentSets = ((trainingSets ?? []) as TrainingSet[])
    .filter((set) => trendDays.includes(set.day));
  const trendPreviousSets = ((trainingSets ?? []) as TrainingSet[])
    .filter((set) => trendPreviousDays.includes(set.day));
  const periodSwims = ((swimSessions ?? []) as SwimSession[])
    .filter((session) => days.includes(session.day));
  const trendCurrentSwims = ((swimSessions ?? []) as SwimSession[])
    .filter((session) => trendDays.includes(session.day) && pacePer100(session.distance_m ?? 0, session.duration_s ?? 0) > 0);
  const trendPreviousSwims = ((swimSessions ?? []) as SwimSession[])
    .filter((session) => trendPreviousDays.includes(session.day) && pacePer100(session.distance_m ?? 0, session.duration_s ?? 0) > 0);
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
  const swimSessionCount = new Set([
    ...plannedSwimDone.map((session) => session.day),
    ...periodSwims.map((session) => session.day),
  ]).size;
  const trainingVolume = Math.round(periodSets.reduce((sum, set) =>
    sum + ((set.weight_kg ?? 0) * (set.reps ?? 0)), 0
  ));
  const completedTrainingSessions = periodTraining.length;

  const exerciseLookup = new Map(PLAN.flatMap((slot) => slot.exercises ?? []).map((exercise) => [exercise.key, exercise]));
  const exerciseKeys = new Set([
    ...periodSets.map((set) => set.exercise_key),
    ...trendCurrentSets.map((set) => set.exercise_key),
    ...trendPreviousSets.map((set) => set.exercise_key),
  ]);
  const exerciseProgress = [...exerciseKeys].map((key) => {
    const exercise = exerciseLookup.get(key);
    const current = periodSets.filter((set) => set.exercise_key === key);
    const historical = ((trainingSets ?? []) as TrainingSet[]).filter((set) => set.exercise_key === key);
    const currentVolume = current.reduce((sum, set) => sum + ((set.weight_kg ?? 0) * (set.reps ?? 0)), 0);
    const sessionVolumes = (sets: TrainingSet[]) => {
      const daysForExercise = [...new Set(sets.filter((set) => set.exercise_key === key).map((set) => set.day))].sort();
      return daysForExercise.map((day) => ({
        day,
        volume: sets
          .filter((set) => set.exercise_key === key && set.day === day)
          .reduce((sum, set) => sum + ((set.weight_kg ?? 0) * (set.reps ?? 0)), 0),
      })).filter((session) => session.volume > 0);
    };
    const currentSessionVolumes = sessionVolumes(trendCurrentSets);
    const previousSessionVolumes = sessionVolumes(trendPreviousSets);
    const allTrendVolumes = [...previousSessionVolumes, ...currentSessionVolumes].sort((a, b) => a.day.localeCompare(b.day));
    const currentAverageVolume = average(currentSessionVolumes.map((session) => session.volume));
    const previousAverageVolume = average(previousSessionVolumes.map((session) => session.volume));
    const preciseVolumeChange = precisePercentChange(currentAverageVolume, previousAverageVolume);
    const strengthEnoughData = allTrendVolumes.length >= 7
      && currentSessionVolumes.length > 0
      && previousSessionVolumes.length > 0;
    const decliningThreeSessions = hasThreeConsecutiveDeclines(allTrendVolumes.map((session) => session.volume));
    const trendLabel = classifyTrend(preciseVolumeChange, 10, strengthEnoughData, decliningThreeSessions);
    const volumeChange = preciseVolumeChange == null ? null : Math.round(preciseVolumeChange);
    const bestWeight = Math.max(0, ...historical.map((set) => set.weight_kg ?? 0));
    const bestReps = Math.max(0, ...historical.map((set) => set.reps ?? 0));
    const bestSeconds = Math.max(0, ...historical.map((set) => set.seconds ?? 0));
    const sessionDays = [...new Set(current.map((set) => set.day))].sort();
    const latestDay = sessionDays.at(-1);
    const latest = current.filter((set) => set.day === latestDay);
    return {
      key,
      name: exercise?.name ?? key,
      timed: Boolean(exercise?.timed),
      currentVolume,
      change: volumeChange,
      trendLabel,
      trendInsight: trendLabel === 'Not enough data'
        ? 'At least seven loaded sessions across both periods are required for a trend.'
        : `${exercise?.name ?? key} volume ${volumeChange! >= 0 ? 'up' : 'down'} ${Math.abs(volumeChange!)}% over the last 30 days.`,
      bestWeight,
      bestReps,
      bestSeconds,
      latestWeight: Math.max(0, ...latest.map((set) => set.weight_kg ?? 0)),
      latestReps: latest.reduce((sum, set) => sum + (set.reps ?? 0), 0),
      latestSeconds: Math.max(0, ...latest.map((set) => set.seconds ?? 0)),
      sessions: sessionDays.length,
    };
  }).sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

  const swimDistanceCurrent = periodSwims.reduce((sum, session) => sum + (session.distance_m ?? 0), 0);
  const swimTimeCurrent = periodSwims.reduce((sum, session) => sum + (session.duration_s ?? 0), 0);
  const swimPace = pacePer100(swimDistanceCurrent, swimTimeCurrent);
  const validSwims = ((swimSessions ?? []) as SwimSession[]).filter((session) => pacePer100(session.distance_m ?? 0, session.duration_s ?? 0));
  const bestSwimPace = validSwims.length
    ? Math.min(...validSwims.map((session) => pacePer100(session.distance_m ?? 0, session.duration_s ?? 0)))
    : 0;
  const averageRpe = average(periodSwims.map((session) => session.rpe ?? 0).filter(Boolean));
  const trendSwimPace = pacePer100(
    trendCurrentSwims.reduce((sum, session) => sum + (session.distance_m ?? 0), 0),
    trendCurrentSwims.reduce((sum, session) => sum + (session.duration_s ?? 0), 0)
  );
  const trendPreviousSwimPace = pacePer100(
    trendPreviousSwims.reduce((sum, session) => sum + (session.distance_m ?? 0), 0),
    trendPreviousSwims.reduce((sum, session) => sum + (session.duration_s ?? 0), 0)
  );
  const swimPacePreciseChange = precisePercentChange(trendSwimPace, trendPreviousSwimPace, true);
  const swimPaceRawChange = precisePercentChange(trendSwimPace, trendPreviousSwimPace);
  const swimEnoughData = new Set([...trendCurrentSwims, ...trendPreviousSwims].map((session) => session.day)).size >= 7
    && trendCurrentSwims.length > 0
    && trendPreviousSwims.length > 0;
  const swimTrendLabel = classifyTrend(swimPacePreciseChange, 2, swimEnoughData);
  const swimPaceChange = swimPacePreciseChange == null ? null : Math.round(swimPacePreciseChange);
  const roundedSwimRawChange = swimPaceRawChange == null ? null : Math.round(swimPaceRawChange);
  const swimTrendInsight = swimTrendLabel === 'Not enough data'
    ? 'At least seven timed swim sessions across both periods are required for a trend.'
    : `Average swim pace ${roundedSwimRawChange! >= 0 ? 'up' : 'down'} ${Math.abs(roundedSwimRawChange!)}% over the last 30 days.`;

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
      else if (day !== actualToday) break;
    }
    return count;
  }

  const memberStats = (profiles ?? []).map((profile) => {
    const timeline = days.map((day) => groupDayProgress(profile.id, day));
    const met = timeline.reduce((sum, item) => sum + item.met, 0);
    const possible = timeline.reduce((sum, item) => sum + item.total, 0);
    const activeDays = timeline.filter((item) => item.checked > 0).length;
    const previousRows = shared.filter((checkin) => checkin.user_id === profile.id && previousDays.includes(checkin.day));
    const previousRate = previousRows.length
      ? Math.round((previousRows.filter((row) => row.goal_met).length / previousRows.length) * 100)
      : 0;
    const currentRate = periodCheckins.filter((checkin) => checkin.user_id === profile.id);
    const goalRate = currentRate.length
      ? Math.round((currentRate.filter((row) => row.goal_met).length / currentRate.length) * 100)
      : 0;
    return {
      ...profile,
      met,
      possible,
      activeDays,
      percent: possible ? Math.round((met / possible) * 100) : 0,
      streak: streak(profile.id),
      goalRate,
      improvement: previousRows.length ? goalRate - previousRate : null,
      yogicGoalDays: periodCheckins.filter((checkin) => checkin.user_id === profile.id && checkin.challenge_id === 'yogic' && checkin.goal_met).length,
    };
  });

  const consistencyLeader = [...memberStats].sort((a, b) => b.activeDays - a.activeDays || b.streak - a.streak)[0];
  const streakLeader = [...memberStats].sort((a, b) => b.streak - a.streak)[0];
  const improvementLeader = [...memberStats].filter((member) => member.improvement != null)
    .sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0))[0];
  const yogicLeader = [...memberStats].sort((a, b) => b.yogicGoalDays - a.yogicGoalDays)[0];

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
  const groupGoalsAchieved = periodCheckins.filter((checkin) => checkin.goal_met).length;
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
  const todayActive = new Set(shared.filter((checkin) => checkin.day === currentDay).map((checkin) => checkin.user_id)).size;
  let collectiveStreak = 0;
  for (let index = allDays.length - 1; index >= 0; index--) {
    const day = allDays[index];
    const activeOnDay = new Set(shared.filter((checkin) => checkin.day === day).map((checkin) => checkin.user_id)).size;
    if (profiles?.length && activeOnDay === profiles.length) collectiveStreak++;
    else if (day !== actualToday) break;
  }
  const strongestChallenge = [...challengePulse].sort((a, b) => b.rate - a.rate)[0];
  const needsAttention = [...challengePulse].filter((item) => item.checkins > 0).sort((a, b) => a.rate - b.rate)[0];
  const celebrations = [
    profiles?.length && todayActive === profiles.length
      ? `Everyone checked in ${currentDay === actualToday ? 'today' : `on ${shortDate(currentDay)}`}.`
      : null,
    collectiveStreak > 1 ? `The whole group has checked in for ${collectiveStreak} days in a row.` : null,
    strongestChallenge?.rate === 100 ? `Every ${strongestChallenge.challenge.name} check-in reached the goal.` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="wrap progress-page">
      <p className="eyebrow">Progress and consistency</p>
      <div className="between progress-heading">
        <h1 className="display">{view === 'me' ? 'My progress' : 'Group pulse'}</h1>
        <span className="range-label num">{range} days</span>
      </div>

      {campaign ? (
        <section className="progress-campaign-card">
          <div className="between">
            <div>
              <p className="eyebrow">{campaign.active ? 'Active campaign' : 'Campaign history'}</p>
              <h2>{campaign.name}</h2>
            </div>
            <span className="campaign-duration num">{campaign.duration_days} days</span>
          </div>
          {campaign.description && <p className="muted">{campaign.description}</p>}
          <p className="campaign-dates num">{campaign.starts_on} → {campaign.ends_on}</p>
        </section>
      ) : (
        <p className="empty">No campaign is available yet.</p>
      )}

      {campaigns.length > 1 && (
        <nav className="campaign-picker" aria-label="Campaign history">
          {campaigns.map((item) => (
            <Link key={item.id}
              href={`/semana?view=${view}&days=${range}&challenge=all&campaign=${item.id}`}
              data-on={item.id === campaign?.id}>
              {item.name}<small>{item.active ? 'Active' : `${item.starts_on} · ${item.duration_days} days`}</small>
            </Link>
          ))}
        </nav>
      )}

      <nav className="view-picker" aria-label="Progress view">
        <Link href={`/semana?view=me&days=${range}&challenge=${selectedChallenge}&campaign=${campaign?.id ?? ''}`} data-on={view === 'me'}>
          My progress
          <small>Private</small>
        </Link>
        <Link href={`/semana?view=group&days=${range}&challenge=${selectedChallenge}&campaign=${campaign?.id ?? ''}`} data-on={view === 'group'}>
          Group pulse
          <small>Shared</small>
        </Link>
      </nav>

      <nav className="range-picker" aria-label="Progress period">
        {RANGES.map((value) => (
          <Link key={value} href={`/semana?view=${view}&days=${value}&challenge=${selectedChallenge}&campaign=${campaign?.id ?? ''}`}
                className="range-option" data-on={range === value}>
            {value}
            <small>days</small>
          </Link>
        ))}
      </nav>

      {view === 'me' ? (
        <>
          <section className="insight-strip" aria-label="Personal overview">
            <div><strong className="num">{challengeEntryCount}</strong><span>challenge entries<small>one activity on one day</small></span></div>
            <div><strong className="num">{completedTrainingSessions}</strong><span>completed sessions<small>strength or swimming</small></span></div>
            <div><strong className="num">{goalRate}%</strong><span>goals achieved<small>{goalsAchieved} of {challengeEntryCount}</small></span></div>
          </section>

          <div className="section-heading">
            <div><p className="eyebrow">30-day trend layer</p><h2>Body and private habits</h2></div>
            <span className="privacy-pill">Only you</span>
          </div>

          <div className="trend-layer-grid">
            <article className="insight-card trend-layer-card">
              <div className="between insight-title">
                <div><p className="eyebrow">Body</p><h3>Weight</h3></div>
                <span className="trend-mark" data-direction={trendDirection(weightTrendLabel)}>{weightTrendLabel}</span>
              </div>
              <div className="metric-row two">
                <div><span>7-day average</span><strong className="num">{currentWeightAverage ? `${currentWeightAverage.toFixed(1)} kg` : '—'}</strong></div>
                <div><span>vs prior 30 days</span><strong className="num">{roundedWeightChange == null ? 'Not enough data' : `${roundedWeightChange > 0 ? '+' : ''}${roundedWeightChange}%`}</strong></div>
              </div>
              <p className="auto-insight">{weightInsight}</p>
              <p className="metric-explainer">Trend uses a 7-day moving average. Daily weight values are not shown.</p>
            </article>

            {habitTrendProgress.map((item) => (
              <article className="insight-card trend-layer-card" key={item.habit.id}>
                <div className="between insight-title">
                  <div><p className="eyebrow">Private habit</p><h3>{item.habit.name}</h3></div>
                  {item.label && <span className="trend-mark" data-direction={trendDirection(item.label)}>{item.label}</span>}
                </div>
                {item.habit.kind === 'done' ? (
                  <div className="metric-row two">
                    <div><span>30-day completion</span><strong className="num">{item.completion}%</strong></div>
                    <div><span>Current streak</span><strong className="num">{plural(item.currentStreak, 'day')}</strong></div>
                  </div>
                ) : (
                  <div className="metric-row two">
                    <div><span>Daily average</span><strong className="num">{formatAverageValue(item.currentAverage, item.habit)}</strong></div>
                    <div><span>vs prior 30 days</span><strong className="num">{item.change == null ? 'Not enough data' : signedPercent(item.change)}</strong></div>
                  </div>
                )}
                <p className="auto-insight">{item.insight}</p>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">Campaign activities</p><h2>Exact results</h2></div>
            <span className="privacy-pill">Only you</span>
          </div>

          <nav className="challenge-filter" aria-label="Activity filter">
            <Link href={`/semana?view=me&days=${range}&challenge=all&campaign=${campaign?.id ?? ''}`} data-on={selectedChallenge === 'all'}>All</Link>
            {active.map((challenge) => (
              <Link key={challenge.id} href={`/semana?view=me&days=${range}&challenge=${challenge.id}&campaign=${campaign?.id ?? ''}`}
                    data-on={selectedChallenge === challenge.id}>{challenge.name}</Link>
            ))}
          </nav>

          <div className="challenge-insights">
            {visibleChallenges.map((item) => (
              <article className="insight-card" key={item.challenge.id}>
                <div className="between insight-title">
                  <div>
                    <h3>{item.challenge.name}</h3>
                    <p className="muted">
                      {item.goalDays}/{item.possibleDays} goal days · {plural(item.activeDays, 'entry', 'entries')}
                    </p>
                  </div>
                  <span className="trend-mark" data-direction={item.change == null ? 'unknown' : item.change > 2 ? 'up' : item.change < -2 ? 'down' : 'steady'}>
                    {item.trendLabel}
                  </span>
                </div>

                <div className="personal-chart" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
                  {item.timeline.map((point) => (
                    <i key={point.day} title={`${shortDate(point.day)}: ${formatValue(point.value, item.challenge)}`}
                       data-today={point.day === currentDay}
                       data-empty={point.value === 0}
                       style={{ '--bar-height': `${point.value ? Math.max(point.percent, 10) : 5}%` } as CSSProperties} />
                  ))}
                </div>
                <div className="chart-axis num"><span>{shortDate(days[0])}</span><span>{axisEndLabel}</span></div>

                <div className="metric-row">
                  <div><span>Latest</span><strong className="num">{formatValue(item.latest, item.challenge)}</strong></div>
                  <div><span>Average</span><strong className="num">{formatAverageValue(item.average, item.challenge)}</strong></div>
                  <div>
                    <span>vs prior {range} days</span>
                    <strong className="num" data-positive={item.change != null && item.change > 0}>{signedPercent(item.change)}</strong>
                  </div>
                </div>
                <div className="record-row">
                  <span>Personal record</span>
                  <strong className="num">{formatValue(item.best, item.challenge)}</strong>
                </div>
                <div className="record-row">
                  <span>Current goal streak</span>
                  <strong className="num">{plural(item.goalStreak, 'day')}</strong>
                </div>
                <p className="auto-insight">{item.insight}</p>
                {item.practiceCounts.length > 0 && (
                  <div className="practice-frequency">
                    <div><span>Most frequent</span><strong>{item.practiceCounts[0]?.name ?? '—'} · {item.practiceCounts[0]?.count ?? 0}</strong></div>
                    <div><span>Least frequent</span><strong>{item.practiceCounts.at(-1)?.name ?? '—'} · {item.practiceCounts.at(-1)?.count ?? 0}</strong></div>
                  </div>
                )}
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
              <div className="between"><p className="eyebrow">Swimming</p><span className="trend-mark" data-direction={trendDirection(swimTrendLabel)}>{swimTrendLabel}</span></div>
              <strong className="big-metric num">{(swimDistance / 1000).toFixed(swimDistance ? 1 : 0)} km</strong>
              <p className="muted">distance completed</p>
              <div className="metric-row">
                <div><span>Sessions</span><strong className="num">{swimSessionCount}</strong></div>
                <div><span>Avg pace</span><strong className="num">{swimPace ? `${mmss(swimPace)}/100m` : '—'}</strong></div>
                <div><span>vs prior 30 days</span><strong className="num">{signedPercent(swimPaceChange)}</strong></div>
              </div>
              <div className="record-row"><span>Best pace</span><strong className="num">{bestSwimPace ? `${mmss(bestSwimPace)}/100m` : '—'}</strong></div>
              <div className="record-row"><span>Average effort</span><strong className="num">{averageRpe ? `${averageRpe.toFixed(1)}/10` : '—'}</strong></div>
              <p className="auto-insight">{swimTrendInsight}</p>
              <p className="metric-explainer">Pace is calculated only from the distance and duration you enter manually. No watch is connected.</p>
            </article>
          </div>

          {exerciseProgress.length > 0 && (
            <>
              <div className="section-heading"><div><p className="eyebrow">By exercise</p><h2>Strength evolution</h2></div></div>
              <div className="exercise-progress-grid">
                {exerciseProgress.map((exercise) => (
                  <article className="exercise-progress-card" key={exercise.key}>
                    <div className="between"><h3>{exercise.name}</h3><span className="trend-mark" data-direction={trendDirection(exercise.trendLabel)}>{exercise.trendLabel}</span></div>
                    <div className="metric-row">
                      <div><span>Latest</span><strong className="num">{exercise.timed ? mmss(exercise.latestSeconds) : exercise.latestWeight ? `${exercise.latestWeight} kg` : `${exercise.latestReps} reps`}</strong></div>
                      <div><span>Personal best</span><strong className="num">{exercise.timed ? mmss(exercise.bestSeconds) : exercise.bestWeight ? `${exercise.bestWeight} kg` : `${exercise.bestReps} reps`}</strong></div>
                      <div><span>vs prior 30 days</span><strong className="num">{signedPercent(exercise.change)}</strong></div>
                    </div>
                    <p className="auto-insight">{exercise.trendInsight}</p>
                  </article>
                ))}
              </div>
            </>
          )}

          <p className="muted progress-note">
            Your habits, body measurements, repetitions, times, selected Yogic practices, weights and swim details are private.
          </p>
        </>
      ) : (
        <>
          {celebrations.length > 0 && (
            <section className="celebration-stack" aria-label="Group celebrations">
              {celebrations.map((message) => <p key={message}>✦ {message}</p>)}
            </section>
          )}
          <section className="insight-strip" aria-label="Group overview">
            <div><strong className="num">{groupParticipation}%</strong><span>daily participation<small>active member-days</small></span></div>
            <div><strong className="num">{groupGoalRate}%</strong><span>shared goals met<small>{groupGoalsAchieved} of {periodCheckins.length}</small></span></div>
            <div><strong className="num">{collectiveStreak}</strong><span>full-group streak<small>days in a row</small></span></div>
          </section>

          <article className="insight-card group-trend-card">
            <div className="between insight-title">
              <div><p className="eyebrow">Momentum</p><h2>Active members by day</h2></div>
              <strong className="num">{todayActive}/{profiles?.length ?? 0}<small> {currentDay === actualToday ? 'today' : 'period end'}</small></strong>
            </div>
            <div className="personal-chart group-chart" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
              {groupTimeline.map((point) => (
                <i key={point.day} title={`${shortDate(point.day)}: ${point.activeMembers}/${profiles?.length ?? 0} members`}
                   data-today={point.day === currentDay}
                   data-empty={point.activeMembers === 0}
                   style={{ '--bar-height': `${point.activeMembers ? Math.max(point.percent, 10) : 5}%` } as CSSProperties} />
              ))}
            </div>
            <div className="chart-axis num"><span>{shortDate(days[0])}</span><span>{axisEndLabel}</span></div>
            <p className="metric-explainer">Each bar shows how many active members logged at least one challenge that day.</p>
          </article>

          <p className="metric-explainer collective-explainer">
            Full-group streak counts consecutive days when every active member logged at least one activity. {currentDay === actualToday ? 'Today counts only after everyone checks in.' : 'For historical campaigns, the count ends on the campaign period shown.'}
          </p>

          <div className="section-heading">
            <div><p className="eyebrow">By activity</p><h2>What is working</h2></div>
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
                <p className="muted">{person.activeDays}/{days.length} active days · {plural(person.streak, 'day')} streak</p>
              </article>
            ))}
          </div>

          <div className="section-heading"><div><p className="eyebrow">Positive competition</p><h2>Relative rankings</h2></div></div>
          <div className="ranking-grid">
            <article><span>Most consistent</span><strong>{consistencyLeader?.display_name ?? '—'}</strong><small>{consistencyLeader ? `${consistencyLeader.activeDays}/${days.length} active days` : 'No activity yet'}</small></article>
            <article><span>Longest current streak</span><strong>{streakLeader?.display_name ?? '—'}</strong><small>{streakLeader ? plural(streakLeader.streak, 'day') : 'No streak yet'}</small></article>
            <article><span>Most improved</span><strong>{improvementLeader?.display_name ?? '—'}</strong><small>{improvementLeader?.improvement != null ? `${signedPercent(improvementLeader.improvement)} goal rate` : 'Comparison pending'}</small></article>
            <article><span>Yogic goal days</span><strong>{yogicLeader?.display_name ?? '—'}</strong><small>{yogicLeader ? plural(yogicLeader.yogicGoalDays, 'day') : 'No result yet'}</small></article>
          </div>

          {needsAttention && strongestChallenge && (
            <p className="auto-insight group-insight">
              {strongestChallenge.challenge.name} has the strongest goal rate at {strongestChallenge.rate}%. {needsAttention.challenge.name} has the most room to grow at {needsAttention.rate}%.
            </p>
          )}

          <p className="muted progress-note">
            Group insights use check-ins and goal completion only. Exact repetitions, times and selections stay private.
          </p>
        </>
      )}
    </main>
  );
}
