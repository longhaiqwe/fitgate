import test from 'node:test';
import assert from 'node:assert/strict';
import { JumpingJackCounter, JJ_STATES } from '../src/workout/jumping-jack-counter.js';

function createBlankKps() {
  const names = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
  ];
  return names.map((name) => ({ x: 0, y: 0, score: 0, name }));
}

function makeClosedKps() {
  const kps = createBlankKps();
  // 躯干 (肩宽 40)
  kps[5] = { x: 180, y: 150, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 220, y: 150, score: 0.9, name: 'right_shoulder' };
  kps[11] = { x: 185, y: 250, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 215, y: 250, score: 0.9, name: 'right_hip' };
  // 双臂垂下
  kps[7] = { x: 175, y: 210, score: 0.9, name: 'left_elbow' };
  kps[8] = { x: 225, y: 210, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 170, y: 300, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 230, y: 300, score: 0.9, name: 'right_wrist' };
  // 双脚并拢 (间距 20 < 肩宽 40)
  kps[13] = { x: 190, y: 350, score: 0.9, name: 'left_knee' };
  kps[14] = { x: 210, y: 350, score: 0.9, name: 'right_knee' };
  kps[15] = { x: 190, y: 450, score: 0.9, name: 'left_ankle' };
  kps[16] = { x: 210, y: 450, score: 0.9, name: 'right_ankle' };
  return kps;
}

function makeOpenKps() {
  const kps = createBlankKps();
  kps[5] = { x: 180, y: 150, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 220, y: 150, score: 0.9, name: 'right_shoulder' };
  kps[11] = { x: 185, y: 250, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 215, y: 250, score: 0.9, name: 'right_hip' };
  // 双臂高举过肩
  kps[7] = { x: 150, y: 110, score: 0.9, name: 'left_elbow' };
  kps[8] = { x: 250, y: 110, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 130, y: 70, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 270, y: 70, score: 0.9, name: 'right_wrist' };
  // 双脚跳开 (踝间距 120 > 1.25 * 40 = 50)
  kps[13] = { x: 160, y: 350, score: 0.9, name: 'left_knee' };
  kps[14] = { x: 240, y: 350, score: 0.9, name: 'right_knee' };
  kps[15] = { x: 140, y: 450, score: 0.9, name: 'left_ankle' };
  kps[16] = { x: 260, y: 450, score: 0.9, name: 'right_ankle' };
  return kps;
}

function makeMidwayKps() {
  const kps = createBlankKps();
  kps[5] = { x: 180, y: 150, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 220, y: 150, score: 0.9, name: 'right_shoulder' };
  kps[11] = { x: 185, y: 250, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 215, y: 250, score: 0.9, name: 'right_hip' };
  // 手臂半举平展至肩平 (过渡态)
  kps[7] = { x: 150, y: 160, score: 0.9, name: 'left_elbow' };
  kps[8] = { x: 250, y: 160, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 135, y: 150, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 265, y: 150, score: 0.9, name: 'right_wrist' };
  // 腿部半张开 (踝间距 46，比率 1.15；处于跳开起跳中途)
  kps[13] = { x: 181, y: 350, score: 0.9, name: 'left_knee' };
  kps[14] = { x: 219, y: 350, score: 0.9, name: 'right_knee' };
  kps[15] = { x: 177, y: 450, score: 0.9, name: 'left_ankle' };
  kps[16] = { x: 223, y: 450, score: 0.9, name: 'right_ankle' };
  return kps;
}

test('JumpingJackCounter: 闭合与张开完整周期计数测试', () => {
  const counter = new JumpingJackCounter({ targetCount: 5 });
  assert.equal(counter.count, 0);

  const closed = makeClosedKps();
  const open = makeOpenKps();

  let res = counter.update(closed, 1000);
  assert.equal(res.state, JJ_STATES.CLOSED);
  assert.equal(res.count, 0);

  res = counter.update(open, 1200);
  assert.equal(res.state, JJ_STATES.OPEN);
  assert.equal(res.isTopThisFrame, true);

  res = counter.update(closed, 1500);
  assert.equal(res.count, 1, '完成一次完整开合，计数应递增为 1');
  assert.equal(res.isCountedThisFrame, true);
});

