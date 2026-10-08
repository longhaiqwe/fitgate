// Popup 控制面板交互逻辑
import { getSettings, saveSettings, getTodayStats } from '../shared/storage.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

const inputUsageLimit = document.getElementById('input-usage-limit');
const valUsageLimit = document.getElementById('val-usage-limit');

const inputSquatTarget = document.getElementById('input-squat-target');
const valSquatTarget = document.getElementById('val-squat-target');

const domainTagsList = document.getElementById('domain-tags-list');
const inputNewDomain = document.getElementById('input-new-domain');
const btnAddDomain = document.getElementById('btn-add-domain');

const statsWorkoutCount = document.getElementById('stats-workout-count');
const btnOpenWorkout = document.getElementById('btn-open-workout');
const toastMsg = document.getElementById('toast-msg');

let currentSettings = null;

function showToast(text) {
  toastMsg.textContent = text;
  setTimeout(() => {
    if (toastMsg.textContent === text) toastMsg.textContent = '';
  }, 2000);
}

/**
 * 渲染受控域名标签列表
 */
function renderDomainTags() {
  domainTagsList.innerHTML = '';
  currentSettings.targetDomains.forEach((domain) => {
    const tag = document.createElement('div');
    tag.className = 'domain-tag';
    tag.innerHTML = `
      <span>${domain}</span>
      <span class="remove-btn" data-domain="${domain}">✕</span>
    `;
    domainTagsList.appendChild(tag);
  });

  // 绑定删除按钮
  domainTagsList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const toRemove = e.target.getAttribute('data-domain');
      currentSettings.targetDomains = currentSettings.targetDomains.filter((d) => d !== toRemove);
      await saveSettings(currentSettings);
      renderDomainTags();
      showToast('已移除网站监控');
    });
  });
}

/**
 * 初始化加载
 */
async function init() {
  // 1. 加载今日统计
  const { todayCount } = await getTodayStats();
  statsWorkoutCount.textContent = `${todayCount} 次`;

  // 2. 加载设置
  currentSettings = await getSettings();

  inputUsageLimit.value = currentSettings.usageLimit;
  valUsageLimit.textContent = `${currentSettings.usageLimit} 分钟`;

  inputSquatTarget.value = currentSettings.squatTarget;
  valSquatTarget.textContent = `${currentSettings.squatTarget} 次`;

  renderDomainTags();

  // 3. 监听滑块修改
  inputUsageLimit.addEventListener('input', async (e) => {
    const val = parseInt(e.target.value, 10);
    valUsageLimit.textContent = `${val} 分钟`;
    currentSettings.usageLimit = val;
    await saveSettings(currentSettings);
    showToast('时间限制已保存');
  });

  inputSquatTarget.addEventListener('input', async (e) => {
    const val = parseInt(e.target.value, 10);
    valSquatTarget.textContent = `${val} 次`;
    currentSettings.squatTarget = val;
    await saveSettings(currentSettings);
    showToast('深蹲目标已保存');
  });

  // 4. 添加新受控域名
  btnAddDomain.addEventListener('click', async () => {
    let domain = inputNewDomain.value.trim().toLowerCase();
    if (!domain) return;
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (domain && !currentSettings.targetDomains.includes(domain)) {
      currentSettings.targetDomains.push(domain);
      await saveSettings(currentSettings);
      inputNewDomain.value = '';
      renderDomainTags();
      showToast(`已添加监控: ${domain}`);
    }
  });

  inputNewDomain.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddDomain.click();
    }
  });

  // 5. 立即开启健身房测试
  btnOpenWorkout.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_WORKOUT });
  });
}

document.addEventListener('DOMContentLoaded', init);
