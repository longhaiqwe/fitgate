// 统一存储封装，基于 chrome.storage.local
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants.js';

/**
 * 获取当前全局设置
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
      const stored = result[STORAGE_KEYS.SETTINGS] || {};
      resolve({
        ...DEFAULT_SETTINGS,
        ...stored,
        targetDomains: Array.isArray(stored.targetDomains) && stored.targetDomains.length > 0
          ? stored.targetDomains
          : [...DEFAULT_SETTINGS.targetDomains]
      });
    });
  });
}

/**
 * 保存全局设置
 */
export async function saveSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged }, () => {
      resolve(merged);
    });
  });
}

/**
 * 获取特定域名的使用情况
 */
export async function getDomainUsage(domain) {
  const key = `${STORAGE_KEYS.USAGE_PREFIX}${domain}`;
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const data = result[key] || {
        seconds: 0,
        isLocked: false,
        updatedAt: Date.now()
      };
      resolve(data);
    });
  });
}

/**
 * 保存特定域名的使用情况
 */
export async function saveDomainUsage(domain, { seconds, isLocked }) {
  const key = `${STORAGE_KEYS.USAGE_PREFIX}${domain}`;
  const data = {
    seconds: Math.max(0, seconds),
    isLocked: !!isLocked,
    updatedAt: Date.now()
  };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: data }, () => {
      resolve(data);
    });
  });
}

/**
 * 重置指定域名的会话计时，解除锁定
 */
export async function resetDomainUsage(domain) {
  return saveDomainUsage(domain, { seconds: 0, isLocked: false });
}

/**
 * 获取今天健身统计（累计深蹲总次数）
 */
export async function getTodayStats() {
  const todayKey = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.STATS], (result) => {
      const allStats = result[STORAGE_KEYS.STATS] || {};
      const todayCount = allStats[todayKey] || 0;
      resolve({ todayKey, todayCount });
    });
  });
}

/**
 * 增加今日深蹲健身总次数
 */
export async function incrementWorkoutCount(amount = 1) {
  const todayKey = new Date().toISOString().slice(0, 10);
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.STATS], (result) => {
      const allStats = result[STORAGE_KEYS.STATS] || {};
      const current = allStats[todayKey] || 0;
      allStats[todayKey] = current + amount;
      chrome.storage.local.set({ [STORAGE_KEYS.STATS]: allStats }, () => {
        resolve(allStats[todayKey]);
      });
    });
  });
}
