// 工位拉伸伴练状态机与节拍器
// 驱动单次保持、双侧轮换换边、循环保持三种拉伸形态

export const STRETCH_STATES = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  SWITCHING_SIDE: 'SWITCHING_SIDE',
  RESTING: 'RESTING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED'
});

export class StretchRunner {
  constructor(options = {}) {
    this.maxIntervalSeconds = options.maxIntervalSeconds ?? 1;
    this.type = options.type || 'hold'; // 'hold' | 'bilateral' | 'rep_hold'
    this.durationSeconds = Math.max(5, options.durationSeconds || 30);
    this.perSideSeconds = Math.max(5, options.perSideSeconds || 30);
    this.totalReps = Math.max(1, options.reps || 8);
    this.repSeconds = Math.max(0.1, options.repSeconds || 5);
    this.restSeconds = Math.max(0.1, options.restSeconds || 2);
    this.activePhaseName = options.activePhaseName || '后伸保持';
    this.restPhaseName = options.restPhaseName || '平缓还原放松';

    this.onTick = options.onTick || null;
    this.onSideSwitch = options.onSideSwitch || null;
    this.onRepCompleted = options.onRepCompleted || null;
    this.onRepHalfway = options.onRepHalfway || null;
    this.onFinished = options.onFinished || null;

    this.state = STRETCH_STATES.IDLE;
    this.isFinished = false;
    this.timerId = null;

    this.initMetrics();
  }

  initMetrics() {
    this.elapsedSeconds = 0;
    this.currentSide = 1;
    this.totalSides = this.type === 'bilateral' ? 2 : 1;
    this.currentRep = 1;
    this.completedReps = 0;
    this.repElapsed = 0;
    this.isRestingInRep = false;
    this.halfwayTriggeredReps = new Set();

    if (this.type === 'hold') {
      this.totalSeconds = this.durationSeconds;
    } else if (this.type === 'bilateral') {
      this.totalSeconds = this.perSideSeconds * 2;
    } else if (this.type === 'rep_hold') {
      this.totalSeconds = (this.repSeconds + this.restSeconds) * this.totalReps;
    } else {
      this.totalSeconds = 30;
    }

    this.remainingSeconds = this.totalSeconds;
  }

  start() {
    if (this.state === STRETCH_STATES.RUNNING) return;
    this.state = STRETCH_STATES.RUNNING;
    this.lastTimestamp = performance.now();
    this.startInterval();
    this.notifyTick();
  }

