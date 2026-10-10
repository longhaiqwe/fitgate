// Popup 控制面板交互逻辑 (紧凑高频看板 + 抽屉设置视图)
import { getSettings, saveSettings, getTodayStats, getAccumulatedUsage } from '../shared/storage.js';
import { MESSAGE_TYPES, WORKOUT_PRESETS } from '../shared/constants.js';
import { SCENARIOS, ACTIONS, getActionsByScenario, getActionById } from '../shared/actions-data.js';
import { SNS_SERVICES, normalizeDomainList, normalizeDomainEntry, matchTarget } from '../shared/target-rules.js';
import {
  parseUsageLimitInput,
  parseStretchSecondsInput,
  parseSquatTargetInput,
  parseActionCountInput,
  formatUsageLimit,
  formatStretchSeconds,
  formatSquatTarget,
  formatActionCount
} from '../shared/duration-parser.js';

// DOM 元素引用 - 视图切换
const viewMain = document.getElementById('view-main');
const viewSettings = document.getElementById('view-settings');
const btnGotoSettings = document.getElementById('btn-goto-settings');
const btnBackToMain = document.getElementById('btn-back-to-main');

// 主视图元素
const statsWorkoutCount = document.getElementById('stats-workout-count');
const valCurrentUsage = document.getElementById('val-current-usage');
const usageProgressFill = document.getElementById('usage-progress-fill');
const usageRemainingHint = document.getElementById('usage-remaining-hint');
const segmentBtns = document.querySelectorAll('.segment-btn');
const btnOpenWorkout = document.getElementById('btn-open-workout');

const actionStripTitle = document.getElementById('action-strip-title');
const selectActiveAction = document.getElementById('select-active-action');

// 当前网页感知条元素
const currentSiteBar = document.getElementById('current-site-bar');
const siteStatusDot = document.getElementById('site-status-dot');
const siteStatusText = document.getElementById('site-status-text');
const btnSiteQuickAction = document.getElementById('btn-site-quick-action');

// 设置视图元素
const presetButtons = document.querySelectorAll('.preset-pill-btn');
const inputUsageLimitText = document.getElementById('input-usage-limit-text');
const inputActionCountText = document.getElementById('input-action-count-text');
const cameraModeItem = document.getElementById('camera-mode-item');
const selectCameraMode = document.getElementById('select-camera-mode');
const valCameraMode = document.getElementById('val-camera-mode');
const squatTargetItem = document.getElementById('squat-target-item');
const inputSquatTargetText = document.getElementById('input-squat-target-text');
const strictModeItem = document.getElementById('strict-mode-item');
const selectStrictMode = document.getElementById('select-strict-mode');
const valStrictMode = document.getElementById('val-strict-mode');
const stretchSecondsItem = document.getElementById('stretch-seconds-item');
const inputStretchSecondsText = document.getElementById('input-stretch-seconds-text');

// 目标受控网站元素
const btnToggleTargets = document.getElementById('btn-toggle-targets');
const snsList = document.getElementById('sns-list');
const checkCustomEnabled = document.getElementById('check-custom-enabled');
const textareaCustomDomains = document.getElementById('textarea-custom-domains');
const toastMsg = document.getElementById('toast-msg');

let currentSettings = null;
let currentUsage = null;
let currentActiveTabDomain = '';

function showToast(text) {
  toastMsg.textContent = text;
  setTimeout(() => {
    if (toastMsg.textContent === text) toastMsg.textContent = '';
  }, 2000);
}

/**
 * 绑定数值参数的手动输入框与交互逻辑
 * 支持键盘输入、Enter 确认、Esc 还原，以及上下方向键步进微调
 */
function bindManualInput({
  textInput,
  parseFn,
  formatFn,
  getCurrentVal,
  onValidChange,
  successMsg,
  step = 1,
  min = 1,
  max = 180
}) {
  if (!textInput) return;

  // 聚焦时全选文本，便于快速键入替换
  textInput.addEventListener('focus', () => {
    textInput.select();
  });

  const commitValue = async (valCandidate) => {
    const parsed = parseFn(valCandidate);

    if (parsed === null) {
      showToast('输入格式无效，已恢复原值');
      textInput.value = formatFn(getCurrentVal());
      return;
    }

    textInput.value = formatFn(parsed);
    await onValidChange(parsed);
    if (successMsg) {
      showToast(successMsg(parsed));
    }
  };

  // 支持回车完成提交，Esc 取消并恢复原值，上下方向键微调步进
  textInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      textInput.blur();
    } else if (e.key === 'Escape') {
      textInput.value = formatFn(getCurrentVal());
      textInput.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFn(textInput.value) ?? getCurrentVal();
      const next = Math.min(max, current + step);
      await commitValue(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFn(textInput.value) ?? getCurrentVal();
      const prev = Math.max(min, current - step);
      await commitValue(prev);
    }
  });

  // 输入完成失焦时触发解析
  textInput.addEventListener('change', async () => {
    await commitValue(textInput.value);
  });
}

