import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionPoseEvaluator, calcJointAngle, calcAngleWithVertical } from '../src/workout/pose-evaluator.js';

// 构建 17 个关键点的测试辅助工具
function createBlankKeypoints() {
  const names = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
  ];
  return names.map((name) => ({ x: 0, y: 0, score: 0, name }));
}

test('ActionPoseEvaluator: 未入镜或低置信度时返回 waiting', () => {
  const evaluator = new ActionPoseEvaluator();
  const resEmpty = evaluator.evaluate('seated_ear_shoulder', []);
  assert.equal(resEmpty.matched, false);
  assert.equal(resEmpty.statusClass, 'waiting');

  const blankKps = createBlankKeypoints();
  const resBlank = evaluator.evaluate('seated_ear_shoulder', blankKps);
  assert.equal(resBlank.matched, false);
});

test('ActionPoseEvaluator: 耳朵找肩膀 (seated_ear_shoulder) 头部侧倾与双侧轮换', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 基础人脸关键点：正立无侧倾
  kps[0] = { x: 200, y: 100, score: 0.9, name: 'nose' };
  kps[1] = { x: 180, y: 90, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 90, score: 0.9, name: 'right_eye' };
  kps[5] = { x: 150, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 250, y: 200, score: 0.9, name: 'right_shoulder' };

  // 1. 无侧倾时，不应达标
  for (let i = 0; i < 4; i++) {
    const res = evaluator.evaluate('seated_ear_shoulder', kps, { currentSide: 1 });
    assert.equal(res.matched, false, '头未倾斜不应达标');
  }

  // 2. 模拟头部向右侧明显侧倾 (倾角 > 15°)
  kps[1] = { x: 180, y: 80, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 105, score: 0.9, name: 'right_eye' }; // dy = 25, dx = 40 => ~32°

  let passed = false;
  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_ear_shoulder', kps, { currentSide: 1 });
    if (res.matched) passed = true;
  }
  assert.ok(passed, '头部侧倾后应判定达标');

  // 3. 换到第 2 侧，如果保持第 1 侧方向，不应通过
  const side2Fail = evaluator.evaluate('seated_ear_shoulder', kps, { currentSide: 2 });
  assert.equal(side2Fail.rawMatched, false, '第2侧同方向不可通过');

  // 4. 换到相反方向倾斜
  kps[1] = { x: 180, y: 105, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 80, score: 0.9, name: 'right_eye' };
  for (let i = 0; i < 5; i++) {
    evaluator.evaluate('seated_ear_shoulder', kps, { currentSide: 2 });
  }
  const side2Pass = evaluator.evaluate('seated_ear_shoulder', kps, { currentSide: 2 });
  assert.ok(side2Pass.matched, '换对侧倾斜后应达标');
});

test('ActionPoseEvaluator: 坐姿侧头舒展 (seated_behind_neck) 严禁端坐戴眼镜 10°~12° 微晃误判', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 模拟真实用户坐姿：端坐正视屏幕，戴眼镜导致双眼检测微斜 11° (dx=40, dy=8 => ~11.3°)
  kps[0] = { x: 200, y: 150, score: 0.9, name: 'nose' };
  kps[1] = { x: 180, y: 130, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 138, score: 0.9, name: 'right_eye' };
  kps[3] = { x: 160, y: 145, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 240, y: 145, score: 0.9, name: 'right_ear' };
  kps[5] = { x: 130, y: 230, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 270, y: 230, score: 0.9, name: 'right_shoulder' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_behind_neck', kps, { currentSide: 1 });
    assert.equal(res.matched, false, '端坐且微晃11度时，绝对不可判定达标');
  }

  // 模拟机位倾斜或坐姿一边高一边低 (双肩倾斜 8°，双眼绝对倾斜 15°，但头部并未相对于肩膀发生侧屈)
  kps[5].y = 220; // 左肩高
  kps[6].y = 240; // 右肩低 (双肩夹角 ~8°)
  kps[1].y = 125;
  kps[2].y = 136; // 双眼绝对夹角 ~15°，但相对于双肩的净夹角仅 ~7°
  assert.equal(evaluator.evaluate('seated_behind_neck', kps, { currentSide: 1 }).matched, false, '双肩与头部同步微偏但无相对侧屈时绝对不可误判');

  // 正确大幅度侧倾拉伸：头倒向一侧肩膀，角度达到 26°，耳朵贴近肩膀
  kps[5].y = 230;
  kps[6].y = 230;
  kps[1] = { x: 180, y: 120, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 140, score: 0.9, name: 'right_eye' }; // 倾角约 26.5°
  kps[3] = { x: 165, y: 130, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 235, y: 160, score: 0.9, name: 'right_ear' }; // 右耳更接近右肩
  kps[0] = { x: 208, y: 155, score: 0.9, name: 'nose' };

  for (let i = 0; i < 5; i++) {
    evaluator.evaluate('seated_behind_neck', kps, { currentSide: 1 });
  }
  const passRes = evaluator.evaluate('seated_behind_neck', kps, { currentSide: 1 });
  assert.ok(passRes.matched, '大幅度侧倾找肩膀后应判定达标');
  assert.equal(passRes.statusText, '🟢 姿态达标 · 保持中');
});

