import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { getActionById, getActionsByScenario, getRandomAction } from '../src/shared/actions-data.js';

test('DEFAULT_SETTINGS 应包含场景配置与动作选择', () => {
  assert.equal(DEFAULT_SETTINGS.scenario, 'office_seated');
  assert.equal(DEFAULT_SETTINGS.activeActionId, 'auto');
  assert.equal(DEFAULT_SETTINGS.stretchSeconds, 30);
  assert.equal(DEFAULT_SETTINGS.cameraEnabled, true, '默认开启摄像头 AI 视觉检测');
  assert.equal(DEFAULT_SETTINGS.actionCountPerSession, 1, '默认每次锁屏完成 1 组动作');
  assert.ok(DEFAULT_SETTINGS.usageLimit > 0);
  assert.ok(DEFAULT_SETTINGS.squatTarget > 0);
});

test('递进场景模式下动作检索逻辑 (5 -> 10 -> 12)', () => {
  const seatedList = getActionsByScenario(DEFAULT_SETTINGS.scenario);
  assert.equal(seatedList.length, 5, '默认办公室坐姿为 5 个动作');
  
  const standingList = getActionsByScenario('office_standing');
  assert.equal(standingList.length, 10, '办公室站立递进包含 10 个动作');

  const homeList = getActionsByScenario('home_active');
  assert.equal(homeList.length, 12, '居家办公递进包含全量 12 个动作');
  assert.ok(homeList.some(a => a.id === 'home_squats'), '包含深蹲动作');
  assert.ok(homeList.some(a => a.id === 'home_jumping_jacks'), '包含开合跳动作');
});

test('STORAGE_KEYS 应包含统一累计时长键 ACCUMULATED_USAGE', async () => {
  const { STORAGE_KEYS } = await import('../src/shared/constants.js');
  assert.equal(STORAGE_KEYS.ACCUMULATED_USAGE, 'fitgate_accumulated_usage');
});

test('累计时长存储函数模拟测试', async () => {
  // 模拟 chrome.storage.local
  const mockStorage = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          keys.forEach(k => {
            if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
          });
          cb(res);
        },
        set: (obj, cb) => {
          Object.assign(mockStorage, obj);
          if (cb) cb();
        }
      }
    }
  };

  const { getAccumulatedUsage, saveAccumulatedUsage, resetAccumulatedUsage, snoozeAccumulatedUsage, getDomainUsage } = await import('../src/shared/storage.js');

  // 1. 初始读取为空
  const initial = await getAccumulatedUsage();
  assert.equal(initial.seconds, 0);
  assert.equal(initial.isLocked, false);

  // 2. 累加并保存
  await saveAccumulatedUsage({ seconds: 600, isLocked: false });
  const mid = await getAccumulatedUsage();
  assert.equal(mid.seconds, 600);
  assert.equal(mid.isLocked, false);

  // 3. getDomainUsage 映射到全局累计时长
  const domainUsage = await getDomainUsage('x.com');
  assert.equal(domainUsage.seconds, 600);

  // 4. 达到 20 分钟 (1200 秒) 触发锁定
  await saveAccumulatedUsage({ seconds: 1200, isLocked: true });
  const locked = await getAccumulatedUsage();
  assert.equal(locked.seconds, 1200);
  assert.equal(locked.isLocked, true);

  // 5. 完成运动重置
  await resetAccumulatedUsage();
  const reset = await getAccumulatedUsage();
  assert.equal(reset.seconds, 0);
  assert.equal(reset.isLocked, false);

  // 6. 重新锁定后测试推迟 5 分钟 (300 秒)
  await saveAccumulatedUsage({ seconds: 1200, isLocked: true });
  await snoozeAccumulatedUsage(5);
  const snoozed = await getAccumulatedUsage();
  assert.equal(snoozed.isLocked, false, '推迟后应解除锁定');
  assert.equal(snoozed.seconds, 900, '推迟 5 分钟后累计时间应回退到 15 分钟 (900 秒)');
  assert.ok(snoozed.snoozedUntil > Date.now(), '推迟保护期截止时间应大于当前时间');
});

