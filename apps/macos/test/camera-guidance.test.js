import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, getActionById } from '../src/shared/actions-data.js';
import { ActionPoseEvaluator } from '../src/workout/pose-evaluator.js';

test('every selectable action explains camera direction and framing', () => {
  for (const action of ACTIONS) {
    assert.ok(action.cameraGuide?.direction, `${action.id}: direction`);
    assert.ok(action.cameraGuide?.framing, `${action.id}: framing`);
  }
});

test('missing-person feedback agrees with the side-facing action guidance', () => {
  const evaluator = new ActionPoseEvaluator();
  for (const id of ['standing_swallow_fly', 'standing_waist_stretch']) {
    assert.match(evaluator.evaluate(id, null).feedback, /侧身/);
    const empty = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0 }));
    assert.match(evaluator.evaluate(id, empty).feedback, /侧身/);
  }
});

test('head turns and lateral bends distinguish body orientation from movement direction', () => {
  for (const id of ['seated_look_armpit', 'seated_press_collarbone', 'standing_cross_leg_side_bend']) {
    assert.match(getActionById(id).cameraGuide.direction, /正对/);
    assert.match(getActionById(id).cameraGuide.framing, /躯干|身体/);
  }
  assert.match(getActionById('home_squats').cameraGuide.framing, /无需.*脚踝/);
});