test('ActionPoseEvaluator: 举手翻掌 (standing_raise_hands) 双手高举判定', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  kps[0] = { x: 200, y: 120, score: 0.9, name: 'nose' };
  kps[5] = { x: 150, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 250, y: 200, score: 0.9, name: 'right_shoulder' };

  // 手自然垂下
  kps[9] = { x: 140, y: 350, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 260, y: 350, score: 0.9, name: 'right_wrist' };

  const lowRes = evaluator.evaluate('standing_raise_hands', kps);
  assert.equal(lowRes.matched, false);

  // 双手举过头顶
  kps[9] = { x: 190, y: 60, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 210, y: 60, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_raise_hands', kps);
  }
  const highRes = evaluator.evaluate('standing_raise_hands', kps);
  assert.ok(highRes.matched, '双手举过头顶应判定达标');
});

test('ActionPoseEvaluator: 胳膊向后旋 (standing_arms_rotate) 双臂平展判定', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  kps[5] = { x: 160, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 240, y: 200, score: 0.9, name: 'right_shoulder' }; // 肩宽 80

  // 手臂未展开
  kps[9] = { x: 170, y: 200, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 230, y: 200, score: 0.9, name: 'right_wrist' };
  assert.equal(evaluator.evaluate('standing_arms_rotate', kps).matched, false);

  // 手臂向两侧充分平展 (腕距 200 > 80 * 1.3)
  kps[9] = { x: 100, y: 200, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 300, y: 200, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_arms_rotate', kps);
  }
  assert.ok(evaluator.evaluate('standing_arms_rotate', kps).matched);
});

test('ActionPoseEvaluator: 交叉腿叉腰侧屈 (standing_cross_leg_side_bend) 侧屈判定', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 垂直站姿
  kps[5] = { x: 170, y: 150, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 230, y: 150, score: 0.9, name: 'right_shoulder' };
  kps[11] = { x: 180, y: 300, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 220, y: 300, score: 0.9, name: 'right_hip' };

  assert.equal(evaluator.evaluate('standing_cross_leg_side_bend', kps, { currentSide: 1 }).matched, false);

  // 上身向一侧倾斜侧屈 (双肩中心偏向一侧)
  kps[5] = { x: 120, y: 160, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 180, y: 150, score: 0.9, name: 'right_shoulder' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_cross_leg_side_bend', kps, { currentSide: 1 });
  }
  assert.ok(evaluator.evaluate('standing_cross_leg_side_bend', kps, { currentSide: 1 }).matched);
});

