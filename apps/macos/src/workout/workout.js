import { isFreshStandingFrame } from '../shared/standing-pose.js';
import '../shared/desktop-bridge.js';
// FitGate 伴练工坊业务交互与多模式执行中枢 (全动作摄像头AI判定 + 无摄像头纯计时伴练自适应)
import { initPoseDetector, detectPose } from './detector.js';
import { SquatCounter, SQUAT_STATES } from './squat-counter.js';
import { JumpingJackCounter, JJ_STATES } from './jumping-jack-counter.js';
import { StretchRunner, STRETCH_STATES } from './stretch-runner.js';
import { ActionPoseEvaluator } from './pose-evaluator.js';
import { KeypointSmoother } from './keypoint-smoother.js';
import {
  playSquatBottomBeep,
  playCountSuccessSound,
  playVictorySound,
  playSwitchSideSound,
  playTickSound
} from '../shared/audio.js';
import { getSettings, saveSettings, getCurrentWorkoutAction, getCurrentWorkoutQueue } from '../shared/storage.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { SCENARIOS, ACTIONS, getActionById } from '../shared/actions-data.js';

// DOM 元素引用
const headerBrandIcon = document.getElementById('header-brand-icon');
const headerTargetBadge = document.getElementById('header-target-badge');
const queueProgressBadge = document.getElementById('queue-progress-badge');
const actionSelector = document.getElementById('action-selector');
const modeSelector = document.getElementById('mode-selector');
const privacyBadgeText = document.getElementById('privacy-badge-text');
const desktopCloseWorkout = document.getElementById('desktop-close-workout');
if (new URLSearchParams(window.location.search).get('blocked') === '1') {
  desktopCloseWorkout.textContent = '返回休息提醒';
}
desktopCloseWorkout.onclick = () => window.close();

// 舞台元素
const cameraStage = document.getElementById('camera-stage');
const timerStage = document.getElementById('timer-stage');
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('pose-canvas');
const ctx = canvasEl ? canvasEl.getContext('2d') : null;
const loadingMask = document.getElementById('loading-mask');
const loadingSpinner = document.getElementById('loading-spinner');
const loadingText = document.getElementById('loading-text');
const loadingFallbackActions = document.getElementById('loading-fallback-actions');
const btnFallbackTimer = document.getElementById('btn-fallback-timer');
const statusPill = document.getElementById('status-pill');
const fpsCounter = document.getElementById('fps-counter');

// 悬浮示范卡与无摄像头示范舞台元素
const guidePipBox = document.getElementById('guide-pip-box');
const guidePipImg = document.getElementById('guide-pip-img');
const guidePipTag = document.getElementById('guide-pip-tag');
const timerGuideImg = document.getElementById('timer-guide-img');
const timerImgBadge = document.getElementById('timer-img-badge');

const btnToggleTimer = document.getElementById('btn-toggle-timer');
const btnTimerIcon = document.getElementById('btn-timer-icon');
const btnTimerText = document.getElementById('btn-timer-text');
const btnResetTimer = document.getElementById('btn-reset-timer');
const btnManualCount = document.getElementById('btn-manual-count');

// 教学引导卡片元素
const actionTitleEl = document.getElementById('action-title');
const actionTargetAreaEl = document.getElementById('action-target-area');
const actionStepsListEl = document.getElementById('action-steps-list');
const actionCheckStopEl = document.getElementById('action-check-stop');

// 仪表盘数据元素
const squatMetricsPanel = document.getElementById('squat-metrics-panel');
const counterMetricLabel = document.getElementById('counter-metric-label');
const counterParamLabel = document.getElementById('counter-param-label');
const counterThresholdLabel = document.getElementById('counter-threshold-label');
const squatCurrentCountEl = document.getElementById('squat-current-count');
const squatTargetCountEl = document.getElementById('squat-target-count');
const squatProgressBar = document.getElementById('squat-progress-bar');
const currentAngleEl = document.getElementById('current-angle-text');
const thresholdAngleEl = document.getElementById('threshold-angle-text');

const stretchMetricsPanel = document.getElementById('stretch-metrics-panel');
const stretchStatusLabel = document.getElementById('stretch-status-label');
const stretchRemainingSecEl = document.getElementById('stretch-remaining-sec');
const stretchTotalSecEl = document.getElementById('stretch-total-sec');
const stretchProgressBar = document.getElementById('stretch-progress-bar');
const stretchPhaseTag = document.getElementById('stretch-phase-tag');
const stretchPhaseHint = document.getElementById('stretch-phase-hint');

const feedbackBubble = document.querySelector('.feedback-bubble');
const feedbackTextEl = document.getElementById('feedback-text');

const victoryModal = document.getElementById('victory-modal');
const victoryTitleEl = document.getElementById('victory-title');
const victoryDescEl = document.getElementById('victory-desc');

