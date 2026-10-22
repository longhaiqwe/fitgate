import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine, localDay } from '../electron/engine.js';
import { activitySummary } from '../src/shared/activity-history.js';

const now = new Date(2026, 9, 20, 12).getTime();
function due() {
  return new UsageEngine({ settings: { cameraEnabled: false }, usage: { isLocked: true, seconds: 1500 } }, now);
}

test('legacy daily records expose zero event counts without changing exercise history', () => {
  const saved = { days: { [localDay(now)]: { seconds: 90, sessions: 2, sets: 3, actions: {} } } };
  const engine = new UsageEngine(saved, now);
  assert.deepEqual([engine.day(now).reminders, engine.day(now).snoozes, engine.day(now).timedRests], [0, 0, 0]);
  assert.equal(engine.day(now).sessions, 2);
  assert.equal(saved.days[localDay(now)].reminders, undefined);
});

test('only a shown due reminder counts, once across redisplay and restart', () => {
  const engine = due();
  engine.beginRest(now);
  assert.equal(engine.day(now).reminders, 0, 'starting the deadline alone is not a displayed reminder');
  engine.recordReminder(now);
  engine.recordReminder(now + 1);
  engine.cancelRest();
  engine.beginRest(now + 2);
  engine.recordReminder(now + 2);
  const restored = new UsageEngine(engine.snapshot(), now + 3);
  restored.recordReminder(now + 3);
  assert.equal(restored.day(now).reminders, 1);
  restored.complete(1, now + 4);
  restored.recordReminder(now + 5);
  assert.equal(restored.day(now).reminders, 1, 'manual activity does not create a reminder');
});

test('snooze counts once and the next due reminder starts a new occurrence', () => {
  const engine = due();
  engine.recordReminder(now);
  engine.snooze(now + 1);
  engine.snooze(now + 2);
  assert.equal(engine.day(now).snoozes, 1);
  assert.equal(engine.day(now).timedRests, 0);
  engine.usage.isLocked = true;
  engine.recordReminder(now + 300001);
  engine.recordReminder(now + 300002);
  assert.equal(engine.day(now).reminders, 2);
});

test('only a completed timed rest counts and repeated completion is harmless', () => {
  const engine = due();
  engine.finishRest(now);
  assert.equal(engine.usage.isLocked, true, 'no running countdown to finish');
  engine.beginRest(now);
  engine.finishRest(now + 299999);
  assert.equal(engine.day(now).timedRests, 0);
  assert.equal(engine.usage.isLocked, true);
  const restored = new UsageEngine(engine.snapshot(), now + 300000);
  restored.tick({ now: now + 300000, target: false });
  restored.finishRest(now + 300001);
  assert.equal(restored.day(now).timedRests, 1);
  assert.equal(restored.day(now).sessions, 0);
  assert.equal(restored.day(now).sets, 0);
  assert.equal(restored.day(now).idleBreaks, 0);
});

test('cancelled timers, idle resets and verified standing do not count as timed rests', () => {
  const engine = due();
  engine.beginRest(now);
  engine.cancelRest();
  engine.finishRest(now + 300000);
  assert.equal(engine.day(now).timedRests, 0);
  engine.checkIdleRest(now + 300000, 300);
  assert.equal(engine.day(now).idleBreaks, 1);
  engine.usage.isLocked = true;
  engine.updateSettings({ cameraEnabled: true });
  engine.beginRest(now + 300001);
  engine.usage.standingMs = 299500;
  engine.recordStanding(true, now + 300001);
  engine.recordStanding(true, now + 301001);
  assert.equal(engine.day(now).sessions, 1);
  assert.equal(engine.day(now).timedRests, 0);
});

test('events belong to the date they occur, including rest completion across midnight', () => {
  const late = new Date(2026, 9, 20, 23, 58).getTime();
  const engine = new UsageEngine({ settings: { cameraEnabled: false }, usage: { isLocked: true } }, late);
  engine.recordReminder(late);
  engine.beginRest(late);
  engine.tick({ now: late + 300000, target: false });
  assert.equal(engine.day(late).reminders, 1);
  assert.equal(engine.day(late).timedRests, 0);
  assert.equal(engine.day(late + 300000).timedRests, 1);
});

test('completion and idle reset rearm the next reminder', () => {
  const engine = due();
  engine.recordReminder(now);
  engine.complete(1, now + 1);
  engine.usage.isLocked = true;
  engine.recordReminder(now + 2);
  engine.checkIdleRest(now + 300000, 300);
  engine.usage.isLocked = true;
  engine.recordReminder(now + 300001);
  assert.equal(engine.day(now).reminders, 3);
});

test('day, week, month and year summaries aggregate events with legacy and invalid values', () => {
  const days = {
    '2026-10-19': { reminders: 2, snoozes: 1, timedRests: 1 },
    '2026-10-20': { reminders: 3, snoozes: 2, timedRests: 1, sessions: 4, sets: 6 },
    '2026-10-18': { reminders: -1, snoozes: Infinity, timedRests: 'bad' },
    '2026-10-17': { sessions: 2 },
    '2026-10-21': { reminders: 50, snoozes: 50, timedRests: 50 },
    '2025-10-20': { reminders: 50, snoozes: 50, timedRests: 50 }
  };
  for (const period of ['day', 'week', 'month', 'year']) {
    const summary = activitySummary(days, period, new Date(now), new Date(now));
    assert.deepEqual([summary.reminders, summary.snoozes, summary.timedRests], period === 'day' ? [3, 2, 1] : [5, 3, 2]);
  }
});
