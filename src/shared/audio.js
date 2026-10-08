// 基于原生 Web Audio API 的轻量级提示音合成模块，零外部音频资源依赖

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
  const stop = start + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  // 指数级淡出防爆音
  gain.gain.setValueAtTime(gainLevel, start);
  gain.gain.exponentialRampToValueAtTime(0.001, stop);

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
