import test from 'node:test';
import assert from 'node:assert/strict';
import { SquatCounter, SQUAT_STATES } from '../src/workout/squat-counter.js';
import { KeypointSmoother } from '../src/workout/keypoint-smoother.js';

// Frontal projection: the thigh shortens vertically, but hip/knee/ankle
// remain almost collinear. Knee angle alone stays 180 degrees.
function frontPose(drop = 0, { shoulderDrop = drop, scale = 1, dy = 0, missing = [] } = {}) {
  const points = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0.1 }));
  for (const [side, x] of [[0, 250], [1, 350]]) {
    points[5 + side] = { x: x * scale, y: (100 + shoulderDrop) * scale + dy, score: 0.95 };
    points[11 + side] = { x: x * scale, y: (240 + drop) * scale + dy, score: 0.95 };
    points[13 + side] = { x: x * scale, y: 360 * scale + dy, score: 0.95 };
    points[15 + side] = { x: x * scale, y: 480 * scale + dy, score: 0.95 };
  }
  for (const index of missing) points[index].score = 0.05;
  return points;
}

function run(counter, frames, smoother) {
  let result;
  for (const [time, drop, options] of frames) {
    const pose = frontPose(drop, options);
    result = counter.update(smoother ? smoother.update(pose) : pose, time);
  }
  return result;
}

const fullRep = [[0, 0], [300, 0], [600, 40], [1000, 90], [1200, 95], [1600, 40], [2000, 0], [2200, 0]];

test('frontal squat detects depth despite a straight projected knee, then counts only after standing', () => {
  const counter = new SquatCounter();
  run(counter, fullRep.slice(0, 5));
  assert.equal(counter.currentAngle, 180);
  assert.equal(counter.state, SQUAT_STATES.BOTTOM);
  assert.equal(counter.count, 0);
  const result = run(counter, fullRep.slice(5));
  assert.equal(result.count, 1);
  assert.equal(result.measurementMode, 'front');
  assert.equal(result.isCountedThisFrame, false, 'standing hold does not double count');
});

test('frontal squat survives the real coordinate smoother', () => {
  const counter = new SquatCounter();
  const smoother = new KeypointSmoother();
  const frames = [];
  for (const [start, drop] of [[0, 0], [500, 40], [900, 95], [1400, 40], [1800, 0]]) {
    for (let t = start; t < start + 400; t += 50) frames.push([t, drop]);
  }
  assert.equal(run(counter, frames, smoother).count, 1);
});

test('small bends and torso-only bows cannot earn a frontal squat', () => {
  for (const frames of [
    fullRep.map(([t, drop]) => [t, Math.min(25, drop)]),
    fullRep.map(([t, drop]) => [t, 0, { shoulderDrop: drop }])
  ]) assert.equal(run(new SquatCounter(), frames).count, 0);
});

test('whole-image translation and scale changes cannot earn a frontal squat', () => {
  for (const frames of [
    fullRep.map(([t, drop]) => [t, 0, { dy: drop }]),
    fullRep.map(([t, drop]) => [t, 0, { scale: 1 - drop / 300 }])
  ]) assert.equal(run(new SquatCounter(), frames).count, 0);
});

test('lowering only one hip cannot earn a frontal squat', () => {
  const counter = new SquatCounter();
  for (const [time, drop] of fullRep) {
    const points = frontPose(drop);
    points[12].y = 240;
    counter.update(points, time);
  }
  assert.equal(counter.count, 0);
});

test('frontal tracking loss cannot fall back to a straight knee and falsely finish', () => {
  const counter = new SquatCounter();
  run(counter, fullRep.slice(0, 5));
  const lost = run(counter, [[1250, 95, { missing: [5, 6] }]]);
  assert.equal(lost.count, 0);
  assert.equal(lost.state, SQUAT_STATES.BOTTOM);
  run(counter, [[1750, 0, { missing: [5, 6] }]]);
  assert.equal(counter.state, SQUAT_STATES.WAITING);
  assert.equal(run(counter, [[1800, 0], [2100, 0]]).count, 0);
});