/**
 * 视图切换控制
 */
function switchView(viewName) {
  if (viewName === 'settings') {
    viewMain.style.display = 'none';
    viewSettings.style.display = 'block';
  } else {
    viewSettings.style.display = 'none';
    viewMain.style.display = 'block';
  }
}

/**
 * 更新主视图中的动作模式精简条与下拉框
 */
function updateActionSection() {
  const scenarioKey = currentSettings.scenario || 'office_seated';
  const actions = getActionsByScenario(scenarioKey);
  const prevActionId = currentSettings.activeActionId || 'auto';

  // 重新填充紧凑下拉框
  selectActiveAction.innerHTML = '<option value="auto">🎲 智能轮换</option>';

  const categoryGroups = [
    { key: 'home_active', label: '🏠 居家大动作' },
    { key: 'office_standing', label: '🚶 办公室站姿' },
    { key: 'office_seated', label: '🪑 办公室坐姿' }
  ];

  categoryGroups.forEach(({ key, label }) => {
    const groupActions = actions.filter((act) => act.scenario === key);
    if (!groupActions.length) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = `${label} (${groupActions.length})`;
    groupActions.forEach((act) => {
      const opt = document.createElement('option');
      opt.value = act.id;
      opt.textContent = act.name;
      optgroup.appendChild(opt);
    });
    selectActiveAction.appendChild(optgroup);
  });

  const validOption = Array.from(selectActiveAction.options).some((o) => o.value === prevActionId);
  selectActiveAction.value = validOption ? prevActionId : 'auto';

  // 更新精简条标题显示
  renderActionStripText();
  updateParamVisibility();
}

/**
 * 渲染精简动作条上的文本
 */
function renderActionStripText() {
  const currentActionId = selectActiveAction.value;
  let actionToDisplay = null;

  if (currentActionId === 'auto') {
    const list = getActionsByScenario(currentSettings.scenario);
    actionToDisplay = list[0] || ACTIONS[0];
    actionStripTitle.textContent = `🎲 智能轮换: ${actionToDisplay?.name || '全身舒展'}`;
  } else {
    actionToDisplay = getActionById(currentActionId);
    actionStripTitle.textContent = `📌 固定: ${actionToDisplay?.name || '指定动作'}`;
  }
}

/**
 * 根据所选场景或动作动态展示/隐藏特定规则参数
 */
function updateParamVisibility() {
  const selectedAction = selectActiveAction.value;
  const isSpecificSquat = selectedAction === 'home_squats';
  const isHomeAuto = currentSettings.scenario === 'home_active' && selectedAction === 'auto';

  // 4 项规则卡片保持固定常驻展示
  squatTargetItem.style.display = '';
  stretchSecondsItem.style.display = '';

  // 仅深蹲相关模式下展示深蹲判定深度下拉菜单
  if (isSpecificSquat || isHomeAuto) {
    strictModeItem.style.display = '';
  } else {
    strictModeItem.style.display = 'none';
  }
}

const snsInputs = new Map();

function allTargetInputs() {
  return [...snsInputs.values(), checkCustomEnabled];
}

function updateToggleTargetsBtnLabel() {
  const inputs = allTargetInputs();
  const anyChecked = inputs.some((input) => input.checked);
  btnToggleTargets.textContent = anyChecked ? '取消全选' : '全选';
}

/**
 * 渲染目标网站管理卡片 (设置视图)
 */
