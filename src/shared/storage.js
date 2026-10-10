import { DEFAULT_SETTINGS, STORAGE_KEYS, REST_TIMEOUT_SECONDS } from './constants.js';
import { getActionById, getRandomAction, getActionsByScenario } from './actions-data.js';
import { DEFAULT_SNS_SETTINGS, getActiveDomains } from './target-rules.js';

export function getLocalDateString(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isStorageAvailable() {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  } catch {
    return false;
  }
}

/**
 * 获取当前全局设置
 */
export async function getSettings() {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      const merged = {
        ...DEFAULT_SETTINGS,
        sns: { ...DEFAULT_SNS_SETTINGS },
        customEnabled: DEFAULT_SETTINGS.customEnabled,
        customDomains: [...DEFAULT_SETTINGS.customDomains]
      };
      merged.targetDomains = getActiveDomains(merged);
      resolve(merged);
      return;
    }

    try {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
        if (chrome.runtime?.lastError) {
          const fallback = {
            ...DEFAULT_SETTINGS,
            sns: { ...DEFAULT_SNS_SETTINGS },
            customEnabled: DEFAULT_SETTINGS.customEnabled,
            customDomains: [...DEFAULT_SETTINGS.customDomains]
          };
          fallback.targetDomains = getActiveDomains(fallback);
          resolve(fallback);
          return;
        }

        const stored = (result && result[STORAGE_KEYS.SETTINGS]) || {};
        const merged = {
          ...DEFAULT_SETTINGS,
          ...stored,
          sns: {
            ...DEFAULT_SNS_SETTINGS,
            ...(stored.sns || {})
          },
          customEnabled: stored.customEnabled !== undefined ? stored.customEnabled : DEFAULT_SETTINGS.customEnabled,
          customDomains: Array.isArray(stored.customDomains) ? stored.customDomains : [...DEFAULT_SETTINGS.customDomains]
        };
        // 向后兼容平滑迁移：将旧的 'all' 自动映射为新的 'home_active'
        if (merged.scenario === 'all') {
          merged.scenario = 'home_active';
        }
        merged.targetDomains = getActiveDomains(merged);
        resolve(merged);
      });
    } catch {
      const fallback = {
        ...DEFAULT_SETTINGS,
        sns: { ...DEFAULT_SNS_SETTINGS },
        customEnabled: DEFAULT_SETTINGS.customEnabled,
        customDomains: [...DEFAULT_SETTINGS.customDomains]
      };
      fallback.targetDomains = getActiveDomains(fallback);
      resolve(fallback);
    }
  });
}

/**
 * 保存全局设置
 */
export async function saveSettings(newSettings) {
  const current = await getSettings();
  const merged = {
    ...current,
    ...newSettings,
    sns: {
      ...(current.sns || DEFAULT_SNS_SETTINGS),
      ...(newSettings.sns || {})
    }
  };
  merged.targetDomains = getActiveDomains(merged);

  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve(merged);
      return;
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged }, () => {
        resolve(merged);
      });
    } catch {
      resolve(merged);
    }
  });
}

/**
 * 获取全局受控网站统一累计使用情况 (含跨天与 15 分钟自然休息超时重置)
 */
export async function getAccumulatedUsage() {
  return new Promise((resolve) => {
    const now = Date.now();
    const todayStr = getLocalDateString(now);
    const fallback = {
      seconds: 0,
      isLocked: false,
      lastActiveAt: now,
      activeDate: todayStr,
      snoozedUntil: 0,
      updatedAt: now
    };

    if (!isStorageAvailable()) {
      resolve(fallback);
      return;
    }

    try {
      chrome.storage.local.get([STORAGE_KEYS.ACCUMULATED_USAGE], (result) => {
        if (chrome.runtime?.lastError) {
          resolve(fallback);
          return;
        }
        const data = (result && result[STORAGE_KEYS.ACCUMULATED_USAGE]) || fallback;
        let { seconds = 0, isLocked = false, lastActiveAt = 0, activeDate = '', snoozedUntil = 0 } = data;

        // 如果未处于锁屏状态，执行跨天与 15 分钟自然休息超时检查
        if (!isLocked) {
          const isCrossDay = activeDate && activeDate !== todayStr;
          const isRestTimeout = lastActiveAt > 0 && (now - lastActiveAt) > (REST_TIMEOUT_SECONDS * 1000);

          if (isCrossDay || isRestTimeout) {
            // 判定用户已自然离开休息或进入新的一天，重置累计时长
            seconds = 0;
            isLocked = false;
            lastActiveAt = now;
            activeDate = todayStr;
            snoozedUntil = 0;
            // 异步回写持久化数据，保持状态一致
            saveAccumulatedUsage({
              seconds: 0,
              isLocked: false,
              lastActiveAt: now,
              activeDate: todayStr,
              snoozedUntil: 0
            }).catch(() => {});
          }
        }

        resolve({
          seconds: Math.max(0, seconds),
          isLocked: !!isLocked,
          lastActiveAt: lastActiveAt || now,
          activeDate: activeDate || todayStr,
          snoozedUntil: typeof snoozedUntil === 'number' ? snoozedUntil : 0,
          updatedAt: now
        });
      });
    } catch {
      resolve(fallback);
    }
  });
}

/**
 * 保存全局受控网站统一累计使用情况
 */
