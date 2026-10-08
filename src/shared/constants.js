// 共享配置与常量定义

export const DEFAULT_SETTINGS = Object.freeze({
  // 浏览时间上限 (单位：分钟)，默认 20 分钟
  usageLimit: 20,
  // 目标深蹲次数，默认 10 次
  squatTarget: 10,
  // 监控的域名列表 (默认支持 x.com 和 twitter.com)
  targetDomains: ['x.com', 'twitter.com'],
  // 是否严格模式 (深蹲不到位不计次)
  strictMode: true
});

export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'fitgate_settings',
  USAGE_PREFIX: 'fitgate_usage:',
  STATS: 'fitgate_stats'
});

export const MESSAGE_TYPES = Object.freeze({
  // Content Script 发送给 Background 的心跳通知
  HEARTBEAT: 'FITGATE_HEARTBEAT',
  // Background 发送给 Content Script 的锁屏通知
  LOCK_PAGE: 'FITGATE_LOCK_PAGE',
  // Background 发送给 Content Script 的解锁通知
  UNLOCK_PAGE: 'FITGATE_UNLOCK_PAGE',
  // Content Script 请求打开全屏健身房
  OPEN_WORKOUT: 'FITGATE_OPEN_WORKOUT',
  // 健身房页面通知 Background 已完成深蹲任务
  WORKOUT_COMPLETED: 'FITGATE_WORKOUT_COMPLETED',
  // Popup 查询实时状态
  GET_STATUS: 'FITGATE_GET_STATUS',
  // 状态变更广播
  STATUS_UPDATED: 'FITGATE_STATUS_UPDATED'
});
