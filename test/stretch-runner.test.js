import test from 'node:test';
import assert from 'node:assert/strict';
import { StretchRunner, STRETCH_STATES } from '../src/workout/stretch-runner.js';

test('单次保持动作 (hold) 生命周期测试', () => {
  const runner = new StretchRunner({
    type: 'hold',
    durationSeconds: 30
  });

  assert.equal(runner.state, STRETCH_STATES.IDLE);
  assert.equal(runner.totalSeconds, 30);
  assert.equal(runner.remainingSeconds, 30);

  runner.start();
  assert.equal(runner.state, STRETCH_STATES.RUNNING);

  // 模拟推进 10 秒
  runner.tick(10);
  assert.equal(runner.elapsedSeconds, 10);
  assert.equal(runner.remainingSeconds, 20);
  assert.equal(runner.isFinished, false);

  // 模拟推完剩余 20 秒
  runner.tick(20);
  assert.equal(runner.elapsedSeconds, 30);
  assert.equal(runner.remainingSeconds, 0);
  assert.equal(runner.isFinished, true);
  assert.equal(runner.state, STRETCH_STATES.COMPLETED);
});

test('双侧轮换动作 (bilateral) 换侧与完成测试', () => {
  let switchSideCalled = false;
  const runner = new StretchRunner({
    type: 'bilateral',
    perSideSeconds: 30,
    onSideSwitch: () => {
      switchSideCalled = true;
    }
  });

  runner.start();
  assert.equal(runner.currentSide, 1);
  assert.equal(runner.totalSides, 2);

  // 第一侧推进 30 秒
  runner.tick(30);
  assert.equal(switchSideCalled, true, '第一侧结束时应触发换侧回调');
  assert.equal(runner.currentSide, 2, '应自动切换至第二侧');
  assert.equal(runner.isFinished, false);

  // 第二侧推进 30 秒
  runner.tick(30);
  assert.equal(runner.isFinished, true);
  assert.equal(runner.state, STRETCH_STATES.COMPLETED);
});

test('节奏循环动作 (rep_hold) 循环次数与完成测试', () => {
  let repCount = 0;
  const runner = new StretchRunner({
    type: 'rep_hold',
    reps: 8,
    repSeconds: 5,
    restSeconds: 2,
    onRepCompleted: () => {
      repCount++;
    }
  });

  runner.start();
  assert.equal(runner.currentRep, 1);
  assert.equal(runner.totalReps, 8);

  // 跑完 1 次循环 (5s + 2s = 7s)
  runner.tick(7);
  assert.equal(repCount, 1);
  assert.equal(runner.currentRep, 2);

  // 跑完剩余 7 次 (49s)
  runner.tick(49);
  assert.equal(repCount, 8);
  assert.equal(runner.isFinished, true);
});

test('深蹲与开合跳节拍器模式 (rep_hold) 半程点与状态文本测试', () => {
  let halfwayCount = 0;
  let repCount = 0;
  let lastTickData = null;

  const runner = new StretchRunner({
    type: 'rep_hold',
    reps: 3,
    repSeconds: 2.0,
    restSeconds: 1.5,
    activePhaseName: '下蹲蓄力',
    restPhaseName: '蹬地起立',
    onRepHalfway: (rep) => {
      halfwayCount++;
      assert.equal(rep, halfwayCount);
    },
    onRepCompleted: () => {
      repCount++;
    },
    onTick: (data) => {
      lastTickData = data;
    }
  });

  runner.start();

  // 1. 推进 1.0 秒：处于第一阶段（下蹲中）
  runner.tick(1.0);
  assert.equal(halfwayCount, 0, '未到 2.0s 不触发半程回调');
  assert.equal(repCount, 0);
  assert.equal(lastTickData.inRepPhase, 'active');
  assert.equal(lastTickData.currentRep, 1);
  assert.equal(lastTickData.completedReps, 0);

  // 2. 推进 1.0 秒（累计 2.0 秒）：到达半程点
  runner.tick(1.0);
  assert.equal(halfwayCount, 1, '到达 2.0s 触发第 1 次半程回调');
  assert.equal(repCount, 0);
  assert.equal(lastTickData.inRepPhase, 'rest');

  // 3. 推进 1.5 秒（累计 3.5 秒）：完成第 1 次深蹲
  runner.tick(1.5);
  assert.equal(repCount, 1);
  assert.equal(lastTickData.completedReps, 1);
  assert.equal(lastTickData.currentRep, 2);

  // 4. 跑完全部剩余 2 次（累计再跑 7.0 秒）
  runner.tick(7.0);
  assert.equal(halfwayCount, 3);
  assert.equal(repCount, 3);
  assert.equal(runner.isFinished, true);
});

