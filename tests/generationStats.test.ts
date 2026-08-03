import assert from 'node:assert/strict';
import { aggregateGenerationTrend, buildGenerationTrendSeries, getGenerationTrendBucket } from '../src/lib/generationStats';

const lateUtc = Date.parse('2026-07-31T16:30:00.000Z');
assert.equal(getGenerationTrendBucket(lateUtc, 'day'), '2026-08-01');
assert.equal(getGenerationTrendBucket(lateUtc, 'month'), '2026-08');

const buckets = aggregateGenerationTrend([
  { timestamp: Date.parse('2026-07-01T01:00:00+08:00') },
  { timestamp: Date.parse('2026-07-01T02:00:00+08:00').toString() },
  { timestamp: Date.parse('2026-07-03T02:00:00+08:00') },
], 'day');
assert.deepEqual(buckets, [
  { key: '2026-07-01', value: 2 },
  { key: '2026-07-03', value: 1 },
]);

const daily = buildGenerationTrendSeries(2026, 7, buckets);
assert.equal(daily.length, 31);
assert.deepEqual(daily[0], { name: '1日', value: 2 });
assert.deepEqual(daily[2], { name: '3日', value: 1 });

const monthly = buildGenerationTrendSeries(2026, 0, [
  { key: '2026-01', value: 4 },
  { key: '2026-12', value: 9 },
]);
assert.equal(monthly.length, 12);
assert.deepEqual(monthly[0], { name: '1月', value: 4 });
assert.deepEqual(monthly[11], { name: '12月', value: 9 });

const allYears = buildGenerationTrendSeries(0, 0, [
  { key: '2025-01', value: 2 },
  { key: '2026-01', value: 3 },
]);
assert.deepEqual(allYears[0], { name: '1月', value: 5 });

console.log('generation stats tests passed');