test('ActionPoseEvaluator: 低头看腋窝 (seated_look_armpit) 端坐防误判与换侧防呆', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 1. 模拟用户截图中的情境：端坐在椅子上，面朝正前方，头部平视，没有低头，也没有偏头
  // 即使鼻子略偏离双肩中心 20px（模拟坐姿自然微偏），也绝对不可误判为达标！
  kps[0] = { x: 275, y: 150, score: 0.9, name: 'nose' };
  kps[1] = { x: 255, y: 135, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 295, y: 135, score: 0.9, name: 'right_eye' };
  kps[5] = { x: 170, y: 250, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 410, y: 250, score: 0.9, name: 'right_shoulder' }; // 双肩宽 240px，中点在 290，nose 在 275 (dx = -15)

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
    assert.equal(res.matched, false, '端坐且头未偏未低头时绝对不应误判达标');
  }

  // 2. 模拟真实动作：头部向左下方转动低头看腋窝
  // 鼻子明显靠近左肩，双眼倾斜，头部下沉
  kps[0] = { x: 220, y: 200, score: 0.9, name: 'nose' }; // 鼻尖下沉且靠近左肩
  kps[1] = { x: 210, y: 175, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 250, y: 195, score: 0.9, name: 'right_eye' }; // 双眼产生明显倾角 ~26°

  let passedSide1 = false;
  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
    if (res.matched) passedSide1 = true;
  }
  assert.ok(passedSide1, '头部向斜下方转动并低头看腋窝应判定达标');

  // 3. 换到第 2 侧：如果用户回正坐直（未换到对侧），绝不能判定达标
  const uprightKps = createBlankKeypoints();
  uprightKps[0] = { x: 290, y: 150, score: 0.9, name: 'nose' };
  uprightKps[1] = { x: 270, y: 135, score: 0.9, name: 'left_eye' };
  uprightKps[2] = { x: 310, y: 135, score: 0.9, name: 'right_eye' };
  uprightKps[5] = { x: 170, y: 250, score: 0.9, name: 'left_shoulder' };
  uprightKps[6] = { x: 410, y: 250, score: 0.9, name: 'right_shoulder' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_look_armpit', uprightKps, { currentSide: 2 });
    assert.equal(res.matched, false, '第2侧回正坐直不应误判达标');
  }

  // 4. 换到第 2 侧：如果用户继续向第 1 侧方向低头，不应通过
  const sameSideRes = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 2 });
  assert.equal(sameSideRes.rawMatched, false, '第2侧保持原方向不可通过');

  // 5. 换到第 2 侧：正确向右下方低头看对侧腋窝
  const side2Kps = createBlankKeypoints();
  side2Kps[0] = { x: 360, y: 200, score: 0.9, name: 'nose' }; // 靠向右肩
  side2Kps[1] = { x: 330, y: 195, score: 0.9, name: 'left_eye' };
  side2Kps[2] = { x: 370, y: 175, score: 0.9, name: 'right_eye' };
  side2Kps[5] = { x: 170, y: 250, score: 0.9, name: 'left_shoulder' };
  side2Kps[6] = { x: 410, y: 250, score: 0.9, name: 'right_shoulder' };

  for (let i = 0; i < 5; i++) {
    evaluator.evaluate('seated_look_armpit', side2Kps, { currentSide: 2 });
  }
  const side2Pass = evaluator.evaluate('seated_look_armpit', side2Kps, { currentSide: 2 });
  assert.ok(side2Pass.matched, '换对侧腋窝低头后应判定达标');
});

