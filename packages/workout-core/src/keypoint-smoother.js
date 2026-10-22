/**
 * 姿态关键点防抖与防闪烁滤波器 (KeypointSmoother)
 *
 * 专门解决摄像头姿态追踪中常见的两大核心体验问题：
 * 1. 骨骼点高频微颤 (Jitter):
 *    用户端坐或保持拉伸静止时，AI 检测的坐标因图像噪点每帧发生 1~4px 的微小跳动。
 *    采用【死区过滤 (Deadband) + 自适应平滑 (Adaptive Alpha)】：
 *    - 当位移 < deadbandPx 时，锁定在上一帧坐标，100% 保持不动，彻底消灭微颤；
 *    - 当位移 >= deadbandPx 时，根据变动幅度动态跟进，中等变动平滑过渡，大变动快速跟手零延迟。
 *
 * 2. 识别点忽隐忽现、骨骼连线闪断 (Flickering / Strobe):
 *    关键点置信度 score 在临界值 (0.2) 附近波动时，造成关节点和相连骨骼线每隔 1~2 帧反复消失与重现。
 *    采用【置信度低通滤波 (Score EMA) + 迟滞门限 (Hysteresis Comparator)】：
 *    - 出现门槛 (minScoreToShow: 0.25) 与 消失门槛 (minScoreToHide: 0.15) 形成迟滞保护带；
 *    - 增加短暂丢点容错缓冲 (maxDropFrames: 4 帧，约 65ms)，单帧丢点绝不闪断。
 */
export class KeypointSmoother {
  constructor(options = {}) {
    // 欧氏距离死区阈值 (像素)：小于该阈值的位移视为传感器噪声，保持上一帧坐标不变
    this.deadbandPx = options.deadbandPx ?? 3.5;
    // 超出死区时的最小平滑系数 (慢速动作平滑插值)
    this.minAlpha = options.minAlpha ?? 0.35;
    // 超出死区时的最大平滑系数 (快速大动作瞬时跟进)
    this.maxAlpha = options.maxAlpha ?? 0.92;
    // 速度缩放基准 (用于从 minAlpha 到 maxAlpha 的平滑过渡)
    this.velocityScale = options.velocityScale ?? 25.0;
    // 置信度指数平滑滤波权重
    this.scoreAlpha = options.scoreAlpha ?? 0.75;
    // 关键点唤醒显示的置信度上限 (迟滞上限)
    this.minScoreToShow = options.minScoreToShow ?? 0.25;
    // 关键点熄灭隐藏的置信度下限 (迟滞下限)
    this.minScoreToHide = options.minScoreToHide ?? 0.15;
    // 容许短暂丢点的连续缓冲帧数 (避免单帧噪点闪烁)
    this.maxDropFrames = options.maxDropFrames ?? 4;
    // 连续空帧重置历史的阈值
    this.emptyFrameLimit = options.emptyFrameLimit ?? 10;

    this.history = new Map();
    this.consecutiveEmptyFrames = 0;
  }

  /**
   * 平滑一帧的人体 17 个关键点
   * @param {Array<{ x: number, y: number, score: number, name?: string }>} keypoints
   * @returns {Array<{ x: number, y: number, score: number, name?: string, visible?: boolean }>}
   */
  update(keypoints) {
    if (!keypoints || keypoints.length === 0) {
      this.consecutiveEmptyFrames += 1;
      if (this.consecutiveEmptyFrames >= this.emptyFrameLimit) {
        this.reset();
      }
      return keypoints;
    }

    this.consecutiveEmptyFrames = 0;

    return keypoints.map((kp, idx) => {
      if (!kp) return kp;

      const rawX = kp.x;
      const rawY = kp.y;
      const rawScore = typeof kp.score === 'number' ? kp.score : 0;

      let state = this.history.get(idx);

      if (!state) {
        const isVisible = rawScore >= this.minScoreToShow;
        state = {
          x: rawX,
          y: rawY,
          score: rawScore,
          visible: isVisible,
          dropCount: isVisible ? 0 : this.maxDropFrames
        };
        this.history.set(idx, state);
        return {
          ...kp,
          x: rawX,
          y: rawY,
          score: isVisible ? Math.max(rawScore, 0.25) : 0,
          visible: isVisible
        };
      }

      // 1. 置信度低通滤波 (EMA)
      const smoothScore = this.scoreAlpha * state.score + (1 - this.scoreAlpha) * rawScore;
      state.score = smoothScore;

      // 2. 可见性迟滞与防闪烁
      if (state.visible) {
        if (rawScore < this.minScoreToHide) {
          state.dropCount += 1;
          if (state.dropCount >= this.maxDropFrames) {
            state.visible = false;
          }
        } else {
          state.dropCount = 0;
        }
      } else {
        if (rawScore >= this.minScoreToShow && smoothScore >= this.minScoreToShow) {
          state.visible = true;
          state.dropCount = 0;
          state.x = rawX;
          state.y = rawY;
        }
      }

      if (!state.visible) {
        return {
          ...kp,
          x: state.x,
          y: state.y,
          score: 0,
          visible: false
        };
      }

      // 3. 坐标死区与自适应平滑 (Deadband & Adaptive Smoothing)
      const dx = rawX - state.x;
      const dy = rawY - state.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.deadbandPx) {
        // 小变动（微小抖动/静止保持）：完全保持上一位置不变，杜绝高频微颤
        return {
          ...kp,
          x: state.x,
          y: state.y,
          score: Math.max(smoothScore, 0.25),
          visible: true
        };
      }

      // 大变动：超过死区，自适应平滑跟进
      const excess = dist - this.deadbandPx;
      const t = Math.min(1.0, excess / this.velocityScale);
      const alpha = this.minAlpha + (this.maxAlpha - this.minAlpha) * t;

      state.x += alpha * dx;
      state.y += alpha * dy;

      return {
        ...kp,
        x: state.x,
        y: state.y,
        score: Math.max(smoothScore, 0.25),
        visible: true
      };
    });
  }

  /**
   * 重置滤波器缓存状态
   */
  reset() {
    this.history.clear();
    this.consecutiveEmptyFrames = 0;
  }
}
