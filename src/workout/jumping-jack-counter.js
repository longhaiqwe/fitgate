// 开合跳 (Jumping Jacks) 高精度 AI 视觉姿态识别与极速动作捕获引擎
// 基于 MoveNet 17 骨骼点，融合多关节冗余防模糊与迟滞波峰波谷状态机

export const JJ_STATES = Object.freeze({
  WAITING: 'WAITING',       // 等待身体入镜
  CLOSED: 'CLOSED',         // 站立闭合准备态 (手垂放、脚并拢)
  OPENING: 'OPENING',       // 向上跳开过程中
  OPEN: 'OPEN',             // 充分张开顶峰态 (手过肩、脚跳开)
  CLOSING: 'CLOSING'        // 回落闭合中
});

const DEFAULT_FEEDBACK = {
  [JJ_STATES.WAITING]: '请退后一步面向镜头，确保双臂与躯干完整可见',
  [JJ_STATES.CLOSED]: '站立就绪，请起跳展开双臂双腿',
  [JJ_STATES.OPENING]: '用力跳起，双臂举过头顶、双脚跳开！',
  [JJ_STATES.OPEN]: '跳开达标！迅速收拢双臂双脚',
  [JJ_STATES.CLOSING]: '双脚并拢，双臂垂放还原'
};

export class JumpingJackCounter {
  constructor(options = {}) {
    this.targetCount = options.targetCount || 15;
    // 最短单次开合全周期耗时 (毫秒)：适配高达 4~5 次/秒的极速跳跃，同时防偶发抖动刷分
    this.minRepDurationMs = options.minRepDurationMs ?? 200;
    // 丢帧容错时长 (毫秒)：剧烈跳跃或运动模糊导致短暂丢帧时保持状态不重置
    this.lossToleranceMs = 350;

    this.reset();
  }