function renderTargetsSection() {
  if (!snsList) return;
  snsList.innerHTML = '';
  snsInputs.clear();

  const currentSns = currentSettings.sns || {};

  SNS_SERVICES.forEach((service) => {
    const label = document.createElement('label');
    label.className = service.wide ? 'sns-item sns-item--wide' : 'sns-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'sns-checkbox';
    input.dataset.snsKey = service.key;
    input.checked = currentSns[service.key] !== false;

    const span = document.createElement('span');
    span.textContent = service.label;

    label.append(input, span);
    snsList.appendChild(label);
    snsInputs.set(service.key, input);

    input.addEventListener('change', async () => {
      if (!currentSettings.sns) currentSettings.sns = {};
      currentSettings.sns[service.key] = input.checked;
      await saveSettings(currentSettings);
      updateToggleTargetsBtnLabel();
      checkCurrentTabTargetStatus();
    });
  });

  // 其他网站开关状态
  checkCustomEnabled.checked = currentSettings.customEnabled !== false;

  // 其他网站域名输入框
  const customDomains = Array.isArray(currentSettings.customDomains) ? currentSettings.customDomains : [];
  textareaCustomDomains.value = customDomains.join('\n');

  updateToggleTargetsBtnLabel();
}

/**
 * 渲染当前周期累计使用时长与进度条
 */
function renderUsageProgress(usage, usageLimitMinutes) {
  if (!valCurrentUsage || !usageProgressFill) return;
  const seconds = usage?.seconds || 0;
  const limitMinutes = usageLimitMinutes || 20;
  const limitSeconds = limitMinutes * 60;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  valCurrentUsage.textContent = `${timeStr} / ${limitMinutes}分钟`;

  const percent = Math.min(100, Math.round((seconds / limitSeconds) * 100));
  usageProgressFill.style.width = `${percent}%`;

  // 进度提示文案
  const remainSeconds = Math.max(0, limitSeconds - seconds);
  const remainMins = Math.ceil(remainSeconds / 60);
  if (remainSeconds <= 0) {
    usageRemainingHint.textContent = '⚠️ 累计时长已达上限，锁屏活动身体准备中';
  } else {
    usageRemainingHint.textContent = `跨受控网站统一累计 · 还有约 ${remainMins} 分钟触发锁屏`;
  }
}

/**
 * 检测当前活跃标签页受控状态
 */
async function checkCurrentTabTargetStatus() {
  if (!chrome.tabs || !chrome.tabs.query) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      siteStatusDot.className = 'site-status-dot inactive';
      siteStatusText.textContent = '当前未处于任何受控网页';
      btnSiteQuickAction.style.display = 'none';
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(tab.url);
    } catch {
      siteStatusDot.className = 'site-status-dot inactive';
      siteStatusText.textContent = '系统页面（不受控）';
      btnSiteQuickAction.style.display = 'none';
      return;
    }

    // 排除非 HTTP/HTTPS 页面
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      siteStatusDot.className = 'site-status-dot inactive';
      siteStatusText.textContent = '内置页面（不受控）';
      btnSiteQuickAction.style.display = 'none';
      return;
    }

    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;
    currentActiveTabDomain = normalizeDomainEntry(hostname);

    const match = matchTarget(hostname, pathname, currentSettings);
    if (match) {
      siteStatusDot.className = 'site-status-dot active';
      siteStatusText.textContent = `已受控 (${match.label || currentActiveTabDomain}) 计时生效中`;
      btnSiteQuickAction.style.display = 'none';
    } else {
      siteStatusDot.className = 'site-status-dot inactive';
      siteStatusText.textContent = `当前: ${currentActiveTabDomain}`;
      btnSiteQuickAction.style.display = 'inline-block';
      btnSiteQuickAction.textContent = '+ 加入受控';
    }
  } catch (_e) {
    siteStatusDot.className = 'site-status-dot inactive';
    siteStatusText.textContent = '浏览器页面';
    btnSiteQuickAction.style.display = 'none';
  }
}

/**
 * 初始化加载
 */