  startInterval() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      const now = performance.now();
      const delta = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      // A suspended process is not an exercise hold.
      this.tick(delta <= this.maxIntervalSeconds ? delta : 0);
    }, 100);
  }

  pause() {
    if (this.state !== STRETCH_STATES.RUNNING) return;
    this.state = STRETCH_STATES.PAUSED;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  resume() {
    if (this.state !== STRETCH_STATES.PAUSED) return;
    this.state = STRETCH_STATES.RUNNING;
    this.lastTimestamp = performance.now();
    this.startInterval();
  }

  reset() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.state = STRETCH_STATES.IDLE;
    this.isFinished = false;
    this.initMetrics();
    this.notifyTick();
  }

  /**
   * 时间步进处理
   * @param {number} deltaSeconds 步进秒数
   */
  tick(deltaSeconds) {
    if (this.isFinished || (this.state !== STRETCH_STATES.RUNNING && this.state !== STRETCH_STATES.IDLE)) {
      return;
    }

    if (this.state === STRETCH_STATES.IDLE) {
      this.state = STRETCH_STATES.RUNNING;
    }

    this.elapsedSeconds = Math.min(this.totalSeconds, this.elapsedSeconds + deltaSeconds);
    this.remainingSeconds = Math.max(0, this.totalSeconds - this.elapsedSeconds);

    if (this.type === 'hold') {
      if (this.elapsedSeconds >= this.totalSeconds) {
        this.finish();
      }
    } else if (this.type === 'bilateral') {
      const side1Threshold = this.perSideSeconds;
      if (this.currentSide === 1 && this.elapsedSeconds >= side1Threshold) {
        this.currentSide = 2;
        if (typeof this.onSideSwitch === 'function') {
          this.onSideSwitch(2);
        }
      }
      if (this.elapsedSeconds >= this.totalSeconds) {
        this.finish();
      }
    } else if (this.type === 'rep_hold') {
      const singleRepDuration = this.repSeconds + this.restSeconds;
      const newCompletedReps = Math.floor(this.elapsedSeconds / singleRepDuration);
      const currentRepIndex = Math.min(this.totalReps, newCompletedReps + 1);
      const inRepTime = this.elapsedSeconds % singleRepDuration;

      // 确保到达半程的 rep 均触发一次半程回调
      const maxHalfwayTarget = (inRepTime >= this.repSeconds) ? currentRepIndex : newCompletedReps;
      for (let r = 1; r <= Math.min(this.totalReps, maxHalfwayTarget); r++) {
        if (!this.halfwayTriggeredReps.has(r)) {
          this.halfwayTriggeredReps.add(r);
          if (typeof this.onRepHalfway === 'function') {
            this.onRepHalfway(r);
          }
        }
      }

      if (newCompletedReps > this.completedReps) {
        const targetCompleted = Math.min(this.totalReps, newCompletedReps);
        for (let r = this.completedReps + 1; r <= targetCompleted; r++) {
          if (typeof this.onRepCompleted === 'function') {
            this.onRepCompleted(r);
          }
        }
        this.completedReps = targetCompleted;
        this.currentRep = Math.min(this.totalReps, this.completedReps + 1);
      }

      if (this.elapsedSeconds >= this.totalSeconds) {
        if (this.completedReps < this.totalReps && typeof this.onRepCompleted === 'function') {
          for (let r = this.completedReps + 1; r <= this.totalReps; r++) {
            this.onRepCompleted(r);
          }
          this.completedReps = this.totalReps;
        }
        this.currentRep = this.totalReps;
        this.finish();
      }
    }

    this.notifyTick();
  }

  finish() {
    this.isFinished = true;
    this.state = STRETCH_STATES.COMPLETED;
    this.remainingSeconds = 0;
    this.elapsedSeconds = this.totalSeconds;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (typeof this.onFinished === 'function') {
      this.onFinished();
    }
  }

  notifyTick() {
    if (typeof this.onTick !== 'function') return;

    let currentPhaseText = '拉伸保持中';
    let progressInPhase = 0;
    let inRepPhase = 'active';
    let inRepRemaining = 0;

    if (this.type === 'hold') {
      progressInPhase = Math.min(1, this.elapsedSeconds / this.durationSeconds);
      currentPhaseText = `静止舒展保持中 (${Math.ceil(this.remainingSeconds)}s)`;
    } else if (this.type === 'bilateral') {
      if (this.currentSide === 1) {
        const sideRem = Math.max(0, this.perSideSeconds - this.elapsedSeconds);
        progressInPhase = this.elapsedSeconds / this.perSideSeconds;
        currentPhaseText = `第一侧拉伸 (${Math.ceil(sideRem)}s)`;
      } else {
        const side2Elapsed = this.elapsedSeconds - this.perSideSeconds;
        const sideRem = Math.max(0, this.perSideSeconds - side2Elapsed);
        progressInPhase = side2Elapsed / this.perSideSeconds;
        currentPhaseText = `换边：第二侧拉伸 (${Math.ceil(sideRem)}s)`;
      }
    } else if (this.type === 'rep_hold') {
      const singleRepDuration = this.repSeconds + this.restSeconds;
      const inRepTime = this.elapsedSeconds % singleRepDuration;
      if (inRepTime < this.repSeconds) {
        inRepPhase = 'active';
        inRepRemaining = Math.max(0, this.repSeconds - inRepTime);
        currentPhaseText = `第 ${this.currentRep}/${this.totalReps} 次：${this.activePhaseName} (${Math.ceil(inRepRemaining)}s)`;
      } else {
        inRepPhase = 'rest';
        inRepRemaining = Math.max(0, singleRepDuration - inRepTime);
        currentPhaseText = `第 ${this.currentRep}/${this.totalReps} 次：${this.restPhaseName} (${Math.ceil(inRepRemaining)}s)`;
      }
      progressInPhase = this.elapsedSeconds / this.totalSeconds;
    }

    this.onTick({
      state: this.state,
      isFinished: this.isFinished,
      elapsed: Math.round(this.elapsedSeconds),
      remaining: Math.ceil(this.remainingSeconds),
      total: this.totalSeconds,
      percent: Math.min(100, Math.round((this.elapsedSeconds / this.totalSeconds) * 100)),
      currentSide: this.currentSide,
      totalSides: this.totalSides,
      currentRep: this.currentRep,
      completedReps: this.completedReps,
      totalReps: this.totalReps,
      inRepPhase,
      inRepRemaining,
      phaseText: currentPhaseText
    });
  }
}
