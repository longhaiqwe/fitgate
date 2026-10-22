// 深蹲几何角度计算与动作判定有限状态机 (Squat Finite State Machine)

export const SQUAT_STATES = Object.freeze({
  WAITING: 'WAITING',       // 画面中缺少有效下肢或置信度低
  STANDING: 'STANDING',     // 站立准备态 (膝关节 > 155°)
  SQUATTING: 'SQUATTING',   // 下蹲过程中 (105° < 角度 <= 155°)
  BOTTOM: 'BOTTOM',         // 达标触底深度 (角度 <= 105°)
  RISING: 'RISING'          // 回升站直中
});

const TRACKING_FEEDBACK = '建议先侧身站直，让肩部、髋部和膝盖入镜';
const PHASE_FEEDBACK = {
  [SQUAT_STATES.WAITING]: '建议侧身对着摄像头，先站直身体',
  [SQUAT_STATES.STANDING]: '站立就绪，请下蹲',
  [SQUAT_STATES.SQUATTING]: '保持平衡，继续向下蹲',
  [SQUAT_STATES.BOTTOM]: '深度达标，请站起',
  [SQUAT_STATES.RISING]: '向上发力，站直身体'
};

/**
 * 评估单侧下肢关节点的置信度与有效性
 * 髋(Hip)和膝(Knee)为核心关节；踝(Ankle)在普通 Webcam 环境下支持自适应低阈值容错。
 */
function evaluateLeg(hip, knee, ankle) {
  if (!hip || !knee || !ankle) return { valid: false, score: 0 };
  if (!Number.isFinite(hip.x) || !Number.isFinite(hip.y) ||
      !Number.isFinite(knee.x) || !Number.isFinite(knee.y) ||
      !Number.isFinite(ankle.x) || !Number.isFinite(ankle.y)) {
    return { valid: false, score: 0 };
  }

  // 核心关节门槛：髋和膝必须具备基础可信度 (>= 0.25)
  if (!(hip.score >= 0.25) || !(knee.score >= 0.25)) return { valid: false, score: 0 };

  // 脚踝门槛：放宽至 0.15，适应居家办公桌面摄像头对下半身的低置信度
  if (!(ankle.score >= 0.15)) return { valid: false, score: 0 };

  // 肢体几何长度必须大于 0
  const thighLen = Math.hypot(hip.x - knee.x, hip.y - knee.y);
  const calfLen = Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
  if (thighLen === 0 || calfLen === 0) return { valid: false, score: 0 };

  // 加权置信度：髋 35% + 膝 45% + 踝 20%
  const score = hip.score * 0.35 + knee.score * 0.45 + ankle.score * 0.2;
  return { valid: true, score };
}

// A frontal knee can remain collinear in 2D even during a squat. Compare
// hip height relative to the knee with a standing reference, normalized by
// torso length. This needs no ankles and is invariant to image translation/scale.
function frontMeasurement(points, requiredSides) {
  const legs = [];
  for (const side of requiredSides || [0, 1]) {
    const shoulder = points[5 + side], hip = points[11 + side];
    const knee = points[13 + side];
    const visible = [shoulder, hip, knee].every(point =>
      point?.score >= 0.25 && Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!visible) {
      if (requiredSides) return null;
      continue;
    }
    const torso = Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y);
    if (torso < 10 || hip.y <= shoulder.y) {
      if (requiredSides) return null;
      continue;
    }
    legs.push({
      side,
      thigh: (knee.y - hip.y) / torso,
      shoulderHeight: (knee.y - shoulder.y) / torso
    });
  }
  if (!legs.length) return null;
  const torsoHeight = legs.length === 2 ? (points[11].y + points[12].y - points[5].y - points[6].y) / 2 : 0;
  const shoulderWidth = legs.length === 2 ? Math.abs(points[5].x - points[6].x) : 0;
  const hipWidth = legs.length === 2 ? Math.abs(points[11].x - points[12].x) : 0;
  return {
    legs,
    isFront: legs.length === 2 && shoulderWidth >= torsoHeight * 0.5 && hipWidth >= torsoHeight * 0.3,
    canCalibrate: legs.every(leg => leg.thigh >= 0.5 && leg.thigh <= 1.6)
  };
}