async function init() {
  // 1. 加载今日统计
  const { todayCount } = await getTodayStats();
  statsWorkoutCount.textContent = `${todayCount} 次`;

  // 2. 加载设置与当前累计时长
  currentSettings = await getSettings();
  currentUsage = await getAccumulatedUsage();
  renderUsageProgress(currentUsage, currentSettings.usageLimit);

  // 3. 视图切换监听
  btnGotoSettings.addEventListener('click', () => switchView('settings'));
  btnBackToMain.addEventListener('click', () => switchView('main'));

  // 4. 场景分段胶囊按钮初始化
  let scenario = currentSettings.scenario || 'office_seated';
  if (scenario === 'all' || !SCENARIOS[scenario]) {
    scenario = 'home_active';
    currentSettings.scenario = 'home_active';
    await saveSettings(currentSettings);
  }

  segmentBtns.forEach((btn) => {
    if (btn.getAttribute('data-scenario') === scenario) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', async () => {
      const targetScenario = btn.getAttribute('data-scenario');
      segmentBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      currentSettings.scenario = targetScenario;
      currentSettings.activeActionId = 'auto'; // 切换场景时重置为自动轮换
      await saveSettings(currentSettings);

      updateActionSection();
      showToast(`已切换至：${SCENARIOS[targetScenario]?.name || ''}`);
    });
  });

  // 5. 监听动作下拉框选择
  selectActiveAction.addEventListener('change', async (e) => {
    currentSettings.activeActionId = e.target.value;
    await saveSettings(currentSettings);
    renderActionStripText();
    updateParamVisibility();
    showToast('解锁动作已更新');
  });

  // 6. 设置面板输入框数值初始化 (输入框纯数字，单位由外部固定标签显示)
  const usageLimitVal = currentSettings.usageLimit || 20;
  inputUsageLimitText.value = String(usageLimitVal);

  const actionCountVal = currentSettings.actionCountPerSession || 1;
  inputActionCountText.value = String(actionCountVal);

  const squatTargetVal = currentSettings.squatTarget || 10;
  inputSquatTargetText.value = String(squatTargetVal);

  const stretchSecVal = currentSettings.stretchSeconds || 30;
  inputStretchSecondsText.value = String(stretchSecVal);

  selectStrictMode.value = String(Boolean(currentSettings.strictMode));
  valStrictMode.textContent = currentSettings.strictMode ? '严格 (110°)' : '适中 (120°)';

  const cameraEnabled = currentSettings.cameraEnabled !== false;
  selectCameraMode.value = String(cameraEnabled);
  valCameraMode.textContent = cameraEnabled ? '摄像头 AI 判定' : '无摄像头纯计时';

  // 快捷预设按钮点击事件
  presetButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const presetId = btn.getAttribute('data-preset');
      const preset = WORKOUT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      currentSettings.usageLimit = preset.usageLimit;
      currentSettings.actionCountPerSession = preset.actionCount;

      inputUsageLimitText.value = String(preset.usageLimit);
      inputActionCountText.value = String(preset.actionCount);

      renderUsageProgress(currentUsage, preset.usageLimit);
      await saveSettings(currentSettings);
      showToast(`已应用预设：${preset.name} (${preset.label})`);
    });
  });

  // 点击输入组合外框聚焦内部输入框
  document.querySelectorAll('.item-input-group').forEach((group) => {
    group.addEventListener('click', () => {
      const input = group.querySelector('.item-val-input');
      input?.focus();
    });
  });

  // 7. 渲染动作与受控目标网站列表
  updateActionSection();
  renderTargetsSection();

  // 8. 监听文本输入框手动输入、键盘上下键步进与存储
  bindManualInput({
    textInput: inputUsageLimitText,
    parseFn: parseUsageLimitInput,
    formatFn: (val) => String(val),
    getCurrentVal: () => currentSettings.usageLimit || 20,
    onValidChange: async (val) => {
      currentSettings.usageLimit = val;
      renderUsageProgress(currentUsage, val);
      await saveSettings(currentSettings);
    },
    successMsg: (val) => `累计上限已设为 ${formatUsageLimit(val)}`,
    step: 5,
    min: 1,
    max: 180
  });

  bindManualInput({
    textInput: inputActionCountText,
    parseFn: parseActionCountInput,
    formatFn: (val) => String(val),
    getCurrentVal: () => currentSettings.actionCountPerSession || 1,
    onValidChange: async (val) => {
      currentSettings.actionCountPerSession = val;
      await saveSettings(currentSettings);
    },
    successMsg: (val) => `动作组数已设为 ${formatActionCount(val)}`,
    step: 1,
    min: 1,
    max: 5
  });

  bindManualInput({
    textInput: inputSquatTargetText,
    parseFn: parseSquatTargetInput,
    formatFn: (val) => String(val),
    getCurrentVal: () => currentSettings.squatTarget || 10,
    onValidChange: async (val) => {
      currentSettings.squatTarget = val;
      await saveSettings(currentSettings);
    },
    successMsg: (val) => `深蹲目标已设为 ${formatSquatTarget(val)}`,
    step: 5,
    min: 1,
    max: 100
  });

  bindManualInput({
    textInput: inputStretchSecondsText,
    parseFn: parseStretchSecondsInput,
    formatFn: (val) => String(val),
    getCurrentVal: () => currentSettings.stretchSeconds || 30,
    onValidChange: async (val) => {
      currentSettings.stretchSeconds = val;
      await saveSettings(currentSettings);
    },
    successMsg: (val) => `拉伸时长已设为 ${formatStretchSeconds(val)}`,
    step: 5,
    min: 5,
    max: 120
  });

  selectStrictMode.addEventListener('change', async (e) => {
    const isStrict = e.target.value === 'true';
    currentSettings.strictMode = isStrict;
    valStrictMode.textContent = isStrict ? '严格 (110°)' : '适中 (120°)';
    await saveSettings(currentSettings);
    showToast('深蹲深度已更新');
  });

  selectCameraMode.addEventListener('change', async (e) => {
    const isCam = e.target.value === 'true';
    currentSettings.cameraEnabled = isCam;
    valCameraMode.textContent = isCam ? '摄像头 AI 判定' : '无摄像头纯计时';
    await saveSettings(currentSettings);
    showToast(isCam ? '已启用摄像头 AI 判定' : '已切换为无摄像头纯计时');
  });

  // 9. 全选 / 取消全选操作
  btnToggleTargets.addEventListener('click', async () => {
    const inputs = allTargetInputs();
    const anyChecked = inputs.some((input) => input.checked);
    const targetState = !anyChecked;

    if (!currentSettings.sns) currentSettings.sns = {};
    SNS_SERVICES.forEach((service) => {
      currentSettings.sns[service.key] = targetState;
      const cb = snsInputs.get(service.key);
      if (cb) cb.checked = targetState;
    });

    currentSettings.customEnabled = targetState;
    checkCustomEnabled.checked = targetState;

    await saveSettings(currentSettings);
    updateToggleTargetsBtnLabel();
    checkCurrentTabTargetStatus();
    showToast(targetState ? '已全部启用目标网站' : '已取消全选');
  });

  // 10. 自定义其他网站
  checkCustomEnabled.addEventListener('change', async () => {
    currentSettings.customEnabled = checkCustomEnabled.checked;
    await saveSettings(currentSettings);
    updateToggleTargetsBtnLabel();
    checkCurrentTabTargetStatus();
  });

  let customSaveTimer = null;
  textareaCustomDomains.addEventListener('input', () => {
    clearTimeout(customSaveTimer);
    customSaveTimer = setTimeout(async () => {
      const raw = textareaCustomDomains.value;
      const normalized = normalizeDomainList(raw);
      currentSettings.customDomains = normalized;
      await saveSettings(currentSettings);
      checkCurrentTabTargetStatus();
    }, 600);
  });

  textareaCustomDomains.addEventListener('blur', async () => {
    clearTimeout(customSaveTimer);
    const raw = textareaCustomDomains.value;
    const normalized = normalizeDomainList(raw);
    currentSettings.customDomains = normalized;
    textareaCustomDomains.value = normalized.join('\n');
    await saveSettings(currentSettings);
    checkCurrentTabTargetStatus();
  });

  // 11. 快捷加入受控按钮
  btnSiteQuickAction.addEventListener('click', async () => {
    if (!currentActiveTabDomain) return;
    const existing = Array.isArray(currentSettings.customDomains) ? currentSettings.customDomains : [];
    if (!existing.includes(currentActiveTabDomain)) {
      existing.push(currentActiveTabDomain);
      currentSettings.customDomains = existing;
      currentSettings.customEnabled = true;
      checkCustomEnabled.checked = true;
      textareaCustomDomains.value = existing.join('\n');
      await saveSettings(currentSettings);
      showToast(`已将 ${currentActiveTabDomain} 加入受控`);
      checkCurrentTabTargetStatus();
    }
  });

  // 12. 打开伴练测试
  btnOpenWorkout.addEventListener('click', () => {
    const selectedAction = selectActiveAction.value !== 'auto'
      ? selectActiveAction.value
      : undefined;
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OPEN_WORKOUT,
      payload: { actionId: selectedAction }
    });
  });

  // 13. 检测当前网页状态
  checkCurrentTabTargetStatus();

  // 14. 启动控制面板实时累计时长轮询刷新
  const refreshTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      currentUsage = await getAccumulatedUsage();
      if (currentSettings) {
        renderUsageProgress(currentUsage, currentSettings.usageLimit);
      }
    } catch {}
  }, 1000);

  window.addEventListener('unload', () => {
    clearInterval(refreshTimer);
  });
}

document.addEventListener('DOMContentLoaded', init);