// 运行态管理
let currentSettings = null;
let currentAction = null;
let workoutQueue = [];
let currentQueueIndex = 0;
let isTransitioning = false;
let finishedActionIds = [];
let isCameraMode = true; // 摄像头判定模式 vs 纯计时模式
let squatCounter = null;
let jumpingJackCounter = null;
let stretchRunner = null;
let actionPoseEvaluator = new ActionPoseEvaluator();
let keypointSmoother = new KeypointSmoother();
let isDetectionRunning = false;
let isCompleted = false;
let cameraStream = null;
let frameCount = 0;
let lastFpsUpdate = performance.now();
let lastFrameTimestamp = performance.now();
let lastStandingVideoTime = -1;
let animFrameId = null;

/**
 * 更新顶部队列进度指示徽章
 */
function updateQueueProgressUI() {
  if (!queueProgressBadge) return;
  if (!workoutQueue || workoutQueue.length <= 1) {
    queueProgressBadge.style.display = 'none';
  } else {
    queueProgressBadge.style.display = 'inline-flex';
    queueProgressBadge.textContent = `动作 ${currentQueueIndex + 1} / ${workoutQueue.length}`;
  }
}


// 人体 17 个关键点骨骼连接对 (MoveNet)
const SKELETON_PAIRS = [
  [0, 1], [0, 2],     // 鼻子到左右眼
  [1, 3], [2, 4],     // 左右眼到左右耳
  [5, 6],             // 双肩
  [5, 7], [7, 9],     // 左臂
  [6, 8], [8, 10],    // 右臂
  [5, 11], [6, 12],   // 躯干两侧
  [11, 12],           // 骨盆
  [11, 13], [13, 15], // 左腿 (髋-膝-踝)
  [12, 14], [14, 16]  // 右腿 (髋-膝-踝)
];

/**
 * 填充头部动作切换下拉选项
 */
function populateActionSelector() {
  actionSelector.innerHTML = '';
  ACTIONS.forEach((act) => {
    const opt = document.createElement('option');
    opt.value = act.id;
    const scenarioName = SCENARIOS[act.scenario]?.name || '';
    opt.textContent = `${act.name} (${scenarioName})`;
    actionSelector.appendChild(opt);
  });
}

/**
 * 更新右侧教学指引卡片
 */
function renderActionGuideCard(action) {
  const scenarioMeta = SCENARIOS[action.scenario] || SCENARIOS.office_seated;

  actionTitleEl.textContent = action.name;
  headerBrandIcon.textContent = scenarioMeta.icon || '🏋️‍♂️';

  actionTargetAreaEl.textContent = action.targetArea;
  document.getElementById('camera-position-guide').classList.toggle('hidden', !isCameraMode);
  document.getElementById('camera-position-direction').textContent = action.cameraGuide?.direction || '';
  document.getElementById('camera-position-framing').textContent = action.cameraGuide?.framing || '';

  // 渲染分步指南
  actionStepsListEl.innerHTML = '';
  if (Array.isArray(action.steps)) {
    action.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      actionStepsListEl.appendChild(li);
    });
  }

  actionCheckStopEl.textContent = action.checkAndStop;
}

/**
 * 切换并加载指定动作
 */