  reset() {
    this.count = 0;
    this.state = JJ_STATES.WAITING;
    this.hasReachedOpen = false;
    this.repStartTime = 0;
    this.lastClosedTime = 0;
    this.lastCountTime = 0;
    this.lostSince = null;
    this.lastOpenRatio = 0;
    this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.WAITING];
    this.notice = '';
    this.noticeUntil = 0;
  }

  /**
   * 传入 MoveNet 单帧 17 个关键点
   * 0: nose, 5: left_shoulder, 6: right_shoulder
   * 7: left_elbow, 8: right_elbow, 9: left_wrist, 10: right_wrist
   * 11: left_hip, 12: right_hip, 13: left_knee, 14: right_knee
   * 15: left_ankle, 16: right_ankle
   */
  update(keypoints, nowMs = Date.now()) {
    if (!keypoints || keypoints.length < 17) {
      return this.handleTrackingLoss(nowMs);
    }

    const nose = keypoints[0];
    const leftShoulder = keypoints[5];
    const rightShoulder = keypoints[6];
    const leftElbow = keypoints[7];
    const rightElbow = keypoints[8];
    const leftWrist = keypoints[9];
    const rightWrist = keypoints[10];
    const leftHip = keypoints[11];
    const rightHip = keypoints[12];
    const leftKnee = keypoints[13];
    const rightKnee = keypoints[14];
    const leftAnkle = keypoints[15];
    const rightAnkle = keypoints[16];

    // 1. 基础躯干可见性检查 (以双肩为基准)
    const hasShoulders = (leftShoulder?.score >= 0.25) && (rightShoulder?.score >= 0.25);
    if (!hasShoulders) {
      return this.handleTrackingLoss(nowMs);
    }

    // 成功捕捉有效躯干，重置丢失计时
    this.lostSince = null;

    // 躯干特征尺度 (双肩间距与中点)
    const shoulderDist = Math.max(25, Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y));
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

    // 2. 上肢张开度评估 (多关节融合：手腕 + 手肘抗动态模糊)
    // 快速运动时手腕置信度易跌落，手肘可提供极强的冗余支撑
    const leftArmRaised = this.isArmRaised(leftWrist, leftElbow, shoulderMidY);
    const rightArmRaised = this.isArmRaised(rightWrist, rightElbow, shoulderMidY);
    const bothArmsRaised = leftArmRaised && rightArmRaised;
    const anyArmRaised = leftArmRaised || rightArmRaised;

    // 计算上肢开度得分 (0.0 ~ 1.0)
    let armOpenRatio = 0;
    if (bothArmsRaised) {
      armOpenRatio = 1.0;
    } else if (anyArmRaised) {
      armOpenRatio = 0.7;
    } else {
      // 评估手臂下垂程度
      const leftArmDown = this.isArmDown(leftWrist, leftElbow, shoulderMidY, leftHip, shoulderDist);
      const rightArmDown = this.isArmDown(rightWrist, rightElbow, shoulderMidY, rightHip, shoulderDist);
      if (leftArmDown && rightArmDown) {
        armOpenRatio = 0.0;
      } else {
        armOpenRatio = 0.35; // 中间过渡
      }
    }

    // 3. 下肢张开度评估 (双踝 + 双膝多尺度冗余，自适应摄像头视野局限)
    let legOpenRatio = 0.5; // 默认中立
    let hasLegData = false;

    const hasAnkles = (leftAnkle?.score >= 0.18) && (rightAnkle?.score >= 0.18);
    const hasKnees = (leftKnee?.score >= 0.20) && (rightKnee?.score >= 0.20);

    if (hasAnkles) {
      hasLegData = true;
      const ankleDist = Math.abs(rightAnkle.x - leftAnkle.x);
      const ankleRatio = ankleDist / shoulderDist;
      // 双脚并拢通常 <= 1.0，跳开通常 >= 1.25
      if (ankleRatio >= 1.25) {
        legOpenRatio = 1.0;
      } else if (ankleRatio <= 1.0) {
        legOpenRatio = 0.0;
      } else {
        legOpenRatio = (ankleRatio - 1.0) / 0.25;
      }
    } else if (hasKnees) {
      hasLegData = true;
      const kneeDist = Math.abs(rightKnee.x - leftKnee.x);
      const kneeRatio = kneeDist / shoulderDist;
      // 双膝并拢通常 <= 0.85，跳开通常 >= 1.05
      if (kneeRatio >= 1.05) {
        legOpenRatio = 1.0;
      } else if (kneeRatio <= 0.85) {
        legOpenRatio = 0.0;
      } else {
        legOpenRatio = (kneeRatio - 0.85) / 0.20;
      }
    }

    // 综合开合度 (若无下肢视野则上肢权重 100%，若有下肢则 55% 手臂 + 45% 双腿)
    let openRatio = 0;
    if (hasLegData) {
      openRatio = armOpenRatio * 0.55 + legOpenRatio * 0.45;
    } else {
      openRatio = armOpenRatio;
    }
    this.lastOpenRatio = openRatio;

    // 4. 离散判定 (迟滞区间 Hysteresis 防止边界抖动)
    // 开合跳顶峰核心标准：手臂高举过肩 (bothArmsRaised 或单侧过肩且开度足够) 且双腿跳开
    const isArmsOpen = bothArmsRaised || (anyArmRaised && armOpenRatio >= 0.7);
    const isLegsOpen = hasLegData ? (legOpenRatio >= 0.65) : true;
    const isOpen = isArmsOpen && isLegsOpen;

    // 闭合达标：手臂充分垂下且双腿并拢 (防将起跳半程误判为闭合)
    const isArmsClosed = armOpenRatio <= 0.15;
    const isLegsClosed = hasLegData ? (legOpenRatio <= 0.20) : true;
    const isClosed = (openRatio <= 0.22) || (isArmsClosed && isLegsClosed);

    let isCountedThisFrame = false;
    let isTopThisFrame = false;

    // 5. 核心有限状态机与闭环计数逻辑 (彻底修复原 CLOSING 漏计 BUG 与极速时序)
    switch (this.state) {
      case JJ_STATES.WAITING:
        if (isClosed) {
          this.state = JJ_STATES.CLOSED;
          this.lastClosedTime = nowMs;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.CLOSED];
        } else if (isOpen) {
          this.state = JJ_STATES.OPEN;
          this.hasReachedOpen = true;
          this.repStartTime = this.lastClosedTime || nowMs;
          isTopThisFrame = true;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.OPEN];
        }
        break;

      case JJ_STATES.CLOSED:
        if (isOpen) {
          // 极速起跳直接由闭合冲顶
          this.state = JJ_STATES.OPEN;
          this.hasReachedOpen = true;
          this.repStartTime = this.lastClosedTime || nowMs;
          isTopThisFrame = true;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.OPEN];
        } else if (!isClosed) {
          this.state = JJ_STATES.OPENING;
          this.repStartTime = this.lastClosedTime || nowMs;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.OPENING];
        } else {
          // 持续保持闭合，刷新最后闭合时刻
          this.lastClosedTime = nowMs;
        }
        break;

      case JJ_STATES.OPENING:
        if (isOpen) {
          this.state = JJ_STATES.OPEN;
          this.hasReachedOpen = true;
          isTopThisFrame = true;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.OPEN];
        } else if (isClosed) {
          // 未充分张开就提前合拢 (幅度不足)
          this.state = JJ_STATES.CLOSED;
          this.lastClosedTime = nowMs;
          this.hasReachedOpen = false;
          this.setNotice('起跳幅度不足，请将双臂完全举过头顶！', nowMs, 1000);
        }
        break;

      case JJ_STATES.OPEN:
        if (isClosed) {
          // 极速回落下落：直接从 OPEN 跃迁到 CLOSED
          isCountedThisFrame = this.tryTriggerCount(nowMs);
        } else if (!isOpen) {
          this.state = JJ_STATES.CLOSING;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.CLOSING];
        }
        break;

      case JJ_STATES.CLOSING:
        if (isClosed) {
          // 关键修复：从 CLOSING 正常回落落地闭合，必须触发计数！
          isCountedThisFrame = this.tryTriggerCount(nowMs);
        } else if (isOpen) {
          // 极速连续弹跳：未完全合拢便再次跳开，重新标记顶峰
          this.state = JJ_STATES.OPEN;
          this.hasReachedOpen = true;
          isTopThisFrame = true;
          this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.OPEN];
        }
        break;
    }

    return this.buildResult(isTopThisFrame, isCountedThisFrame, nowMs);
  }

  /**
   * 判定单侧手臂是否有效高举过肩 (手腕与手肘融合)
   */
  isArmRaised(wrist, elbow, shoulderMidY) {
    const hasWrist = wrist && wrist.score >= 0.18;
    const hasElbow = elbow && elbow.score >= 0.20;

    // 手腕高于肩线
    if (hasWrist && wrist.y < shoulderMidY) {
      return true;
    }
    // 手肘高于肩线 (高速甩手时手腕可能在画面外或模糊，手肘过肩即是强有力证据)
    if (hasElbow && elbow.y < shoulderMidY) {
      return true;
    }
    return false;
  }

  /**
   * 判定单侧手臂是否垂下靠拢身体
   */
  isArmDown(wrist, elbow, shoulderMidY, hip, shoulderDist) {
    const hasWrist = wrist && wrist.score >= 0.18;
    const hasElbow = elbow && elbow.score >= 0.20;

    // 手腕明显在肩线下方 (超过 0.6 倍肩宽，靠近下躯干)
    if (hasWrist && wrist.y > shoulderMidY + shoulderDist * 0.6) {
      return true;
    }
    // 若有髋部信息，手腕靠近或低于髋部
    if (hasWrist && hip && hip.score >= 0.2 && wrist.y >= hip.y - shoulderDist * 0.3) {
      return true;
    }
    // 手肘在肩线下方
    if (hasElbow && elbow.y > shoulderMidY + shoulderDist * 0.4) {
      return true;
    }
    return false;
  }

  /**
   * 结算动作完成并累加计数
   */
  tryTriggerCount(nowMs) {
    const elapsedSinceStart = this.repStartTime > 0 ? (nowMs - this.repStartTime) : (nowMs - this.lastCountTime);
    const elapsedSinceLastCount = this.lastCountTime > 0 ? (nowMs - this.lastCountTime) : 9999;

    let success = false;
    if (this.hasReachedOpen && elapsedSinceStart >= this.minRepDurationMs && elapsedSinceLastCount >= this.minRepDurationMs) {
      this.count++;
      this.lastCountTime = nowMs;
      this.lastClosedTime = nowMs;
      this.state = JJ_STATES.CLOSED;
      this.hasReachedOpen = false;
      this.setNotice(`太棒了！已完成 ${this.count} 次，保持节奏！`, nowMs, 1200);
      success = true;
    } else {
      this.state = JJ_STATES.CLOSED;
      this.lastClosedTime = nowMs;
      this.hasReachedOpen = false;
    }
    return success;
  }

  setNotice(msg, nowMs, durationMs = 1200) {
    this.notice = msg;
    this.noticeUntil = nowMs + durationMs;
  }

  handleTrackingLoss(nowMs) {
    this.lostSince ??= nowMs;
    // 在允许的丢帧时间内（如 350ms）保留状态，不直接切回 WAITING
    if (nowMs - this.lostSince < this.lossToleranceMs && this.state !== JJ_STATES.WAITING) {
      return this.buildResult(false, false, nowMs);
    }

    this.state = JJ_STATES.WAITING;
    this.hasReachedOpen = false;
    this.lastFeedback = DEFAULT_FEEDBACK[JJ_STATES.WAITING];
    return this.buildResult(false, false, nowMs);
  }

  buildResult(isTopThisFrame, isCountedThisFrame, nowMs = Date.now()) {
    const activeFeedback = (this.notice && nowMs < this.noticeUntil)
      ? this.notice
      : (DEFAULT_FEEDBACK[this.state] || this.lastFeedback);

    const openPercent = Math.min(100, Math.max(0, Math.round(this.lastOpenRatio * 100)));

    return {
      count: this.count,
      targetCount: this.targetCount,
      state: this.state,
      isOpen: this.state === JJ_STATES.OPEN,
      openRatio: this.lastOpenRatio,
      openPercent,
      isFinished: this.count >= this.targetCount,
      isTopThisFrame,
      isCountedThisFrame,
      feedback: activeFeedback
    };
  }
}
