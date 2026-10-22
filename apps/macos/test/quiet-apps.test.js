import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine, sanitizeSettings } from '../electron/engine.js';

const start = new Date(2026, 9, 20, 14).getTime();
const meeting = { id: 'test.meeting', name: '会议应用' };
const editor = { id: 'test.editor', name: '编辑器' };
const sample = (e, extra = {}) => e.tick({ now: e.lastTick + 1000, activeApp: meeting, ...extra });
const create = (usage = {}, settings = {}) => new UsageEngine({
  settings: { usageLimit: 2, warnSeconds: 30, quietApps: [meeting.id], ...settings },
  usage: { seconds: 119, ...usage },
}, start);

test('quiet applications are opt-in and invalid identifiers are rejected', () => {
  assert.deepEqual(sanitizeSettings().quietApps, []);
  assert.deepEqual(sanitizeSettings({ quietApps: [meeting.id, meeting.id, '', 42, null, ' '.repeat(2)] }).quietApps, [meeting.id]);
});

test('quiet foreground suppresses pre-warning and defers a due reminder while counting use', () => {
  const e = create({ seconds: 89 });
  assert.equal(sample(e), undefined);
  assert.equal(e.usage.warned, false);
  for (let i = 0; i < 30; i++) sample(e);
  assert.equal(e.usage.isLocked, false);
  assert.equal(e.usage.deferredSince, start + 31000);
  assert.equal(e.recordReminder(e.lastTick), false);
  sample(e);
  assert.equal(e.usage.seconds, 121);
  assert.equal(e.day(e.lastTick).reminders, 0);
  assert.match(e.reason, /待提醒/);
});

test('switching out of a quiet app releases pending reminder even outside monitored scope', () => {
  const e = create();
  sample(e);
  sample(e, { activeApp: editor, target: false });
  assert.equal(e.usage.isLocked, true);
  assert.equal(e.usage.deferredSince, 0);
  assert.equal(e.recordReminder(e.lastTick), true);
  assert.equal(e.recordReminder(e.lastTick), false);
  assert.equal(e.day(e.lastTick).reminders, 1);
});

test('deferral deadline survives restart and switching between quiet apps', () => {
  let e = create({}, { quietApps: [meeting.id, editor.id] });
  sample(e);
  const deadline = e.usage.deferredSince + 3600000;
  e = new UsageEngine(JSON.parse(JSON.stringify(e.snapshot())), e.lastTick);
  sample(e, { activeApp: editor });
  assert.equal(e.usage.deferredSince, start + 1000);
  sample(e, { now: deadline - 1 });
  assert.equal(e.usage.isLocked, false);
  sample(e, { now: deadline });
  assert.equal(e.usage.isLocked, true);
});

test('unavailable, paused and idle contexts do not release a pending reminder', () => {
  for (const extra of [{ available: false }, { idle: 61 }, { sleeping: true }, { screenLocked: true }, { workout: true }]) {
    const e = create();
    sample(e);
    sample(e, { activeApp: editor, ...extra });
    assert.equal(e.usage.isLocked, false, JSON.stringify(extra));
    sample(e, { activeApp: editor });
    assert.equal(e.usage.isLocked, true);
  }
  const e = create();
  sample(e);
  e.updateSettings({ paused: true });
  sample(e, { activeApp: editor });
  assert.equal(e.usage.isLocked, false);
  e.updateSettings({ paused: false });
  sample(e, { activeApp: editor });
  assert.equal(e.usage.isLocked, true);
});

test('natural rest and completion clear pending reminders; a snooze still protects its full interval', () => {
  for (const reset of [e => sample(e, { idle: 300 }), e => e.complete(1, e.lastTick, ['home_squats'])]) {
    const e = create(); sample(e); reset(e);
    sample(e, { activeApp: editor });
    assert.equal(e.usage.isLocked, false);
    assert.equal(e.usage.deferredSince || 0, 0);
  }
  const e = create();
  sample(e, { activeApp: editor });
  e.snooze(e.lastTick);
  for (let i = 0; i < 299; i++) sample(e);
  assert.equal(e.usage.deferredSince || 0, 0);
  sample(e);
  assert.equal(e.usage.isLocked, false);
  assert.ok(e.usage.deferredSince);
});

test('settings changes release or cancel a pending reminder as appropriate', () => {
  const e = create(); sample(e);
  e.updateSettings({ quietApps: [] }); sample(e);
  assert.equal(e.usage.isLocked, true);
  const extended = create(); sample(extended);
  extended.updateSettings({ usageLimit: 10 }); sample(extended, { activeApp: editor });
  assert.equal(extended.usage.isLocked, false);
  assert.equal(extended.usage.deferredSince || 0, 0);
});