async function loadAction(actionId) {
  if (desktopSuspended) return;
  const action = getActionById(actionId);
  if (!action) return;
  currentAction = action;
  actionSelector.value = action.id;

  renderActionGuideCard(action);
  actionPoseEvaluator.reset();
  keypointSmoother.reset();

  // 停止先前的运行态
  stopCameraLoop();
  if (stretchRunner) {
    stretchRunner.reset();
  }

  // 根据当前动作类型显隐对应的右侧数据面板
  if (action.type === 'pose_counter') {
    stretchMetricsPanel.classList.add('hidden');
    squatMetricsPanel.classList.remove('hidden');

    if (action.id === 'home_jumping_jacks') {
      const target = action.targetReps || 15;
      headerTargetBadge.textContent = isCameraMode
        ? `目标：开合跳 ${target} 次 (AI 全身开合计数)`
        : `目标：开合跳 ${target} 次 (节拍倒计时伴练)`;

      jumpingJackCounter = new JumpingJackCounter({
        targetCount: target
      });

      if (counterMetricLabel) counterMetricLabel.textContent = '已完成开合跳次数';
      if (isCameraMode) {
        if (counterParamLabel) counterParamLabel.textContent = '开合跳姿态';
        if (counterThresholdLabel) counterThresholdLabel.textContent = '有效张开标准';
        if (thresholdAngleEl) thresholdAngleEl.textContent = '手过肩 · 腿跳开';
        currentAngleEl.textContent = '准备就绪';
      }

      squatCurrentCountEl.textContent = '0';
      squatTargetCountEl.textContent = `/ ${target}`;
      squatProgressBar.style.width = '0%';

      if (!isCameraMode) {
        initPoseCounterTimer(action, target);
      }
    } else {
      const target = currentSettings.squatTarget || 10;
      const strictMode = Boolean(currentSettings.strictMode);
      headerTargetBadge.textContent = isCameraMode
        ? `目标：深蹲 ${target} 次 (${strictMode ? '严格' : '适中'})`
        : `目标：深蹲 ${target} 次 (节拍倒计时伴练)`;

      squatCounter = new SquatCounter({
        targetCount: target,
        strictMode
      });

      if (counterMetricLabel) counterMetricLabel.textContent = '已完成深蹲次数';
      if (isCameraMode) {
        if (counterParamLabel) counterParamLabel.textContent = '膝关节夹角';
        if (counterThresholdLabel) counterThresholdLabel.textContent = '达标有效深度';
        if (thresholdAngleEl) {
          thresholdAngleEl.textContent = `≤ ${squatCounter.bottomAngleThreshold}°`;
        }
        currentAngleEl.textContent = '--';
      }

      squatCurrentCountEl.textContent = '0';
      squatTargetCountEl.textContent = `/ ${target}`;
      squatProgressBar.style.width = '0%';

      if (!isCameraMode) {
        initPoseCounterTimer(action, target);
      }
    }
  } else {
    squatMetricsPanel.classList.add('hidden');
    stretchMetricsPanel.classList.remove('hidden');

    const stretchSec = action.fixedDurationSeconds || currentSettings.stretchSeconds || 30;
    headerTargetBadge.textContent = action.type === 'bilateral'
      ? `目标：${stretchSec}秒 × 2侧 (${SCENARIOS[action.scenario]?.name || '工位'})`
      : action.type === 'rep_hold'
        ? `目标：${action.reps || 8}次循环 (${SCENARIOS[action.scenario]?.name || '工位'})`
        : `目标：${stretchSec}秒保持 (${SCENARIOS[action.scenario]?.name || '工位'})`;

    initStretchRunner(action, stretchSec);
  }

  // 根据是否开启摄像头分流舞台
  if (isCameraMode) {
    await setupCameraStage(action);
  } else {
    setupTimerStage(action);
  }
}

/**
 * 初始化无摄像头模式下的计数型动作节拍器 (深蹲 / 开合跳)
 */
function initPoseCounterTimer(action, target) {
  const isJumpingJack = action.id === 'home_jumping_jacks';
  const repSeconds = isJumpingJack ? 0.8 : 2.0;
  const restSeconds = isJumpingJack ? 0.7 : 1.5;
  const activePhaseName = isJumpingJack ? '跳起张开' : '下蹲蓄力';
  const restPhaseName = isJumpingJack ? '并拢还原' : '蹬地起立';

  stretchRunner = new StretchRunner({
    type: 'rep_hold',
    reps: target,
    repSeconds,
    restSeconds,
    activePhaseName,
    restPhaseName,
    onRepHalfway: () => {
      playSquatBottomBeep();
    },
    onRepCompleted: (repNum) => {
      playCountSuccessSound();
      squatCurrentCountEl.textContent = repNum;
      squatCurrentCountEl.classList.add('bump');
      setTimeout(() => squatCurrentCountEl.classList.remove('bump'), 300);

      const percent = Math.min(100, Math.round((repNum / target) * 100));
      squatProgressBar.style.width = `${percent}%`;

      feedbackTextEl.textContent = isJumpingJack
        ? `已完成第 ${repNum}/${target} 次，跟随节拍继续`
        : `已完成第 ${repNum}/${target} 次，起立站稳`;
    },
    onTick: (data) => {
      if (counterParamLabel) counterParamLabel.textContent = '当前节拍';
      if (counterThresholdLabel) counterThresholdLabel.textContent = '动作节奏';
      if (thresholdAngleEl) thresholdAngleEl.textContent = isJumpingJack ? '1.5秒/次' : '3.5秒/次';

      const remSec = (data.inRepRemaining || 0).toFixed(1);
      if (data.inRepPhase === 'active') {
        currentAngleEl.textContent = `${activePhaseName} (${remSec}s)`;
        currentAngleEl.classList.remove('reached');
        statusPill.textContent = isJumpingJack ? '🟡 向上跳开...' : '🟡 下蹲中...';
        statusPill.className = 'status-pill squatting';
      } else {
        currentAngleEl.textContent = `${restPhaseName} (${remSec}s)`;
        currentAngleEl.classList.add('reached');
        statusPill.textContent = isJumpingJack ? '⬆️ 并拢还原...' : '⬆️ 起立还原...';
        statusPill.className = 'status-pill standing';
      }
    },
    onFinished: () => {
      if (!isCompleted) {
        handleActionFinished(action);
      }
    }
  });

  // 初始界面渲染
  squatCurrentCountEl.textContent = '0';
  squatTargetCountEl.textContent = `/ ${target}`;
  squatProgressBar.style.width = '0%';
  if (counterParamLabel) counterParamLabel.textContent = '当前节拍';
  if (counterThresholdLabel) counterThresholdLabel.textContent = '动作节奏';
  if (thresholdAngleEl) thresholdAngleEl.textContent = isJumpingJack ? '1.5秒/次' : '3.5秒/次';
  currentAngleEl.textContent = `${activePhaseName} (${repSeconds.toFixed(1)}s)`;
  statusPill.textContent = '🟢 节拍准备就绪';
  statusPill.className = 'status-pill standing';
}