export async function saveAccumulatedUsage({ seconds, isLocked, lastActiveAt, activeDate, snoozedUntil }) {
  const now = Date.now();
  const todayStr = getLocalDateString(now);
  const data = {
    seconds: Math.max(0, seconds),
    isLocked: !!isLocked,
    lastActiveAt: lastActiveAt || now,
    activeDate: activeDate || todayStr,
    snoozedUntil: typeof snoozedUntil === 'number' ? snoozedUntil : 0,
    updatedAt: now
  };
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve(data);
      return;
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.ACCUMULATED_USAGE]: data }, () => {
        resolve(data);
      });
    } catch {
      resolve(data);
    }
  });
}

/**
 * 重置全局累计使用时长，解除锁定
 */
export async function resetAccumulatedUsage() {
  const now = Date.now();
  return saveAccumulatedUsage({
    seconds: 0,
    isLocked: false,
    lastActiveAt: now,
    activeDate: getLocalDateString(now),
    snoozedUntil: 0
  });
}

/**
 * 临时推迟锁屏，解除锁定并设定推迟保护期与回退累计秒数
 */
export async function snoozeAccumulatedUsage(snoozeMinutes = 5) {
  const now = Date.now();
  const todayStr = getLocalDateString(now);
  const settings = await getSettings();
  const limitSeconds = settings.usageLimit * 60;
  const snoozeSeconds = snoozeMinutes * 60;
  // 将累计秒数回退至距离上限还有 snoozeSeconds 的位置（至少有 snoozeMinutes 分钟的可用时长）
  const adjustedSeconds = Math.max(0, limitSeconds - snoozeSeconds);
  const snoozedUntil = now + (snoozeMinutes * 60 * 1000);

  return saveAccumulatedUsage({
    seconds: adjustedSeconds,
    isLocked: false,
    lastActiveAt: now,
    activeDate: todayStr,
    snoozedUntil
  });
}

/**
 * 获取特定域名的使用情况（映射到全局累计时长，保持向后兼容）
 */
export async function getDomainUsage(domain) {
  return getAccumulatedUsage();
}

/**
 * 保存特定域名的使用情况（映射到全局累计时长，保持向后兼容）
 */
export async function saveDomainUsage(domain, { seconds, isLocked }) {
  return saveAccumulatedUsage({ seconds, isLocked });
}

/**
 * 重置指定域名的会话计时，解除锁定（映射到全局累计时长重置）
 */
export async function resetDomainUsage(domain) {
  return resetAccumulatedUsage();
}

/**
 * 获取今天健身统计（累计深蹲总次数）
 */
export async function getTodayStats() {
  const todayKey = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve({ todayKey, todayCount: 0 });
      return;
    }
    try {
      chrome.storage.local.get([STORAGE_KEYS.STATS], (result) => {
        if (chrome.runtime?.lastError) {
          resolve({ todayKey, todayCount: 0 });
          return;
        }
        const allStats = (result && result[STORAGE_KEYS.STATS]) || {};
        const todayCount = allStats[todayKey] || 0;
        resolve({ todayKey, todayCount });
      });
    } catch {
      resolve({ todayKey, todayCount: 0 });
    }
  });
}

/**
 * 增加今日深蹲健身总次数
 */
export async function incrementWorkoutCount(amount = 1) {
  const todayKey = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve(0);
      return;
    }
    try {
      chrome.storage.local.get([STORAGE_KEYS.STATS], (result) => {
        if (chrome.runtime?.lastError) {
          resolve(0);
          return;
        }
        const allStats = (result && result[STORAGE_KEYS.STATS]) || {};
        const current = allStats[todayKey] || 0;
        allStats[todayKey] = current + amount;
        chrome.storage.local.set({ [STORAGE_KEYS.STATS]: allStats }, () => {
          resolve(allStats[todayKey]);
        });
      });
    } catch {
      resolve(0);
    }
  });
}

/**
 * 获取当前应执行的动作队列（支持 1~5 组动作串联）
 * @returns {Promise<Array<object>>} 动作对象队列
 */
export async function getCurrentWorkoutQueue() {
  const settings = await getSettings();
  const count = Math.max(1, Math.min(5, parseInt(settings.actionCountPerSession, 10) || 1));

  // 1. 如果指定了固定动作（如深蹲），生成包含 count 个相同动作的队列
  if (settings.activeActionId && settings.activeActionId !== 'auto') {
    const fixedAction = getActionById(settings.activeActionId);
    return Array.from({ length: count }, () => fixedAction);
  }

  // 2. 智能轮换模式：从当前场景动作库中抽取 count 个动作
  const scenarioKey = settings.scenario || 'office_seated';
  const availableActions = getActionsByScenario(scenarioKey);
  if (!availableActions.length) {
    return Array.from({ length: count }, () => getRandomAction(scenarioKey));
  }

  // 洗牌算法
  const pool = [...availableActions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // 若可用动作数 >= count，取前 count 个（保证不重复）
  if (pool.length >= count) {
    return pool.slice(0, count);
  }

  // 若可用动作数 < count，循环填充
  const queue = [];
  while (queue.length < count) {
    for (const act of pool) {
      if (queue.length < count) {
        queue.push(act);
      }
    }
  }
  return queue;
}

/**
 * 获取当前应执行的动作（结合场景配置与用户偏好，取队列首个动作保持向后兼容）
 */
export async function getCurrentWorkoutAction() {
  const queue = await getCurrentWorkoutQueue();
  return queue[0];
}


