import './desktop.css';
import { getActionsByScenario } from './shared/actions-data.js';
import { SNS_SERVICES, normalizeDomainList } from './shared/target-rules.js';
import { parseUsageLimitInput, parseStretchSecondsInput, parseSquatTargetInput, parseActionCountInput } from './shared/duration-parser.js';
const $ = id => document.getElementById(id);
const api = window.fitgate;
let state, settingsSignature = '', appsSignature = '', toastTimer;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const minutes = seconds => seconds < 60 ? `${Math.floor(seconds)} 秒` : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800); }
async function save(patch) {
  $('saved-state').textContent = '保存中…';
  try { await api.settings(patch); $('saved-state').textContent = '已保存'; }
  catch (error) { toast(error.message); render(await api.status()); $('saved-state').textContent = '保存失败'; }
}
function updateValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
function renderSettings(s) {
  updateValue('usage-limit', s.usageLimit); updateValue('action-count', s.actionCountPerSession);
  updateValue('squat-target', s.squatTarget); updateValue('stretch-seconds', s.stretchSeconds);
  updateValue('camera-mode', String(s.cameraEnabled)); updateValue('strict-mode', String(s.strictMode));
  updateValue('idle-seconds', s.idleSeconds); updateValue('custom-domains', s.customDomains.join('\n'));
  $('launch-login').checked = s.launchAtLogin; $('custom-enabled').checked = s.customEnabled;
  $('app-targets').hidden = s.monitorMode !== 'apps'; $('website-targets').hidden = s.monitorMode !== 'websites';
  document.querySelectorAll('[data-scope]').forEach(b => b.classList.toggle('selected', b.dataset.scope === s.monitorMode));
  document.querySelectorAll('[data-scenario]').forEach(b => b.classList.toggle('selected', b.dataset.scenario === s.scenario));
  $('action-select').innerHTML = '<option value="auto">随机动作</option>' + getActionsByScenario(s.scenario).map(a => `<option value="${a.id}">${escape(a.name)}</option>`).join('');
  $('action-select').value = s.activeActionId;
  $('site-choices').innerHTML = SNS_SERVICES.map(service => `<label class="check"><input type="checkbox" data-site="${service.key}" ${s.sns[service.key] ? 'checked' : ''}>${service.label}</label>`).join('');
}
function renderApps() {
  const names = new Map((state.foreground.apps || []).filter(a => a.id && a.id !== 'com.fitgate.desktop' && !a.id.startsWith('com.github.Electron')).map(a => [a.id, a.name]));
  state.settings.selectedApps.forEach(id => { if (!names.has(id)) names.set(id, state.today.apps[id]?.name || id); });
  const entries = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const signature = JSON.stringify([entries, state.settings.selectedApps]);
  if (signature === appsSignature) return;
  appsSignature = signature;
  $('app-choices').innerHTML = entries.map(([id, name]) => `<label class="check"><input type="checkbox" data-app="${escape(id)}" ${state.settings.selectedApps.includes(id) ? 'checked' : ''}>${escape(name)}</label>`).join('') || '<p class="muted">请先打开需要监控的应用。</p>';
}
function renderHistory() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ key: dayKey(d), label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`, seconds: state.days[dayKey(d)]?.seconds || 0 }); }
  const maximum = Math.max(60, ...days.map(d => d.seconds));
  $('week-chart').innerHTML = days.map((d, i) => `<div class="bar-column ${i === 6 ? 'today' : ''}" title="${d.key} · ${minutes(d.seconds)}"><small>${Math.floor(d.seconds / 60)} 分</small><div class="bar" style="height:${Math.max(2, d.seconds / maximum * 140)}px"></div><span>${d.label}</span></div>`).join('');
  const apps = Object.values(state.today.apps).sort((a, b) => b.seconds - a.seconds);
  $('app-usage').innerHTML = apps.length ? apps.map(a => `<div class="app-row"><span>${escape(a.name)}</span><div class="progress-track"><div style="width:${a.seconds / Math.max(1, state.today.seconds) * 100}%"></div></div><span>${minutes(a.seconds)}</span></div>`).join('') : '<div class="empty">暂无使用记录。<br>使用受控范围内的应用后，此处显示使用时长。</div>';
}
function render(next) {
  state = next;
  const { settings: s, usage: u, today } = state;
  const secs = Math.floor(u.seconds);
  $('session-time').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  $('limit-minutes').textContent = s.usageLimit;
  $('session-progress').style.width = `${Math.min(100, secs / (s.usageLimit * 60) * 100)}%`;
  const remaining = Math.max(s.usageLimit * 60 - secs, (u.snoozedUntil - Date.now()) / 1000, 0);
  $('remaining').textContent = u.isLocked ? '已达到使用上限' : `距离活动提醒还有 ${minutes(Math.ceil(remaining))}`;
  $('today-time').textContent = minutes(today.seconds); $('today-sessions').textContent = today.sessions;
  $('today-sets').textContent = `累计完成 ${today.sets} 组动作`;
  $('rhythm').innerHTML = `${s.usageLimit} <em>分钟 /</em> ${s.actionCountPerSession} <em>组</em>`;
  $('mode-tag').textContent = { all: '整台电脑', apps: '指定应用', websites: '指定网站' }[s.monitorMode];
  $('live-reason').textContent = state.reason; $('current-app').textContent = state.foreground.name;
  $('pause-button').classList.toggle('paused', s.paused); $('pause-button').querySelector('span').textContent = s.paused ? '已暂停 · 点击继续' : '监控运行中';
  $('warning').hidden = !state.warning; $('warning').textContent = state.warning;
  $('version').textContent = `FitGate for macOS · ${state.version}`;
  $('camera-permission').textContent = ({ granted: '已允许 · 仅在伴练时使用', denied: '尚未允许 · 也可选择纯计时模式', restricted: '设备策略限制了摄像头使用', 'not-determined': '首次摄像头伴练时，系统会请求授权。' })[state.cameraPermission] || '仅在伴练时使用。';
  const signature = JSON.stringify(s);
  if (signature !== settingsSignature) { renderSettings(s); settingsSignature = signature; }
  renderApps(); renderHistory();
}
$('date-label').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b === button));
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== button.dataset.view);
  $('page-title').textContent = { overview: '今日概览', activity: '使用记录', settings: '规则设置' }[button.dataset.view];
  window.scrollTo(0, 0);
}));
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => save({ scenario: button.dataset.scenario, activeActionId: 'auto' })));
document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => save({ monitorMode: button.dataset.scope })));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { const [usageLimit, actionCountPerSession] = button.dataset.preset.split(',').map(Number); save({ usageLimit, actionCountPerSession }); }));
$('action-select').addEventListener('change', event => save({ activeActionId: event.target.value }));
$('pause-button').addEventListener('click', () => save({ paused: !state.settings.paused }));
$('start-workout').addEventListener('click', () => api.openWorkout().catch(e => toast(e.message)));
for (const [id, key, parse] of [['usage-limit', 'usageLimit', parseUsageLimitInput], ['action-count', 'actionCountPerSession', parseActionCountInput], ['squat-target', 'squatTarget', parseSquatTargetInput], ['stretch-seconds', 'stretchSeconds', parseStretchSecondsInput]]) {
  $(id).addEventListener('focus', () => $(id).select());
  $(id).addEventListener('change', () => {
    const value = parse($(id).value);
    if (value === null) { $(id).value = state.settings[key]; toast('输入格式无效，已恢复原值'); return; }
    $(id).value = value; save({ [key]: value });
  });
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $(id).blur(); if (e.key === 'Escape') { $(id).value = state.settings[key]; $(id).blur(); } });
}
for (const [id, key] of [['camera-mode', 'cameraEnabled'], ['strict-mode', 'strictMode']]) $(id).addEventListener('change', e => save({ [key]: e.target.value === 'true' }));
$('idle-seconds').addEventListener('change', e => save({ idleSeconds: Number(e.target.value) }));
$('launch-login').addEventListener('change', e => save({ launchAtLogin: e.target.checked }));
$('app-choices').addEventListener('change', e => { if (!e.target.dataset.app) return; const selected = new Set(state.settings.selectedApps); if (e.target.checked) selected.add(e.target.dataset.app); else selected.delete(e.target.dataset.app); save({ selectedApps: [...selected] }); });
$('site-choices').addEventListener('change', e => { if (e.target.dataset.site) save({ sns: { ...state.settings.sns, [e.target.dataset.site]: e.target.checked } }); });
$('custom-enabled').addEventListener('change', e => save({ customEnabled: e.target.checked }));
$('custom-domains').addEventListener('change', e => { const values = normalizeDomainList(e.target.value); e.target.value = values.join('\n'); save({ customDomains: values }); });
$('preview-reminder').addEventListener('click', () => api.previewReminder());
$('camera-privacy').addEventListener('click', () => api.cameraPrivacy());
$('automation-privacy').addEventListener('click', () => api.automationPrivacy());
$('export-data').addEventListener('click', async () => { try { if (await api.exportData()) toast('记录已导出'); } catch (e) { toast(e.message); } });
api.onStatus(render);
api.status().then(render).catch(e => toast(`连接失败：${e.message}`));