test('ActionPoseEvaluator: 低头看腋窝 (seated_look_armpit) 显示器上方俯视机位下，端坐平视绝不可误判', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 模拟显示器顶部摄像头轻度俯视拍摄：
  // 肩宽 260px，双肩在 y=300；俯视机位下鼻尖在 y=205 (neckDropRatio = 95/260 = 0.365，在旧算法 <= 0.40 下必然被误判)
  kps[5] = { x: 170, y: 300, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 430, y: 300, score: 0.9, name: 'right_shoulder' };
  // 双眼中点在 x=300，双眼在 y=175，眼距 40px
  kps[1] = { x: 280, y: 175, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 320, y: 175, score: 0.9, name: 'right_eye' };
  // 鼻尖在 x=300 (完全居中未偏转)，y=205
  kps[0] = { x: 300, y: 205, score: 0.9, name: 'nose' };
  // 双耳高度在 y=200 附近 (平视未低头状态，耳鼻高差接近 0)
  kps[3] = { x: 250, y: 200, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 350, y: 200, score: 0.9, name: 'right_ear' };

  // 1. 即使因坐姿稍微向左偏坐 12px (头部整体相对于双肩中点偏离，但面部正对镜头未偏转)
  kps[0].x = 288;
  kps[1].x = 268;
  kps[2].x = 308;
  kps[3].x = 238;
  kps[4].x = 338;
  const sitStraightRes = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
  assert.equal(sitStraightRes.matched, false, '俯视摄像头端坐平视未偏转未低头，绝对不可误判达标');
  assert.equal(sitStraightRes.statusText, '🟡 请低头看腋窝');

  // 2. 仅转头看侧面，但头未向下低头看腋窝 (平视侧方，耳朵未抬升，耳鼻高差仍小)
  kps[0] = { x: 260, y: 205, score: 0.9, name: 'nose' }; // 鼻尖转向左侧
  kps[1] = { x: 265, y: 175, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 305, y: 175, score: 0.9, name: 'right_eye' };
  const turnOnlyRes = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
  assert.equal(turnOnlyRes.matched, false, '仅转头但未低头看腋窝，不可达标');
  assert.equal(turnOnlyRes.statusText, '🟡 请向下低头');

  // 3. 头部向斜下方转动并切实低头看腋窝 (耳朵向上翘起至 y=165，鼻尖下沉至 y=240，斜向偏转)
  kps[0] = { x: 235, y: 240, score: 0.9, name: 'nose' };
  kps[1] = { x: 230, y: 195, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 270, y: 215, score: 0.9, name: 'right_eye' };
  kps[3] = { x: 215, y: 165, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 295, y: 175, score: 0.9, name: 'right_ear' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
  }
  const validRes = evaluator.evaluate('seated_look_armpit', kps, { currentSide: 1 });
  assert.ok(validRes.matched, '向斜下方偏转且低头看腋窝到位，应判定达标');
  assert.equal(validRes.statusText, '🟢 达标保持中');
});

test('ActionPoseEvaluator: 托脑低头 (seated_hold_head_down) 低头与手位双重校验', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  kps[0] = { x: 200, y: 120, score: 0.9, name: 'nose' };
  kps[5] = { x: 150, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 250, y: 200, score: 0.9, name: 'right_shoulder' };

  // 手没抬
  assert.equal(evaluator.evaluate('seated_hold_head_down', kps).matched, false);

  // 手抬到后脑但头没低 (neckDropRatio = (200 - 120) / 100 = 0.8 > 0.38)
  kps[9] = { x: 170, y: 140, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 230, y: 140, score: 0.9, name: 'right_wrist' };
  assert.equal(evaluator.evaluate('seated_hold_head_down', kps).matched, false, '手抬但未低头不应达标');

  // 手托后脑且明显低头 (nose 下沉到 170)
  kps[0] = { x: 200, y: 170, score: 0.9, name: 'nose' };
  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('seated_hold_head_down', kps);
  }
  assert.ok(evaluator.evaluate('seated_hold_head_down', kps).matched, '托脑且低头应判定达标');
});