test('自然休息超时与跨天自动重置逻辑测试', async () => {
  const mockStorage = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          keys.forEach(k => {
            if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
          });
          cb(res);
        },
        set: (obj, cb) => {
          Object.assign(mockStorage, obj);
          if (cb) cb();
        }
      }
    }
  };

  const { getAccumulatedUsage, saveAccumulatedUsage } = await import('../src/shared/storage.js');
  const now = Date.now();

  // 1. 测试自然休息超时（离开了 20 分钟 > 15 分钟）：自动清零
  const twentyMinsAgo = now - 20 * 60 * 1000;
  await saveAccumulatedUsage({
    seconds: 800,
    isLocked: false,
    lastActiveAt: twentyMinsAgo
  });

  const afterRest = await getAccumulatedUsage();
  assert.equal(afterRest.seconds, 0, '离开超过 15 分钟后应自动重置累计时长');
  assert.equal(afterRest.isLocked, false);

  // 2. 测试短暂离开（仅离开 5 分钟 < 15 分钟）：继续保持累计
  const fiveMinsAgo = now - 5 * 60 * 1000;
  await saveAccumulatedUsage({
    seconds: 500,
    isLocked: false,
    lastActiveAt: fiveMinsAgo
  });
  const afterShortBreak = await getAccumulatedUsage();
  assert.equal(afterShortBreak.seconds, 500, '短暂离开 5 分钟应保留累计时长');

  // 3. 测试跨天自动重置
  await saveAccumulatedUsage({
    seconds: 900,
    isLocked: false,
    lastActiveAt: now,
    activeDate: '2025-01-01' // 过去的日期
  });
  const afterCrossDay = await getAccumulatedUsage();
  assert.equal(afterCrossDay.seconds, 0, '跨天应自动清零昨日残留时长');

  // 4. 测试锁屏防逃逸：若已经锁屏，即使离开 30 分钟也绝不自动解除
  const thirtyMinsAgo = now - 30 * 60 * 1000;
  await saveAccumulatedUsage({
    seconds: 1200,
    isLocked: true,
    lastActiveAt: thirtyMinsAgo,
    activeDate: '2025-01-01'
  });
  const lockedState = await getAccumulatedUsage();
  assert.equal(lockedState.isLocked, true, '锁定状态严禁因超时或跨天自动解除');
  assert.equal(lockedState.seconds, 1200);
});

test('WORKOUT_PRESETS 预设定义完整性', async () => {
  const { WORKOUT_PRESETS } = await import('../src/shared/constants.js');
  assert.ok(Array.isArray(WORKOUT_PRESETS));
  assert.ok(WORKOUT_PRESETS.length >= 2);
  const pomodoro = WORKOUT_PRESETS.find(p => p.id === 'pomodoro');
  assert.ok(pomodoro);
  assert.equal(pomodoro.usageLimit, 25);
  assert.equal(pomodoro.actionCount, 1);

  const deepWork = WORKOUT_PRESETS.find(p => p.id === 'deep_work');
  assert.ok(deepWork);
  assert.equal(deepWork.usageLimit, 50);
  assert.equal(deepWork.actionCount, 3);
});

test('getCurrentWorkoutQueue 动作队列抽取逻辑测试', async () => {
  const mockStorage = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          keys.forEach(k => {
            if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
          });
          cb(res);
        },
        set: (obj, cb) => {
          Object.assign(mockStorage, obj);
          if (cb) cb();
        }
      }
    }
  };

  const { saveSettings, getCurrentWorkoutQueue, getCurrentWorkoutAction } = await import('../src/shared/storage.js');

  // 1. 默认设置下：返回 1 个动作的队列
  const defaultQueue = await getCurrentWorkoutQueue();
  assert.equal(defaultQueue.length, 1);
  assert.ok(defaultQueue[0]?.id);
  const singleAction = await getCurrentWorkoutAction();
  assert.ok(singleAction?.id);

  // 2. 设置 actionCountPerSession = 3，智能轮换模式：返回 3 个不重复的动作
  await saveSettings({
    scenario: 'office_seated',
    activeActionId: 'auto',
    actionCountPerSession: 3
  });
  const queue3 = await getCurrentWorkoutQueue();
  assert.equal(queue3.length, 3);
  const idSet = new Set(queue3.map(a => a.id));
  assert.equal(idSet.size, 3, '抽取的 3 个动作应当不重复');

  // 3. 固定某个动作模式：返回 3 个相同动作对象组成的队列
  await saveSettings({
    scenario: 'home_active',
    activeActionId: 'home_squats',
    actionCountPerSession: 3
  });
  const fixedQueue = await getCurrentWorkoutQueue();
  assert.equal(fixedQueue.length, 3);
  assert.ok(fixedQueue.every(a => a.id === 'home_squats'), '固定模式下队列应全部为指定动作');
});

