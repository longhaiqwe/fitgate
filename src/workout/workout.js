// 健身房业务交互与实时视觉推理渲染中枢
import { initPoseDetector, detectPose } from './detector.js';
import { SquatCounter, SQUAT_STATES } from './squat-counter.js';
import { playSquatBottomBeep, playCountSuccessSound, playVictorySound } from '../shared/audio.js';
import { getSettings } from '../shared/storage.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

// DOM 元素引用
const videoEl = document.getElementById('webcam');
const canvasEl = document.getElementById('pose-canvas');
const ctx = canvasEl.getContext('2d');
const loadingMask = document.getElementById('loading-mask');
const loadingText = document.getElementById('loading-text');

const statusPill = document.getElementById('status-pill');
const fpsCounter = document.getElementById('fps-counter');
const currentCountEl = document.getElementById('squat-current-count');
const targetCountEl = document.getElementById('squat-target-count');
const progressBar = document.getElementById('progress-bar');
const currentAngleEl = document.getElementById('current-angle-text');
const feedbackTextEl = document.getElementById('feedback-text');
const headerTargetBadge = document.getElementById('header-target-badge');
const victoryModal = document.getElementById('victory-modal');

let squatCounter = null;
let isRunning = false;
let isCompleted = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

// 人体 17 个关键点骨骼连接对
const SKELETON_PAIRS = [
  [5, 6],   // 双肩
  [5, 7], [7, 9],     // 左臂
  [6, 8], [8, 10],    // 右臂
  [5, 11], [6, 12],   // 躯干两侧
  [11, 12], // 骨盆
  [11, 13], [13, 15], // 左腿 (髋-膝-踝)
  [12, 14], [14, 16]  // 右腿 (髋-膝-踝)
];

/**
 * 启动摄像头与姿态模型 (并行管线：设置、摄像头硬件预热与本地 AI 引擎同时并发拉起)
 */
async function startWorkout() {
  try {
    loadingText.textContent = '正在并行初始化摄像头与 AI 姿态检测引擎...';

    // 1. 三路并发拉起：用户配置、摄像头视频流、本地 MoveNet 模型同时启动
    const settingsPromise = getSettings();
    const cameraPromise = navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
    const detectorPromise = initPoseDetector((msg) => {
      loadingText.textContent = msg;
    });

    // 并发等待三者全部就绪
    const [settings, stream] = await Promise.all([
      settingsPromise,
      cameraPromise,
      detectorPromise
    ]);

    const target = settings.squatTarget || 10;
    const strictMode = settings.strictMode !== false;

    squatCounter = new SquatCounter({
      targetCount: target,
      strictMode
    });

    targetCountEl.textContent = `/ ${target}`;
    headerTargetBadge.textContent = `目标：深蹲 ${target} 次`;

    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play();
        resolve();
      };
    });

    // 调整 Canvas 尺寸与视频一致
    canvasEl.width = videoEl.videoWidth || 1280;
    canvasEl.height = videoEl.videoHeight || 720;

    // 隐藏加载遮罩，直接开启推断循环
    loadingMask.classList.add('hidden');
    isRunning = true;
    requestAnimationFrame(renderLoop);

  } catch (err) {
    console.error('[FitGate] 启动失败:', err);
    loadingText.innerHTML = `
      <span style="color: #ff3b30; font-size: 18px;">⚠️ 无法访问摄像头或加载模型</span>
      <p style="font-size: 14px; margin-top: 8px; color: rgba(255,255,255,0.7);">
        ${err.name === 'NotAllowedError' ? '请点击浏览器地址栏的摄像头图标，允许插件访问摄像头。' : err.message}
      </p>
      <button style="margin-top: 16px; padding: 8px 18px; border-radius: 8px; background: #ff6b4a; color: white; border: none; cursor: pointer;" onclick="location.reload()">重新尝试</button>
    `;
  }
}

/**
 * 帧渲染与姿态分析主循环
 */