test('reset discards the standing reference, and starting crouched earns nothing', () => {
  const counter = new SquatCounter();
  assert.equal(run(counter, fullRep).count, 1);
  counter.reset();
  const result = run(counter, [[2300, 95], [2700, 95], [2900, 40], [3300, 0]]);
  assert.equal(result.count, 0);
  run(counter, [[3600, 0]]);
  assert.equal(run(counter, fullRep.map(([t, drop]) => [t + 4000, drop])).count, 1);
});

test('moving through the starting position cannot calibrate a moving reference', () => {
  const counter = new SquatCounter();
  run(counter, [[0, 0], [100, 10], [200, 20], [300, 30], [400, 40], [500, 90]]);
  assert.equal(counter.state, SQUAT_STATES.WAITING);
  assert.equal(counter.count, 0);
  assert.equal(run(counter, fullRep.map(([t, drop]) => [t + 1000, drop])).count, 1);
});

test('strict frontal depth rejects a moderate dip that normal mode accepts', () => {
  const frames = fullRep.map(([t, drop]) => [t, Math.min(drop, 70)]);
  assert.equal(run(new SquatCounter(), frames).count, 1);
  assert.equal(run(new SquatCounter({ strictMode: true }), frames).count, 0);
});

test('frontal squat counts with both ankles invisible for the entire rep', () => {
  const counter = new SquatCounter();
  const result = run(counter, fullRep.map(([t, drop]) => [t, drop, { missing: [15, 16] }]));
  assert.equal(result.count, 1);
  assert.equal(result.currentAngle, null, 'do not invent a knee angle without an ankle');
});

test('cropped arrays with no ankle entries still count from shoulder, hip and knee', () => {
  const counter = new SquatCounter();
  let result;
  for (const [t, drop] of fullRep) result = counter.update(frontPose(drop).slice(0, 15), t);
  assert.equal(result.count, 1);
});

test('ankles disappearing and reappearing mid-rep do not reset progress', () => {
  const counter = new SquatCounter();
  let result;
  for (const [t, drop] of fullRep) {
    const points = frontPose(drop);
    if (t >= 600 && t <= 1600) {
      points[15] = undefined;
      points[16] = { x: NaN, y: NaN, score: 0 };
    }
    result = counter.update(points, t);
  }
  assert.equal(result.count, 1);
});

test('a visible shoulder, hip and knee on one side suffice without ankles', () => {
  const counter = new SquatCounter();
  const result = run(counter, fullRep.map(([t, drop]) => [t, drop, { missing: [6, 12, 14, 15, 16] }]));
  assert.equal(result.count, 1);
});

test('missing knees still prevent counting and do not demand visible ankles', () => {
  const counter = new SquatCounter();
  const result = run(counter, fullRep.map(([t, drop]) => [t, drop, { missing: [13, 14, 15, 16] }]));
  assert.equal(result.count, 0);
  assert.equal(result.state, SQUAT_STATES.WAITING);
  assert.doesNotMatch(result.feedback, /含脚踝|脚踝.*入镜/);
});

test('no-ankle tracking survives smoothing, but bowing and moving the camera earn nothing', () => {
  const counter = new SquatCounter();
  const frames = [];
  for (const [start, drop] of [[0, 0], [500, 40], [900, 95], [1400, 40], [1800, 0]]) {
    for (let t = start; t < start + 400; t += 50) frames.push([t, drop, { missing: [15, 16] }]);
  }
  assert.equal(run(counter, frames, new KeypointSmoother()).count, 1);
  for (const options of [drop => ({ shoulderDrop: drop }), drop => ({ dy: drop }), drop => ({ scale: 1 - drop / 300 })]) {
    assert.equal(run(new SquatCounter(), fullRep.map(([t, drop]) => [t, 0, { ...options(drop), missing: [15, 16] }])).count, 0);
  }
});