/**
 * 计算三点构成的平面夹角 (度数 0 ~ 180)
 * @param {{x: number, y: number}} p1 起点 (如 Hip)
 * @param {{x: number, y: number}} p2 顶点 (如 Knee)
 * @param {{x: number, y: number}} p3 终点 (如 Ankle)
 */
export function calculateAngle(p1, p2, p3) {
  if (!p1 || !p2 || !p3) return 180;

  const ux = p1.x - p2.x;
  const uy = p1.y - p2.y;
  const vx = p3.x - p2.x;
  const vy = p3.y - p2.y;

  const uMag = Math.sqrt(ux * ux + uy * uy);
  const vMag = Math.sqrt(vx * vx + vy * vy);

  if (uMag === 0 || vMag === 0) return 180;

  let cosVal = (ux * vx + uy * vy) / (uMag * vMag);
  // 防止浮点精度超出 [-1, 1]
  cosVal = Math.max(-1, Math.min(1, cosVal));

  const rad = Math.acos(cosVal);
  return Math.round((rad * 180) / Math.PI);
}

/**
 * 深蹲计数器类
 */
export class SquatCounter {
  constructor(options = {}) {
    this.targetCount = options.targetCount || 10;
    this.strictMode = Boolean(options.strictMode);
    // 站直角度阈值
    this.standingAngleThreshold = 155;
    // 触底有效深度阈值：
    // 外接摄像头挂在电脑屏幕上方俯拍时，2D 图像投影夹角比真实生理角度大 15°~20°。
    // 适中模式设为 120° (大腿蹲到大致水平即判定达标，保护膝盖且顺畅自然)；严格模式设为 110°。
    this.bottomAngleThreshold = options.bottomAngleThreshold || (this.strictMode ? 110 : 120);
    this.frontDepthThreshold = this.strictMode ? 0.65 : 0.55;
    // 最短深蹲周期 (秒)，防止剧烈晃动镜头作弊刷分
    this.minSquatDurationSec = options.minSquatDurationSec !== undefined ? options.minSquatDurationSec : 0.8;
    // 丢帧容错时长 (毫秒)：动作过程中允许短暂停顿或动态模糊，不中断动作
    this.lossToleranceMs = 1500;

    this.reset();
  }

  reset() {
    this.count = 0;
    this.state = SQUAT_STATES.WAITING;
    this.hasReachedBottom = false;
    this.squatStartTime = 0;
    this.currentAngle = null;
    this.activeSide = 'left';
    this.lostSince = null;
    this.lastFeedback = TRACKING_FEEDBACK;
    this.notice = '';
    this.noticeUntil = 0;
    this.trackingReady = false;
    this.validSince = null;
    this.frontReference = null;
    this.frontCandidate = null;
    this.currentDepth = null;
  }

