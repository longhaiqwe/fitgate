import './desktop.css';
import { usageSummary, appUsageSummary } from './shared/usage-history.js';
import { activitySummary, actionSummary, periodStart, shiftPeriod, dateKey, periodLabel } from './shared/activity-history.js';
import { actionRecordName } from './shared/action-records.js';
import { pauseDeadline, pauseLabel } from './shared/pause-settings.js';
import { getActionsByScenario } from './shared/actions-data.js';
import { SNS_SERVICES, normalizeDomainList } from './shared/target-rules.js';
import { parseUsageLimitInput, parseStretchSecondsInput, parseSquatTargetInput, parseActionCountInput } from './shared/duration-parser.js';
const $ = id => document.getElementById(id);
const api = window.fitgate;
const chartHistory = new Map();
let calendarDate = new Date(), calendarSelected = '', calendarSelect = null;
let selectedAction = null, actionPeriod = 'day', actionDate = new Date(), followCurrentAction = true, actionDetailSignature = '', actionListScroll = 0;
let selectedUsageApp = null, appPeriod = 'day', appDate = new Date(), followCurrentApp = true, appDetailSignature = '', usageScroll = 0;
let usagePeriod = 'day', usageDate = new Date(), followCurrentUsage = true, usageSignature = '';
let activityPeriod = 'day', activityDate = new Date(), followCurrentPeriod = true, activitySignature = '';
let state, settingsSignature = '', appsSignature = '', toastTimer;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const minutes = seconds => seconds < 60 ? `${Math.floor(seconds)} 秒` : seconds < 3600 ? `${Math.floor(seconds / 60)} 分钟` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800); }
async function save(patch) {
  $('saved-state').textContent = '保存中…';
  try { await api.settings(patch); $('saved-state').textContent = '已保存'; }
  catch (error) { toast(error.message); render(await api.status()); $('saved-state').textContent = '保存失败'; }
}
function updateValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
function renderSettings(s) {
  updateValue('warn-seconds', s.warnSeconds);
  updateValue('break-reset-seconds', s.breakResetSeconds);
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
  [...state.settings.selectedApps, ...state.settings.quietApps].forEach(id => { if (!names.has(id)) names.set(id, state.today.apps[id]?.name || id); });
  const entries = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const signature = JSON.stringify([entries, state.settings.selectedApps, state.settings.quietApps]);
  if (signature === appsSignature) return;
  appsSignature = signature;
  $('app-choices').innerHTML = entries.map(([id, name]) => `<label class="check"><input type="checkbox" data-app="${escape(id)}" ${state.settings.selectedApps.includes(id) ? 'checked' : ''}>${escape(name)}</label>`).join('') || '<p class="muted">请先打开需要监控的应用。</p>';
  $('quiet-app-choices').innerHTML = entries.map(([id, name]) => `<label class="check"><input type="checkbox" data-quiet-app="${escape(id)}" ${state.settings.quietApps.includes(id) ? 'checked' : ''}>${escape(name)}</label>`).join('') || '<p class="muted">请先打开需要免打扰的应用。</p>';
}
function renderHistory() {
  if (followCurrentUsage) usageDate = new Date();
  const signature = JSON.stringify([usagePeriod, dateKey(usageDate), dateKey(new Date()), Object.entries(state.days).map(([key, d]) => [key, d.seconds, d.apps])]);
  if (signature === usageSignature) return;
  usageSignature = signature;
  const summary = usageSummary(state.days, usagePeriod, usageDate);
  $('usage-period-label').textContent = summary.label;
  $('usage-total').textContent = minutes(summary.totalSeconds);
  $('usage-app-count').textContent = summary.apps.length;
  $('usage-active-days').textContent = summary.activeDays;
  $('usage-current').textContent = { day: '今天', week: '本周', month: '本月', year: '今年' }[usagePeriod];
  $('usage-next').disabled = dateKey(shiftPeriod(usagePeriod, usageDate, 1)) > dateKey(new Date());
  document.querySelectorAll('[data-usage-period]').forEach(button => {
    const selected = button.dataset.usagePeriod === usagePeriod;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('usage-trend-title').textContent = { day: '最近七天', week: '每日使用', month: '每日使用', year: '每月使用' }[usagePeriod];
  renderUsageChart(summary.buckets, usagePeriod, 'week-chart', 'usage-chart-unit');
  renderUsageAppRows(summary);
  $('usage-unknown').hidden = summary.unknownSeconds < 1;
  $('usage-unknown').textContent = `有 ${minutes(summary.unknownSeconds)} 未归属到具体应用（可能未记录或已被旧版清理），已计入总时长。`;
}
function renderUsageChart(buckets, period, chartId, unitId) {
  const maximum = Math.max(60, ...buckets.map(b => b.seconds));
  const unit = period === 'year' ? 3600 : 60;
  const chartValue = seconds => seconds > 0 && seconds < unit ? '<1' : String(Math.floor(seconds / unit));
  $(unitId).textContent = `活跃时间 · ${unit === 3600 ? '小时' : '分钟'}`;
  renderHistoryChart(buckets, period, chartId, b => ({ value: b.seconds,
    display: chartValue(b.seconds), description: minutes(b.seconds) }), maximum);
}
function renderUsageAppRows(summary) {
  const list = $('app-usage');
  if (!summary.apps.length) {
    list.innerHTML = `<div class="empty">${summary.totalSeconds ? '这段时间的记录没有可用的应用明细。' : '这段时间暂无使用记录。<br>使用受控范围内的应用后，此处会显示用时。'}</div>`;
    return;
  }
  // Preserve button nodes while live timers update, so focus and clicks stay stable.
  const focused = document.activeElement?.dataset.usageApp;
  const existing = new Map([...list.querySelectorAll('[data-usage-app]')].map(row => [row.dataset.usageApp, row]));
  list.querySelector('.empty')?.remove();
  summary.apps.forEach((a, index) => {
    let row = existing.get(a.id);
    if (!row) {
      row = document.createElement('button'); row.type = 'button'; row.className = 'app-row app-usage-link'; row.dataset.usageApp = a.id;
      row.innerHTML = '<span class="app-row-name"></span><span class="progress-track" aria-hidden="true"><span></span></span><span class="app-row-time"></span><span class="app-row-arrow" aria-hidden="true">›</span>';
    }
    existing.delete(a.id);
    row.dataset.appName = a.name; row.title = `${a.name} · ${a.id}`;
    row.setAttribute('aria-label', `${a.name}，${minutes(a.seconds)}，查看使用详情`);
    row.querySelector('.app-row-name').textContent = a.name;
    row.querySelector('.app-row-time').textContent = minutes(a.seconds);
    row.querySelector('.progress-track > span').style.width = `${Math.min(100, a.seconds / Math.max(1, summary.totalSeconds) * 100)}%`;
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  });
  existing.forEach(row => row.remove());
  if (focused) [...list.children].find(row => row.dataset.usageApp === focused)?.focus({ preventScroll: true });
}
function renderAppDetail() {
  if (!selectedUsageApp) return;
  if (followCurrentApp) appDate = new Date();
  const signature = JSON.stringify([selectedUsageApp.id, appPeriod, dateKey(appDate), dateKey(new Date()), state.days]);
  if (signature === appDetailSignature) return;
  appDetailSignature = signature;
  const summary = appUsageSummary(state.days, selectedUsageApp.id, appPeriod, appDate);
  $('app-detail-name').textContent = selectedUsageApp.name;
  $('app-detail-period-label').textContent = summary.label;
  $('app-detail-total').textContent = minutes(summary.totalSeconds);
  $('app-detail-days').textContent = summary.activeDays;
  $('app-detail-average').textContent = minutes(summary.averageSeconds);
  $('app-detail-current').textContent = { day: '今天', week: '本周', month: '本月', year: '今年' }[appPeriod];
  $('app-detail-next').disabled = dateKey(shiftPeriod(appPeriod, appDate, 1)) > dateKey(new Date());
  document.querySelectorAll('[data-app-period]').forEach(button => {
    const selected = button.dataset.appPeriod === appPeriod;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('app-detail-trend-title').textContent = { day: '最近七天', week: '每日使用', month: '每日使用', year: '每月使用' }[appPeriod];
  renderUsageChart(summary.buckets, appPeriod, 'app-detail-chart', 'app-detail-chart-unit');
  $('app-detail-empty').hidden = summary.totalSeconds > 0;
  $('app-detail-unknown').hidden = summary.unattributedSeconds < 1;
  $('app-detail-unknown').textContent = `该周期内有 ${minutes(summary.unattributedSeconds)} 总使用时长未归属到具体应用；此处仅统计已记录到该应用的用时。`;
  $('app-detail-breakdown-title').textContent = appPeriod === 'year' ? '每月用时' : '每日用时';
  $('app-detail-breakdown-note').textContent = appPeriod === 'day' ? '截至所选日期的最近七天。' : '所选周期内的用时明细。';
  $('app-detail-breakdown').innerHTML = summary.buckets.map(b => `<div class="app-detail-day"><span>${appPeriod === 'year' ? b.label : b.key.replaceAll('-', '.')}</span><span>${b.future ? '尚未到来' : minutes(b.seconds)}</span></div>`).join('');
}
function render(next) {
  state = next;
  const { settings: s, usage: u, today } = state;
  const secs = Math.floor(u.seconds);
  $('session-time').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  $('limit-minutes').textContent = s.usageLimit;
  $('session-progress').style.width = `${Math.min(100, secs / (s.usageLimit * 60) * 100)}%`;
  const remaining = Math.max(s.usageLimit * 60 - secs, (u.snoozedUntil - Date.now()) / 1000, 0);
  $('remaining').textContent = u.isLocked ? '已达到使用上限' : u.deferredSince ? '待提醒 · 免打扰应用使用中' : `距离活动提醒还有 ${minutes(Math.ceil(remaining))}`;
  $('today-time').textContent = minutes(today.seconds); $('today-sessions').textContent = today.sessions;
  $('today-idle-breaks').textContent = `空闲休息 ${today.idleBreaks || 0} 次`;
  $('today-reminder-counts').textContent = `提醒 ${today.reminders || 0} 次 · 推迟 ${today.snoozes || 0} 次 · 计时休息 ${today.timedRests || 0} 次`;
  $('today-sets').textContent = `累计完成 ${today.sets} 组动作`;
  $('rhythm').innerHTML = `${s.usageLimit} <em>分钟 /</em> ${s.actionCountPerSession} <em>组</em>`;
  $('mode-tag').textContent = { all: '整台电脑', apps: '指定应用', websites: '指定网站' }[s.monitorMode];
  $('live-reason').textContent = s.paused ? pauseLabel(s.pausedUntil) : state.reason; $('current-app').textContent = state.foreground.name;
  $('pause-button').classList.toggle('paused', s.paused); $('pause-button').querySelector('span').textContent = s.paused ? `${pauseLabel(s.pausedUntil)} · 点击继续` : '暂停';
  $('pause-duration').hidden = s.paused;
  $('warning').hidden = !state.warning; $('warning').textContent = state.warning;
  $('version').textContent = `FitGate for macOS · ${state.version}`;
  $('camera-permission').textContent = ({ granted: '已允许 · 仅在站立检测或伴练时使用', denied: '尚未允许 · 也可选择纯计时模式', restricted: '设备策略限制了摄像头使用', 'not-determined': '首次站立检测或摄像头伴练时，系统会请求授权。' })[state.cameraPermission] || '仅在站立检测或伴练时使用。';
  const signature = JSON.stringify(s);
  if (signature !== settingsSignature) { renderSettings(s); settingsSignature = signature; }
  renderApps();
  if (!$('activity').hidden) renderHistory();
  if (!$('exercise').hidden) renderActivity();
  if (!$('app-detail').hidden) renderAppDetail();
  if (!$('action-detail').hidden) renderActionDetail();
}
$('date-label').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
function showView(view) {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === (view === 'app-detail' ? 'activity' : view === 'action-detail' ? 'exercise' : view)));
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== view);
  $('page-title').textContent = { overview: '今日概览', activity: '使用记录', exercise: '活动记录', settings: '规则设置', 'app-detail': '应用使用详情', 'action-detail': '动作完成详情' }[view];
  if (view === 'exercise' && state) renderActivity();
  if (view === 'activity' && state) renderHistory();
  if (view === 'app-detail' && state) renderAppDetail();
  if (view === 'action-detail' && state) renderActionDetail();
  window.scrollTo(0, 0);
}
function renderActivity() {
  if (followCurrentPeriod) activityDate = new Date();
  const signature = JSON.stringify([activityPeriod, dateKey(activityDate), dateKey(new Date()), Object.entries(state.days).map(([key, d]) => [key, d.sessions, d.sets, d.actions, d.idleBreaks, d.reminders, d.snoozes, d.timedRests])]);
  if (signature === activitySignature) return;
  activitySignature = signature;
  const summary = activitySummary(state.days, activityPeriod, activityDate);
  $('activity-period-label').textContent = summary.label;
  $('activity-sets').textContent = summary.sets;
  $('activity-idle-breaks').textContent = `空闲休息 ${summary.idleBreaks} 次 · 单独记录，不计入动作组数`;
  $('activity-reminders').textContent = summary.reminders;
  $('activity-snoozes').textContent = summary.snoozes;
  $('activity-timed-rests').textContent = summary.timedRests;
  $('activity-sessions').textContent = summary.sessions;
  $('activity-days').textContent = summary.activeDays;
  $('activity-current').textContent = { day: '今天', week: '本周', month: '本月', year: '今年' }[activityPeriod];
  $('activity-next').disabled = dateKey(shiftPeriod(activityPeriod, activityDate, 1)) > dateKey(new Date());
  document.querySelectorAll('[data-period]').forEach(button => {
    const selected = button.dataset.period === activityPeriod;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('activity-trend-title').textContent = { day: '最近七天', week: '每日完成', month: '每日完成', year: '每月完成' }[activityPeriod];
  renderActionChart(summary.buckets, activityPeriod, 'activity-chart', '组');
  $('activity-action-types').textContent = `${summary.actions.length} 种动作`;
  renderActionRows(summary);
  $('activity-unknown').hidden = !summary.unknownSets;
  $('activity-unknown').textContent = `另有 ${summary.unknownSets} 组历史动作未记录名称，已计入上方汇总。`;
}
function renderActionChart(buckets, period, chartId, unit) {
  const maximum = Math.max(1, ...buckets.map(b => b.value));
  renderHistoryChart(buckets, period, chartId, b => ({ value: b.value,
    display: String(b.value), description: `${b.value} ${unit}` }), maximum);
}
function renderHistoryChart(buckets, period, chartId, describe, maximum) {
  renderChartBack(chartId);
  const chart = $(chartId), targetPeriod = period === 'year' ? 'month' : 'day';
  chart.style.setProperty('--columns', buckets.length);
  chart.classList.toggle('dense', period === 'month');
  chart.setAttribute('aria-label', period === 'year' ? '每月趋势，点击月份查看明细' : '每日趋势，点击日期查看当天明细');
  $(`${chartId}-hint`).textContent = period === 'year' ? '点击月份查看该月明细，再点击日期查看当天记录。' : '点击日期柱，查看当天的详细记录。';
  // Keep buttons in place during live updates, including a focused or pressed bar.
  const existing = new Map([...chart.children].map(button => [button.dataset.chartDate, button]));
  buckets.forEach((bucket, index) => {
    let button = existing.get(bucket.key);
    if (!button) {
      button = document.createElement('button'); button.type = 'button';
      button.innerHTML = '<small aria-hidden="true"></small><span class="bar" aria-hidden="true"></span><span class="bar-label" aria-hidden="true"></span>';
    }
    existing.delete(bucket.key);
    const value = describe(bucket), label = period === 'year' ? bucket.key.slice(0, 7) : bucket.key;
    const description = `${label} · ${bucket.future ? '尚未到来' : value.description}`;
    button.dataset.chartDate = bucket.key; button.dataset.chartPeriod = targetPeriod;
    button.className = `bar-column chart-link${bucket.selected ? ' today' : ''}${bucket.future ? ' future' : ''}`;
    button.disabled = bucket.future;
    button.title = `${description}${bucket.future ? '' : targetPeriod === 'month' ? ' · 查看该月记录' : ' · 查看当天记录'}`;
    button.setAttribute('aria-label', button.title);
    button.querySelector('small').textContent = bucket.future ? '—' : value.display;
    button.querySelector('.bar').style.height = `${Math.max(3, value.value / maximum * 132)}px`;
    button.querySelector('.bar-label').textContent = period === 'month' ? Number(bucket.key.slice(-2)) : bucket.label;
    if (chart.children[index] !== button) chart.insertBefore(button, chart.children[index] || null);
  });
  existing.forEach(button => button.remove());
}
function renderActionRows(summary) {
  const list = $('activity-action-list');
  if (!summary.actions.length) {
    list.innerHTML = `<div class="empty">${summary.sets ? '这段时间的历史记录尚无动作明细。' : '这段时间还没有完成活动。<br>完成一次伴练后，就能在这里看到动作记录。'}</div>`;
    return;
  }
  const focused = document.activeElement?.dataset.historyAction;
  const existing = new Map([...list.querySelectorAll('[data-history-action]')].map(row => [row.dataset.historyAction, row]));
  const maximum = Math.max(1, ...summary.actions.map(([, count]) => count));
  list.querySelector('.empty')?.remove();
  summary.actions.forEach(([id, count], index) => {
    const name = actionRecordName(id);
    let row = existing.get(id);
    if (!row) {
      row = document.createElement('button'); row.type = 'button'; row.className = 'action-history-row action-history-link'; row.dataset.historyAction = id;
      row.innerHTML = '<span class="action-rank"></span><span class="action-history-name"></span><span class="progress-track" aria-hidden="true"><span></span></span><strong><span class="action-history-count"></span><small> 次</small></strong><span class="action-row-arrow" aria-hidden="true">›</span>';
    }
    existing.delete(id);
    row.setAttribute('aria-label', `${name}，${count} 次，查看完成详情`);
    row.querySelector('.action-rank').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.action-history-name').textContent = name;
    row.querySelector('.action-history-count').textContent = count;
    row.querySelector('.progress-track > span').style.width = `${count / maximum * 100}%`;
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  });
  existing.forEach(row => row.remove());
  if (focused) [...list.children].find(row => row.dataset.historyAction === focused)?.focus({ preventScroll: true });
}
function renderActionDetail() {
  if (!selectedAction) return;
  if (followCurrentAction) actionDate = new Date();
  const signature = JSON.stringify([selectedAction, actionPeriod, dateKey(actionDate), dateKey(new Date()), Object.entries(state.days).map(([key, d]) => [key, d.sets, d.actions])]);
  if (signature === actionDetailSignature) return;
  actionDetailSignature = signature;
  const summary = actionSummary(state.days, selectedAction, actionPeriod, actionDate);
  $('action-detail-name').textContent = actionRecordName(selectedAction);
  $('action-detail-period-label').textContent = summary.label;
  $('action-detail-total').textContent = `${summary.totalCount} 次`;
  $('action-detail-days').textContent = summary.activeDays;
  $('action-detail-average').textContent = `${summary.averageCount.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 次`;
  $('action-detail-current').textContent = { day: '今天', week: '本周', month: '本月', year: '今年' }[actionPeriod];
  $('action-detail-next').disabled = dateKey(shiftPeriod(actionPeriod, actionDate, 1)) > dateKey(new Date());
  document.querySelectorAll('[data-action-period]').forEach(button => {
    const selected = button.dataset.actionPeriod === actionPeriod;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('action-detail-trend-title').textContent = { day: '最近七天', week: '每日完成', month: '每日完成', year: '每月完成' }[actionPeriod];
  renderActionChart(summary.buckets, actionPeriod, 'action-detail-chart', '次');
  $('action-detail-empty').hidden = summary.totalCount > 0;
  $('action-detail-unknown').hidden = !summary.unknownSets;
  $('action-detail-unknown').textContent = `该周期内有 ${summary.unknownSets} 组历史动作未记录名称；此处仅统计明确记录为“${actionRecordName(selectedAction)}”的完成次数。`;
  $('action-detail-breakdown-title').textContent = actionPeriod === 'year' ? '每月完成' : '每日完成';
  $('action-detail-breakdown-note').textContent = actionPeriod === 'day' ? '截至所选日期的最近七天。' : '所选周期内的完成次数明细。';
  $('action-detail-breakdown').innerHTML = summary.buckets.map(b => `<div class="app-detail-day"><span>${actionPeriod === 'year' ? b.label : b.key.replaceAll('-', '.')}</span><span>${b.future ? '尚未到来' : b.value + ' 次'}</span></div>`).join('');
}
document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('open-settings').addEventListener('click', () => showView('settings'));
$('back-settings-overview').addEventListener('click', () => { showView('overview'); $('open-settings').focus({ preventScroll: true }); });
$('open-usage').addEventListener('click', () => { clearChartHistory('week-chart'); usagePeriod = 'day'; followCurrentUsage = true; showView('activity'); });
$('back-usage-overview').addEventListener('click', () => { showView('overview'); $('open-usage').focus({ preventScroll: true }); });
$('open-activity').addEventListener('click', () => { clearChartHistory('activity-chart'); activityPeriod = 'day'; followCurrentPeriod = true; showView('exercise'); });
$('back-overview').addEventListener('click', () => { showView('overview'); $('open-activity').focus({ preventScroll: true }); });
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => { clearChartHistory('activity-chart'); activityPeriod = button.dataset.period; renderActivity(); }));
for (const [id, offset] of [['activity-prev', -1], ['activity-next', 1]]) $(id).addEventListener('click', () => {
  const next = shiftPeriod(activityPeriod, activityDate, offset);
  if (dateKey(next) > dateKey(new Date())) return;
  activityDate = next; followCurrentPeriod = dateKey(next) === dateKey(periodStart(activityPeriod, new Date())); renderActivity();
});
$('activity-current').addEventListener('click', () => { followCurrentPeriod = true; renderActivity(); });
document.querySelectorAll('[data-usage-period]').forEach(button => button.addEventListener('click', () => { clearChartHistory('week-chart'); usagePeriod = button.dataset.usagePeriod; renderHistory(); }));
for (const [id, offset] of [['usage-prev', -1], ['usage-next', 1]]) $(id).addEventListener('click', () => {
  const next = shiftPeriod(usagePeriod, usageDate, offset);
  if (dateKey(next) > dateKey(new Date())) return;
  usageDate = next; followCurrentUsage = dateKey(next) === dateKey(periodStart(usagePeriod, new Date())); renderHistory();
});
$('usage-current').addEventListener('click', () => { followCurrentUsage = true; renderHistory(); });
$('app-usage').addEventListener('click', event => {
  const row = event.target.closest('[data-usage-app]');
  if (!row) return;
  clearChartHistory('app-detail-chart'); selectedUsageApp = { id: row.dataset.usageApp, name: row.dataset.appName };
  appPeriod = usagePeriod; appDate = new Date(usageDate); followCurrentApp = followCurrentUsage;
  usageScroll = window.scrollY; appDetailSignature = '';
  showView('app-detail'); $('app-detail-name').focus({ preventScroll: true });
});
$('back-app-usage').addEventListener('click', () => {
  showView('activity'); window.scrollTo(0, usageScroll);
  [...$('app-usage').querySelectorAll('[data-usage-app]')].find(row => row.dataset.usageApp === selectedUsageApp?.id)?.focus({ preventScroll: true });
});
document.querySelectorAll('[data-app-period]').forEach(button => button.addEventListener('click', () => { clearChartHistory('app-detail-chart'); appPeriod = button.dataset.appPeriod; renderAppDetail(); }));
for (const [id, offset] of [['app-detail-prev', -1], ['app-detail-next', 1]]) $(id).addEventListener('click', () => {
  const next = shiftPeriod(appPeriod, appDate, offset);
  if (dateKey(next) > dateKey(new Date())) return;
  appDate = next; followCurrentApp = dateKey(next) === dateKey(periodStart(appPeriod, new Date())); renderAppDetail();
});
$('app-detail-current').addEventListener('click', () => { followCurrentApp = true; renderAppDetail(); });
$('activity-action-list').addEventListener('click', event => {
  const row = event.target.closest('[data-history-action]');
  if (!row) return;
  clearChartHistory('action-detail-chart'); selectedAction = row.dataset.historyAction;
  actionPeriod = activityPeriod; actionDate = new Date(activityDate); followCurrentAction = followCurrentPeriod;
  actionListScroll = window.scrollY; actionDetailSignature = '';
  showView('action-detail'); $('action-detail-name').focus({ preventScroll: true });
});
$('back-action-list').addEventListener('click', () => {
  showView('exercise'); window.scrollTo(0, actionListScroll);
  [...$('activity-action-list').querySelectorAll('[data-history-action]')].find(row => row.dataset.historyAction === selectedAction)?.focus({ preventScroll: true });
});
document.querySelectorAll('[data-action-period]').forEach(button => button.addEventListener('click', () => { clearChartHistory('action-detail-chart'); actionPeriod = button.dataset.actionPeriod; renderActionDetail(); }));
for (const [id, offset] of [['action-detail-prev', -1], ['action-detail-next', 1]]) $(id).addEventListener('click', () => {
  const next = shiftPeriod(actionPeriod, actionDate, offset);
  if (dateKey(next) > dateKey(new Date())) return;
  actionDate = next; followCurrentAction = dateKey(next) === dateKey(periodStart(actionPeriod, new Date())); renderActionDetail();
});
$('action-detail-current').addEventListener('click', () => { followCurrentAction = true; renderActionDetail(); });
function renderChartBack(chartId) {
  const previous = chartHistory.get(chartId)?.at(-1), button = $(`${chartId}-back`);
  button.hidden = !previous;
  if (!previous) return;
  const name = { day: '日', week: '周', month: '月', year: '年' }[previous.period];
  button.textContent = `← 返回上一层（${name}视图）`;
  button.title = `返回 ${periodLabel(previous.period, previous.date)}`;
}
function clearChartHistory(chartId) {
  chartHistory.delete(chartId); renderChartBack(chartId);
}
// Each view owns its drill-down path, independent of the list/detail navigation.
for (const [chartId, labelId, current, navigate] of [
  ['week-chart', 'usage-period-label', () => [usagePeriod, usageDate], (period, date) => { usagePeriod = period; usageDate = date; followCurrentUsage = false; renderHistory(); }],
  ['activity-chart', 'activity-period-label', () => [activityPeriod, activityDate], (period, date) => { activityPeriod = period; activityDate = date; followCurrentPeriod = false; renderActivity(); }],
  ['app-detail-chart', 'app-detail-period-label', () => [appPeriod, appDate], (period, date) => { appPeriod = period; appDate = date; followCurrentApp = false; renderAppDetail(); }],
  ['action-detail-chart', 'action-detail-period-label', () => [actionPeriod, actionDate], (period, date) => { actionPeriod = period; actionDate = date; followCurrentAction = false; renderActionDetail(); }]
]) {
  const drillTo = (targetPeriod, date, key = null) => {
    if (dateKey(date) > dateKey(new Date())) return;
    const [period, previousDate] = current(), history = chartHistory.get(chartId) || [];
    if (period === targetPeriod && dateKey(previousDate) === dateKey(date)) return;
    // Moving between days keeps the same parent week/month instead of adding daily detours.
    if (period !== targetPeriod || !history.length) history.push({ period, date: new Date(previousDate), scroll: window.scrollY, key });
    chartHistory.set(chartId, history);
    navigate(targetPeriod, date);
    $(labelId).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  $(labelId).addEventListener('click', () => {
    const [, date] = current();
    calendarDate = periodStart('month', date); calendarSelected = dateKey(date);
    calendarSelect = selected => drillTo('day', selected);
    renderCalendar(); $('history-calendar').showModal();
    ($('calendar-days').querySelector('[aria-pressed="true"]') || $('calendar-days').querySelector('button:not(:disabled)')).focus();
  });
  $(chartId).addEventListener('click', event => {
    const button = event.target.closest('[data-chart-date]');
    if (!button || button.disabled || !$(chartId).contains(button)) return;
    const [year, month, day] = button.dataset.chartDate.split('-').map(Number);
    drillTo(button.dataset.chartPeriod, new Date(year, month - 1, day, 12), button.dataset.chartDate);
  });
  $(`${chartId}-back`).addEventListener('click', () => {
    const previous = chartHistory.get(chartId)?.pop();
    if (!previous) return;
    navigate(previous.period, previous.date);
    renderChartBack(chartId);
    window.scrollTo(0, previous.scroll);
    const bar = [...$(chartId).children].find(button => button.dataset.chartDate === previous.key);
    (bar || $(labelId)).focus({ preventScroll: true });
  });
}
function renderCalendar() {
  const today = new Date(), year = calendarDate.getFullYear(), month = calendarDate.getMonth();
  $('calendar-year').max = today.getFullYear(); $('calendar-year').value = year;
  $('calendar-month').value = month;
  [...$('calendar-month').options].forEach(option => { option.disabled = year === today.getFullYear() && Number(option.value) > today.getMonth(); });
  $('calendar-prev').disabled = year === 1900 && month === 0;
  $('calendar-next').disabled = dateKey(shiftPeriod('month', calendarDate, 1)) > dateKey(today);
  const offset = (calendarDate.getDay() + 6) % 7;
  const end = shiftPeriod('month', calendarDate, 1); end.setDate(0);
  $('calendar-days').innerHTML = '<span aria-hidden="true"></span>'.repeat(offset) + Array.from({ length: end.getDate() }, (_, i) => {
    const date = new Date(calendarDate); date.setDate(i + 1);
    const key = dateKey(date), future = key > dateKey(today);
    return `<button type="button" data-calendar-date="${key}" aria-label="${year}年${month + 1}月${i + 1}日" aria-pressed="${key === calendarSelected}" ${key === dateKey(today) ? 'aria-current="date"' : ''} ${future ? 'disabled' : ''}>${i + 1}</button>`;
  }).join('');
}
$('calendar-month').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}月</option>`).join('');
for (const id of ['calendar-year', 'calendar-month']) $(id).addEventListener('change', () => {
  const today = new Date(), year = Number($('calendar-year').value), month = Number($('calendar-month').value);
  if (!Number.isInteger(year) || year < 1900 || year > today.getFullYear()) { renderCalendar(); return; }
  calendarDate.setDate(1); calendarDate.setFullYear(year, year === today.getFullYear() ? Math.min(month, today.getMonth()) : month, 1);
  renderCalendar();
});
for (const [id, offset] of [['calendar-prev', -1], ['calendar-next', 1]]) $(id).addEventListener('click', () => {
  calendarDate = shiftPeriod('month', calendarDate, offset); renderCalendar();
});
function chooseCalendarDate(date) {
  if (dateKey(date) > dateKey(new Date())) return;
  $('history-calendar').close(); calendarSelect?.(date);
}
$('calendar-days').addEventListener('click', event => {
  const button = event.target.closest('[data-calendar-date]');
  if (!button || button.disabled) return;
  const date = new Date(calendarDate); date.setDate(Number(button.dataset.calendarDate.slice(-2)));
  chooseCalendarDate(date);
});
$('calendar-today').addEventListener('click', () => chooseCalendarDate(new Date()));
$('calendar-close').addEventListener('click', () => $('history-calendar').close());
$('history-calendar').addEventListener('click', event => { if (event.target === $('history-calendar')) {
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
} });
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => save({ scenario: button.dataset.scenario, activeActionId: 'auto' })));
document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => save({ monitorMode: button.dataset.scope })));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { const [usageLimit, actionCountPerSession] = button.dataset.preset.split(',').map(Number); save({ usageLimit, actionCountPerSession }); }));
$('action-select').addEventListener('change', event => save({ activeActionId: event.target.value }));
$('pause-button').addEventListener('click', () => save(state.settings.paused ? { paused: false } : { paused: true, pausedUntil: pauseDeadline($('pause-duration').value) }));
$('warn-seconds').addEventListener('change', e => save({ warnSeconds: Number(e.target.value) }));
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
$('break-reset-seconds').addEventListener('change', e => save({ breakResetSeconds: Number(e.target.value) }));
$('idle-seconds').addEventListener('change', e => save({ idleSeconds: Number(e.target.value) }));
$('launch-login').addEventListener('change', e => save({ launchAtLogin: e.target.checked }));
$('app-choices').addEventListener('change', e => { if (!e.target.dataset.app) return; const selected = new Set(state.settings.selectedApps); if (e.target.checked) selected.add(e.target.dataset.app); else selected.delete(e.target.dataset.app); save({ selectedApps: [...selected] }); });
$('quiet-app-choices').addEventListener('change', e => { if (!e.target.dataset.quietApp) return; const selected = new Set(state.settings.quietApps); if (e.target.checked) selected.add(e.target.dataset.quietApp); else selected.delete(e.target.dataset.quietApp); save({ quietApps: [...selected] }); });
$('site-choices').addEventListener('change', e => { if (e.target.dataset.site) save({ sns: { ...state.settings.sns, [e.target.dataset.site]: e.target.checked } }); });
$('custom-enabled').addEventListener('change', e => save({ customEnabled: e.target.checked }));
$('custom-domains').addEventListener('change', e => { const values = normalizeDomainList(e.target.value); e.target.value = values.join('\n'); save({ customDomains: values }); });
$('preview-reminder').addEventListener('click', () => api.previewReminder());
$('camera-privacy').addEventListener('click', () => api.cameraPrivacy());
$('automation-privacy').addEventListener('click', () => api.automationPrivacy());
$('export-data').addEventListener('click', async () => { try { if (await api.exportData()) toast('记录已导出'); } catch (e) { toast(e.message); } });
api.onStatus(render);
api.status().then(render)
  // Show connection errors too, instead of leaving a failed startup invisible.
  .catch(e => toast(`连接失败：${e.message}`))
  .then(() => api.dashboardReady())
  .catch(e => toast(`窗口初始化失败：${e.message}`));