test('ActionPoseEvaluator: 托脑低头 (seated_hold_head_down) 真实面部下仅托后脑平视不达标，必须有低头幅度', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 模拟真实成人正面坐姿 (肩宽 200, 双肩在 y=300)
  kps[5] = { x: 200, y: 300, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 400, y: 300, score: 0.9, name: 'right_shoulder' };
  // 双眼眼距 40，双眼在 y=180
  kps[1] = { x: 280, y: 180, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 320, y: 180, score: 0.9, name: 'right_eye' };
  // 鼻尖在 y=210
  kps[0] = { x: 300, y: 210, score: 0.9, name: 'nose' };
  // 双手抬起托在后脑勺 (y=170)
  kps[9] = { x: 260, y: 170, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 340, y: 170, score: 0.9, name: 'right_wrist' };

  // 1. 平视状态：耳朵高度与鼻尖平齐 (y=205 附近，低头幅度为 0)
  kps[3] = { x: 250, y: 205, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 350, y: 205, score: 0.9, name: 'right_ear' };

  const lookStraightRes = evaluator.evaluate('seated_hold_head_down', kps);
  assert.equal(lookStraightRes.matched, false, '双手托后脑但平视未低头，绝对不可判定达标');
  assert.equal(lookStraightRes.statusText, '🟡 请继续向下低头');

  // 2. 稍微低头 (轻微收下巴/低头 10°，耳鼻落差仅 15px，earNoseRatio=0.375，幅度不足不可达标)
  kps[3] = { x: 250, y: 195, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 350, y: 195, score: 0.9, name: 'right_ear' };
  kps[0] = { x: 300, y: 210, score: 0.9, name: 'nose' };
  const slightRes = evaluator.evaluate('seated_hold_head_down', kps);
  assert.equal(slightRes.matched, false, '稍微低头幅度不足时不可达标');
  assert.equal(slightRes.statusText, '🟡 请继续向下低头');

  // 3. 顺着重力平缓充分低头向下：耳朵向上抬升到 y=170，鼻尖下沉到 y=235 (落差 65px，earNoseRatio=1.625)
  kps[3] = { x: 250, y: 170, score: 0.9, name: 'left_ear' };
  kps[4] = { x: 350, y: 170, score: 0.9, name: 'right_ear' };
  kps[0] = { x: 300, y: 235, score: 0.9, name: 'nose' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('seated_hold_head_down', kps);
  }
  const headDownRes = evaluator.evaluate('seated_hold_head_down', kps);
  assert.ok(headDownRes.matched, '低头幅度到位后应判定达标');
  assert.equal(headDownRes.statusText, '🟢 达标保持中');

  // 4. 模拟后脑勺遮挡：双手手腕完全丢点 (wrists 变成 null)，但双肘保持抬起
  kps[9] = null;
  kps[10] = null;
  kps[7] = { x: 140, y: 320, score: 0.9, name: 'left_elbow' }; // 双肘高于 shoulder.y + 0.45 * shoulderWidth (300 + 90 = 390)
  kps[8] = { x: 460, y: 320, score: 0.9, name: 'right_elbow' };

  const occludedWristRes = evaluator.evaluate('seated_hold_head_down', kps);
  assert.ok(occludedWristRes.matched, '手腕因后脑勺遮挡丢失但肘部抬起时，动作依然达标');
  assert.equal(occludedWristRes.statusText, '🟢 达标保持中', '达标保持中手腕遮挡不应闪烁出“请轻托后脑”');

  // 5. 模拟单帧噪点 (raw 偶发失配 1 帧)：UI 状态文本与状态类名必须稳定，绝不高频闪变
  const noisyKps = createBlankKeypoints();
  noisyKps[0] = { x: 300, y: 200, score: 0.9, name: 'nose' }; // 单帧头部微晃
  noisyKps[5] = { x: 200, y: 300, score: 0.9, name: 'left_shoulder' };
  noisyKps[6] = { x: 400, y: 300, score: 0.9, name: 'right_shoulder' };
  const noisyRes = evaluator.evaluate('seated_hold_head_down', noisyKps);
  assert.ok(noisyRes.matched, '迟滞保护下偶发单帧抖动依然保持达标');
  assert.equal(noisyRes.statusText, '🟢 达标保持中', '单帧抖动时药丸文本绝对不闪烁');
  assert.equal(noisyRes.statusClass, 'bottom', '单帧抖动时药丸状态样式保持绿色');
});