test('JumpingJackCounter: 存在 CLOSING 过渡帧时绝不漏计 (修复历史严重漏判BUG)', () => {
  const counter = new JumpingJackCounter({ targetCount: 5 });

  const closed = makeClosedKps();
  const midway = makeMidwayKps();
  const open = makeOpenKps();

  // 1. 初始就绪
  counter.update(closed, 1000);
  // 2. 向上展开中
  const r2 = counter.update(midway, 1100);
  assert.equal(r2.state, JJ_STATES.OPENING);
  // 3. 达到顶峰
  const r3 = counter.update(open, 1200);
  assert.equal(r3.state, JJ_STATES.OPEN);
  // 4. 回落过渡帧 (CLOSING)
  const r4 = counter.update(midway, 1350);
  assert.equal(r4.state, JJ_STATES.CLOSING);
  // 5. 落地完全并拢 (落地触发计数)
  const r5 = counter.update(closed, 1500);
  assert.equal(r5.count, 1, '经历 CLOSING 过渡帧后回到 CLOSED 必须成功计次');
  assert.equal(r5.isCountedThisFrame, true);
});

test('JumpingJackCounter: 极速高频开合跳响应 (单次周期 ~280ms 连续跳跃不漏判)', () => {
  const counter = new JumpingJackCounter({ targetCount: 10, minRepDurationMs: 220 });
  const closed = makeClosedKps();
  const open = makeOpenKps();

  let t = 1000;
  counter.update(closed, t);

  // 连续进行 3 次极速跳跃 (每周期 280ms)
  for (let rep = 1; rep <= 3; rep++) {
    t += 140;
    const topRes = counter.update(open, t);
    assert.equal(topRes.state, JJ_STATES.OPEN);
    assert.equal(topRes.isTopThisFrame, true);

    t += 140;
    const countRes = counter.update(closed, t);
    assert.equal(countRes.count, rep, `第 ${rep} 次极速跳跃必须计次成功`);
    assert.equal(countRes.isCountedThisFrame, true);
  }
  assert.equal(counter.count, 3);
});

test('JumpingJackCounter: 剧烈运动导致的短暂丢帧容错 (350ms 内不中断动作)', () => {
  const counter = new JumpingJackCounter({ targetCount: 5 });
  const closed = makeClosedKps();
  const open = makeOpenKps();

  counter.update(closed, 1000);
  counter.update(open, 1200);

  // 模拟中间 1 帧因为运动模糊丢失检测 (< 350ms)
  const lostRes = counter.update(null, 1280);
  assert.equal(lostRes.state, JJ_STATES.OPEN, '丢失检测时在容错时长内保持上一有效状态');

  // 下一帧恢复并完成回落
  const recoverRes = counter.update(closed, 1500);
  assert.equal(recoverRes.count, 1, '恢复后应顺利累加计数');
  assert.equal(recoverRes.isCountedThisFrame, true);
});

test('JumpingJackCounter: 居家摄像头下半身出画时膝盖与手臂自适应补偿', () => {
  const counter = new JumpingJackCounter({ targetCount: 5 });

  const closed = makeClosedKps();
  const open = makeOpenKps();

  // 把双脚踝置信度置 0 (模拟镜头只拍到大腿或膝盖)
  closed[15].score = 0;
  closed[16].score = 0;
  open[15].score = 0;
  open[16].score = 0;

  counter.update(closed, 1000);
  const openRes = counter.update(open, 1250);
  assert.equal(openRes.state, JJ_STATES.OPEN);

  const finalRes = counter.update(closed, 1550);
  assert.equal(finalRes.count, 1, '仅依靠膝盖与手臂，开合跳计数依然准确无误');
});

test('JumpingJackCounter: 高速甩手手腕运动模糊时手肘冗余补偿', () => {
  const counter = new JumpingJackCounter({ targetCount: 5 });

  const closed = makeClosedKps();
  const open = makeOpenKps();

  // 手腕因快速挥动运动模糊 (score 降至 0.1)
  closed[9].score = 0.1;
  closed[10].score = 0.1;
  open[9].score = 0.1;
  open[10].score = 0.1;

  counter.update(closed, 1000);
  const openRes = counter.update(open, 1250);
  assert.equal(openRes.state, JJ_STATES.OPEN);

  const finalRes = counter.update(closed, 1550);
  assert.equal(finalRes.count, 1, '手腕模糊但手肘过肩时，依然精准识别开合跳');
});
