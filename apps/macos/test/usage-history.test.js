import test from 'node:test';
import assert from 'node:assert/strict';
import { usageSummary, appUsageSummary } from '../src/shared/usage-history.js';
const now = new Date(2026, 9, 16, 9);
const record = (seconds, apps = {}) => ({ seconds, apps });
const days = {
  '2025-12-31': record(900, { editor: { name: 'Editor', seconds: 900 } }),
  '2026-01-01': record(1200, { editor: { name: 'Old editor', seconds: 1200 } }),
  '2026-09-30': record(600, { browser: { name: 'Browser', seconds: 600 } }),
  '2026-10-11': record(300),
  '2026-10-12': record(100.5, { editor: { name: 'Editor', seconds: 100.5 } }),
  '2026-10-16': record(200.5, { editor: { name: 'New editor', seconds: 150.25 }, browser: { name: 'Browser', seconds: 50.25 } }),
  '2026-10-17': record(9999, { editor: { name: 'Future', seconds: 9999 } })
};
test('usage totals and app totals follow day/week/month/year boundaries, excluding future records', () => {
  for (const [period, total, activeDays] of [['day', 200.5, 1], ['week', 301, 2], ['month', 601, 3], ['year', 2401, 5]]) {
    const result = usageSummary(days, period, now, now);
    assert.equal(result.totalSeconds, total); assert.equal(result.activeDays, activeDays);
    assert.equal(result.apps.reduce((n, app) => n + app.seconds, 0) + result.unknownSeconds, total);
  }
  const year = usageSummary(days, 'year', now, now);
  assert.deepEqual(year.apps[0], { id: 'editor', name: 'New editor', seconds: 1450.75 });
  assert.equal(year.unknownSeconds, 300);
  assert.equal(year.buckets[9].seconds, 601);
  assert.equal(year.buckets.length, 12);
});
test('same application across days merges by ID, while same-name applications remain distinct', () => {
  const result = usageSummary({
    '2026-10-15': record(20, { a: { name: 'App', seconds: 20 } }),
    '2026-10-16': record(40, { a: { name: 'App', seconds: 10 }, b: { name: 'App', seconds: 30 } })
  }, 'month', now, now);
  assert.equal(result.apps.length, 2);
  assert.deepEqual(result.apps.map(a => a.seconds), [30, 30]);
});
test('empty days, missing application detail, and leap-year months remain explicit', () => {
  assert.equal(usageSummary({}, 'month', new Date(2024, 1, 10), now).buckets.length, 29);
  const missing = usageSummary({ '2026-10-16': record(3600) }, 'day', now, now);
  assert.equal(missing.unknownSeconds, 3600); assert.deepEqual(missing.apps, []);
  assert.equal(missing.buckets.length, 7);
  assert.equal(missing.buckets[0].seconds, 0);
  const empty = usageSummary({}, 'year', now, now);
  assert.equal(empty.totalSeconds, 0); assert.equal(empty.activeDays, 0);
  assert.equal(empty.buckets[10].future, true);
});
test('cross-year Monday week includes both years and no preceding Sunday', () => {
  const selected = new Date(2026, 0, 1);
  const result = usageSummary({ '2025-12-28': record(500), '2025-12-29': record(100), '2026-01-01': record(200) }, 'week', selected, now);
  assert.equal(result.totalSeconds, 300);
  assert.equal(result.label, '2025.12.29 — 2026.01.04');
});

test('application detail filters every period and trend by stable ID', () => {
  for (const [period, total, activeDays] of [['day', 150.25, 1], ['week', 250.75, 2], ['month', 250.75, 2], ['year', 1450.75, 3]]) {
    const detail = appUsageSummary(days, 'editor', period, now, now);
    assert.equal(detail.totalSeconds, total); assert.equal(detail.activeDays, activeDays);
    assert.equal(detail.averageSeconds, total / activeDays);
    if (period !== 'day') assert.equal(detail.buckets.reduce((n, b) => n + b.seconds, 0), total);
  }
  const detail = appUsageSummary(days, 'editor', 'year', now, now);
  assert.equal(detail.buckets[8].seconds, 0); // Browser-only month is not editor usage.
  assert.equal(detail.buckets[9].seconds, 250.75);
  assert.equal(detail.unattributedSeconds, 300);
});
test('app details do not merge same-name apps or assign missing history to an app', () => {
  const input = { '2026-10-16': record(600, { a: { name: 'Same', seconds: 100 }, b: { name: 'Same', seconds: 200 } }) };
  assert.equal(appUsageSummary(input, 'a', 'day', now, now).totalSeconds, 100);
  assert.equal(appUsageSummary(input, 'b', 'day', now, now).totalSeconds, 200);
  const absent = appUsageSummary(input, 'absent', 'day', now, now);
  assert.equal(absent.totalSeconds, 0); assert.equal(absent.activeDays, 0); assert.equal(absent.averageSeconds, 0);
  assert.equal(absent.unattributedSeconds, 300);
  assert.ok(absent.buckets.every(b => b.seconds === 0));
  assert.equal(appUsageSummary(days, 'editor', 'year', new Date(2025, 5, 1), now).totalSeconds, 900);
});