test('ActionPoseEvaluator: 站姿小燕飞 (standing_swallow_fly) 侧身与双臂后伸判定', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 1. 完全正对摄像头站立，双手自然下垂：绝对不可误判达标
  kps[0] = { x: 250, y: 100, score: 0.9, name: 'nose' };
  kps[1] = { x: 235, y: 90, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 265, y: 90, score: 0.9, name: 'right_eye' };
  kps[5] = { x: 190, y: 160, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 310, y: 160, score: 0.9, name: 'right_shoulder' };
  kps[7] = { x: 180, y: 260, score: 0.9, name: 'left_elbow' };
  kps[8] = { x: 320, y: 260, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 175, y: 350, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 325, y: 350, score: 0.9, name: 'right_wrist' };
  kps[11] = { x: 210, y: 320, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 290, y: 320, score: 0.9, name: 'right_hip' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('standing_swallow_fly', kps);
    assert.equal(res.matched, false, '正面站立未侧身时不应达标');
  }
  const frontRes = evaluator.evaluate('standing_swallow_fly', kps);
  assert.equal(frontRes.metricValue, '请侧身');

  // 2. 模拟侧身面向左 (nose 在左侧，头朝向左)，但手臂自然垂直下垂贴裤缝 (未后伸)
  evaluator.reset();
  const sideRelaxKps = createBlankKeypoints();
  sideRelaxKps[0] = { x: 210, y: 100, score: 0.9, name: 'nose' }; // 明显偏向左侧 (shoulderMid = 260, torsoHeight = 160)
  sideRelaxKps[1] = { x: 220, y: 95, score: 0.9, name: 'left_eye' };
  sideRelaxKps[3] = { x: 250, y: 95, score: 0.9, name: 'left_ear' };
  sideRelaxKps[5] = { x: 250, y: 160, score: 0.9, name: 'left_shoulder' };
  sideRelaxKps[6] = { x: 270, y: 160, score: 0.9, name: 'right_shoulder' }; // 侧身双肩重叠变窄
  sideRelaxKps[11] = { x: 250, y: 320, score: 0.9, name: 'left_hip' };
  sideRelaxKps[12] = { x: 265, y: 320, score: 0.9, name: 'right_hip' };
  // 手臂自然垂直下垂 (x 坐标与肩几乎对齐，无后伸)
  sideRelaxKps[7] = { x: 250, y: 250, score: 0.9, name: 'left_elbow' };
  sideRelaxKps[9] = { x: 252, y: 340, score: 0.9, name: 'left_wrist' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('standing_swallow_fly', sideRelaxKps);
    assert.equal(res.matched, false, '侧身但手臂自然垂立未后伸时不应达标');
  }
  const relaxRes = evaluator.evaluate('standing_swallow_fly', sideRelaxKps);
  assert.equal(relaxRes.rawMatched, false);
  assert.equal(relaxRes.statusText, '🟡 请双臂后伸');

  // 3. 模拟侧身面向左，双臂向身后 (右下方，x 增大) 充分后伸展翅 (燕飞达标)
  evaluator.reset();
  const sideFlyLeftKps = createBlankKeypoints();
  sideFlyLeftKps[0] = { x: 210, y: 100, score: 0.9, name: 'nose' };
  sideFlyLeftKps[1] = { x: 220, y: 95, score: 0.9, name: 'left_eye' };
  sideFlyLeftKps[3] = { x: 250, y: 95, score: 0.9, name: 'left_ear' };
  sideFlyLeftKps[5] = { x: 250, y: 160, score: 0.9, name: 'left_shoulder' };
  sideFlyLeftKps[6] = { x: 270, y: 160, score: 0.9, name: 'right_shoulder' };
  sideFlyLeftKps[11] = { x: 250, y: 320, score: 0.9, name: 'left_hip' };
  sideFlyLeftKps[12] = { x: 265, y: 320, score: 0.9, name: 'right_hip' };
  // 手臂向身后 (右下方) 斜向伸展：肩(250, 160) -> 肘(310, 240) -> 腕(360, 310) (dx = 110, dy = 150, angle ~ 36°)
  sideFlyLeftKps[7] = { x: 310, y: 240, score: 0.9, name: 'left_elbow' };
  sideFlyLeftKps[9] = { x: 360, y: 310, score: 0.9, name: 'left_wrist' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_swallow_fly', sideFlyLeftKps);
  }
  const flyLeftPass = evaluator.evaluate('standing_swallow_fly', sideFlyLeftKps);
  assert.ok(flyLeftPass.matched, '面向左侧且双臂向身后斜展时应判定达标');
  assert.equal(flyLeftPass.statusText, '🟢 燕飞展开中');

  // 4. 模拟侧身面向右，双臂向身后 (左下方，x 减小) 充分后伸展翅 (燕飞达标)
  evaluator.reset();
  const sideFlyRightKps = createBlankKeypoints();
  sideFlyRightKps[0] = { x: 290, y: 100, score: 0.9, name: 'nose' }; // 头部明显朝右
  sideFlyRightKps[2] = { x: 280, y: 95, score: 0.9, name: 'right_eye' };
  sideFlyRightKps[4] = { x: 250, y: 95, score: 0.9, name: 'right_ear' };
  sideFlyRightKps[5] = { x: 230, y: 160, score: 0.9, name: 'left_shoulder' };
  sideFlyRightKps[6] = { x: 250, y: 160, score: 0.9, name: 'right_shoulder' };
  sideFlyRightKps[11] = { x: 235, y: 320, score: 0.9, name: 'left_hip' };
  sideFlyRightKps[12] = { x: 250, y: 320, score: 0.9, name: 'right_hip' };
  // 身后为左侧 (dx < 0)：肩(250, 160) -> 肘(190, 240) -> 腕(140, 310) (dx = -110, dy = 150, angle ~ 36°)
  sideFlyRightKps[8] = { x: 190, y: 240, score: 0.9, name: 'right_elbow' };
  sideFlyRightKps[10] = { x: 140, y: 310, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_swallow_fly', sideFlyRightKps);
  }
  const flyRightPass = evaluator.evaluate('standing_swallow_fly', sideFlyRightKps);
  assert.ok(flyRightPass.matched, '面向右侧且双臂向身后斜展时应判定达标');
  assert.equal(flyRightPass.statusText, '🟢 燕飞展开中');
});

