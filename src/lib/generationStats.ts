export type GenerationTrendGranularity = 'day' | 'month';

export interface GenerationTrendBucket {
  key: string;
  value: number;
}

const shanghaiDateParts = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day') };
};

export function getGenerationTrendBucket(timestamp: number, granularity: GenerationTrendGranularity): string {
  const parts = shanghaiDateParts(timestamp);
  return granularity === 'day'
    ? `${parts.year}-${parts.month}-${parts.day}`
    : `${parts.year}-${parts.month}`;
}

export function aggregateGenerationTrend(
  logs: Array<{ timestamp: number | string }>,
  granularity: GenerationTrendGranularity,
): GenerationTrendBucket[] {
  const counts = new Map<string, number>();
  logs.forEach(log => {
    const timestamp = Number(log.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const key = getGenerationTrendBucket(timestamp, granularity);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value }));
}

export function buildGenerationTrendSeries(
  year: number,
  month: number,
  buckets: GenerationTrendBucket[],
): Array<{ name: string; value: number }> {
  const counts = new Map(buckets.map(bucket => [bucket.key, Number(bucket.value) || 0]));
  if (month > 0) {
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { name: `${day}日`, value: counts.get(key) || 0 };
    });
  }
  if (year <= 0) {
    const totalsByMonth = new Map<number, number>();
    buckets.forEach(bucket => {
      const bucketMonth = Number(bucket.key.slice(5, 7));
      if (bucketMonth >= 1 && bucketMonth <= 12) {
        totalsByMonth.set(bucketMonth, (totalsByMonth.get(bucketMonth) || 0) + (Number(bucket.value) || 0));
      }
    });
    return Array.from({ length: 12 }, (_, index) => ({
      name: `${index + 1}月`,
      value: totalsByMonth.get(index + 1) || 0,
    }));
  }
  return Array.from({ length: 12 }, (_, index) => {
    const currentMonth = index + 1;
    const key = `${year}-${String(currentMonth).padStart(2, '0')}`;
    return { name: `${currentMonth}月`, value: counts.get(key) || 0 };
  });
}
