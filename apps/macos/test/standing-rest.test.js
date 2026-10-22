import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine } from '../electron/engine.js';
import { ActionPoseEvaluator } from '../src/workout/pose-evaluator.js';
import { getActionById, getActionsByScenario } from '../src/shared/actions-data.js';
const now = new Date(2026, 9, 17, 12).getTime();
const due = () => { const e = new UsageEngine({}, now); e.usage.isLocked = true; e.beginRest(now); return e; };
function pose() {
  const k = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0 }));
  for (const [i, x, y] of [[5, 140, 100], [6, 220, 100], [11, 150, 220], [12, 210, 220], [13, 150, 340], [14, 210, 340], [15, 150, 460], [16, 210, 460]]) k[i] = { x, y, score: .95 };
  return k;
}
const evaluate = k => { const e = new ActionPoseEvaluator(); let r; for (let i = 0; i < 8; i++) r = e.evaluate('standing_five_minutes', k); return r; };
test('standing is a fixed five minute action in standing and home scenarios', () => {
  const a = getActionById('standing_five_minutes');
  assert.equal(a.id, 'standing_five_minutes'); assert.equal(a.fixedDurationSeconds, 300);
  assert.ok(getActionsByScenario('office_standing').includes(a));
  assert.ok(getActionsByScenario('home_active').includes(a));
  assert.ok(!getActionsByScenario('office_seated').includes(a));
});
test('requires shoulders, hips and knees, rejects sitting, cropped knees and invalid confidence', () => {
  assert.equal(evaluate(pose()).matched, true);
  const sitting = pose(); sitting[13].x += 110; sitting[13].y = 235; sitting[14].x += 110; sitting[14].y = 235;
  assert.equal(evaluate(sitting).matched, false);
  const cropped = pose(); cropped[13].score = 0; assert.equal(evaluate(cropped).matched, false);
  const invalid = pose(); invalid[14].score = NaN; assert.equal(evaluate(invalid).matched, false);
  const compressed = pose(); for (const i of [13,14,15,16]) compressed[i].y = 225 + i;
  assert.equal(evaluate(compressed).matched, false);
  const lying = pose().map(k => ({ ...k, x: k.y, y: k.x })); assert.equal(evaluate(lying).matched, false);
});
test('standing stops immediately when a knee is lost, without generic hysteresis credit', () => {
  const e = new ActionPoseEvaluator(), k = pose();
  for (let i = 0; i < 8; i++) e.evaluate('standing_five_minutes', k);
  k[13].score = 0;
  assert.equal(e.evaluate('standing_five_minutes', k).matched, false);
});
test('camera rest cannot expire from wall time or a legacy deadline', () => {
  const e = due(); e.usage.restEndsAt = now + 300000;
  e.tick({ now: now + 300000 }); assert.equal(e.usage.isLocked, true);
  assert.equal(e.day(now).sets, 0);
});
test('only verified standing time earns one action, once, after a full five minutes', () => {
  const e = due();
  assert.equal(typeof e.recordStanding, 'function');
  for (let t = 0; t <= 300000; t += 250) e.recordStanding(true, now + t);
  assert.equal(e.usage.isLocked, true, 'initial stabilization is not credited');
  for (let t = 300250; t <= 302000; t += 250) e.recordStanding(true, now + t);
  assert.equal(e.usage.isLocked, false); assert.equal(e.day(now).sets, 1);
  assert.equal(e.day(now).sessions, 1); assert.equal(e.day(now).actions.standing_five_minutes, 1);
});
test('sitting, missing frames, clock jumps and restarts never add standing time', () => {
  const e = due(); assert.equal(typeof e.recordStanding, 'function');
  for (let t = 0; t <= 5000; t += 250) e.recordStanding(true, now + t);
  const earned = e.usage.standingMs; assert.ok(earned > 0);
  e.recordStanding(false, now + 5250); e.recordStanding(true, now + 5500);
  assert.equal(e.usage.standingMs, earned);
  e.recordStanding(true, now + 305500); assert.equal(e.usage.standingMs, earned);
  const restored = new UsageEngine(e.snapshot(), now + 306000);
  restored.recordStanding(true, now + 306000); assert.equal(restored.usage.standingMs, earned);
  restored.cancelRest(); restored.recordStanding(true, now + 306250);
  assert.equal(restored.usage.standingMs, 0);
});
test('camera disabled retains unverified timed rest without action credit', () => {
  const e = new UsageEngine({ settings: { cameraEnabled: false } }, now);
  e.usage.isLocked = true; e.beginRest(now); e.tick({ now: now + 300000 });
  assert.equal(e.usage.isLocked, false); assert.equal(e.day(now).sets, 0);
});

test('standing frame validation rejects frozen, muted and ended camera streams', async () => {
  const helpers = await import('../src/workout/pose-evaluator.js');
  assert.equal(typeof helpers.isFreshStandingFrame, 'function');
  const video = { readyState: 2, currentTime: 10 };
  const track = { readyState: 'live', muted: false };
  const stream = { getVideoTracks: () => [track] };
  assert.equal(helpers.isFreshStandingFrame(video, stream, 9), true);
  assert.equal(helpers.isFreshStandingFrame(video, stream, 10), false);
  track.muted = true; assert.equal(helpers.isFreshStandingFrame(video, stream, 9), false);
  track.muted = false; track.readyState = 'ended'; assert.equal(helpers.isFreshStandingFrame(video, stream, 9), false);
});


test('standing passes with both ankles outside the frame or missing entirely', () => {
  const cropped = pose();
  cropped[15] = { x: NaN, y: NaN, score: 0 };
  cropped[16] = { x: NaN, y: NaN, score: 0 };
  assert.equal(evaluate(cropped).matched, true);
  assert.equal(evaluate(cropped.slice(0, 15)).matched, true);
});

test('losing ankle tracking does not interrupt standing or block five-minute completion', () => {
  const e = due(), evaluator = new ActionPoseEvaluator(), k = pose();
  for (let t = 0; t <= 302000; t += 250) {
    if (t >= 2000) { k[15].score = 0; k[16].score = 0; }
    const result = evaluator.evaluate('standing_five_minutes', k);
    assert.equal(result.matched, true);
    e.recordStanding(result.matched, now + t);
  }
  assert.equal(e.usage.isLocked, false);
  assert.equal(e.day(now).actions.standing_five_minutes, 1);
});

test('seated upper body and foreshortened thighs cannot pass with ankles cropped', () => {
  const k = pose().slice(0, 15);
  k[13].y = k[14].y = 250;
  assert.equal(evaluate(k).matched, false);
  assert.equal(evaluate(k.slice(0, 13)).matched, false);
});
