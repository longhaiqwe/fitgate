import './reminder.css';
import { getActionsByScenario } from './shared/actions-data.js';
import { REMINDER_REST_MS, remainingRestSeconds, formatRestTime } from './shared/reminder-timer.js';

const preview = new URLSearchParams(location.search).has('preview');
const element = id => document.getElementById(id);
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
  element('rest-time').textContent = formatRestTime(remainingRestSeconds(deadline));
}

function update(state) {
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
  }
  paintClock();
}

window.fitgate.status().then(update);
const unsubscribe = window.fitgate.onStatus(update);
const clock = setInterval(paintClock, 250);
paintClock();
element('begin').focus({ preventScroll: true });

window.addEventListener('beforeunload', () => {
  clearInterval(clock);
  unsubscribe();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    dismiss();
  }
});
