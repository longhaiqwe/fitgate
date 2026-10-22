import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENARIOS,
  ACTIONS,
  getActionsByScenario,
  getActionById,
  getRandomAction
} from '../src/shared/actions-data.js';

test('场景库应包含三个核心递进场景与向后兼容定义', () => {
  assert.ok(SCENARIOS.office_seated, '应有 office_seated 办公室坐姿');
  assert.ok(SCENARIOS.office_standing, '应有 office_standing 办公室站立');
  assert.ok(SCENARIOS.home_active, '应有 home_active 居家办公');
  assert.ok(SCENARIOS.all, '应有 all 兼容别名');
  
  assert.equal(SCENARIOS.office_seated.canStand, false);
  assert.equal(SCENARIOS.office_standing.canStand, true);
  assert.equal(SCENARIOS.office_seated.actionCount, 5);
  assert.equal(SCENARIOS.office_standing.actionCount, 10);
  assert.equal(SCENARIOS.home_active.actionCount, 12);
});

test('递进场景动作库阶梯筛选测试 (5 -> 10 -> 12)', () => {
  assert.equal(ACTIONS.length, 12, '全量共有12个高精识别动作');
  
  // 1. 办公室坐姿：5 个动作
  const seatedActions = getActionsByScenario('office_seated');
  assert.equal(seatedActions.length, 5, '办公室坐姿应有5个动作');
  assert.ok(seatedActions.every(a => a.scenario === 'office_seated'), '全为坐姿动作');
  assert.ok(seatedActions.some(a => a.id === 'seated_ear_shoulder'), '包含耳朵找肩膀');
  
  // 2. 办公室站立：递进包含 5 个坐姿 + 5 个站姿 = 10 个动作
  const standingActions = getActionsByScenario('office_standing');
  assert.equal(standingActions.length, 10, '办公室站立应递进包含10个动作');
  assert.ok(standingActions.some(a => a.id === 'standing_cross_leg_side_bend'), '站立模式包含站立动作');
  assert.ok(!standingActions.some(a => a.id === 'home_squats'), '站立模式不含居家深蹲');

  // 3. 居家办公：递进包含 5 坐姿 + 5 站姿 + 2 居家 = 12 个动作
  const homeActions = getActionsByScenario('home_active');
  assert.equal(homeActions.length, 12, '居家办公应包含全套12个动作');
  assert.ok(homeActions.some(a => a.id === 'standing_cross_leg_side_bend'), '居家模式包含站立动作');
  assert.ok(homeActions.some(a => a.id === 'home_squats'), '包含标准深蹲');
  assert.ok(homeActions.some(a => a.id === 'home_jumping_jacks'), '包含活力开合跳');

  // 4. 兼容性测试：旧版 'all' 或空值返回全量 12 个动作
  assert.equal(getActionsByScenario('all').length, 12, '旧版 all 兼容返回12个动作');
  assert.equal(getActionsByScenario('').length, 12, '空场景默认返回12个动作');
});

test('每个动作均应包含完整的元数据与安全要点', () => {
  for (const action of ACTIONS) {
    assert.ok(action.id, '动作需有 id');
    assert.ok(action.name, '动作需有 name');
    assert.ok(action.scenario, '动作需有 scenario');
    assert.ok(action.targetArea, '动作需有 targetArea 管什么');
    assert.ok(action.steps && action.steps.length > 0, '动作需有步骤');
    assert.ok(action.checkAndStop, '动作需有 安全停止指引');
    if (action.id !== 'home_squats') {
      assert.ok(action.image, '非深蹲动作需有配图路径: ' + action.id);
    }
  }
});

test('getActionById 与 getRandomAction 方法测试', () => {
  const action = getActionById('seated_ear_shoulder');
  assert.ok(action);
  assert.equal(action.name, '耳朵找肩膀');
  assert.equal(action.type, 'bilateral');

  const jj = getActionById('home_jumping_jacks');
  assert.ok(jj);
  assert.equal(jj.name, '活力开合跳');
  assert.equal(jj.type, 'pose_counter');

  const randomSeated = getRandomAction('office_seated');
  assert.ok(randomSeated);
  assert.equal(randomSeated.scenario, 'office_seated');
});