let lastStretchTickBeepSec = -1;

/**
 * 初始化拉伸节拍器
 */
function initStretchRunner(action, stretchSec) {
  lastStretchTickBeepSec = -1;
  stretchRunner = new StretchRunner({
    type: action.type,
    durationSeconds: stretchSec,
    perSideSeconds: stretchSec,
    reps: action.reps || 8,
    repSeconds: action.repSeconds || 5,
    restSeconds: action.restSeconds || 2,
    onTick: handleStretchTick,
    onSideSwitch: (newSide) => {
      playSwitchSideSound();
      actionPoseEvaluator.reset();
      stretchPhaseTag.textContent = `第 ${newSide}/2 侧 · 请换边保持`;
      feedbackTextEl.textContent = '请换另一侧，保持均匀呼吸与双肩下沉';
    },
    onRepCompleted: (repNum) => {
      playCountSuccessSound();
      feedbackTextEl.textContent = `已完成第 ${repNum} 次，缓慢平稳还原`;
    },
    onFinished: () => {
      if (!isCompleted) {
        handleActionFinished(action);
      }
    }
  });

  // 更新初始时间与进度条
  handleStretchTick({
    remaining: stretchRunner.remainingSeconds,
    total: stretchRunner.totalSeconds,
    percent: 0,
    phaseText: action.type === 'bilateral' ? '第 1/2 侧 · 开始保持' : '动作开始 · 保持姿态'
  });
}

function handleStretchTick(data) {
  stretchRemainingSecEl.textContent = data.remaining;
  stretchTotalSecEl.textContent = `/ ${data.total}s`;
  stretchProgressBar.style.width = `${data.percent}%`;
  stretchPhaseTag.textContent = data.phaseText;

  if (currentAction && currentAction.tips) {
    stretchPhaseHint.textContent = currentAction.tips;
  }

  // 重置防重标记：当剩余时间大于 3 秒时，允许下一次倒计时重新触发
  if (data.remaining > 3) {
    lastStretchTickBeepSec = -1;
  }

  // 动作快结束时的 3、2、1 倒计时提示音（精准按整秒去重，每秒仅响一次清脆水滴音）
  if (data.remaining <= 3 && data.remaining > 0 && lastStretchTickBeepSec !== data.remaining) {
    lastStretchTickBeepSec = data.remaining;
    playTickSound(data.remaining);
  }
}

// ==================== 模式 A：摄像头 AI 视觉判定 ====================

async function setupCameraStage(action) {
  const generation = ++cameraGeneration;
  // 显隐舞台
  timerStage.classList.add('hidden');
  cameraStage.classList.remove('hidden');

  // 配置悬浮示范插画卡
  if (action.image) {
    guidePipImg.src = chrome.runtime.getURL(action.image);
    guidePipTag.textContent = '标准示范';
    guidePipBox.classList.remove('hidden');
  } else {
    guidePipBox.classList.add('hidden');
  }

  privacyBadgeText.textContent = '本地姿态检测 · 视频不上传';

  try {
    loadingMask.classList.remove('hidden');
    loadingFallbackActions.classList.add('hidden');
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    loadingText.textContent = '正在启动摄像头与 AI 姿态检测引擎...';

    // 如果视频流已就绪则复用，否则获取
    if (!cameraStream) {
      const cameraPromise = navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      }).then(stream => {
        if (generation !== cameraGeneration || desktopSuspended || !isCameraMode) {
          stream.getTracks().forEach(track => track.stop());
          return null;
        }
        cameraStream = stream;
        return stream;
      });
      const detectorPromise = initPoseDetector((msg) => {
        loadingText.textContent = msg;
      });

      const [stream] = await Promise.all([cameraPromise, detectorPromise]);
      if (!stream || generation !== cameraGeneration || desktopSuspended) return;
      cameraStream = stream;
      videoEl.srcObject = stream;

      await new Promise((resolve) => {
        if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          videoEl.play().catch(() => {});
          resolve();
          return;
        }
        videoEl.onloadedmetadata = () => {
          videoEl.play().catch(() => {});
          resolve();
        };
      });
    }

    await initPoseDetector();
    if (generation !== cameraGeneration || desktopSuspended || !isCameraMode) return;
    canvasEl.width = videoEl.videoWidth || 1280;
    canvasEl.height = videoEl.videoHeight || 720;

    loadingMask.classList.add('hidden');
    isDetectionRunning = true;
    lastFpsUpdate = performance.now();
    lastFrameTimestamp = performance.now();
    frameCount = 0;
    animFrameId = requestAnimationFrame(renderPoseLoop);

  } catch (err) {
    if (generation !== cameraGeneration || desktopSuspended || !isCameraMode) return;
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    console.error('[FitGate] 启动摄像头检测失败:', err);
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    loadingFallbackActions.classList.remove('hidden');

    const isDenied = err.name === 'NotAllowedError';
    const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError';

    loadingText.innerHTML = `
      <span style="color: #ff3b30; font-size: 15px; font-weight: 600;">⚠️ 无法开启摄像头</span>
      <p style="font-size: 12.5px; margin-top: 6px; color: #64748b; line-height: 1.5; max-width: 320px;">
        ${isDenied ? '摄像头尚未获授权，请在系统设置中允许 FitGate 使用摄像头；也可直接切换为无摄像头模式。' : isNotFound ? '未检测到可用摄像头设备，可一键切换为无摄像头纯计时伴练。' : err.message}
      </p>
    `;
  }
}

