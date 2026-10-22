// 深蹲状态机算法单元测试
import assert from 'node:assert';
import { calculateAngle, SquatCounter, SQUAT_STATES } from '../src/workout/squat-counter.js';

console.log('--- 开始测试深蹲状态机算法 ---');

// 1. 测试夹角计算
{
  // 直角 90 度
  const p1 = { x: 10, y: 0 };
  const p2 = { x: 0, y: 0 };
  const p3 = { x: 0, y: 10 };
  const deg = calculateAngle(p1, p2, p3);
  assert.strictEqual(deg, 90, `预期 90 度，实际得到 ${deg}`);

  // 直线 180 度 (完全站直)
  const straight1 = { x: 0, y: -10 };
  const straight2 = { x: 0, y: 0 };
  const straight3 = { x: 0, y: 10 };
  const degStraight = calculateAngle(straight1, straight2, straight3);
  assert.strictEqual(degStraight, 180, `预期 180 度，实际得到 ${degStraight}`);
  console.log('✓ 几何夹角计算测试通过');
}

// 模拟构造 17 个关键点
function makeKeypoints(hip, knee, ankle, score = 0.9) {
  const kps = Array.from({ length: 17 }, () => ({ x: 0, y: 0, score: 0.1 }));
  // 11: left_hip, 13: left_knee, 15: left_ankle
  kps[11] = { ...hip, score };
  kps[13] = { ...knee, score };
  kps[15] = { ...ankle, score };
  return kps;
}

// 2. 测试完整标准深蹲流程与计数
{
  const counter = new SquatCounter({ targetCount: 3, strictMode: true });
  // 降低最小耗时便于模拟测试
  counter.minSquatDurationSec = 0;

  // 帧 1: 站直 (180°)
  counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }), Date.now() - 300);
  let res = counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.STANDING, '初始站直应进入 STANDING');
  assert.strictEqual(res.count, 0, '此时计数应为 0');

  // 帧 2: 开始下蹲 (膝关节约 135°)
  res = counter.update(makeKeypoints({ x: 7, y: 3 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.SQUATTING, '屈膝应进入 SQUATTING');

  // 帧 3: 深蹲触底 (90° 直角)
  res = counter.update(makeKeypoints({ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.BOTTOM, '达到 90° 应进入 BOTTOM');
  assert.strictEqual(res.isBottomThisFrame, true, '应当标记本帧触底');

  // 帧 4: 起立回升 (135°)
  res = counter.update(makeKeypoints({ x: 7, y: 3 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.RISING, '回升应进入 RISING');

  // 帧 5: 完全站直 (180°)
  res = counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.STANDING, '恢复站直应重回 STANDING');
  assert.strictEqual(res.isCountedThisFrame, true, '本帧应当完成计次');
  assert.strictEqual(res.count, 1, '深蹲有效计数应增加至 1');
  console.log('✓ 完整标准深蹲状态机流程测试通过');
}

// 3. 测试作弊半蹲（未下蹲到底便站起，不计次）
{
  const counter = new SquatCounter({ targetCount: 3, strictMode: true });
  counter.minSquatDurationSec = 0;

  // 站直
  counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }), Date.now() - 300);
  counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }));

  // 半蹲到 130° (未达 100° 阈值)
  let res = counter.update(makeKeypoints({ x: 6, y: 4 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.state, SQUAT_STATES.SQUATTING);

  // 立即站起
  res = counter.update(makeKeypoints({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }));
  assert.strictEqual(res.count, 0, '未下蹲到底不计次');
  assert.strictEqual(res.isCountedThisFrame, false, '不触发计数完成');
  console.log('✓ 半蹲防作弊测试通过');
}

console.log('🎉 所有算法测试全部成功通过！');
