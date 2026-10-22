import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, actionSummary, dateKey, shiftPeriod, periodStart } from '../src/shared/activity-history.js';
const now = new Date(2026, 9, 16, 14);
const record = (sets, actions = {}) => ({ sessions: 1, sets, actions });
const days = {
  '2025-12-31': record(50, { '深蹲': 50 }),
  '2026-01-01': record(20, { '深蹲': 20 }),
  '2026-09-30': record(5, { '深蹲': 5 }),
  '2026-10-11': record(3, { '侧头': 3 }),
  '2026-10-12': record(2, { '深蹲': 2 }),
  '2026-10-16': record(4, { '侧头': 3, '深蹲': 1 }),
  '2026-10-17': record(99, { '深蹲': 99 }),
};
test('day/week/month/year aggregate only their local calendar period through today', () => {
  for (const [period, total, sessions] of [['day', 4, 1], ['week', 6, 2], ['month', 9, 3], ['year', 34, 5]]) {
    const result = activitySummary(days, period, now, now);
    assert.equal(result.sets, total); assert.equal(result.sessions, sessions);
    assert.equal(result.activeDays, sessions);
    assert.equal(result.actions.reduce((sum, [, value]) => sum + value, 0), total);
  }
  assert.deepEqual(activitySummary(days, 'day', now, now).actions, [['侧头', 3], ['深蹲', 1]]);
  assert.equal(activitySummary(days, 'year', now, now).buckets[9].value, 9);
});
test('weeks start Monday, including weeks crossing years and Sunday selection', () => {
  assert.equal(dateKey(periodStart('week', new Date(2026, 0, 1))), '2025-12-29');
  assert.equal(dateKey(periodStart('week', new Date(2026, 9, 18))), '2026-10-12');
});
test('calendar navigation handles month end, leap years, and year boundaries', () => {
  assert.equal(dateKey(shiftPeriod('month', new Date(2026, 0, 31), 1)), '2026-02-01');
  assert.equal(dateKey(shiftPeriod('day', new Date(2024, 1, 28), 1)), '2024-02-29');
  assert.equal(dateKey(shiftPeriod('year', new Date(2026, 9, 16), -1)), '2025-01-01');
  assert.equal(activitySummary({}, 'month', new Date(2024, 1, 4), now).buckets.length, 29);
});
test('missing dates are zero-filled, future dates distinct, and legacy unnamed sets remain visible', () => {
  const summary = activitySummary({ '2026-10-16': record(5) }, 'month', now, now);
  assert.equal(summary.unknownSets, 5); assert.deepEqual(summary.actions, []);
  assert.equal(summary.buckets.length, 31); assert.equal(summary.buckets[0].value, 0);
  assert.equal(summary.buckets[16].future, true);
  assert.equal(activitySummary({}, 'day', now, now).buckets.length, 7);
  assert.equal(activitySummary({}, 'year', now, now).sets, 0);
});

test('action detail counts only the selected saved name across calendar periods', () => {
  for (const [period, total, activeDays] of [['day', 1, 1], ['week', 3, 2], ['month', 3, 2], ['year', 28, 4]]) {
    const result = actionSummary(days, '深蹲', period, now, now);
    assert.equal(result.totalCount, total); assert.equal(result.activeDays, activeDays);
    assert.equal(result.averageCount, total / activeDays);
    if (period !== 'day') assert.equal(result.buckets.reduce((n, b) => n + b.value, 0), total);
  }
  assert.equal(actionSummary(days, '深蹲', 'year', now, now).buckets[9].value, 3);
  assert.equal(actionSummary(days, '深蹲', 'year', new Date(2025, 5, 1), now).totalCount, 50);
  assert.equal(actionSummary(days, '侧头', 'month', now, now).totalCount, 6);
});
test('unknown historical sets are never assigned to an action; absent actions are zero-filled', () => {
  const input = { '2026-10-15': record(5), '2026-10-16': record(3, { '动作': 2, '动作（另一种）': 1 }) };
  const known = actionSummary(input, '动作', 'month', now, now);
  assert.equal(known.totalCount, 2); assert.equal(known.activeDays, 1); assert.equal(known.unknownSets, 5);
  const absent = actionSummary(input, '未做过的动作', 'month', now, now);
  assert.equal(absent.totalCount, 0); assert.equal(absent.activeDays, 0); assert.equal(absent.averageCount, 0);
  assert.ok(absent.buckets.every(b => b.value === 0));
  assert.equal(absent.buckets.length, 31); assert.equal(absent.buckets[16].future, true);
  assert.equal(actionSummary(input, 'toString', 'day', now, now).totalCount, 0);
});
