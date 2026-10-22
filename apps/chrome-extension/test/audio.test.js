import test from 'node:test';
import assert from 'node:assert/strict';
import {
  playSquatBottomBeep,
  playCountSuccessSound,
  playVictorySound,
  playSwitchSideSound,
  playTickSound
} from '../src/shared/audio.js';

// 构造 Web Audio API Mock 环境
class MockGainNode {
  constructor() {
    this.gain = {
      value: 0,
      _startVal: 0,
      _peakVal: 0,
      _endVal: 0,
      setValueAtTime(v, t) { this._startVal = v; },
      linearRampToValueAtTime(v, t) { this._peakVal = v; },
      exponentialRampToValueAtTime(v, t) { this._endVal = v; }
    };
  }
  connect(dest) {}
}

class MockOscillatorNode {
  constructor() {
    this.type = 'sine';
    this.frequency = {
      value: 440,
      targetFreq: 440,
      setValueAtTime(v, t) { this.value = v; },
      exponentialRampToValueAtTime(v, t) { this.targetFreq = v; }
    };
    this.started = false;
    this.stopped = false;
  }
  connect(dest) {}
  start(t) { this.started = true; }
  stop(t) { this.stopped = true; }
}

const mockCtx = {
  currentTime: 0,
  state: 'running',
  destination: {},
  createdOscillators: [],
  createdGains: [],
  createOscillator() {
    const osc = new MockOscillatorNode();
    this.createdOscillators.push(osc);
    return osc;
  },
  createGain() {
    const gain = new MockGainNode();
    this.createdGains.push(gain);
    return gain;
  },
  resume() {
    this.state = 'running';
  }
};

test('audio: 无 AudioContext 环境下安全空转不抛出异常', () => {
  assert.doesNotThrow(() => {
    playSquatBottomBeep();
    playCountSuccessSound();
    playVictorySound();
    playSwitchSideSound();
    playTickSound(3);
    playTickSound(2);
    playTickSound(1);
  });
});

test('audio: playTickSound 正弦波纯净水滴声与音调递进阶梯验证', () => {
  globalThis.AudioContext = function() { return mockCtx; };

  // 倒数 3 秒 (G5 784Hz)
  playTickSound(3);
  const osc3 = mockCtx.createdOscillators.pop();
  assert.equal(osc3.type, 'sine', '倒计时应采用纯正弦波彻底告别三角波/方波粗糙电流声');
  assert.ok(Math.abs(osc3.frequency.targetFreq - 784) < 1, `倒数3秒基频应为 784Hz，实际为 ${osc3.frequency.targetFreq}`);

  // 倒数 2 秒 (A5 880Hz)
  playTickSound(2);
  const osc2 = mockCtx.createdOscillators.pop();
  assert.equal(osc2.type, 'sine');
  assert.ok(Math.abs(osc2.frequency.targetFreq - 880) < 1, `倒数2秒基频应为 880Hz，实际为 ${osc2.frequency.targetFreq}`);

  // 倒数 1 秒 (C6 1046.5Hz)
  playTickSound(1);
  const osc1 = mockCtx.createdOscillators.pop();
  assert.equal(osc1.type, 'sine');
  assert.ok(Math.abs(osc1.frequency.targetFreq - 1046.5) < 1, `倒数1秒基频应为 1046.5Hz，实际为 ${osc1.frequency.targetFreq}`);
});

test('audio: playTickSound 具备平滑 Attack 淡入与指数衰减，彻底杜绝爆音与电流打火声', () => {
  playTickSound(1);
  const gainNode = mockCtx.createdGains.pop();
  assert.ok(gainNode, '应成功创建增益节点');
  assert.equal(gainNode.gain._startVal, 0.0001, '初始电平应从微小值平滑起始');
  assert.ok(gainNode.gain._peakVal > 0.1, '应有平滑上升的 Attack 峰值');
  assert.equal(gainNode.gain._endVal, 0.0001, '结束时应指数衰减防爆音');
});