function stopCameraLoop() {
  cameraGeneration++;
  lastStandingVideoTime = -1;
  isDetectionRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  keypointSmoother.reset();
}

/**
 * 摄像头全动作主检测循环
 */
async function renderPoseLoop(timestamp) {
  if (!isDetectionRunning) return;

  frameCount++;
  if (timestamp - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
    fpsCounter.textContent = `FPS: ${fps}`;
    frameCount = 0;
    lastFpsUpdate = timestamp;
  }

  const deltaSeconds = Math.min(0.2, (timestamp - lastFrameTimestamp) / 1000);
  lastFrameTimestamp = timestamp;

  // 严格确保画布内部像素物理分辨率与视频内在分辨率完全 1:1 同步
  if (videoEl.videoWidth > 0 && (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight)) {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  }

  try {
    const generation = cameraGeneration;
    const pose = await detectPose(videoEl);
    if (generation !== cameraGeneration || !isDetectionRunning || desktopSuspended) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // 关键点防抖与防闪烁滤波 (小幅度变动/静止彻底冻结坐标，大幅度变动敏捷平滑跟进)
    const smoothedKeypoints = pose?.keypoints ? keypointSmoother.update(pose.keypoints) : null;

    if (currentAction.type === 'pose_counter') {
      if (currentAction.id === 'home_jumping_jacks') {
        // 1-A. 开合跳 AI 动作判定 (JumpingJackCounter FSM)
        if (smoothedKeypoints) {
          drawSkeleton(smoothedKeypoints, jumpingJackCounter.state === JJ_STATES.OPEN);
          const result = jumpingJackCounter.update(smoothedKeypoints);
          updateJumpingJackUI(result);

          if (result.isTopThisFrame) {
            playSquatBottomBeep();
          }
          if (result.isCountedThisFrame) {
            playCountSuccessSound();
          }
          if (result.isFinished && !isCompleted) {
            handleActionFinished(currentAction);
          }
        } else {
          updateJumpingJackUI(jumpingJackCounter.update(null));
        }
      } else {
        // 1-B. 标准深蹲动作判定 (SquatCounter FSM)
        if (smoothedKeypoints) {
          drawSkeleton(smoothedKeypoints, squatCounter.state === SQUAT_STATES.BOTTOM);
          const result = squatCounter.update(smoothedKeypoints);
          updateSquatUI(result);

          if (result.isBottomThisFrame) {
            playSquatBottomBeep();
          }
          if (result.isCountedThisFrame) {
            playCountSuccessSound();
          }
          if (result.isFinished && !isCompleted) {
            handleActionFinished(currentAction);
          }
        } else {
          updateSquatUI(squatCounter.update(null));
        }
      }
    } else {
      // 2. 工位拉伸与姿态保持动作判定 (ActionPoseEvaluator)
      const context = {
        currentSide: stretchRunner ? stretchRunner.currentSide : 1,
        currentRep: stretchRunner ? stretchRunner.currentRep : 1
      };

      const standingFrame = isFreshStandingFrame(videoEl, cameraStream, lastStandingVideoTime);
      lastStandingVideoTime = videoEl.currentTime;
      const evalRes = actionPoseEvaluator.evaluate(currentAction.id, currentAction.id === 'standing_five_minutes' ? (standingFrame ? pose?.keypoints : null) : smoothedKeypoints, context);

      if (smoothedKeypoints) {
        drawSkeleton(smoothedKeypoints, evalRes.matched);
      }

      // 更新状态药丸
      statusPill.textContent = evalRes.statusText;
      statusPill.className = `status-pill ${evalRes.statusClass}`;

      // 实时指导文案
      if (evalRes.feedback && feedbackTextEl.textContent !== evalRes.feedback) {
        feedbackTextEl.textContent = evalRes.feedback;
      }

      // 核心判定：仅当姿态达标时推进倒计时节拍！
      if (evalRes.matched && stretchRunner && !stretchRunner.isFinished) {
        stretchRunner.tick(deltaSeconds);
      }
    }
  } catch (error) {
    console.error('[FitGate] 姿态推理帧异常:', error);
  }

  if (isDetectionRunning) {
    animFrameId = requestAnimationFrame(renderPoseLoop);
  }
}

