import './reminder.css';
import { isFreshStandingFrame } from './shared/standing-pose.js';
import { getActionsByScenario } from './shared/actions-data.js';
import { REMINDER_REST_MS, remainingRestSeconds, formatRestTime } from './shared/reminder-timer.js';

const preview = new URLSearchParams(location.search).has('preview');
const element = id => document.getElementById(id);
let currentState, cameraStream, cameraRun = 0, cameraRunning = false, cameraFailed = false;
let frameTimer;
const video = element('standing-video');
let deadline = preview ? Date.now() + REMINDER_REST_MS : 0;

if (preview) {
  element('reminder-title').textContent = '活动提醒预览';
  element('reminder-description').textContent = '按当前规则预览提醒。';
  element('clock-label').textContent = '预览 · 休息倒计时';
  element('clock-note').textContent = '关闭预览不会修改本轮计时。';
  element('snooze').textContent = '关闭预览';
  element('keyboard-hint').textContent = '按 Esc 关闭预览';
}

element('close-preview').hidden = !preview;
element('close-preview').onclick = () => window.fitgate.closePreview();
element('begin').onclick = () => window.fitgate.openWorkout();
const dismiss = () => preview ? window.fitgate.closePreview() : window.fitgate.snooze();
element('snooze').onclick = dismiss;

function paintClock() {
  const standing = !preview && currentState?.usage.restMode === 'standing';
  element('rest-time').textContent = formatRestTime(standing
    ? (REMINDER_REST_MS - (currentState.usage.standingMs || 0)) / 1000
    : remainingRestSeconds(deadline));
}

function update(state) {
  currentState = state;
  const settings = state.settings;
  const action = getActionsByScenario(settings.scenario).find(item => item.id === settings.activeActionId);
  element('action-title').textContent = action?.name || '随机动作';
  element('action-count').textContent = `${settings.actionCountPerSession} 组动作`;
  if (!preview) {
    const workoutActive = state.workoutActive === true;
    element('reminder-title').textContent = workoutActive ? '伴练进行中' : '活动提醒';
    element('reminder-description').textContent = workoutActive ? '完成伴练后，重新计时。' : '已达到本轮使用上限。';
    document.querySelector('.rest-clock').hidden = workoutActive;
    element('begin').textContent = workoutActive ? '返回伴练' : '开始伴练';
    deadline = state.usage.restEndsAt || 0;
    const standing = state.usage.restMode === 'standing';
    element('clock-label').textContent = standing ? '微动作 · 站立 5 分钟' : '休息倒计时';
    element('clock-note').textContent = standing
      ? '只累计检测到站立的时间，满 5 分钟记为 1 组微动作。'
      : '休息结束后重新计时；纯计时不计入站立动作记录。';
    if (standing && !state.standingCameraOwner && !workoutActive) element('clock-note').textContent = '请面向另一块屏幕上的摄像头预览，站立进度会同步。';
    const shouldDetect = standing && state.standingCameraOwner && !workoutActive;
    element('standing-camera').hidden = !shouldDetect;
    if (shouldDetect && !cameraRunning && !cameraFailed) void startCamera();
    else if (!shouldDetect && cameraRunning) stopCamera();
  }
  paintClock();
}

window.fitgate.status().then(update);
const unsubscribe = window.fitgate.onStatus(update);
const clock = setInterval(paintClock, 250);
paintClock();
element('begin').focus({ preventScroll: true });

window.addEventListener('beforeunload', () => {
  stopCamera();
  clearInterval(clock);
  unsubscribe();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    dismiss();
  }
});

function stopCamera() {
  cameraRun++;
  cameraRunning = false;
  clearTimeout(frameTimer);
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  video.srcObject = null;
}

async function startCamera() {
  cameraRunning = true;
  cameraFailed = false;
  const run = ++cameraRun;
  for (const id of ['retry-camera', 'camera-settings', 'no-camera']) element(id).hidden = true;
  element('standing-feedback').textContent = '正在开启摄像头并加载本地模型，计时暂停…';
  const fail = error => {
    if (run !== cameraRun) return;
    stopCamera(); cameraFailed = true;
    void window.fitgate.standingSample(null);
    element('standing-feedback').textContent = error.name === 'NotAllowedError'
      ? '摄像头未获授权，站立计时已暂停。请允许访问后重试。'
      : error.name === 'NotFoundError' ? '未检测到摄像头，站立计时已暂停。'
      : '摄像头或姿态识别暂不可用，站立计时已暂停，请重试。';
    element('retry-camera').hidden = false;
    element('camera-settings').hidden = error.name !== 'NotAllowedError';
    element('no-camera').hidden = error.name !== 'NotFoundError';
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (run !== cameraRun) { stream.getTracks().forEach(track => track.stop()); return; }
    cameraStream = stream;
    video.srcObject = stream;
    for (const track of stream.getVideoTracks()) track.onended = () => fail(new Error('Camera disconnected'));
    await video.play();
    const { initPoseDetector, detectPose } = await import('./workout/detector.js');
    await initPoseDetector();
    if (run !== cameraRun) return;
    let lastVideoTime = -1;
    const sample = async () => {
      if (run !== cameraRun) return;
      try {
        // A frozen or muted video cannot keep earning time from its last frame.
        const fresh = isFreshStandingFrame(video, stream, lastVideoTime);
        lastVideoTime = video.currentTime;
        const pose = fresh ? await detectPose(video) : null;
        if (run !== cameraRun) return;
        const result = await window.fitgate.standingSample(pose?.keypoints || null);
        if (run !== cameraRun) return;
        if (!result.accepted || result.completed) { stopCamera(); return; }
        currentState.usage.standingMs = result.standingMs;
        element('standing-feedback').textContent = result.feedback;
        paintClock();
        frameTimer = setTimeout(sample, 200);
      } catch (error) { fail(error); }
    };
    void sample();
  } catch (error) { fail(error); }
}
element('retry-camera').onclick = () => { if (!cameraRunning) void startCamera(); };
element('camera-settings').onclick = () => window.fitgate.cameraPrivacy();
element('no-camera').onclick = () => window.fitgate.settings({ cameraEnabled: false });