  /**
   * 传入 MoveNet 单帧 17 个关键点数组
   * keypoints: Array<{ x: number, y: number, score: number, name: string }>
   */
  update(keypoints, nowMs = Date.now()) {
    if (!keypoints || keypoints.length < 15) {
      return this.handleTrackingLoss(nowMs);
    }

    // 关键点映射索引
    // 11: left_hip, 12: right_hip
    // 13: left_knee, 14: right_knee
    // 15: left_ankle, 16: right_ankle
    const leftHip = keypoints[11];
    const rightHip = keypoints[12];
    const leftKnee = keypoints[13];
    const rightKnee = keypoints[14];
    const leftAnkle = keypoints[15];
    const rightAnkle = keypoints[16];

    const leftEval = evaluateLeg(leftHip, leftKnee, leftAnkle);
    const rightEval = evaluateLeg(rightHip, rightKnee, rightAnkle);

    const frontal = frontMeasurement(keypoints, this.frontReference?.map(leg => leg.side));
    if (!leftEval.valid && !rightEval.valid && !frontal) {
      return this.handleTrackingLoss(nowMs);
    }
    // Never switch to the angle path halfway through a frontal rep: its
    // projected 180° knee would otherwise falsely report standing.
    if (this.frontReference && !frontal) return this.handleTrackingLoss(nowMs);

    // 短暂丢帧只暂停判定；持续丢失超过 400ms 后必须重新稳定识别
    if (this.lostSince !== null && nowMs - this.lostSince >= 400) {
      this.clearTracking();
    }
    this.lostSince = null;

    // 左右腿选择策略：优先保留当前侧，除非另一侧置信度明显更优 (+0.15)
    let useLeft = true;
    if (this.activeSide === 'left') {
      useLeft = leftEval.valid && (!rightEval.valid || rightEval.score <= leftEval.score + 0.15);
    } else {
      useLeft = !rightEval.valid || (leftEval.valid && leftEval.score > rightEval.score + 0.15);
    }
    if (!leftEval.valid && !rightEval.valid) useLeft = frontal.legs[0].side === 0;

    let hip, knee, ankle;
    if (useLeft) {
      hip = leftHip;
      knee = leftKnee;
      ankle = leftAnkle;
      this.activeSide = 'left';
    } else {
      hip = rightHip;
      knee = rightKnee;
      ankle = rightAnkle;
      this.activeSide = 'right';
    }

    // 计算当前膝关节夹角
    const angle = (useLeft ? leftEval.valid : rightEval.valid) ? calculateAngle(hip, knee, ankle) : null;
    const useHeight = frontal && (frontal.isFront || angle === null || this.frontReference);
    if (useHeight && !this.frontReference
      && ![SQUAT_STATES.WAITING, SQUAT_STATES.STANDING].includes(this.state)) {
      // An angle-based rep losing its ankles must establish a fresh reference;
      // do not splice a partial rep across two measurement methods.
      this.clearTracking();
    }
    if (!this.frontReference) {
      if (useHeight && frontal.canCalibrate && (angle === null || angle >= this.standingAngleThreshold)) {
        const candidate = this.frontCandidate;
        const stable = candidate && frontal.legs.length === candidate.legs.length && frontal.legs.every((leg, i) =>
          leg.side === candidate.legs[i].side && Math.abs(leg.thigh - candidate.legs[i].thigh) < 0.08
          && Math.abs(leg.shoulderHeight - candidate.legs[i].shoulderHeight) < 0.12);
        if (!stable) this.frontCandidate = { since: nowMs, legs: frontal.legs };
        else if (nowMs - candidate.since >= 300) this.frontReference = candidate.legs;
      } else this.frontCandidate = null;
    }

    // 建立跟踪就绪状态：需连续稳定追踪 300ms 滤除单帧偶发杂音
    if (!this.trackingReady) {
      this.validSince ??= nowMs;
      if (nowMs - this.validSince < 300) {
        return this.getResult(TRACKING_FEEDBACK);
      }
      this.trackingReady = true;
    }

    this.currentAngle = angle;
    if (useHeight && !this.frontReference) {
      this.state = SQUAT_STATES.WAITING;
      return this.getResult('建议先侧身站直并保持片刻，记录起始位置');
    }
    if (this.frontReference && frontal) {
      this.currentDepth = Math.max(0, Math.min(...frontal.legs.map((leg, i) => {
        const reference = this.frontReference[i];
        const hipDrop = (reference.thigh - leg.thigh) / reference.thigh;
        const shoulderDrop = (reference.shoulderHeight - leg.shoulderHeight) / reference.thigh;
        // Every calibrated hip must lower, with the upper body following it.
        return Math.min(hipDrop, shoulderDrop / 0.35);
      })));
    } else this.currentDepth = null;
    const isStanding = this.frontReference ? this.currentDepth <= 0.12 : angle >= this.standingAngleThreshold;
    const isDescending = this.frontReference ? this.currentDepth >= 0.18 : angle < this.standingAngleThreshold - 10;
    const isBottom = this.frontReference ? this.currentDepth >= this.frontDepthThreshold : angle <= this.bottomAngleThreshold;
    const isRising = this.frontReference ? this.currentDepth < this.frontDepthThreshold - 0.1 : angle > this.bottomAngleThreshold + 10;
    const now = nowMs / 1000;

    let isCountedThisFrame = false;
    let isBottomThisFrame = false;
    let feedback = '';

    switch (this.state) {
      case SQUAT_STATES.WAITING:
        if (isStanding) {
          this.state = SQUAT_STATES.STANDING;
        }
        break;

      case SQUAT_STATES.STANDING:
        if (isDescending) {
          this.state = SQUAT_STATES.SQUATTING;
          this.hasReachedBottom = false;
          this.squatStartTime = now;
        }
        break;

      case SQUAT_STATES.SQUATTING:
        if (isBottom) {
          this.state = SQUAT_STATES.BOTTOM;
          this.hasReachedBottom = true;
          isBottomThisFrame = true;
        } else if (isStanding) {
          // 未触底就提前站起（半蹲无效）
          this.state = SQUAT_STATES.STANDING;
          feedback = '下蹲幅度不足，未计次';
        }
        break;

      case SQUAT_STATES.BOTTOM:
        if (isRising) {
          this.state = SQUAT_STATES.RISING;
        }
        break;

      case SQUAT_STATES.RISING:
        if (isStanding) {
          const duration = now - this.squatStartTime;
          if (this.hasReachedBottom && duration >= this.minSquatDurationSec) {
            this.count += 1;
            isCountedThisFrame = true;
            feedback = `已完成 ${this.count} 次`;
          } else if (!this.hasReachedBottom) {
            feedback = '动作幅度不足，请蹲得更深一点';
          } else {
            feedback = '动作过快，请保持稳定节奏';
          }
          this.hasReachedBottom = false;
          this.state = SQUAT_STATES.STANDING;
        } else if (isBottom) {
          this.state = SQUAT_STATES.BOTTOM;
        }
        break;
    }

    // 完成或无效动作的提示保留 1.2 秒；下一次下蹲开始时立即恢复动作指导。
    if (feedback) {
      this.notice = feedback;
      this.noticeUntil = nowMs + 1200;
    }
    if (this.state !== SQUAT_STATES.STANDING) this.notice = '';
    feedback = this.notice && nowMs < this.noticeUntil ? this.notice : PHASE_FEEDBACK[this.state];

    return {
      ...this.getResult(feedback),
      isCountedThisFrame,
      isBottomThisFrame,
      activeSide: this.activeSide,
      keypointsUsed: { hip, knee, ankle }
    };
  }

  clearTracking() {
    this.trackingReady = false;
    this.validSince = null;
    this.state = SQUAT_STATES.WAITING;
    this.hasReachedBottom = false;
    this.squatStartTime = 0;
    this.currentAngle = null;
    this.notice = '';
    this.noticeUntil = 0;
    this.frontReference = null;
    this.frontCandidate = null;
    this.currentDepth = null;
  }

  handleTrackingLoss(nowMs) {
    this.validSince = null;
    this.frontCandidate = null;
    this.lostSince ??= nowMs;
    if (this.trackingReady && nowMs - this.lostSince < 400) {
      return this.getResult(this.lastFeedback);
    }
    this.clearTracking();
    return this.getResult(TRACKING_FEEDBACK);
  }

  getResult(feedback) {
    this.lastFeedback = feedback;
    return {
      state: this.state,
      count: this.count,
      targetCount: this.targetCount,
      currentAngle: this.currentAngle,
      measurementMode: this.frontReference ? 'front' : 'angle',
      currentDepth: this.currentDepth,
      depthThreshold: this.frontDepthThreshold,
      isFinished: this.count >= this.targetCount,
      isCountedThisFrame: false,
      isBottomThisFrame: false,
      feedback
    };
  }
}
