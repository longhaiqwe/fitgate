// 深蹲几何角度计算与动作判定有限状态机 (Squat Finite State Machine)

export const SQUAT_STATES = Object.freeze({
  WAITING: 'WAITING',       // 画面中缺少有效下肢或置信度低
  STANDING: 'STANDING',     // 站立准备态 (膝关节 > 155°)
  SQUATTING: 'SQUATTING',   // 下蹲过程中 (105° < 角度 <= 155°)
  BOTTOM: 'BOTTOM',         // 达标触底深度 (角度 <= 105°)
  RISING: 'RISING'          // 回升站直中
});

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
    this.strictMode = options.strictMode !== false; // 默认开启严格判定
    // 站直角度阈值
    this.standingAngleThreshold = 155;
    // 触底有效深度阈值 (严格模式 100°，标准模式 105°)
    this.bottomAngleThreshold = this.strictMode ? 100 : 105;
    // 最短深蹲周期 (秒)，防止剧烈晃动镜头作弊刷分
    this.minSquatDurationSec = 0.8;

    this.reset();
  }

  reset() {
    this.count = 0;
    this.state = SQUAT_STATES.WAITING;
    this.hasReachedBottom = false;
    this.squatStartTime = 0;
    this.currentAngle = 180;
    this.activeSide = 'left';
  }

  /**
   * 传入 MoveNet 单帧 17 个关键点数组
   * keypoints: Array<{ x: number, y: number, score: number, name: string }>
   */
  update(keypoints) {
    if (!keypoints || keypoints.length < 17) {
      this.state = SQUAT_STATES.WAITING;
      return this.getResult('未检测到人体姿态');
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

    // 计算左右两侧的置信度总和，挑选更清晰的一侧
    const leftConfidence = ((leftHip?.score || 0) + (leftKnee?.score || 0) + (leftAnkle?.score || 0)) / 3;
    const rightConfidence = ((rightHip?.score || 0) + (rightKnee?.score || 0) + (rightAnkle?.score || 0)) / 3;

    const minConfidenceThreshold = 0.3;

    let hip, knee, ankle;
    if (leftConfidence >= rightConfidence && leftConfidence >= minConfidenceThreshold) {
      hip = leftHip;
      knee = leftKnee;
      ankle = leftAnkle;
      this.activeSide = 'left';
    } else if (rightConfidence >= minConfidenceThreshold) {
      hip = rightHip;
      knee = rightKnee;
      ankle = rightAnkle;
      this.activeSide = 'right';
    } else {
      this.state = SQUAT_STATES.WAITING;
      return this.getResult('请退后一步，确保画面拍到双腿和膝盖');
    }

    // 计算当前膝关节夹角
    const angle = calculateAngle(hip, knee, ankle);
    this.currentAngle = angle;
    const now = Date.now() / 1000;

    let isCountedThisFrame = false;
    let isBottomThisFrame = false;
    let feedback = '';

    switch (this.state) {
      case SQUAT_STATES.WAITING:
        if (angle >= this.standingAngleThreshold) {
          this.state = SQUAT_STATES.STANDING;
          feedback = '准备就绪，请开始下蹲';
        } else {
          feedback = '请站直身体，开始准备';
        }
        break;

      case SQUAT_STATES.STANDING:
        if (angle < this.standingAngleThreshold - 10) {
          this.state = SQUAT_STATES.SQUATTING;
          this.hasReachedBottom = false;
          this.squatStartTime = now;
          feedback = '保持平衡，继续向下蹲';
        } else {
          feedback = '站立就绪，请下蹲';
        }
        break;

      case SQUAT_STATES.SQUATTING:
        if (angle <= this.bottomAngleThreshold) {
          this.state = SQUAT_STATES.BOTTOM;
          this.hasReachedBottom = true;
          isBottomThisFrame = true;
          feedback = '深度达标！请站起';
        } else if (angle >= this.standingAngleThreshold) {
          // 未触底就提前站起（半蹲无效）
          this.state = SQUAT_STATES.STANDING;
          feedback = '下蹲幅度不足，未计次';
        } else {
          feedback = '继续下压...';
        }
        break;

      case SQUAT_STATES.BOTTOM:
        if (angle > this.bottomAngleThreshold + 10) {
          this.state = SQUAT_STATES.RISING;
          feedback = '向上发力，站直身体';
        } else {
          feedback = '深度达标！站起完成动作';
        }
        break;

      case SQUAT_STATES.RISING:
        if (angle >= this.standingAngleThreshold) {
          const duration = now - this.squatStartTime;
          if (this.hasReachedBottom && duration >= this.minSquatDurationSec) {
            this.count += 1;
            isCountedThisFrame = true;
            feedback = `太棒了！第 ${this.count} 次完成`;
          } else if (!this.hasReachedBottom) {
            feedback = '动作幅度不足，请蹲得更深一点';
          } else {
            feedback = '动作过快，请保持稳定节奏';
          }
          this.hasReachedBottom = false;
          this.state = SQUAT_STATES.STANDING;
        } else if (angle <= this.bottomAngleThreshold) {
          this.state = SQUAT_STATES.BOTTOM;
        } else {
          feedback = '继续站起...';
        }
        break;
    }

    return {
      ...this.getResult(feedback),
      isCountedThisFrame,
      isBottomThisFrame,
      activeSide: this.activeSide,
      keypointsUsed: { hip, knee, ankle }
    };
  }

  getResult(feedback) {
    return {
      state: this.state,
      count: this.count,
      targetCount: this.targetCount,
      currentAngle: this.currentAngle,
      isFinished: this.count >= this.targetCount,
      feedback
    };
  }
}
