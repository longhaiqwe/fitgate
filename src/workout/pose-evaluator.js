// FitGate 通用人体姿态与动作完成判定引擎 (Pose Evaluator)
// 适配 MoveNet 17 骨骼关键点，覆盖全部 15 种办公室工位与居家动作

/**
 * 关键点索引对照表 (MoveNet 17 Keypoints):
 * 0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear
 * 5: left_shoulder, 6: right_shoulder, 7: left_elbow, 8: right_elbow
 * 9: left_wrist, 10: right_wrist, 11: left_hip, 12: right_hip
 * 13: left_knee, 14: right_knee, 15: left_ankle, 16: right_ankle
 */

// 辅助几何计算
export function getKp(keypoints, index, minScore = 0.2) {
  if (!keypoints || !keypoints[index]) return null;
  const kp = keypoints[index];
  if (kp.score !== undefined && kp.score < minScore) return null;
  if (!Number.isFinite(kp.x) || !Number.isFinite(kp.y)) return null;
  return kp;
}

export function getMidPoint(p1, p2) {
  if (!p1 && !p2) return null;
  if (!p1) return { x: p2.x, y: p2.y };
  if (!p2) return { x: p1.x, y: p1.y };
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

export function calcDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * 计算向量与竖直向下方向的夹角 (度数 0 ~ 180)
 * 0度表示正向下，90度水平，180度正向上
 */
export function calcAngleWithVertical(fromPt, toPt) {
  if (!fromPt || !toPt) return 0;
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const rad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return Math.round((rad * 180) / Math.PI);
}

/**
 * 计算三点连线夹角 (度数 0 ~ 180)
 */
export function calcJointAngle(p1, vertex, p2) {
  if (!p1 || !vertex || !p2) return 180;
  const ux = p1.x - vertex.x;
  const uy = p1.y - vertex.y;
  const vx = p2.x - vertex.x;
  const vy = p2.y - vertex.y;
  const uMag = Math.hypot(ux, uy);
  const vMag = Math.hypot(vx, vy);
  if (uMag === 0 || vMag === 0) return 180;
  let cos = (ux * vx + uy * vy) / (uMag * vMag);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

/**
 * 通用人体姿态评估器
 */
export class ActionPoseEvaluator {
  constructor() {
    this.side1DetectedDir = null; // 记录第1侧用户倾斜方向 ('left' | 'right')
    this.recentMatchHistory = []; // 平滑滤波缓存
    this.smoothedMatchedState = false; // 迟滞达标状态
    this.lastFeedback = '';
    this.currentSide = null;
    this.lastMatchedResult = null; // 记录最近一次达标时的完整结果，用于平滑期间展示稳定
    this.holdHeadHandMemoryFrames = 0; // 托后脑动作手部记忆缓冲帧，防止后脑遮挡丢点高频闪烁
  }

  reset() {
    this.side1DetectedDir = null;
    this.recentMatchHistory = [];
    this.smoothedMatchedState = false;
    this.lastFeedback = '';
    this.currentSide = null;
    this.lastMatchedResult = null;
    this.holdHeadHandMemoryFrames = 0;
  }

  /**
   * 评估指定帧的人体关键点姿态是否符合动作要求
   * @param {string} actionId 动作ID
   * @param {Array} keypoints 17个关键点数组
   * @param {Object} context 上下文 { currentSide, side1Direction, currentRep, isResting }
   * @returns {Object} 评估结果
   */
  evaluate(actionId, keypoints, context = {}) {
    const side = context.currentSide || 1;
    if (this.currentSide !== null && this.currentSide !== side) {
      this.recentMatchHistory = [];
      this.smoothedMatchedState = false;
    }
    this.currentSide = side;

    if (!keypoints || keypoints.length < 17) {
      return {
        matched: false,
        feedback: '请面向摄像头，确保头部与双肩可见',
        statusText: '等待入镜',
        statusClass: 'waiting',
        metricName: '姿态追踪',
        metricValue: '未入镜'
      };
    }

    // 基础有效性：至少检测到头部（鼻子或任一眼/耳）或双肩
    const nose = getKp(keypoints, 0);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);

    if (!nose && !leftShoulder && !rightShoulder) {
      return {
        matched: false,
        feedback: '未检测到人体，请面向摄像头就位',
        statusText: '等待入镜',
        statusClass: 'waiting',
        metricName: '姿态追踪',
        metricValue: '无目标'
      };
    }

    // 根据具体动作分派判定规则
    let result = null;
    switch (actionId) {
      // ===== 办公室 · 坐姿 6 动作 =====
      case 'seated_ear_shoulder':
      case 'seated_behind_neck':
        result = this.evalHeadLateralTilt(keypoints, context, actionId === 'seated_behind_neck');
        break;

      case 'seated_look_armpit':
        result = this.evalLookArmpit(keypoints, context);
        break;

      case 'seated_press_collarbone':
        result = this.evalPressCollarbone(keypoints, context);
        break;

      case 'seated_hold_head_down':
        result = this.evalHoldHeadDown(keypoints);
        break;

      case 'seated_ankle_pump':
        result = this.evalSeatedAnklePump(keypoints, context);
        break;

      // ===== 办公室 · 站立 6 动作 =====
      case 'standing_raise_hands':
        result = this.evalRaiseHands(keypoints);
        break;

      case 'standing_arms_rotate':
        result = this.evalArmsRotate(keypoints);
        break;

      case 'standing_wall_chest':
        result = this.evalWallChest(keypoints);
        break;

      case 'standing_waist_stretch':
        result = this.evalWaistStretch(keypoints, context);
        break;

      case 'standing_swallow_fly':
        result = this.evalSwallowFly(keypoints);
        break;

      case 'standing_cross_leg_side_bend':
        result = this.evalSideBend(keypoints, context);
        break;

      // ===== 居家大动作 =====
      case 'home_squats':
        // 深蹲主要由 SquatCounter 状态机驱动，在此提供协同校验
        result = this.evalSquatPose(keypoints);
        break;

      case 'home_child_cobra_stretch':
        result = this.evalChildCobra(keypoints, context);
        break;

      default:
        // 兜底通用上半身在位判定
        result = this.evalGenericPresence(keypoints);
        break;
    }

    // 状态迟滞滤波 (Hysteresis Filter):
    // 避免临界点因单帧轻微浮动导致 绿/蓝、大/小、粗/细 剧烈闪烁
    this.recentMatchHistory.push(result.matched);
    if (this.recentMatchHistory.length > 5) {
      this.recentMatchHistory.shift();
    }
    const trueCount = this.recentMatchHistory.filter(Boolean).length;

    if (!this.smoothedMatchedState) {
      // 未达标 -> 达标：需要最近 5 帧中有至少 3 帧达标
      if (trueCount >= 3) {
        this.smoothedMatchedState = true;
      }
    } else {
      // 已达标 -> 失去达标：需要连续失配 (trueCount <= 1)，过滤单帧偶发噪点
      if (trueCount <= 1) {
        this.smoothedMatchedState = false;
      }
    }

    if (this.smoothedMatchedState) {
      if (result.matched) {
        this.lastMatchedResult = {
          statusText: result.statusText,
          statusClass: result.statusClass,
          feedback: result.feedback,
          metricValue: result.metricValue
        };
      }
      return {
        ...result,
        matched: true,
        rawMatched: result.matched,
        statusText: this.lastMatchedResult?.statusText || (result.statusText && (result.statusText.includes('达标') || result.statusText.includes('保持')) ? result.statusText : '🟢 达标保持中'),
        statusClass: 'bottom',
        feedback: this.lastMatchedResult?.feedback || result.feedback,
        metricValue: this.lastMatchedResult?.metricValue || result.metricValue
      };
    }

    return {
      ...result,
      matched: false,
      rawMatched: result.matched
    };
  }

  // ================= 具体动作评估子逻辑 =================

  /**
   * 1 & 2: 耳朵找肩膀 / 背后交扣侧头 (头部侧倾)
   */
  evalHeadLateralTilt(keypoints, context, isBehindNeck = false) {
    const nose = getKp(keypoints, 0);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const headMid = nose || getMidPoint(leftEye, rightEye) || getMidPoint(leftEar, rightEar);

    if (!headMid || !shoulderMid) {
      return {
        matched: false,
        feedback: "请确保面部正对摄像头",
        statusText: "调整头部",
        statusClass: "squatting",
        metricName: "头部侧倾",
        metricValue: "--"
      };
    }

    const shoulderWidth = (leftShoulder && rightShoulder) ? calcDistance(leftShoulder, rightShoulder) : 200;

    // 1. 双肩基准角 (Shoulder Horizon Angle)
    // 解决工位坐姿身体微斜或摄像头微歪：必须测量头部相对于双肩的“净侧屈角”，而非绝对地平线角
    let shoulderAngle = 0;
    if (leftShoulder && rightShoulder) {
      const sdx = rightShoulder.x - leftShoulder.x;
      const sdy = rightShoulder.y - leftShoulder.y;
      shoulderAngle = Math.atan2(sdy, sdx) * (180 / Math.PI);
    }

    // 2. 双眼与双耳连线水平角
    let eyeAngle = 0;
    let hasEyeAngle = false;
    if (leftEye && rightEye) {
      const edx = rightEye.x - leftEye.x;
      const edy = rightEye.y - leftEye.y;
      eyeAngle = Math.atan2(edy, edx) * (180 / Math.PI);
      hasEyeAngle = true;
    }

    let earAngle = 0;
    let hasEarAngle = false;
    if (leftEar && rightEar) {
      const eardx = rightEar.x - leftEar.x;
      const eardy = rightEar.y - leftEar.y;
      earAngle = Math.atan2(eardy, eardx) * (180 / Math.PI);
      hasEarAngle = true;
    }

    // 3. 计算头部相对于双肩的净侧屈角 (Net Lateral Flexion Angle)
    let netTiltAngle = 0;
    let netTiltDir = null; // "left" 表示倒向画面左侧肩膀 (镜面对应人体右肩)

    if (hasEyeAngle) {
      let diff = eyeAngle - shoulderAngle;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      netTiltAngle = Math.round(Math.abs(diff));
      netTiltDir = diff > 0 ? "left" : "right";
    } else if (hasEarAngle) {
      let diff = earAngle - shoulderAngle;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      netTiltAngle = Math.round(Math.abs(diff));
      netTiltDir = diff > 0 ? "left" : "right";
    } else if (shoulderMid && nose) {
      const dx = nose.x - shoulderMid.x;
      const dy = Math.max(1, shoulderMid.y - nose.y);
      netTiltAngle = Math.round(Math.atan2(Math.abs(dx), dy) * (180 / Math.PI));
      netTiltDir = dx < 0 ? "left" : "right";
    }

    // 4. 耳朵找肩膀 (Ear to Shoulder Proximity) 核心解剖学特征
    // 侧头时，倒向侧的耳肩欧氏距离显著缩短，对侧大幅拉伸
    let earProximityValid = false;
    if (leftEar && rightEar && leftShoulder && rightShoulder) {
      const distLeft = calcDistance(leftEar, leftShoulder);
      const distRight = calcDistance(rightEar, rightShoulder);
      const ratio = distLeft / (distRight || 1);
      if (netTiltDir === "left" && ratio <= 0.82) {
        earProximityValid = true;
      } else if (netTiltDir === "right" && ratio >= 1.22) {
        earProximityValid = true;
      }
    }

    // 5. 头部相对于双肩的横向侧偏量 (Lateral Head Shift)
    const relDx = (nose.x - shoulderMid.x) / (shoulderWidth || 1);
    const hasLateralShift = Boolean(
      (netTiltDir === "left" && relDx <= -0.07) ||
      (netTiltDir === "right" && relDx >= 0.07)
    );

    // 6. 严密侧倾门槛（彻底排除端坐微偏/机位倾斜/戴眼镜导致的假侧头）：
    // 相对双肩净侧屈角必须 >= 16°，且必须伴随耳肩贴近或头部侧偏物理特征 (或相对深度倾斜 >= 24°)
    const isAngleValid = Boolean(
      netTiltAngle >= 16 && (earProximityValid || hasLateralShift || netTiltAngle >= 24)
    );

    const currentSide = context.currentSide || 1;

    let matched = false;
    let feedback = "";

    if (currentSide === 1) {
      if (isAngleValid && netTiltDir) {
        matched = true;
        this.side1DetectedDir = netTiltDir;
        feedback = isBehindNeck ? "保持背后交扣，颈部放松拉伸" : "保持侧倾，感受颈侧斜角肌拉伸";
      } else {
        matched = false;
        feedback = isBehindNeck ? "请将头自然倒向一侧肩膀" : "请将头部向侧面倾斜，耳朵贴近肩膀";
      }
    } else {
      // 第 2 侧：必须向对侧倾斜
      const oppositeDir = this.side1DetectedDir === "left" ? "right" : "left";
      if (!isAngleValid) {
        matched = false;
        feedback = "请换至另一侧倾斜头部";
      } else if (this.side1DetectedDir && netTiltDir !== oppositeDir) {
        matched = false;
        feedback = "请换向另一侧肩膀倾斜";
      } else {
        matched = true;
        feedback = "很好！已换至另一侧，保持均匀呼吸";
      }
    }

    return {
      matched,
      feedback,
      statusText: matched ? "🟢 姿态达标 · 保持中" : (netTiltAngle >= 10 ? "🟡 幅度不足，请贴近肩膀" : "🟡 请倾斜头部"),
      statusClass: matched ? "bottom" : "squatting",
      metricName: "净侧屈角",
      metricValue: netTiltAngle + "°"
    };
  }

  /**
   * 3: 低头看腋窝 (坐姿肩胛提肌放松)
   * 动作标准：头部向斜下方转动，眼睛低头看向同侧腋窝位置，同侧手可轻扶后脑勺外侧
   */
  evalLookArmpit(keypoints, context) {
    const nose = getKp(keypoints, 0);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const currentSide = context.currentSide || 1;

    if (!nose || !shoulderMid || !leftShoulder || !rightShoulder) {
      return {
        matched: false,
        feedback: '请面向摄像头就坐，确保双肩入镜',
        statusText: '调整视角',
        statusClass: 'squatting',
        metricName: '斜下朝向',
        metricValue: '--'
      };
    }

    const shoulderWidth = calcDistance(leftShoulder, rightShoulder);
    if (shoulderWidth < 40) {
      return {
        matched: false,
        feedback: '请稍微靠近摄像头坐好',
        statusText: '距离过远',
        statusClass: 'squatting',
        metricName: '姿态追踪',
        metricValue: '过远'
      };
    }

    const eyeMid = (leftEye && rightEye) ? getMidPoint(leftEye, rightEye) : null;
    const eyeDist = (leftEye && rightEye) ? calcDistance(leftEye, rightEye) : Math.max(30, shoulderWidth * 0.22);

    // 1. 面部水平侧转特征 (Yaw) 与倾角 (Roll)
    // 针对显示器顶部摄像头俯视：必须依靠面部内在几何，避免把端坐自然微偏或坐位不对称误判为偏转
    let yawRatio = 0;
    if (leftEye && rightEye && eyeDist > 15) {
      // 鼻子相对于双眼中点的水平偏离（以双眼间距归一化）
      yawRatio = (nose.x - eyeMid.x) / eyeDist;
    }
    const isSingleEyeVisible = Boolean((leftEye && !rightEye) || (!leftEye && rightEye));

    let headTiltAngle = 0;
    if (leftEye && rightEye) {
      const edx = rightEye.x - leftEye.x;
      const edy = rightEye.y - leftEye.y;
      headTiltAngle = Math.round(Math.abs(Math.atan2(edy, edx)) * (180 / Math.PI));
    } else if (leftEar && rightEar) {
      const edx = rightEar.x - leftEar.x;
      const edy = rightEar.y - leftEar.y;
      headTiltAngle = Math.round(Math.abs(Math.atan2(edy, edx)) * (180 / Math.PI));
    }

    // 鼻子相对于双肩欧氏距离比值与双肩水平相对偏离
    const distToLeftShoulder = calcDistance(nose, leftShoulder);
    const distToRightShoulder = calcDistance(nose, rightShoulder);
    const shoulderDistRatio = distToLeftShoulder / (distToRightShoulder || 1);
    const relDx = (nose.x - shoulderMid.x) / shoulderWidth;

    // 判定侧偏方向（要求有明确的面部转向或明显侧偏，正对端坐绝对不触发方向）
    let detectedDir = null;
    // 朝画面左侧偏（镜面对称同侧）：鼻子向左偏偏离 >= 0.20 眼距，或单眼遮挡，或肩距比 <= 0.80 且有倾角
    if (yawRatio <= -0.20 || (leftEye && !rightEye) || (relDx <= -0.09 && headTiltAngle >= 12) || (shoulderDistRatio <= 0.80 && headTiltAngle >= 10)) {
      detectedDir = 'left';
    } else if (yawRatio >= 0.20 || (!leftEye && rightEye) || (relDx >= 0.09 && headTiltAngle >= 12) || (shoulderDistRatio >= 1.25 && headTiltAngle >= 10)) {
      detectedDir = 'right';
    }

    // 有效偏转与倾斜门槛：
    // 绝不可仅用 6° 自然微晃作为阈值；要求明确的面部侧转 (|yawRatio| >= 0.20) 或深度倾角 (>= 14°) 或单眼遮挡
    const isTurnedOrTilted = Boolean(
      Math.abs(yawRatio) >= 0.20 ||
      (headTiltAngle >= 14 && Math.abs(relDx) >= 0.06) ||
      isSingleEyeVisible ||
      (shoulderDistRatio <= 0.78 || shoulderDistRatio >= 1.28)
    );

    // 2. 头部向下低垂幅度 (Pitch Down) —— 消除显示器上方俯视摄像头造成的假低头
    // 在俯视机位下，端坐平视时 (shoulderMid.y - nose.y) / shoulderWidth 本身就只有 0.32 ~ 0.38
    // 真正低头看腋窝时：
    // a. 耳鼻高差：耳部相对鼻尖明显抬升 (nose.y - earY >= 0.28 * eyeDist)
    // b. 颈肩深度下沉：鼻子向同侧腋窝下探，neckDropRatio 下降至 <= 0.22
    const neckDropRatio = (shoulderMid.y - nose.y) / shoulderWidth;
    const earY = (leftEar && rightEar)
      ? (leftEar.y + rightEar.y) / 2
      : (leftEar ? leftEar.y : (rightEar ? rightEar.y : null));

    let isHeadDown = false;
    if (earY !== null && nose) {
      const earNoseDrop = nose.y - earY;
      const earNoseRatio = earNoseDrop / eyeDist;
      // 耳鼻高差明确拉开 (耳朵明显高于鼻尖) 且颈肩距离未异常后仰，或者鼻子向双肩深层下沉
      isHeadDown = (earNoseRatio >= 0.28 && neckDropRatio <= 0.36) || (neckDropRatio <= 0.22);
    } else {
      // 耳部不可见兜底：要求更严格的向下深度下沉
      isHeadDown = neckDropRatio <= 0.22;
    }

    // 动作有效性：必须同时满足【有明确斜向偏转】+【有明确向下低头幅度】
    const isPostureValid = Boolean(detectedDir && isTurnedOrTilted && isHeadDown);

    let matched = false;
    let feedback = '';

    if (currentSide === 1) {
      if (isPostureValid && detectedDir) {
        matched = true;
        this.side1DetectedDir = detectedDir;
        feedback = '保持低头看向腋窝，感受后颈外侧舒展';
      } else if (detectedDir && isTurnedOrTilted && !isHeadDown) {
        matched = false;
        feedback = '已转向侧方，请慢慢低头看向腋窝';
      } else {
        matched = false;
        feedback = '请将头部向斜下方转动，低头看向腋窝';
      }
    } else {
      const oppositeDir = this.side1DetectedDir === 'left' ? 'right' : 'left';
      if (!isPostureValid) {
        matched = false;
        feedback = '请换至另一侧，向斜下方低头看腋窝';
      } else if (this.side1DetectedDir && detectedDir !== oppositeDir) {
        matched = false;
        feedback = '已到换侧时间，请换向另一侧腋窝';
      } else {
        matched = true;
        feedback = '换侧正确，保持后颈温和拉伸';
      }
    }

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 达标保持中' : (detectedDir && isTurnedOrTilted && !isHeadDown ? '🟡 请向下低头' : '🟡 请低头看腋窝'),
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '斜下朝向',
      metricValue: matched ? (detectedDir === 'left' ? '偏左下' : '偏右下') : (detectedDir ? '未低头' : '未偏转')
    };
  }

  /**
   * 4: 手按锁骨看斜上方 (胸锁乳突肌舒展)
   */
  evalPressCollarbone(keypoints, context) {
    const nose = getKp(keypoints, 0);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const currentSide = context.currentSide || 1;

    if (!nose || !shoulderMid || !leftShoulder || !rightShoulder) {
      return {
        matched: false,
        feedback: '请面向摄像头就坐',
        statusText: '调整视角',
        statusClass: 'squatting',
        metricName: '仰望姿态',
        metricValue: '--'
      };
    }

    const shoulderWidth = calcDistance(leftShoulder, rightShoulder);
    const eyeMid = (leftEye && rightEye) ? getMidPoint(leftEye, rightEye) : null;

    // 仰头特征判定：
    // 平视时眼睛在鼻子上方（eye.y < nose.y），眼睛到鼻子的垂直投影距离较大；
    // 仰望天花板时，下巴抬高，鼻尖上翘，眼鼻垂直投影距离显著压缩（nose.y - eyeMid.y 变小），
    // 且仰头时后脑下潜，耳部相对于鼻尖高度明显下沉。
    const eyeToNoseDy = (eyeMid && nose) ? (nose.y - eyeMid.y) : 30;
    const eyeDist = (leftEye && rightEye) ? calcDistance(leftEye, rightEye) : 40;
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const earY = (leftEar?.y || rightEar?.y);

    // 仰头严格判定：眼鼻垂直投影压缩至 <= 0.35 * eyeDist，或者耳部下沉至与鼻尖平齐或更低
    const isHeadTiltedUp = (eyeToNoseDy <= eyeDist * 0.33) || (earY && nose && earY > nose.y - 8);

    // 斜向偏转特征：鼻子偏离双肩中线超过肩宽的 12% (真正转头看向斜方，避免自然微偏误判)
    const relDx = (nose.x - shoulderMid.x) / (shoulderWidth || 1);
    const isTurned = Math.abs(relDx) >= 0.12;
    const turnDir = relDx < 0 ? 'left' : 'right';

    let matched = false;
    let feedback = '';

    if (currentSide === 1) {
      if (isHeadTiltedUp && isTurned) {
        matched = true;
        this.side1DetectedDir = turnDir;
        feedback = '手按锁骨，目光看斜上方天花板';
      } else {
        matched = false;
        feedback = '双手按压锁骨，头转向斜上方仰望';
      }
    } else {
      const oppositeDir = this.side1DetectedDir === 'left' ? 'right' : 'left';
      if (!isHeadTiltedUp || !isTurned) {
        matched = false;
        feedback = '请换至另一侧，望向斜上方';
      } else if (this.side1DetectedDir && turnDir !== oppositeDir) {
        matched = false;
        feedback = '请换到另一侧斜上方仰望';
      } else {
        matched = true;
        feedback = '另一侧仰头到位，感受颈前舒展';
      }
    }

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 达标保持中' : '🟡 请看斜上方',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '仰望姿态',
      metricValue: matched ? '已仰望' : '请微仰头'
    };
  }

  /**
   * 5: 托住后脑低头 (枕下肌群解压)
   */
  evalHoldHeadDown(keypoints) {
    const nose = getKp(keypoints, 0);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const shoulderWidth = (leftShoulder && rightShoulder) ? calcDistance(leftShoulder, rightShoulder) : 200;
    const eyeMid = (leftEye && rightEye) ? getMidPoint(leftEye, rightEye) : null;
    const eyeDist = (leftEye && rightEye) ? calcDistance(leftEye, rightEye) : Math.max(30, shoulderWidth * 0.22);

    // 1. 手腕与手肘抬高判定：必须切实抬高轻托在后脑勺凸起下方
    // A. 手腕可见时：手腕高度高于肩部或靠近耳部/后脑
    const isLeftWristAtHead = Boolean(leftWrist && leftShoulder && leftWrist.y < leftShoulder.y + 15);
    const isRightWristAtHead = Boolean(rightWrist && rightShoulder && rightWrist.y < rightShoulder.y + 15);
    const isWristAtHead = isLeftWristAtHead || isRightWristAtHead;

    // B. 手肘特征：双手十指相扣托后脑时，双肘弯曲并向两侧张开抬起，手肘高度显著高于平时下垂腰部
    const isLeftElbowRaised = Boolean(leftElbow && leftShoulder && leftElbow.y < leftShoulder.y + shoulderWidth * 0.45);
    const isRightElbowRaised = Boolean(rightElbow && rightShoulder && rightElbow.y < rightShoulder.y + shoulderWidth * 0.45);
    const isElbowRaised = isLeftElbowRaised || isRightElbowRaised;

    const isHandsDetectedNow = isWristAtHead || isElbowRaised;

    // C. 手部就位状态记忆缓冲 (Hand Presence Hysteresis)：
    // 正面摄像头拍摄下，双手托在脑后枕骨时，手腕被后脑勺与头发严重遮挡导致置信度频繁在阈值边缘波动；
    // 一旦检测到手已就位，维持 20 帧 (~330ms) 缓冲记忆，避免遮挡丢点造成高频频闪。
    if (isHandsDetectedNow) {
      this.holdHeadHandMemoryFrames = 20;
    } else if (this.holdHeadHandMemoryFrames > 0) {
      // 若检测到双臂明确垂下到腹部/腰部以下，则立即解除记忆
      const isHandsDropped = Boolean(
        leftElbow && leftShoulder && leftElbow.y > leftShoulder.y + shoulderWidth * 0.75 &&
        rightElbow && rightShoulder && rightElbow.y > rightShoulder.y + shoulderWidth * 0.75
      );
      if (isHandsDropped) {
        this.holdHeadHandMemoryFrames = 0;
      } else {
        this.holdHeadHandMemoryFrames -= 1;
      }
    }
    const isHandRaised = isHandsDetectedNow || (this.holdHeadHandMemoryFrames > 0);

    // 2. 头部低垂幅度严格判定 (解剖学充分前屈俯仰角检测)：
    // 枕下肌群拉伸要求顺着重力平缓向下充分低头，微点头或轻微收下巴绝不可判定达标。
    const neckDropRatio = (shoulderMid && nose) ? (shoulderMid.y - nose.y) / (shoulderWidth || 1) : 0.4;
    const earY = (leftEar && rightEar)
      ? (leftEar.y + rightEar.y) / 2
      : (leftEar ? leftEar.y : (rightEar ? rightEar.y : null));

    let isHeadDown = false;

    // 处于达标保持中时启用迟滞容差门槛，避免微小噪点在门限边缘单像素高频振荡
    const earNoseThreshold = this.smoothedMatchedState ? 0.38 : 0.48;
    const earNoseThresholdB = this.smoothedMatchedState ? 0.34 : 0.42;
    const eyeCompThreshold = this.smoothedMatchedState ? 0.55 : 0.50;
    const neckDropThresholdA = this.smoothedMatchedState ? 0.40 : 0.36;
    const neckDropThresholdC = this.smoothedMatchedState ? 0.22 : 0.18;

    if (earY !== null && nose) {
      // 核心特征：耳鼻垂直俯仰高差 (Ear-Nose Pitch)
      // 显示器顶部俯视摄像头下，平视时 earNoseRatio 约为 0.10 ~ 0.20；
      // 轻微点头时约为 0.30 ~ 0.45 (不可达标)；
      // 真正顺着重力充分低头拉伸枕下肌群时，后脑抬升鼻尖下潜，earNoseRatio >= 0.58！
      const earNoseDrop = nose.y - earY;
      const earNoseRatio = earNoseDrop / eyeDist;

      // 眼鼻垂直投影压缩比 (面部朝下俯视时投影收缩)
      const verticalEyeToNose = eyeMid ? (nose.y - eyeMid.y) : 30;
      const eyeCompressionRatio = verticalEyeToNose / eyeDist;

      // 黄金平衡门槛：静止不动绝对拦截，切实启动低头即顺畅达标
      // 条件 A：耳部明确高过鼻尖且脖颈未过度仰起
      // 条件 B：眼鼻投影有效压缩且耳部高过鼻尖
      // 条件 C：头部深度向下下潜
      if (
        (earNoseRatio >= earNoseThreshold && neckDropRatio <= neckDropThresholdA) ||
        (eyeCompressionRatio <= eyeCompThreshold && earNoseRatio >= earNoseThresholdB) ||
        (neckDropRatio <= neckDropThresholdC)
      ) {
        isHeadDown = true;
      }
    } else if (eyeMid && nose) {
      // 耳部被长发或手掌遮挡兜底：依靠眼鼻垂直投影压缩比与深度下沉比
      const verticalEyeToNose = nose.y - eyeMid.y;
      const isEyeCompressed = verticalEyeToNose <= eyeDist * (this.smoothedMatchedState ? 0.52 : 0.48);
      isHeadDown = neckDropRatio <= neckDropThresholdC || (neckDropRatio <= (this.smoothedMatchedState ? 0.28 : 0.24) && isEyeCompressed);
    } else {
      // 极简关键点兜底 (如简易测试用例，仅有 nose 与 shoulders)
      isHeadDown = neckDropRatio <= (this.smoothedMatchedState ? 0.34 : 0.30);
    }

    const matched = Boolean(isHandRaised && isHeadDown);
    const feedback = matched
      ? '双手轻托后脑，微收下巴平缓低头'
      : (!isHandRaised ? '请双手十指相扣，轻托在后脑勺' : '双手托好后脑，慢慢加大低头幅度');

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 达标保持中' : (isHandRaised ? '🟡 请继续向下低头' : '🟡 请轻托后脑'),
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '托脑低头',
      metricValue: matched ? '动作到位' : (isHandRaised ? '幅度不足' : '请托头')
    };
  }

  /**
   * 6: 桌下勾脚踮脚 (工位微运动)
   */
  evalSeatedAnklePump(keypoints, context) {
    // 若下肢脚踝可见，检测脚踝动态；若桌面遮挡，检测工位在座就位
    const leftAnkle = getKp(keypoints, 15);
    const rightAnkle = getKp(keypoints, 16);
    const shoulder = getKp(keypoints, 5) || getKp(keypoints, 6);

    const matched = Boolean(shoulder);
    const feedback = '保持端坐，桌下脚尖用力上勾 2s、踮脚 2s 循环';

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 工位伴练中' : '🟡 请在工位端坐',
      statusClass: matched ? 'bottom' : 'standing',
      metricName: '在位状态',
      metricValue: matched ? '端坐就位' : '未就位'
    };
  }

  /**
   * 7: 举手翻掌 (双手十指相扣高举过头)
   */
  evalRaiseHands(keypoints) {
    const nose = getKp(keypoints, 0);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);

    const headTop = nose || getMidPoint(leftEye, rightEye);
    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);

    if (!headTop || !shoulderMid) {
      return {
        matched: false,
        feedback: '请在镜头前站立就位',
        statusText: '调整站位',
        statusClass: 'squatting',
        metricName: '举手高度',
        metricValue: '--'
      };
    }

    // 严禁单手蒙混：必须双手同时高举！
    // 1. 双手手腕均高于头部/眉眼
    const isLeftWristUp = leftWrist && leftWrist.y < headTop.y;
    const isRightWristUp = rightWrist && rightWrist.y < headTop.y;

    // 2. 镜头顶部视野边缘容错：若站立过高导致手腕出画顶边，双肘必须均显著高过双肩且贴近耳侧
    const isLeftElbowHigh = leftElbow && leftElbow.y < shoulderMid.y - 15;
    const isRightElbowHigh = rightElbow && rightElbow.y < shoulderMid.y - 15;

    const bothHandsRaised = Boolean((isLeftWristUp && isRightWristUp) ||
                                    (isLeftWristUp && isRightElbowHigh) ||
                                    (isRightWristUp && isLeftElbowHigh) ||
                                    (isLeftElbowHigh && isRightElbowHigh && (!leftWrist || !rightWrist)));

    const matched = bothHandsRaised;
    const feedback = matched
      ? '双手十指相扣用力上推翻掌，保持 30 秒'
      : (isLeftWristUp || isRightWristUp ? '请将双手【同时】高举过头顶推掌' : '请将双手举过头顶，掌心向上翻转推向天花板');

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 双手高举 · 保持中' : '🟡 请将双手高举过头',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '举手姿态',
      metricValue: matched ? '双手到位' : (isLeftWristUp || isRightWristUp ? '单手未全' : '偏低')
    };
  }

  /**
   * 8: 胳膊向后旋 (双臂侧平展，双手握空拳向后旋)
   */
  evalArmsRotate(keypoints) {
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);
    const leftHip = getKp(keypoints, 11);
    const rightHip = getKp(keypoints, 12);

    if (!leftShoulder || !rightShoulder) {
      return {
        matched: false,
        feedback: '请面向摄像头站立',
        statusText: '调整站位',
        statusClass: 'squatting',
        metricName: '双臂展开',
        metricValue: '--'
      };
    }

    const shoulderDist = calcDistance(leftShoulder, rightShoulder);
    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const hipMid = getMidPoint(leftHip, rightHip);
    const torsoHeight = (shoulderMid && hipMid) ? Math.max(80, hipMid.y - shoulderMid.y) : shoulderDist * 1.4;

    // 1. 严格检查高度（Y 轴）：双肘和双手腕只要可见，必须抬起至肩部水平高度，严禁垂在腰间/裤缝蒙混！
    const areElbowsRaised = (!leftElbow || leftElbow.y < shoulderMid.y + torsoHeight * 0.35) &&
                            (!rightElbow || rightElbow.y < shoulderMid.y + torsoHeight * 0.35);

    const areWristsRaised = (!leftWrist || leftWrist.y < shoulderMid.y + torsoHeight * 0.45) &&
                            (!rightWrist || rightWrist.y < shoulderMid.y + torsoHeight * 0.45);

    // 至少有腕部或肘部被检测到，且全部可见的臂部关键点高度均抬起达标
    const hasAnyArmKp = Boolean(leftElbow || rightElbow || leftWrist || rightWrist);
    const areArmsHeightValid = hasAnyArmKp && areElbowsRaised && areWristsRaised;

    // 2. 严格检查横向展开宽度（X 轴）：双臂平展宽度必须显著大于肩宽
    const wristDist = (leftWrist && rightWrist) ? Math.abs(rightWrist.x - leftWrist.x) : 0;
    const elbowDist = (leftElbow && rightElbow) ? Math.abs(rightElbow.x - leftElbow.x) : 0;
    const isHorizontallyWide = wristDist >= shoulderDist * 1.4 || elbowDist >= shoulderDist * 1.25;

    // 3. 伸直度校验：肩-肘-腕不可完全弯曲垂胸
    let isStraightEnough = true;
    if (leftElbow && leftWrist) {
      isStraightEnough = isStraightEnough && calcJointAngle(leftShoulder, leftElbow, leftWrist) >= 110;
    }
    if (rightElbow && rightWrist) {
      isStraightEnough = isStraightEnough && calcJointAngle(rightShoulder, rightElbow, rightWrist) >= 110;
    }

    const matched = Boolean(areArmsHeightValid && isHorizontallyWide && isStraightEnough);
    let feedback = '双臂平展后旋，感受肩胛骨夹紧下沉';
    if (!areArmsHeightValid) {
      feedback = '请将双臂抬起至与肩同高，水平向两侧平展';
    } else if (!isHorizontallyWide) {
      feedback = '请将双臂充分向两侧伸展打开，不要收拢在胸前';
    }

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 展臂达标 · 保持中' : '🟡 请平展抬起双臂',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '手臂展开',
      metricValue: matched ? '已平展' : (!areElbowsRaised ? '过低' : '待展开')
    };
  }

  /**
   * 9: 靠墙开胸 (双肘抬起撑墙挺胸)
   */
  evalWallChest(keypoints) {
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);

    const isElbowRaised = (leftElbow && leftShoulder && leftElbow.y < leftShoulder.y + 40) &&
                          (rightElbow && rightShoulder && rightElbow.y < rightShoulder.y + 40);

    const matched = Boolean(isElbowRaised);
    const feedback = matched
      ? '胸口贴近墙面，保持舒展深呼吸'
      : '请屈肘抬臂撑稳，将胸口慢慢靠向墙面';

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 达标保持中' : '🟡 请抬肘靠墙开胸',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '胸腔舒展',
      metricValue: matched ? '已开胸' : '待挺胸'
    };
  }

  /**
   * 10: 扶腰后伸 (双手叉腰腰椎后伸)
   * 动作标准：双手托住后腰下侧，上身平缓向后仰伸，感受腰椎舒展
   */
  evalWaistStretch(keypoints, context) {
    const nose = getKp(keypoints, 0);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);
    const leftHip = getKp(keypoints, 11);
    const rightHip = getKp(keypoints, 12);

    if (!leftShoulder && !rightShoulder) {
      return {
        matched: false,
        feedback: '请面向摄像头站立',
        statusText: '调整站位',
        statusClass: 'squatting',
        metricName: '腰椎后伸',
        metricValue: '--'
      };
    }

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const hipMid = getMidPoint(leftHip, rightHip);
    const shoulderDist = (leftShoulder && rightShoulder) ? Math.abs(rightShoulder.x - leftShoulder.x) : 100;
    const torsoHeight = (shoulderMid && hipMid) ? Math.max(80, hipMid.y - shoulderMid.y) : 150;

    // 1. 手位检测：双手叉腰 / 托住后腰
    // 叉腰时手腕处于腰髋区间（在双肩下方，不能垂至大腿膝盖），且双肘向两侧外撑
    const maxWaistY = (hipMid ? hipMid.y : shoulderMid.y + torsoHeight) + torsoHeight * 0.12;
    const minWaistY = shoulderMid.y + torsoHeight * 0.35;

    const isLeftWristAtWaist = leftWrist && leftWrist.y >= minWaistY && leftWrist.y <= maxWaistY;
    const isRightWristAtWaist = rightWrist && rightWrist.y >= minWaistY && rightWrist.y <= maxWaistY;
    const isWristNearWaist = isLeftWristAtWaist || isRightWristAtWaist;

    const isElbowWider = (leftElbow && rightElbow) &&
      Math.abs(rightElbow.x - leftElbow.x) >= shoulderDist * 0.95 &&
      leftElbow.y >= minWaistY - 20 && leftElbow.y <= maxWaistY;

    const hasHandsOnWaist = isWristNearWaist || isElbowWider;

    // 2. 后仰延展检测 (严禁直立挂机)：
    // 方式 A：抬头后仰（下巴抬高，眼鼻垂直投影压缩，或耳下沉）
    let isHeadExtended = false;
    const eyeMid = (leftEye && rightEye) ? getMidPoint(leftEye, rightEye) : null;
    const eyeDist = (leftEye && rightEye) ? calcDistance(leftEye, rightEye) : 40;
    if (eyeMid && nose) {
      const eyeToNoseDy = nose.y - eyeMid.y;
      isHeadExtended = eyeToNoseDy <= eyeDist * 0.28;
    } else if (nose && (leftEar || rightEar)) {
      const earY = (leftEar?.y || rightEar?.y);
      isHeadExtended = earY > nose.y - 5;
    }

    // 方式 B：微侧身时的躯干向后倾斜（若用户侧向站立后仰）
    let isTrunkArchingBack = false;
    if (shoulderMid && hipMid) {
      const trunkDx = shoulderMid.x - hipMid.x;
      // 微侧身时双肩中点向背侧移动，后仰倾角 >= 8°
      const headOffset = nose ? nose.x - shoulderMid.x : 0;
      if (Math.abs(headOffset) > torsoHeight * 0.1) {
        const isFacingLeft = headOffset < 0;
        const archDx = isFacingLeft ? trunkDx : -trunkDx;
        isTrunkArchingBack = archDx >= torsoHeight * 0.12;
      }
    }

    const isExtending = isHeadExtended || isTrunkArchingBack;

    const matched = Boolean(hasHandsOnWaist && isExtending);
    let feedback = '双手托住后腰，平缓向后仰伸 5 秒';
    if (!hasHandsOnWaist) {
      feedback = '请双手叉腰托住后腰下侧';
    } else if (!isExtending) {
      feedback = '双手托稳后腰，上身缓慢平稳向后仰伸';
    }

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 扶腰后伸中' : (!hasHandsOnWaist ? '🟡 请双手叉腰' : '🟡 请平缓后仰'),
      statusClass: matched ? 'bottom' : 'standing',
      metricName: '后伸延展',
      metricValue: matched ? '已后伸' : (!hasHandsOnWaist ? '未叉腰' : '待后仰')
    };
  }

  /**
   * 11: 站姿小燕飞 (建议侧身面向镜头，双臂向身后斜下方伸展)
   */
  evalSwallowFly(keypoints) {
    const nose = getKp(keypoints, 0);
    const leftEar = getKp(keypoints, 3);
    const rightEar = getKp(keypoints, 4);
    const leftEye = getKp(keypoints, 1);
    const rightEye = getKp(keypoints, 2);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);
    const leftElbow = getKp(keypoints, 7);
    const rightElbow = getKp(keypoints, 8);
    const leftHip = getKp(keypoints, 11);
    const rightHip = getKp(keypoints, 12);

    if (!leftShoulder && !rightShoulder) {
      return {
        matched: false,
        feedback: '请在镜头前站立就位',
        statusText: '等待入镜',
        statusClass: 'waiting',
        metricName: '小燕飞',
        metricValue: '--'
      };
    }

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const hipMid = getMidPoint(leftHip, rightHip);
    const headPt = nose || getMidPoint(leftEye, rightEye) || getMidPoint(leftEar, rightEar);

    // 1. 判断是否微侧身以及朝向 (面向左 'left' | 面向右 'right' | 正对 'front')
    let facingDir = 'front';
    const shoulderDist = (leftShoulder && rightShoulder) ? Math.abs(rightShoulder.x - leftShoulder.x) : 0;
    const torsoHeight = (shoulderMid && hipMid) ? Math.max(80, hipMid.y - shoulderMid.y) : 150;

    if (headPt && shoulderMid) {
      const headOffset = headPt.x - shoulderMid.x;
      // 头部相对双肩中线明显偏向一侧（> 10% 躯干高度），判定为侧向
      if (headOffset < -torsoHeight * 0.1) {
        facingDir = 'left';
      } else if (headOffset > torsoHeight * 0.1) {
        facingDir = 'right';
      } else if (shoulderDist < torsoHeight * 0.45) {
        // 双肩投影重叠极窄，根据耳部与鼻尖判断侧面朝向
        if (nose && (leftEar || rightEar)) {
          const earPt = leftEar || rightEar;
          facingDir = nose.x < earPt.x ? 'left' : 'right';
        }
      }
    }

    // 2. 若完全面向镜头未侧身，提示转动角度
    if (facingDir === 'front') {
      return {
        matched: false,
        feedback: '请向左或向右微侧身面对镜头，双臂向身后展开',
        statusText: '🟡 请微侧身站立',
        statusClass: 'squatting',
        metricName: '站位角度',
        metricValue: '请侧身'
      };
    }

    // 3. 侧身状态下，检测手臂是否向身后斜下方伸展 (燕飞展翅)
    // 面向左时，身后是右侧 (+x)；面向右时，身后是左侧 (-x)
    const checkArmBack = (shoulder, elbow, wrist) => {
      if (!shoulder || !wrist) return { isBack: false, angle: 0, isStraight: false };

      const dx = wrist.x - shoulder.x;
      const dy = wrist.y - shoulder.y;

      // 手腕必须在肩膀下方 (后下方)
      if (dy < 15) return { isBack: false, angle: 0, isStraight: false };

      const backDx = facingDir === 'left' ? dx : -dx;
      // 手臂背向倾斜角 (度数)
      const backAngle = Math.round(Math.atan2(backDx, dy) * (180 / Math.PI));

      // 手臂伸直度：肩-肘-腕夹角 >= 130° (避免屈肘垂手或抱胸)
      let isStraight = true;
      if (elbow) {
        const jointAngle = calcJointAngle(shoulder, elbow, wrist);
        isStraight = jointAngle >= 130;
      }

      // 后伸要求：背向夹角 >= 15° (自然垂立通常为 0° 或前倾负数)，且手臂充分伸直
      const isBack = backAngle >= 15 && isStraight;
      return { isBack, angle: backAngle, isStraight };
    };

    const leftArmCheck = checkArmBack(leftShoulder, leftElbow, leftWrist);
    const rightArmCheck = checkArmBack(rightShoulder, rightElbow, rightWrist);

    const hasArmBack = leftArmCheck.isBack || rightArmCheck.isBack;
    const maxBackAngle = Math.max(leftArmCheck.angle, rightArmCheck.angle);

    if (!hasArmBack) {
      return {
        matched: false,
        feedback: '已检测到侧身，请将双臂向身后斜下方伸直展开',
        statusText: '🟡 请双臂后伸',
        statusClass: 'squatting',
        metricName: '后伸角度',
        metricValue: maxBackAngle > 0 ? `${maxBackAngle}° (偏小)` : '未后伸'
      };
    }

    return {
      matched: true,
      feedback: '双臂后伸展开充分，挺胸微后仰，保持呼吸',
      statusText: '🟢 燕飞展开中',
      statusClass: 'bottom',
      metricName: '后伸角度',
      metricValue: `${maxBackAngle}° 达标`
    };
  }

  /**
   * 12: 交叉腿叉腰侧屈 (腰方肌拉伸)
   */
  evalSideBend(keypoints, context) {
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const leftHip = getKp(keypoints, 11);
    const rightHip = getKp(keypoints, 12);
    const leftWrist = getKp(keypoints, 9);
    const rightWrist = getKp(keypoints, 10);

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const hipMid = getMidPoint(leftHip, rightHip);
    const currentSide = context.currentSide || 1;

    let trunkAngle = 0;
    let bendDir = 'left';

    if (shoulderMid && hipMid) {
      const dx = shoulderMid.x - hipMid.x;
      const dy = Math.max(1, hipMid.y - shoulderMid.y);
      trunkAngle = Math.round(Math.atan2(Math.abs(dx), dy) * (180 / Math.PI));
      bendDir = dx < 0 ? 'left' : 'right';
    } else if (leftShoulder && rightShoulder) {
      const dx = rightShoulder.x - leftShoulder.x;
      const dy = rightShoulder.y - leftShoulder.y;
      trunkAngle = Math.round(Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI));
      bendDir = dy > 0 ? 'left' : 'right';
    }

    const isBent = trunkAngle >= 10;
    let matched = false;
    let feedback = '';

    if (currentSide === 1) {
      if (isBent) {
        matched = true;
        this.side1DetectedDir = bendDir;
        feedback = '保持侧屈，感受腋下到侧腰的强烈舒展';
      } else {
        matched = false;
        feedback = '一手叉腰，上身向侧面平稳侧屈倾斜';
      }
    } else {
      const oppositeDir = this.side1DetectedDir === 'left' ? 'right' : 'left';
      if (isBent && (!this.side1DetectedDir || bendDir === oppositeDir)) {
        matched = true;
        feedback = '换侧侧屈到位，保持平稳呼吸';
      } else {
        matched = false;
        feedback = '请换至另一侧，向对侧倾斜侧屈';
      }
    }

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 侧屈达标 · 保持中' : '🟡 请向侧面侧屈',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '侧屈倾角',
      metricValue: `${trunkAngle}°`
    };
  }

  /**
   * 13: 标准深蹲
   */
  evalSquatPose(keypoints) {
    const leftHip = getKp(keypoints, 11);
    const leftKnee = getKp(keypoints, 13);
    const leftAnkle = getKp(keypoints, 15);
    const rightHip = getKp(keypoints, 12);
    const rightKnee = getKp(keypoints, 14);
    const rightAnkle = getKp(keypoints, 16);

    let angle = null;
    if (leftHip && leftKnee && leftAnkle) {
      angle = calcJointAngle(leftHip, leftKnee, leftAnkle);
    } else if (rightHip && rightKnee && rightAnkle) {
      angle = calcJointAngle(rightHip, rightKnee, rightAnkle);
    }

    const isDown = angle !== null && angle <= 125;
    return {
      matched: isDown,
      feedback: isDown ? '深度达标！请站起' : '请平稳下蹲至大腿大致水平',
      statusText: isDown ? '🔥 深度达标' : '下蹲中',
      statusClass: isDown ? 'bottom' : 'squatting',
      metricName: '膝关节角',
      metricValue: angle !== null ? `${angle}°` : '--'
    };
  }

  /**
   * 垫上养腰：婴儿式与眼镜蛇式 (向后兼容)
   */
  evalChildCobra(keypoints, context) {
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);
    const nose = getKp(keypoints, 0);
    const currentSide = context.currentSide || 1;

    const shoulderMid = getMidPoint(leftShoulder, rightShoulder);
    const matched = Boolean(shoulderMid || nose);

    const feedback = currentSide === 1
      ? '【婴儿式】俯身跪坐额头贴地，脊柱完全放松'
      : '【眼镜蛇式】双手推地，上半身升起舒展腰腹';

    return {
      matched,
      feedback,
      statusText: matched ? '🟢 垫上放松中' : '🟡 请在垫上就位',
      statusClass: matched ? 'bottom' : 'standing',
      metricName: '姿势阶段',
      metricValue: currentSide === 1 ? '婴儿式' : '眼镜蛇式'
    };
  }

  /**
   * 兜底通用上半身在位
   */
  evalGenericPresence(keypoints) {
    const nose = getKp(keypoints, 0);
    const leftShoulder = getKp(keypoints, 5);
    const rightShoulder = getKp(keypoints, 6);

    const matched = Boolean(nose || leftShoulder || rightShoulder);
    return {
      matched,
      feedback: matched ? '保持动作规范，均匀呼吸' : '请面向摄像头就位',
      statusText: matched ? '🟢 动作进行中' : '🟡 等待就绪',
      statusClass: matched ? 'bottom' : 'squatting',
      metricName: '检测状态',
      metricValue: matched ? '正常' : '未入镜'
    };
  }
}
