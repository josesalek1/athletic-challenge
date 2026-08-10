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
  windowSize = 7
) {
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  return ordered.flatMap((row, index) => {
    if (index < windowSize - 1) return [];
    const window = ordered.slice(index - windowSize + 1, index + 1);
    return [{ day: row.day, value: window.reduce((sum, item) => sum + value(item), 0) / windowSize }];
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
