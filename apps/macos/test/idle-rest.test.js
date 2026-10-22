import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine, localDay, sanitizeSettings } from '../electron/engine.js';
import { activitySummary } from '../src/shared/activity-history.js';
const start = new Date(2026, 9, 20, 12).getTime();
function used(settings = {}) {
  const e = new UsageEngine({ settings }, start);
  for (let i = 1; i <= 30; i++) e.tick({ now: start + i * 1000 });
  return e;
}
test('five-minute idle resets the cycle once and never credits exercise', () => {
  const e = used();
  e.usage.warned = true; e.usage.snoozedUntil = start + 999999;
  e.tick({ now: start + 329000, idle: 299 }); assert.equal(e.usage.seconds, 30);
  e.tick({ now: start + 330000, idle: 300 });
  assert.equal(e.usage.seconds, 0); assert.equal(e.usage.warned, false); assert.equal(e.usage.snoozedUntil, 0);
  for (let i = 331; i < 400; i++) e.tick({ now: start + i * 1000, idle: i - 30 });
  assert.equal(e.day(start).idleBreaks, 1); assert.equal(e.day(start).seconds, 30);
  assert.equal(e.day(start).sessions, 0); assert.equal(e.day(start).sets, 0); assert.deepEqual(e.day(start).actions, {});
});
test('restart during the same idle episode does not duplicate the break; new use rearms it', () => {
  let e = used(); e.tick({ now: start + 330000, idle: 300 });
  e = new UsageEngine(JSON.parse(JSON.stringify(e.snapshot())), start + 400000);
  e.tick({ now: start + 401000, idle: 371 }); assert.equal(e.day(start).idleBreaks, 1);
  e.tick({ now: start + 402000, idle: 0 });
  e.tick({ now: start + 702000, idle: 300 }); assert.equal(e.day(start).idleBreaks, 2);
});
test('configured reset thresholds work even when idle pause is longer', () => {
  for (const breakResetSeconds of [120, 300, 600, 900]) {
    const e = used({ breakResetSeconds, idleSeconds: 900 });
    e.tick({ now: start + (30 + breakResetSeconds) * 1000, idle: breakResetSeconds });
    e.tick({ now: start + (31 + breakResetSeconds) * 1000, idle: breakResetSeconds + 1 });
    assert.equal(e.usage.seconds, 0); assert.equal(e.day(start).idleBreaks, 1);
  }
  assert.equal(sanitizeSettings({ breakResetSeconds: -1 }).breakResetSeconds, 300);
});
test('locked reminders are cleared by idle rest, without camera credit', () => {
  const e = used(); e.usage.isLocked = true; e.beginRest(start + 30000);
  e.tick({ now: start + 330000, idle: 300 });
  assert.equal(e.usage.isLocked, false); assert.equal(e.usage.restMode, null); assert.equal(e.day(start).idleBreaks, 1);
});
test('sleep and lock duration uses observed departure and repeated wake signals count once', () => {
  const e = used();
  assert.equal(typeof e.beginAway, 'function'); assert.equal(typeof e.checkIdleRest, 'function');
  e.beginAway(start + 30000);
  e.beginAway(start + 60000);
  e.checkIdleRest(start + 330000, 0);
  e.checkIdleRest(start + 330000, 0);
  assert.equal(e.usage.seconds, 0); assert.equal(e.day(start).idleBreaks, 1);
});
test('no invented break on a fresh install or solely because the app was closed', () => {
  const empty = new UsageEngine({}, start); empty.tick({ now: start + 300000, idle: 300 });
  assert.equal(empty.day(start).idleBreaks, 0);
  const e = used(); const restored = new UsageEngine(e.snapshot(), start + 600000);
  assert.equal(restored.usage.seconds, 30);
  restored.tick({ now: start + 601000, idle: 601 }); assert.equal(restored.day(start).idleBreaks, 1);
});
test('ongoing workout and fresh verified standing are not interrupted by keyboard idle', () => {
  const e = used(); e.tick({ now: start + 330000, idle: 300, workout: true });
  assert.equal(e.usage.seconds, 30); assert.equal(e.day(start).idleBreaks, 0);
  const standing = used(); standing.usage.isLocked = true; standing.beginRest(start + 30000);
  for (let t = 30000; t <= 332000; t += 250) {
    standing.recordStanding(true, start + t);
    standing.tick({ now: start + t, idle: t / 1000 });
  }
  assert.equal(standing.day(start).actions.standing_five_minutes, 1);
  assert.equal(standing.day(start).idleBreaks, 0);
});
test('idle episode spanning midnight never adds breaks repeatedly', () => {
  const e = used(); e.tick({ now: start + 330000, idle: 300 });
  const next = new Date(2026, 9, 21, 0).getTime();
  e.tick({ now: next, idle: 43200 }); e.tick({ now: next + 1000, idle: 43201 });
  assert.equal(e.days[localDay(start)].idleBreaks, 1); assert.equal(e.day(next).idleBreaks, 0);
});
test('idle break summaries remain separate from action sessions and tolerate old records', () => {
  const days = { '2026-10-19': { idleBreaks: 2 }, '2026-10-20': { idleBreaks: 1, sessions: 1, sets: 2 }, '2026-10-21': { idleBreaks: 9 } };
  const result = activitySummary(days, 'month', new Date(start), new Date(start));
  assert.equal(result.idleBreaks, 3); assert.equal(result.sessions, 1); assert.equal(result.sets, 2);
  assert.equal(activitySummary({ '2026-10-20': { sets: 2 } }, 'day', new Date(start), new Date(start)).idleBreaks, 0);
});
test('a stale departure saved before app shutdown is not evidence of continuing rest', () => {
  const e = used(); e.beginAway(start + 30000);
  const restored = new UsageEngine(JSON.parse(JSON.stringify(e.snapshot())), start + 600000);
  restored.tick({ now: start + 601000, idle: 0 });
  assert.equal(restored.usage.seconds, 31); assert.equal(restored.day(start).idleBreaks, 0);
});