test('ActionPoseEvaluator: 举手翻掌 (standing_raise_hands) 严禁单手挠头挂机', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  kps[0] = { x: 200, y: 120, score: 0.9, name: 'nose' };
  kps[5] = { x: 150, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 250, y: 200, score: 0.9, name: 'right_shoulder' };

  // 单手高举 (左手举过头顶，右手垂在身体腰侧) -> 严禁通过
  kps[9] = { x: 190, y: 60, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 260, y: 350, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('standing_raise_hands', kps);
    assert.equal(res.matched, false, '仅单手举起绝对不应误判达标');
  }

  // 双手同时高举过头顶 -> 达标
  kps[10] = { x: 210, y: 60, score: 0.9, name: 'right_wrist' };
  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_raise_hands', kps);
  }
  assert.ok(evaluator.evaluate('standing_raise_hands', kps).matched, '双手同时高举达标');
});

test('ActionPoseEvaluator: 胳膊向后旋 (standing_arms_rotate) 严禁垂手插兜挂机', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  kps[5] = { x: 160, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 240, y: 200, score: 0.9, name: 'right_shoulder' };
  kps[11] = { x: 170, y: 350, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 230, y: 350, score: 0.9, name: 'right_hip' };

  // 手垂在裤缝，虽然肘部撑开 (类似插兜)，但高度太低 -> 严禁通过
  kps[7] = { x: 120, y: 300, score: 0.9, name: 'left_elbow' }; // y=300 过低 (肩在中点200)
  kps[8] = { x: 280, y: 300, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 150, y: 380, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 250, y: 380, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 5; i++) {
    assert.equal(evaluator.evaluate('standing_arms_rotate', kps).matched, false, '垂手插兜不可通过');
  }

  // 双臂抬起至肩部水平高度且横向充分展开 -> 达标
  kps[7] = { x: 110, y: 205, score: 0.9, name: 'left_elbow' };
  kps[8] = { x: 290, y: 205, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 60, y: 205, score: 0.9, name: 'left_wrist' };
  kps[10] = { x: 340, y: 205, score: 0.9, name: 'right_wrist' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_arms_rotate', kps);
  }
  assert.ok(evaluator.evaluate('standing_arms_rotate', kps).matched, '平举展臂应达标');
});

