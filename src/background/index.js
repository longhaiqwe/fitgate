// Background Service Worker 集中式计时调度与跨标签中继
import { MESSAGE_TYPES } from '../shared/constants.js';
import {
  getSettings,
  getDomainUsage,
  saveDomainUsage,
  resetDomainUsage,
  incrementWorkoutCount
} from '../shared/storage.js';

console.log('[FitGate] Background Service Worker 启动');

/**
 * 提取 URL 的纯主域名 (例如 "x.com" 或 "twitter.com")
 */
function extractDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    // 匹配 x.com, twitter.com 等
    if (host === 'x.com' || host.endsWith('.x.com')) return 'x.com';
    if (host === 'twitter.com' || host.endsWith('.twitter.com')) return 'twitter.com';
    return host;
  } catch {
    return '';
  }
}

/**
 * 广播消息给所有匹配指定域名的活动标签页
 */
async function broadcastToDomainTabs(domain, message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const tabDomain = extractDomain(tab.url);
    if (tabDomain === domain && tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // 忽略未注入 content script 或非活动 tab 的通信报错
      });
    }
  }
}

// 监听运行时消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, payload } = request || {};

  // 1. 处理来自 Content Script 的心跳通知
  if (type === MESSAGE_TYPES.HEARTBEAT) {
    handleHeartbeat(sender).then(sendResponse);
    return true; // 异步响应
  }

  // 2. 处理打开健身房请求
  if (type === MESSAGE_TYPES.OPEN_WORKOUT) {
    const workoutUrl = chrome.runtime.getURL('src/workout/workout.html');
    chrome.tabs.create({ url: workoutUrl });
    sendResponse({ success: true });
    return false;
  }

  // 3. 处理健身达标解锁请求
  if (type === MESSAGE_TYPES.WORKOUT_COMPLETED) {
    handleWorkoutCompleted(payload).then(sendResponse);
    return true; // 异步响应
  }

  // 4. 处理 Popup 查询状态请求
  if (type === MESSAGE_TYPES.GET_STATUS) {
    handleGetStatus().then(sendResponse);
    return true;
  }

  return false;
});

/**
 * 处理心跳计时
 */
async function handleHeartbeat(sender) {
  if (!sender || !sender.tab || !sender.tab.url) {
    return { status: 'ignored' };
  }

  const domain = extractDomain(sender.tab.url);
  const settings = await getSettings();

  // 检查是否属于受控域名
  const isTarget = settings.targetDomains.some((d) => d === domain || domain.endsWith(`.${d}`));
  if (!isTarget) {
    return { status: 'not_target' };
  }

  const usage = await getDomainUsage(domain);

  // 如果已经处于锁定状态，确保通知当前 Tab 锁屏
  if (usage.isLocked) {
    return { status: 'locked', seconds: usage.seconds, limit: settings.usageLimit * 60 };
  }

  // 递增已用时间（秒）
  const newSeconds = usage.seconds + 1;
  const limitSeconds = settings.usageLimit * 60;

  if (newSeconds >= limitSeconds) {
    // 达到阈值，触发锁定
    await saveDomainUsage(domain, { seconds: newSeconds, isLocked: true });
    // 向所有该域名的标签页广播锁定消息
    await broadcastToDomainTabs(domain, {
      type: MESSAGE_TYPES.LOCK_PAGE,
      payload: { domain, seconds: newSeconds, limit: limitSeconds }
    });
    return { status: 'locked_now', seconds: newSeconds, limit: limitSeconds };
  }

  // 正常累加时间
  await saveDomainUsage(domain, { seconds: newSeconds, isLocked: false });
  return { status: 'ok', seconds: newSeconds, limit: limitSeconds };
}

/**
 * 处理运动完成解锁
 */
async function handleWorkoutCompleted(payload) {
  const squatCount = payload?.squatCount || 10;
  const settings = await getSettings();

  // 记录今日健身成就
  await incrementWorkoutCount(squatCount);

  // 解锁所有受控域名（重置会话计时与锁定状态）
  for (const domain of settings.targetDomains) {
    await resetDomainUsage(domain);
    await broadcastToDomainTabs(domain, {
      type: MESSAGE_TYPES.UNLOCK_PAGE,
      payload: { domain }
    });
  }

  return { success: true };
}

/**
 * 获取当前全局运行状态（供 Popup 显示）
 */
async function handleGetStatus() {
  const settings = await getSettings();
  const domainStates = {};

  for (const domain of settings.targetDomains) {
    domainStates[domain] = await getDomainUsage(domain);
  }

  return {
    settings,
    domainStates
  };
}