/**
 * 绘制人体 17 骨骼连线与关节点
 */
function drawSkeleton(keypoints, isMatched = false) {
  if (!keypoints || keypoints.length === 0) return;

  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  const defaultLineColor = 'rgba(10, 132, 255, 0.65)';
  const matchedLineColor = 'rgba(52, 199, 89, 0.95)';
  const activeColor = isMatched ? matchedLineColor : defaultLineColor;

  for (const [i, j] of SKELETON_PAIRS) {
    const p1 = keypoints[i];
    const p2 = keypoints[j];
    if (p1 && p2 && p1.score > 0.2 && p2.score > 0.2 && p1.visible !== false && p2.visible !== false) {
      ctx.beginPath();
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = isMatched ? 6 : 4;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  for (const kp of keypoints) {
    if (kp && kp.score > 0.2 && kp.visible !== false) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, isMatched ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = isMatched ? '#34c759' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isMatched ? '#ffffff' : '#ff6b4a';
      ctx.stroke();
    }
  }
}

/**
 * 更新深蹲 UI
 */
function updateSquatUI(result) {
  const previousCount = parseInt(squatCurrentCountEl.textContent, 10) || 0;
  squatCurrentCountEl.textContent = result.count;
  if (result.count > previousCount) {
    squatCurrentCountEl.classList.add('bump');
    setTimeout(() => squatCurrentCountEl.classList.remove('bump'), 300);
  }

  const progressPercent = Math.min(100, Math.round((result.count / result.targetCount) * 100));
  squatProgressBar.style.width = `${progressPercent}%`;

  const frontView = result.measurementMode === 'front';
  if (counterParamLabel) counterParamLabel.textContent = frontView ? '下蹲进度' : '膝关节夹角';
  if (counterThresholdLabel) counterThresholdLabel.textContent = frontView ? '达标进度' : '达标有效深度';
  if (thresholdAngleEl) thresholdAngleEl.textContent = frontView ? '100%' : `≤ ${squatCounter.bottomAngleThreshold}°`;
  currentAngleEl.textContent = frontView
    ? `${Math.min(100, Math.round(result.currentDepth / result.depthThreshold * 100))}%`
    : result.currentAngle === null ? '--' : `${result.currentAngle}°`;
  if (result.state === SQUAT_STATES.BOTTOM) {
    currentAngleEl.classList.add('reached');
  } else {
    currentAngleEl.classList.remove('reached');
  }

  switch (result.state) {
    case SQUAT_STATES.STANDING:
      statusPill.textContent = '🟢 站立就绪';
      statusPill.className = 'status-pill standing';
      break;
    case SQUAT_STATES.SQUATTING:
      statusPill.textContent = '🟡 下蹲中...';
      statusPill.className = 'status-pill squatting';
      break;
    case SQUAT_STATES.BOTTOM:
      statusPill.textContent = '深度达标';
      statusPill.className = 'status-pill bottom';
      break;
    case SQUAT_STATES.RISING:
      statusPill.textContent = '⬆️ 起立中...';
      statusPill.className = 'status-pill squatting';
      break;
    default:
      statusPill.textContent = '等待动作';
      statusPill.className = 'status-pill';
  }

  if (result.feedback && feedbackTextEl.textContent !== result.feedback) {
    feedbackTextEl.textContent = result.feedback;
  }
}

/**
 * 更新开合跳 UI
 */
function updateJumpingJackUI(result) {
  const previousCount = parseInt(squatCurrentCountEl.textContent, 10) || 0;
  squatCurrentCountEl.textContent = result.count;
  if (result.count > previousCount) {
    squatCurrentCountEl.classList.add('bump');
    setTimeout(() => squatCurrentCountEl.classList.remove('bump'), 300);
  }

  const progressPercent = Math.min(100, Math.round((result.count / result.targetCount) * 100));
  squatProgressBar.style.width = `${progressPercent}%`;

  if (result.isOpen) {
    currentAngleEl.textContent = '跳开达标';
    currentAngleEl.classList.add('reached');
  } else if (result.state === JJ_STATES.WAITING) {
    currentAngleEl.textContent = '等待身体';
    currentAngleEl.classList.remove('reached');
  } else if (result.state === JJ_STATES.CLOSED) {
    currentAngleEl.textContent = '🟢 闭合就绪';
    currentAngleEl.classList.remove('reached');
  } else {
    currentAngleEl.textContent = `开度 ${result.openPercent ?? 0}%`;
    currentAngleEl.classList.remove('reached');
  }

  switch (result.state) {
    case JJ_STATES.CLOSED:
      statusPill.textContent = '🟢 站立就绪';
      statusPill.className = 'status-pill standing';
      break;
    case JJ_STATES.OPENING:
      statusPill.textContent = '🟡 向上跳开...';
      statusPill.className = 'status-pill squatting';
      break;
    case JJ_STATES.OPEN:
      statusPill.textContent = '张开达标';
      statusPill.className = 'status-pill bottom';
      break;
    case JJ_STATES.CLOSING:
      statusPill.textContent = '⬇️ 双脚并拢...';
      statusPill.className = 'status-pill squatting';
      break;
    default:
      statusPill.textContent = '等待动作';
      statusPill.className = 'status-pill';
  }

  if (result.feedback && feedbackTextEl.textContent !== result.feedback) {
    feedbackTextEl.textContent = result.feedback;
  }
}

// ==================== 模式 B：无摄像头纯计时伴练 ====================

function setupTimerStage(action) {
  stopCameraLoop();
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }

  cameraStage.classList.add('hidden');
  timerStage.classList.remove('hidden');

  privacyBadgeText.textContent = '无摄像头模式 · 倒计时伴练';

  if (action.image) {
    timerGuideImg.src = chrome.runtime.getURL(action.image);
    timerImgBadge.textContent = `${SCENARIOS[action.scenario]?.name || '工位'} · 伴练指导`;
  }

  // 控制按钮状态
  btnTimerIcon.textContent = '⏸️';
  btnTimerText.textContent = '暂停计时';

  if (action.type === 'pose_counter') {
    // 无摄像头模式下的深蹲或开合跳：显示直接达标辅助按钮，自动启动节拍器
    btnManualCount.style.display = 'inline-flex';
    feedbackTextEl.textContent = action.id === 'home_jumping_jacks'
      ? '无摄像头伴练模式：跟随提示音完成开合跳，系统自动按节奏计时计数'
      : '无摄像头伴练模式：跟随提示音完成深蹲，系统自动按节奏计时计数';
    if (stretchRunner) {
      stretchRunner.start();
    }
  } else {
    btnManualCount.style.display = 'none';
    feedbackTextEl.textContent = '无摄像头伴练模式：跟着动作图解与倒计时完成舒展';
    if (stretchRunner) {
      stretchRunner.start();
    }
  }
}

