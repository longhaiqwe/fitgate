import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageEngine, localDay, sanitizeSettings } from '../electron/engine.js';
import { LocalStore } from '../electron/store.js';
const epoch = new Date(2026, 9, 12, 10).getTime();
const activeApp = { id: 'com.test.editor', name: 'Editor' };
function advance(engine, seconds, extras = {}) {
  for (let i = 0; i < seconds; i++) engine.tick({ now: engine.lastTick + 1000, activeApp, ...extras });
}
test('active foreground time is counted once and reminder triggers at exact limit', () => {
  const e = new UsageEngine({ settings: { usageLimit: 1 } }, epoch);
  advance(e, 59); assert.equal(e.usage.isLocked, false);
  advance(e, 1); assert.equal(e.usage.isLocked, true); assert.equal(e.usage.seconds, 60);
  advance(e, 20); assert.equal(e.usage.seconds, 60);
  assert.equal(e.day(epoch).seconds, 60); assert.equal(e.day(epoch).apps[activeApp.id].seconds, 60);
});
test('idle, sleep, screen lock, workout, excluded apps and helper failure do not count', () => {
  for (const extra of [{ idle: 61 }, { sleeping: true }, { screenLocked: true }, { workout: true }, { target: false }, { available: false }]) {
    const e = new UsageEngine({}, epoch); advance(e, 10, extra); assert.equal(e.usage.seconds, 0);
  }
  const e = new UsageEngine({ settings: { paused: true } }, epoch); advance(e, 10); assert.equal(e.usage.seconds, 0);
});
test('wake-up gaps and clock reversal never charge unobserved time', () => {
  const e = new UsageEngine({}, epoch); advance(e, 10);
  e.tick({ now: epoch + 600000, activeApp }); assert.equal(e.usage.seconds, 10);
  e.tick({ now: epoch + 590000, activeApp }); assert.equal(e.usage.seconds, 10);
});
test('15 minute natural rest clears reminder but retains daily totals', () => {
  const e = new UsageEngine({ settings: { usageLimit: 1 } }, epoch); advance(e, 60);
  e.tick({ now: epoch + 1000000, idle: 900, activeApp });
  assert.equal(e.usage.seconds, 0); assert.equal(e.usage.isLocked, false); assert.equal(e.day(epoch).seconds, 60);
});
test('five-minute snooze cannot retrigger early even for a one-minute limit', () => {
  const e = new UsageEngine({ settings: { usageLimit: 1 } }, epoch); advance(e, 60); e.snooze(e.lastTick);
  advance(e, 299); assert.equal(e.usage.isLocked, false);
  advance(e, 1); assert.equal(e.usage.isLocked, true);
});
test('completion records sessions and sets separately, starts a new cycle', () => {
  const e = new UsageEngine({}, epoch); advance(e, 40); e.complete(3, e.lastTick);
  assert.equal(e.day(epoch).sessions, 1); assert.equal(e.day(epoch).sets, 3);
  assert.equal(e.day(epoch).seconds, 40); assert.equal(e.usage.seconds, 0);
});
test('local midnight creates a new day; UTC midnight does not affect local stats', () => {
  const before = new Date(2026, 9, 12, 23, 59, 59).getTime();
  const e = new UsageEngine({}, before); e.tick({ now: before + 1000, activeApp });
  assert.equal(e.usage.activeDate, '2026-10-13'); assert.equal(e.day(before + 1000).seconds, 1);
  assert.equal(localDay(new Date(2026, 9, 12, 0, 1)), '2026-10-12');
});
test('restart preserves active sessions and expired natural rest resets them', () => {
  const e = new UsageEngine({}, epoch); advance(e, 120);
  const snapshot = JSON.parse(JSON.stringify(e.snapshot()));
  assert.equal(new UsageEngine(snapshot, epoch + 180000).usage.seconds, 120);
  assert.equal(new UsageEngine(snapshot, epoch + 1100000).usage.seconds, 0);
});
test('invalid input is constrained; action follows selected scenario', () => {
  const s = sanitizeSettings({ usageLimit: -10, actionCountPerSession: 100, squatTarget: Infinity, scenario: 'office_seated', activeActionId: 'home_squats', selectedApps: [1, 'a', 'a'], customDomains: ['https://www.example.com/a'] });
  assert.equal(s.usageLimit, 1); assert.equal(s.actionCountPerSession, 5); assert.equal(s.squatTarget, 10);
  assert.equal(s.activeActionId, 'auto'); assert.deepEqual(s.selectedApps, ['a']); assert.deepEqual(s.customDomains, ['example.com']);
});
test('daily retention is bounded at 90 days', () => {
  const e = new UsageEngine({}, epoch);
  for (let i = 0; i < 100; i++) e.day(epoch + i * 86400000);
  assert.equal(Object.keys(e.days).length, 90);
});
test('atomic persistence roundtrip and corruption recovery', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-store-'));
  const store = new LocalStore(directory), e = new UsageEngine({}, epoch);
  advance(e, 20); store.write(e.snapshot()); assert.equal(store.read().usage.seconds, 20);
  fs.writeFileSync(store.file, '{broken'); assert.deepEqual(store.read(), {});
  assert.ok(fs.readdirSync(directory).some(p => p.includes('.recovered-')));
});
