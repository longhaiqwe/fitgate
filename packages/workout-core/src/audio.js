// 基于原生 Web Audio API 的轻量级提示音合成模块，零外部音频资源依赖

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : (typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null);
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 播放单个音符
 */
function playTone(freq, type = 'sine', duration = 0.15, gainLevel = 0.2, startTimeOffset = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const start = ctx.currentTime + startTimeOffset;
  const attack = 0.005; // 5ms 平滑微淡入，彻底消除直流瞬态跳变造成的爆音/杂音
  const stop = start + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  // 包络：平滑上升再指数级淡出防爆音
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainLevel, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(stop);
}

/**
 * 触底提示音：轻快的短促高音 "叮"
 */
export function playSquatBottomBeep() {
  playTone(880, 'sine', 0.12, 0.25);
}

/**
 * 计数成功音：两段递增明快和弦 (C5 -> G5)
 */
export function playCountSuccessSound() {
  playTone(523.25, 'sine', 0.1, 0.2, 0);     // C5
  playTone(783.99, 'sine', 0.18, 0.25, 0.08); // G5
}

/**
 * 通关胜利乐：四音欢快和弦琶音 (C5 -> E5 -> G5 -> C6)
 */
export function playVictorySound() {
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    playTone(freq, 'triangle', 0.25, 0.3, idx * 0.12);
  });
}

/**
 * 换侧提醒音：清脆的双音提示 (E5 -> A5)
 */
export function playSwitchSideSound() {
  playTone(659.25, 'sine', 0.12, 0.25, 0);     // E5
  playTone(880.00, 'sine', 0.22, 0.3, 0.1);    // A5
}

/**
 * 倒计时提示音：清脆、干净的微水滴/提示铃（3-2-1 递进音阶，彻底告别粗糙电流声）
 * @param {number} remaining 倒计时剩余秒数 (3, 2, 1)
 */
export function playTickSound(remaining = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;

  // 根据剩余秒数升阶：3秒 -> 784Hz(G5), 2秒 -> 880Hz(A5), 1秒 -> 1046.5Hz(C6)
  let freq = 880;
  if (remaining === 3) freq = 784;
  else if (remaining === 2) freq = 880;
  else if (remaining === 1) freq = 1046.5;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const start = ctx.currentTime;
  const attack = 0.004;  // 4ms 平滑微淡入，杜绝任何硬件电平突变爆音
  const duration = 0.09; // 90ms 饱满利落的衰减
  const stop = start + duration;

  osc.type = 'sine'; // 纯净正弦波，柔和且无毛刺谐波

  // 微妙的高频微滑降 (模拟真实水滴/音叉清脆撞击的物理声学特征)
  osc.frequency.setValueAtTime(freq * 1.05, start);
  osc.frequency.exponentialRampToValueAtTime(freq, start + 0.035);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.18, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(stop);
}