// ==================== 交互控制与模式切换绑定 ====================

// 顶栏模式下拉选择器切换
modeSelector.addEventListener('change', async (e) => {
  const newMode = e.target.value;
  isCameraMode = newMode === 'camera';
  await saveSettings({ cameraEnabled: isCameraMode });
  currentSettings.cameraEnabled = isCameraMode;
  await loadAction(currentAction.id);
});

// 摄像头加载失败时的一键降级按钮
btnFallbackTimer.addEventListener('click', async () => {
  isCameraMode = false;
  modeSelector.value = 'timer';
  await saveSettings({ cameraEnabled: false });
  currentSettings.cameraEnabled = false;
  await loadAction(currentAction.id);
});

// 示范画中画小窗点击放大/缩小
guidePipBox.addEventListener('click', () => {
  guidePipBox.classList.toggle('expanded');
});

// 计时器控制按钮
btnToggleTimer.addEventListener('click', () => {
  if (!stretchRunner) return;
  if (stretchRunner.state === STRETCH_STATES.RUNNING) {
    stretchRunner.pause();
    btnTimerIcon.textContent = '▶️';
    btnTimerText.textContent = '继续计时';
    feedbackTextEl.textContent = '已暂停，点击“继续计时”恢复';
  } else if (stretchRunner.state === STRETCH_STATES.PAUSED) {
    stretchRunner.resume();
    btnTimerIcon.textContent = '⏸️';
    btnTimerText.textContent = '暂停计时';
    feedbackTextEl.textContent = currentAction.type === 'pose_counter'
      ? '节拍继续，跟随节奏完成动作'
      : '计时继续，感受肌群温和拉伸';
  }
});

btnResetTimer.addEventListener('click', () => {
  if (!stretchRunner) return;
  stretchRunner.reset();
  stretchRunner.start();
  btnTimerIcon.textContent = '⏸️';
  btnTimerText.textContent = '暂停计时';
  if (currentAction.type === 'pose_counter') {
    squatCurrentCountEl.textContent = '0';
    squatProgressBar.style.width = '0%';
    feedbackTextEl.textContent = '已重新开始当前动作节拍伴练';
  } else {
    feedbackTextEl.textContent = '已重新开始当前动作计时';
  }
});