async function renderLoop(timestamp) {
  if (!isRunning) return;

  // 计算实际 FPS
  frameCount++;
  if (timestamp - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
    fpsCounter.textContent = `FPS: ${fps}`;
    frameCount = 0;
    lastFpsUpdate = timestamp;
  }

  // 1. 运行 AI 姿态推断
  try {
    const pose = await detectPose(videoEl);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (pose && pose.keypoints) {
      // 绘制人体骨骼连线与关节点
      drawSkeleton(pose.keypoints);

      // 更新深蹲算法状态机
      const result = squatCounter.update(pose.keypoints);
      updateUI(result);

      // 动作音效反馈
      if (result.isBottomThisFrame) {
        playSquatBottomBeep();
      }
      if (result.isCountedThisFrame) {
        playCountSuccessSound();
      }

      // 达成目标，触发通关流程
      if (result.isFinished && !isCompleted) {
        handleGoalAccomplished(result.count);
      }
    } else {
      statusPill.textContent = '等待检测人体...';
      statusPill.className = 'status-pill';
    }
  } catch (error) {
    console.error('[FitGate] 推理帧异常:', error);
  }

  if (isRunning) {
    requestAnimationFrame(renderLoop);
  }
}

/**
 * 在 Canvas 上绘制骨骼连线与关节点
 */
function drawSkeleton(keypoints) {
  // 1. 绘制连线
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(10, 132, 255, 0.7)';
  ctx.lineCap = 'round';

  for (const [i, j] of SKELETON_PAIRS) {
    const p1 = keypoints[i];
    const p2 = keypoints[j];
    if (p1 && p2 && p1.score > 0.25 && p2.score > 0.25) {
      // 如果是深蹲核心腿部，用醒目高亮色
      const isLeg = (i === 11 && j === 13) || (i === 13 && j === 15) ||
                    (i === 12 && j === 14) || (i === 14 && j === 16);

      ctx.beginPath();
      ctx.strokeStyle = isLeg ? 'rgba(255, 159, 10, 0.9)' : 'rgba(10, 132, 255, 0.6)';
      ctx.lineWidth = isLeg ? 6 : 3;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  // 2. 绘制关节点
  for (const kp of keypoints) {
    if (kp.score > 0.3) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff6b4a';
      ctx.stroke();
    }
  }
}

/**
 * 更新仪表盘界面数据与动画
 */
function updateUI(result) {
  // 1. 次数与进度条
  const previousCount = parseInt(currentCountEl.textContent, 10) || 0;
  currentCountEl.textContent = result.count;
  if (result.count > previousCount) {
    currentCountEl.classList.add('bump');
    setTimeout(() => currentCountEl.classList.remove('bump'), 300);
  }

  const progressPercent = Math.min(100, Math.round((result.count / result.targetCount) * 100));
  progressBar.style.width = `${progressPercent}%`;

  // 2. 膝关节夹角
  currentAngleEl.textContent = `${result.currentAngle}°`;
  if (result.state === SQUAT_STATES.BOTTOM) {
    currentAngleEl.classList.add('reached');
  } else {
    currentAngleEl.classList.remove('reached');
  }

  // 3. 状态标签
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
      statusPill.textContent = '🔥 深度达标！';
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

  // 4. 实时指导建议文案
  if (result.feedback) {
    feedbackTextEl.textContent = result.feedback;
  }
}

/**
 * 处理达成目标与解锁通关流程
 */
function handleGoalAccomplished(finalCount) {
  isCompleted = true;
  isRunning = false;

  // 播放胜利和弦
  playVictorySound();

  // 弹出通关模态层
  victoryModal.classList.add('active');

  // 通知 Background 广播解锁已锁定的网页
  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.WORKOUT_COMPLETED,
      payload: { squatCount: finalCount }
    },
    (res) => {
      console.log('[FitGate] 解锁广播响应:', res);
    }
  );

  // 延时 1.8 秒自动关闭健身房标签页，焦点自然切回原网页
  setTimeout(() => {
    window.close();
  }, 1800);
}

// 页面加载完成后启动
window.addEventListener('DOMContentLoaded', startWorkout);
