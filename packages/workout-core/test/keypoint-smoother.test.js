import test from 'node:test';
import assert from 'node:assert/strict';
import { KeypointSmoother } from '../src/keypoint-smoother.js';

test('KeypointSmoother: 静止与小幅度噪点微颤时坐标绝对冻结 (死区过滤)', () => {
  const smoother = new KeypointSmoother({ deadbandPx: 3.5 });

  const initialKps = [
    { x: 200, y: 150, score: 0.9, name: 'nose' },
    { x: 180, y: 130, score: 0.9, name: 'left_eye' }
  ];

  const firstFrame = smoother.update(initialKps);
  assert.equal(firstFrame[0].x, 200);
  assert.equal(firstFrame[0].y, 150);

  // 模拟连续 10 帧传感器高频微小抖动 (+- 1.5 像素内)
  const jitters = [
    { dx: 0.8, dy: -0.6 },
    { dx: -1.2, dy: 1.1 },
    { dx: 1.5, dy: -1.0 },
    { dx: -0.5, dy: 0.7 },
    { dx: 0.9, dy: 1.2 },
    { dx: -1.4, dy: -0.8 },
    { dx: 1.1, dy: 0.5 },
    { dx: -0.9, dy: -1.1 },
    { dx: 0.6, dy: 1.0 },
    { dx: -1.0, dy: 0.8 }
  ];

  for (const j of jitters) {
    const noisyKps = [
      { x: 200 + j.dx, y: 150 + j.dy, score: 0.89, name: 'nose' },
      { x: 180 + j.dx, y: 130 + j.dy, score: 0.88, name: 'left_eye' }
    ];
    const res = smoother.update(noisyKps);
    // 必须 100% 保持在初始坐标，杜绝微颤
    assert.equal(res[0].x, 200, '鼻子坐标必须在死区内保持完全稳定');
    assert.equal(res[0].y, 150, '鼻子坐标必须在死区内保持完全稳定');
    assert.equal(res[1].x, 180, '眼睛坐标必须在死区内保持完全稳定');
    assert.equal(res[1].y, 130, '眼睛坐标必须在死区内保持完全稳定');
  }
});

test('KeypointSmoother: 产生大变动时自适应平滑跟进，无卡顿死锁', () => {
  const smoother = new KeypointSmoother({ deadbandPx: 3.5 });

  smoother.update([{ x: 100, y: 100, score: 0.9 }]);

  // 用户头部或手臂发生大幅移动 (位移 50 像素)
  const movedKps = [{ x: 140, y: 130, score: 0.95 }];
  const res = smoother.update(movedKps);

  // 应该超出死区并跟进更新
  assert.ok(res[0].x > 100, 'x 轴应该跟进位移');
  assert.ok(res[0].y > 100, 'y 轴应该跟进位移');
  assert.ok(res[0].x <= 140, '平滑值不应超过目标值');
  assert.ok(res[0].y <= 130, '平滑值不应超过目标值');
});

test('KeypointSmoother: 置信度临界波动与单帧偶发丢点防闪烁 (Hysteresis)', () => {
  const smoother = new KeypointSmoother({
    minScoreToShow: 0.25,
    minScoreToHide: 0.15,
    maxDropFrames: 4
  });

  // 初始正常显示
  smoother.update([{ x: 200, y: 200, score: 0.7 }]);

  // 偶发 1 帧由于反光跌至 0.18 (低于常规 0.2 阈值，但高于 0.15 迟滞下限)
  const dropFrame1 = smoother.update([{ x: 200, y: 200, score: 0.18 }]);
  assert.equal(dropFrame1[0].visible, true, '偶发单帧微弱下降不可闪烁消失');
  assert.ok(dropFrame1[0].score >= 0.2, '平滑后的 score 应维持在可绘制安全区间');

  // 偶发 1 帧暴跌至 0.05 (低于 0.15)，但因为缓冲帧数，第 1 帧不可立即闪灭
  const dropFrame2 = smoother.update([{ x: 200, y: 200, score: 0.05 }]);
  assert.equal(dropFrame2[0].visible, true, '单帧丢点应由缓冲机制保护，杜绝频闪');

  // 恢复正常
  const recoverFrame = smoother.update([{ x: 200, y: 200, score: 0.65 }]);
  assert.equal(recoverFrame[0].visible, true);
});

test('KeypointSmoother: 持续丢失目标超过缓冲帧后平稳隐藏，重现后就地恢复', () => {
  const smoother = new KeypointSmoother({ maxDropFrames: 3 });

  smoother.update([{ x: 150, y: 150, score: 0.8 }]);

  // 连续 4 帧彻底丢失
  for (let i = 0; i < 4; i++) {
    smoother.update([{ x: 150, y: 150, score: 0.05 }]);
  }

  const hiddenRes = smoother.update([{ x: 150, y: 150, score: 0.05 }]);
  assert.equal(hiddenRes[0].visible, false, '持续丢失后应进入隐藏状态');

  // 人体在全新位置重新出现
  const reappearRes = smoother.update([{ x: 300, y: 300, score: 0.9 }]);
  assert.equal(reappearRes[0].visible, true, '重新出现后应唤醒');
  assert.equal(reappearRes[0].x, 300, '重新出现后坐标应立即对齐当前新位置，不可从旧位置拖尾');
  assert.equal(reappearRes[0].y, 300);
});

test('KeypointSmoother: reset 能正确清空历史状态', () => {
  const smoother = new KeypointSmoother();
  smoother.update([{ x: 100, y: 100, score: 0.9 }]);
  assert.equal(smoother.history.size, 1);

  smoother.reset();
  assert.equal(smoother.history.size, 0);
});