// 辅助跳过/快捷完成按钮 (深蹲 / 开合跳无摄像头模式)
btnManualCount.addEventListener('click', () => {
  if (currentAction.type !== 'pose_counter') return;
  const target = currentAction.id === 'home_jumping_jacks'
    ? (currentAction.targetReps || 15)
    : (currentSettings.squatTarget || 10);

  squatCurrentCountEl.textContent = target;
  squatProgressBar.style.width = '100%';
  playCountSuccessSound();

  if (stretchRunner) {
    stretchRunner.pause();
  }
  if (!isCompleted) {
    handleActionFinished(currentAction);
  }
});

// ==================== 通关与队列切换处理 ====================

function handleActionFinished(action) {
  if (isCompleted || isTransitioning) return;

  if (action && action.id) {
    finishedActionIds.push(action.id);
  }

  if (currentQueueIndex < workoutQueue.length - 1) {
    isTransitioning = true;
    stopCameraLoop();
    if (stretchRunner) {
      stretchRunner.pause();
    }
    playCountSuccessSound();

    const nextIndex = currentQueueIndex + 1;
    const nextAction = workoutQueue[nextIndex];

    statusPill.textContent = `第 ${currentQueueIndex + 1} 组已完成`;
    statusPill.className = 'status-pill standing';
    feedbackTextEl.textContent = `下一组：${nextIndex + 1}/${workoutQueue.length} · ${nextAction.name}`;

    setTimeout(async () => {
      if (isCompleted) return;
      isTransitioning = false;
      currentQueueIndex = nextIndex;
      updateQueueProgressUI();
      await loadAction(nextAction.id);
    }, 1500);
  } else {
    handleGoalAccomplished(
      workoutQueue.length,
      workoutQueue.length > 1 ? `全部 ${workoutQueue.length} 组组合训练` : action.name,
      finishedActionIds
    );
  }
}

function handleGoalAccomplished(amount, actionName, completedActionIds = []) {
  isCompleted = true;
  stopCameraLoop();
  if (stretchRunner) {
    stretchRunner.pause();
  }

  playVictorySound();

  victoryTitleEl.textContent = `已完成：${actionName}`;
  victoryDescEl.textContent = '已记录本次活动，使用时长已重置。';
  victoryModal.classList.add('active');

  const finalActions = (completedActionIds && completedActionIds.length > 0)
    ? completedActionIds
    : (finishedActionIds.length > 0 ? finishedActionIds : (currentAction?.id ? [currentAction.id] : []));

  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.WORKOUT_COMPLETED,
      payload: { amount, actionName, completedActionIds: finalActions }
    },
    (res) => {
      console.log('[FitGate] 解锁广播响应:', res);
    }
  );

  setTimeout(() => {
    window.close();
  }, 1900);
}

// ==================== 初始化 ====================

async function init() {
  currentSettings = await getSettings();
  isCameraMode = currentSettings.cameraEnabled !== false;
  modeSelector.value = isCameraMode ? 'camera' : 'timer';

  populateActionSelector();

  // 检查 URL 是否指定了动作 ?action=xxx
  const urlParams = new URLSearchParams(window.location.search);
  const actionFromUrl = urlParams.get('action');

  if (actionFromUrl) {
    const targetAction = getActionById(actionFromUrl);
    workoutQueue = [targetAction];
  } else {
    workoutQueue = await getCurrentWorkoutQueue();
  }
  currentQueueIndex = 0;
  updateQueueProgressUI();

  // 监听动作选择下拉框切换 (手动切换当前动作)
  actionSelector.addEventListener('change', (e) => {
    if (workoutQueue.length > 0) {
      workoutQueue[currentQueueIndex] = getActionById(e.target.value);
    }
    loadAction(e.target.value);
  });

  if (workoutQueue.length > 0) {
    await loadAction(workoutQueue[0].id);
  }
}

window.addEventListener('DOMContentLoaded', init);

// A sleeping or locked Mac must never complete a timer or keep the camera running.
let desktopSuspended = false;
let cameraGeneration = 0;
window.fitgate.onSuspend(() => {
  if (isCompleted) return;
  desktopSuspended = true;
  stopCameraLoop();
  stretchRunner?.pause();
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  if (document.getElementById('desktop-resume')) return;
  const cover = document.createElement('div');
  cover.id = 'desktop-resume';
  cover.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#f8fafcf5;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px';
  const title = document.createElement('h2'); title.textContent = '伴练已暂停';
  const detail = document.createElement('p'); detail.textContent = '电脑锁屏或休眠后已关闭摄像头。点击“重新开始本组”继续。';
  const resume = document.createElement('button'); resume.className = 'stage-btn-control'; resume.textContent = '重新开始本组';
  resume.onclick = async () => { desktopSuspended = false; cover.remove(); await loadAction(workoutQueue[currentQueueIndex].id); };
  cover.append(title, detail, resume); document.body.append(cover);
});
