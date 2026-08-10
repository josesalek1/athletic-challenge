export type TrendLabel = 'Improving' | 'Holding steady' | 'Declining' | 'Not enough data';

export function percentChange(current: number, previous: number, lowerIsBetter = false) {
  if (!previous) return null;
  const raw = ((current - previous) / previous) * 100;
  return lowerIsBetter ? -raw : raw;
}

export function classifyTrend(
  change: number | null,
  threshold: number,
  enoughData: boolean,
  allowDecline = true
): TrendLabel {
  if (!enoughData || change == null) return 'Not enough data';
  if (change >= threshold) return 'Improving';
  if (allowDecline && change <= -threshold) return 'Declining';
  return 'Holding steady';
}

export function movingAverage<T extends { day: string }>(
  rows: T[],
  value: (row: T) => number,
  windowDays = 7
) {
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  return ordered.map((row) => {
    const end = new Date(`${row.day}T12:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - windowDays + 1);
    const startDay = start.toISOString().slice(0, 10);
    const window = ordered.filter((item) => item.day >= startDay && item.day <= row.day);
    return {
      day: row.day,
      value: window.reduce((sum, item) => sum + value(item), 0) / window.length,
    };
  });
}

export function hasThreeConsecutiveDeclines(values: number[]) {
  const last = values.slice(-3);
  return last.length === 3 && last[0] > last[1] && last[1] > last[2];
}

export function trendDirection(label: TrendLabel) {
  if (label === 'Improving') return 'up';
  if (label === 'Declining') return 'down';
  if (label === 'Holding steady') return 'steady';
  return 'unknown';
}
