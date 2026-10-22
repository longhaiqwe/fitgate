import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SquatCounter, SQUAT_STATES } from '../src/workout/squat-counter.js';

function pose(angle, scores = [0.9, 0.9, 0.9]) {
  const radians = angle * Math.PI / 180;
  const points = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0.1 }));
  points[11] = { x: Math.sin(radians) * 100, y: Math.cos(radians) * 100, score: scores[0] };
  points[13] = { x: 0, y: 0, score: scores[1] };
  points[15] = { x: 0, y: 100, score: scores[2] };
  return points;
}

function readyCounter() {
  const counter = new SquatCounter();
  counter.update(pose(180), 0);
  assert.equal(counter.update(pose(180), 300).state, SQUAT_STATES.STANDING);
  return counter;
}

test('without ankles or shoulders there is insufficient evidence for either measurement', () => {
  const counter = new SquatCounter();
  const incomplete = pose(90, [0.9, 0.9, 0.05]);
  counter.update(incomplete, 0);
  const result = counter.update(incomplete, 1000);
  assert.equal(result.currentAngle, null);
  assert.match(result.feedback, /肩部.*髋部.*膝盖/);
  assert.equal(result.count, 0);
});

test('alternating valid and unreliable frames keep one waiting prompt and no angle', () => {
  const counter = new SquatCounter();
  const messages = new Set();
  for (let time = 0; time <= 2000; time += 100) {
    const result = counter.update(time % 200 === 0 ? pose(104) : pose(20, [0.1, 0.1, 0.1]), time);
    messages.add(result.feedback);
    assert.equal(result.currentAngle, null);
    assert.equal(result.count, 0);
  }
  assert.equal(messages.size, 1);
  assert.equal(counter.update(pose(104), 2300).currentAngle, 104);
});

test('one lost frame pauses a squat without resetting it or replaying events', () => {
  const counter = readyCounter();
  counter.update(pose(135), 500);
  const bottom = counter.update(pose(90), 800);
  assert.equal(bottom.isBottomThisFrame, true);
  const lost = counter.update(null, 900);
  assert.equal(lost.state, SQUAT_STATES.BOTTOM);
  assert.equal(lost.feedback, bottom.feedback);
  assert.equal(lost.isBottomThisFrame, false);
  counter.update(pose(135), 1100);
  assert.equal(counter.update(pose(180), 1400).count, 1);
});

test('sustained loss clears the angle and in-progress rep, then requires stable recovery', () => {
  const counter = readyCounter();
  counter.update(pose(135), 500);
  counter.update(pose(90), 800);
  counter.update(null, 900);
  const lost = counter.update(null, 1400);
  assert.equal(lost.state, SQUAT_STATES.WAITING);
  assert.equal(lost.currentAngle, null);
  assert.equal(counter.hasReachedBottom, false);
  assert.equal(counter.update(pose(180), 1500).state, SQUAT_STATES.WAITING);
  const recovered = counter.update(pose(180), 1800);
  assert.equal(recovered.state, SQUAT_STATES.STANDING);
  assert.equal(recovered.count, 0);
});

test('minor left/right score changes do not alternate the measured leg', () => {
  const counter = readyCounter();
  for (let time = 400; time <= 1000; time += 100) {
    const points = pose(180, [0.8, 0.8, 0.8]);
    const other = pose(90, [time % 200 === 0 ? 0.85 : 0.75, 0.85, 0.85]);
    for (const index of [11, 13, 15]) points[index + 1] = other[index];
    const result = counter.update(points, time);
    assert.equal(result.activeSide, 'left');
    assert.equal(result.currentAngle, 180);
    assert.equal(result.count, 0);
  }
});

test('each action phase has consistent guidance across consecutive frames', () => {
  const counter = readyCounter();
  for (const [angle, time] of [[180, 400], [135, 600], [90, 800], [120, 1000]]) {
    const first = counter.update(pose(angle), time);
    const next = counter.update(pose(angle), time + 50);
    assert.equal(next.feedback, first.feedback);
  }
});

test('completion stays readable, while counting events remain one-shot', () => {
  const counter = readyCounter();
  counter.minSquatDurationSec = 0;
  counter.update(pose(135), 500);
  counter.update(pose(90), 800);
  counter.update(pose(135), 1100);
  const completed = counter.update(pose(180), 1400);
  assert.equal(completed.count, 1);
  assert.equal(completed.isCountedThisFrame, true);
  const next = counter.update(pose(180), 1450);
  assert.equal(next.feedback, completed.feedback);
  assert.equal(next.isCountedThisFrame, false);
  assert.notEqual(counter.update(pose(180), 2600).feedback, completed.feedback);
});

test('a late valid frame after a dropout cannot resume an abandoned rep', () => {
  const counter = readyCounter();
  counter.update(pose(135), 500);
  counter.update(pose(90), 800);
  counter.update(null, 900);
  const result = counter.update(pose(180), 1500);
  assert.equal(result.state, SQUAT_STATES.WAITING);
  assert.equal(result.currentAngle, null);
  assert.equal(counter.update(pose(180), 1800).count, 0);
});

test('fast squats remain invalid and their notice yields to the next squat', () => {
  const counter = readyCounter();
  counter.update(pose(135), 400);
  counter.update(pose(90), 450);
  counter.update(pose(135), 500);
  const fast = counter.update(pose(180), 550);
  assert.equal(fast.count, 0);
  assert.match(fast.feedback, /过快/);
  assert.equal(counter.update(pose(180), 600).feedback, fast.feedback);
  const next = counter.update(pose(135), 700);
  assert.equal(next.state, SQUAT_STATES.SQUATTING);
  assert.match(next.feedback, /向下蹲/);
  counter.update(pose(90), 1000);
  counter.update(pose(135), 1400);
  assert.equal(counter.update(pose(180), 1700).count, 1);
});

test('the other leg is used when the current ankle is no longer visible', () => {
  const counter = readyCounter();
  const points = pose(90, [0.9, 0.9, 0.05]);
  const other = pose(180);
  for (const index of [11, 13, 15]) points[index + 1] = other[index];
  const result = counter.update(points, 400);
  assert.equal(result.activeSide, 'right');
  assert.equal(result.currentAngle, 180);
  assert.equal(result.state, SQUAT_STATES.STANDING);
});
