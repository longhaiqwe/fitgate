import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine, localDay, sanitizeSettings } from '../electron/engine.js';
import { actionSummary, activitySummary } from '../src/shared/activity-history.js';
const now = new Date(2026, 9, 20, 12).getTime();
const sample = (e, extra = {}) => e.tick({ now: e.lastTick + 1000, ...extra });
test('warns once before the limit, persists across restart and rearms after completion', () => {
  let e = new UsageEngine({ settings: { usageLimit: 2, warnSeconds: 30 } }, now);
  for (let i = 0; i < 89; i++) assert.equal(sample(e), undefined);
  assert.equal(sample(e), 30);
  e = new UsageEngine(JSON.parse(JSON.stringify(e.snapshot())), e.lastTick);
  assert.equal(sample(e), undefined);
  e.complete(1, e.lastTick, ['home_squats']);
  for (let i = 0; i < 89; i++) sample(e);
  assert.equal(sample(e), 30);
});
test('disabled warnings and inactive contexts never send a pre-warning', () => {
  for (const extra of [{ idle: 61 }, { sleeping: true }, { screenLocked: true }, { workout: true }, { target: false }, { available: false }]) {
    const e = new UsageEngine({ settings: { usageLimit: 2, warnSeconds: 30 }, usage: { seconds: 89 } }, now);
    assert.equal(sample(e, extra), undefined);
    assert.equal(sample(e), 30);
  }
  const e = new UsageEngine({ settings: { usageLimit: 1, warnSeconds: 0 } }, now);
  for (let i = 0; i < 60; i++) assert.equal(sample(e), undefined);
  assert.equal(e.usage.isLocked, true);
});
test('snooze rearms warning using the later of usage limit and snooze deadline', () => {
  const e = new UsageEngine({ settings: { usageLimit: 1, warnSeconds: 30 } }, now);
  for (let i = 0; i < 60; i++) sample(e);
  e.snooze(e.lastTick);
  for (let i = 0; i < 269; i++) assert.equal(sample(e), undefined);
  assert.equal(sample(e), 30);
  for (let i = 0; i < 30; i++) assert.equal(sample(e), undefined);
  assert.equal(e.usage.isLocked, true);
});
test('timed pause expires without charging paused time, including restart', () => {
  const e = new UsageEngine({ settings: { paused: true, pausedUntil: now + 2000 } }, now);
  sample(e); assert.equal(e.settings.paused, true); assert.equal(e.usage.seconds, 0);
  sample(e); assert.equal(e.settings.paused, false); assert.equal(e.settings.pausedUntil, 0); assert.equal(e.usage.seconds, 0);
  sample(e); assert.equal(e.usage.seconds, 1);
  const restarted = new UsageEngine({ settings: { paused: true, pausedUntil: now - 1 } }, now);
  assert.equal(restarted.settings.paused, false);
  assert.equal(new UsageEngine({ settings: { paused: true, pausedUntil: now + 5000 } }, now).settings.paused, true);
});
test('manual resume clears deadline and legacy indefinite pause remains indefinite', () => {
  const e = new UsageEngine({ settings: { paused: true, pausedUntil: now + 2000 } }, now);
  e.updateSettings({ paused: false }); assert.equal(e.settings.pausedUntil, 0);
  const legacy = new UsageEngine({ settings: { paused: true } }, now);
  for (let i = 0; i < 3; i++) sample(legacy);
  assert.equal(legacy.settings.paused, true); assert.equal(legacy.settings.pausedUntil, 0);
  assert.equal(sanitizeSettings({ warnSeconds: 77 }).warnSeconds, 60);
  assert.equal(sanitizeSettings({ paused: true, pausedUntil: Infinity }).pausedUntil, 0);
});
test('legacy names merge into stable IDs once, preserving unknown records and totals', () => {
  const day = localDay(now);
  const saved = { days: { [day]: { seconds: 10, sessions: 3, sets: 10, actions: { '背后交扣侧头': 2, '坐姿侧头舒展': 3, seated_behind_neck: 1, '活力开合跳': 1, '旧动作': 3 } } } };
  const original = JSON.stringify(saved);
  const e = new UsageEngine(saved, now);
  assert.deepEqual(e.days[day].actions, { seated_behind_neck: 6, home_jumping_jacks: 1, '旧动作': 3 });
  assert.equal(JSON.stringify(saved), original, 'migration does not mutate the input backup');
  const restored = new UsageEngine(JSON.parse(JSON.stringify(e.snapshot())), now);
  assert.deepEqual(restored.days, e.days);
  assert.equal(restored.days[day].sets, 10);
  restored.complete(2, now, ['seated_behind_neck', 'seated_behind_neck']);
  assert.equal(restored.days[day].actions.seated_behind_neck, 8);
});
test('action history and drill-down combine legacy names and IDs without attributing unknown sets', () => {
  const days = { [localDay(now)]: { sessions: 1, sets: 9, actions: { '背后交扣侧头': 2, seated_behind_neck: 3, '旧动作': 1 } } };
  const result = activitySummary(days, 'day', new Date(now), new Date(now));
  assert.deepEqual(result.actions, [['seated_behind_neck', 5], ['旧动作', 1]]);
  const detail = actionSummary(days, 'seated_behind_neck', 'day', new Date(now), new Date(now));
  assert.equal(detail.totalCount, 5); assert.equal(detail.unknownSets, 3);
});
