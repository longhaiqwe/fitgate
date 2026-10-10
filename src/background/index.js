import { MESSAGE_TYPES } from '../shared/constants.js';
import { matchTarget } from '../shared/target-rules.js';
import {
  getSettings,
  getAccumulatedUsage,
  saveAccumulatedUsage,
  resetAccumulatedUsage,
  snoozeAccumulatedUsage,
  getDomainUsage,
  saveDomainUsage,
  resetDomainUsage,
  incrementWorkoutCount
} from '../shared/storage.js';

console.log('[FitGate] Background Service Worker 启动');

/**
 * 解析 URL 主机名与路径
 */
function parseUrlParts(urlStr) {
  try {
    const url = new URL(urlStr);
    return {
      hostname: url.hostname.toLowerCase(),
      pathname: url.pathname
    };
  } catch {
    return null;
  }
}

/**
 * 广播消息给所有受控规则命中的活动标签页
 */
async function broadcastToAllTargetTabs(message) {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const parts = parseUrlParts(tab.url);
    if (!parts) continue;
    const matched = matchTarget(parts.hostname, parts.pathname, settings);
    if (matched && tab.id) {
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
    let url = 'src/workout/workout.html';
    if (payload?.actionId) {
      url += `?action=${encodeURIComponent(payload.actionId)}`;
    }
    const workoutUrl = chrome.runtime.getURL(url);
    chrome.tabs.create({ url: workoutUrl });
    sendResponse({ success: true });
    return false;
  }

  // 3. 处理健身达标解锁请求
  if (type === MESSAGE_TYPES.WORKOUT_COMPLETED) {
    handleWorkoutCompleted(payload).then(sendResponse);
    return true; // 异步响应
  }

  // 4. 处理锁屏推迟/稍后提醒请求
  if (type === MESSAGE_TYPES.SNOOZE_WORKOUT) {
    handleWorkoutSnoozed(payload).then(sendResponse);
    return true; // 异步响应
  }

  // 5. 处理 Popup 查询状态请求
  if (type === MESSAGE_TYPES.GET_STATUS) {
    handleGetStatus().then(sendResponse);
    return true;
  }

  return false;
});

// 记录上次成功累加物理秒数的时间戳，用于防御多标签页并发倍速计时
let lastTickTimestamp = 0;

/**
 * 处理心跳计时（受控网站统一累计使用）
 */
async function handleHeartbeat(sender) {
  if (!sender || !sender.tab || !sender.tab.url) {
    return { status: 'ignored' };
  }

  const parts = parseUrlParts(sender.tab.url);
  if (!parts) {
    return { status: 'ignored' };
  }

  const settings = await getSettings();
  const matched = matchTarget(parts.hostname, parts.pathname, settings);
  if (!matched) {
    return { status: 'not_target' };
  }

  const domain = matched.domain;
  const limitSeconds = settings.usageLimit * 60;
  const usage = await getAccumulatedUsage();

  const now = Date.now();
  const isSnoozed = Boolean(usage.snoozedUntil && now < usage.snoozedUntil);

  // 如果已经处于锁定状态且未处于推迟期，确保通知当前 Tab 锁屏
  if (usage.isLocked && !isSnoozed) {
    return { status: 'locked', seconds: usage.seconds, limit: limitSeconds };
  }

  // 防倍速节流检查：如果距离上一次成功计入秒数未满 900ms，说明处于同一自然秒内的多标签页并发心跳
  // 此时不重复累加秒数，直接返回当前有效状态
  if (now - lastTickTimestamp < 900) {
    return { status: 'throttled', seconds: usage.seconds, limit: limitSeconds };
  }
  lastTickTimestamp = now;

  // 递增全局累计已用时间（秒）
  const newSeconds = usage.seconds + 1;

  if (newSeconds >= limitSeconds && !isSnoozed) {
    // 达到阈值且未处于推迟期，触发锁定
    await saveAccumulatedUsage({
      seconds: newSeconds,
      isLocked: true,
      lastActiveAt: now,
      snoozedUntil: 0
    });
    // 向所有受控域名的标签页广播锁定消息
    await broadcastToAllTargetTabs({
      type: MESSAGE_TYPES.LOCK_PAGE,
      payload: { domain, seconds: newSeconds, limit: limitSeconds }
    });
    return { status: 'locked_now', seconds: newSeconds, limit: limitSeconds };
  }

  // 正常累加时间并刷新最近活跃时间戳
  await saveAccumulatedUsage({
    seconds: newSeconds,
    isLocked: false,
    lastActiveAt: now,
    snoozedUntil: isSnoozed ? usage.snoozedUntil : 0
  });
  return { status: 'ok', seconds: newSeconds, limit: limitSeconds };
}

/**
 * 处理推迟锁屏请求
 */
async function handleWorkoutSnoozed(payload) {
  const snoozeMinutes = Number(payload?.snoozeMinutes) || 5;

  await snoozeAccumulatedUsage(snoozeMinutes);

  // 向所有受控域名的标签页广播解锁消息
  await broadcastToAllTargetTabs({
    type: MESSAGE_TYPES.UNLOCK_PAGE,
    payload: { snoozed: true, snoozeMinutes }
  });

  return { success: true, snoozeMinutes };
}

/**
 * 处理运动完成解锁
 */
async function handleWorkoutCompleted(payload) {
  const amount = payload?.amount || payload?.squatCount || 1;
  const settings = await getSettings();

  // 记录今日健身成就
  await incrementWorkoutCount(amount);

  // 解锁所有受控域名（重置全局累计计时与锁定状态）
  await resetAccumulatedUsage();
  for (const domain of settings.targetDomains) {
    await resetDomainUsage(domain);
  }

  await broadcastToAllTargetTabs({
    type: MESSAGE_TYPES.UNLOCK_PAGE,
    payload: {}
  });

  return { success: true };
}

/**
 * 获取当前全局运行状态（供 Popup 显示）
 */
async function handleGetStatus() {
  const settings = await getSettings();
  const usage = await getAccumulatedUsage();
  const domainStates = {};

  for (const domain of settings.targetDomains) {
    domainStates[domain] = usage;
  }

  return {
    settings,
    usage,
    domainStates
  };
}