test('ActionPoseEvaluator: 扶腰后伸 (standing_waist_stretch) 严禁直立挂机', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 1. 普通直立站立，手自然垂立，未叉腰、未后仰 -> 严禁通过 (封堵历史只要入镜就通过的漏洞)
  kps[0] = { x: 200, y: 135, score: 0.9, name: 'nose' };
  kps[1] = { x: 180, y: 110, score: 0.9, name: 'left_eye' }; // eyeToNoseDy = 25
  kps[2] = { x: 220, y: 110, score: 0.9, name: 'right_eye' };
  kps[5] = { x: 150, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 250, y: 200, score: 0.9, name: 'right_shoulder' };
  kps[9] = { x: 140, y: 380, score: 0.9, name: 'left_wrist' }; // 垂在腿侧
  kps[10] = { x: 260, y: 380, score: 0.9, name: 'right_wrist' };
  kps[11] = { x: 160, y: 330, score: 0.9, name: 'left_hip' };
  kps[12] = { x: 240, y: 330, score: 0.9, name: 'right_hip' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('standing_waist_stretch', kps);
    assert.equal(res.matched, false, '直立站立未叉腰未后仰绝对不应通过');
  }

  // 2. 双手叉腰且头部/躯干后仰延展 (仰头 eyeToNoseDy 压缩) -> 达标
  kps[7] = { x: 120, y: 290, score: 0.9, name: 'left_elbow' }; // 肘向外撑
  kps[8] = { x: 280, y: 290, score: 0.9, name: 'right_elbow' };
  kps[9] = { x: 150, y: 310, score: 0.9, name: 'left_wrist' }; // 手腕在腰髋处
  kps[10] = { x: 250, y: 310, score: 0.9, name: 'right_wrist' };
  // 抬头后仰：鼻尖上扬，eyeToNoseDy 压缩至 8px (< 40 * 0.35)
  kps[0] = { x: 200, y: 118, score: 0.9, name: 'nose' };
  kps[1] = { x: 180, y: 112, score: 0.9, name: 'left_eye' };
  kps[2] = { x: 220, y: 112, score: 0.9, name: 'right_eye' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('standing_waist_stretch', kps);
  }
  const passRes = evaluator.evaluate('standing_waist_stretch', kps);
  assert.ok(passRes.matched, '双手叉腰且平缓后仰应判定达标');
  assert.equal(passRes.statusText, '🟢 扶腰后伸中');
});

test('ActionPoseEvaluator: 手按锁骨看斜上方 (seated_press_collarbone) 严禁平视误判', () => {
  const evaluator = new ActionPoseEvaluator();
  const kps = createBlankKeypoints();

  // 1. 正常端坐平视前方，未仰头 (eyeToNoseDy 正常) -> 严禁通过
  kps[0] = { x: 200, y: 130, score: 0.9, name: 'nose' };
  kps[1] = { x: 180, y: 105, score: 0.9, name: 'left_eye' }; // eyeToNoseDy = 25 (> 40 * 0.33)
  kps[2] = { x: 220, y: 105, score: 0.9, name: 'right_eye' };
  kps[5] = { x: 130, y: 200, score: 0.9, name: 'left_shoulder' };
  kps[6] = { x: 270, y: 200, score: 0.9, name: 'right_shoulder' };

  for (let i = 0; i < 5; i++) {
    const res = evaluator.evaluate('seated_press_collarbone', kps);
    assert.equal(res.matched, false, '平视未仰头不应达标');
  }

  // 2. 抬头仰望斜上方天花板 (nose偏向一侧且仰起) -> 达标
  kps[0] = { x: 225, y: 115, score: 0.9, name: 'nose' }; // relDx = 25/140 = 0.18 >= 0.12
  kps[1] = { x: 200, y: 110, score: 0.9, name: 'left_eye' }; // eyeToNoseDy = 5 <= 40 * 0.33
  kps[2] = { x: 240, y: 110, score: 0.9, name: 'right_eye' };

  for (let i = 0; i < 4; i++) {
    evaluator.evaluate('seated_press_collarbone', kps, { currentSide: 1 });
  }
  const passRes = evaluator.evaluate('seated_press_collarbone', kps, { currentSide: 1 });
  assert.ok(passRes.matched, '仰望斜上方天花板应判定达标');
});
