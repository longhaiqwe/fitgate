import { DEFAULT_SNS_SETTINGS, getActiveDomains } from './target-rules.js';

export const DEFAULT_SETTINGS = Object.freeze({
  // 累计使用时间上限 (单位：分钟)，默认 25 分钟
  usageLimit: 25,
  // 工作场景递进模式：'office_seated' (办公室·坐姿 6个动作) | 'office_standing' (办公室·站立 12个动作) | 'home_active' (居家办公 15个动作)
  scenario: 'office_seated',
  // 指定动作 ID ('auto' 为自动轮换，或具体动作 ID)
  activeActionId: 'auto',
  // 目标深蹲次数，默认 10 次 (居家模式)
  squatTarget: 10,
  // 单侧拉伸基础秒数，默认 30 秒 (工位模式)
  stretchSeconds: 30,
  // 预设受控 SNS 平台开关映射 (全部 7 大平台默认开启)
  sns: { ...DEFAULT_SNS_SETTINGS },
  // 是否启用“其他网站”自定义输入
  customEnabled: true,
  // 自定义域名列表 (字符串数组)
  customDomains: [],
  // 监控的域名列表 (保持向后兼容)
  targetDomains: ['x.com', 'twitter.com', 'facebook.com', 'reddit.com', 'threads.net', 'threads.com', 'bsky.app', 'youtube.com'],
  // 是否严格模式 (默认 false 采用 120° 适中深度，适配屏幕上方摄像头俯拍视角)
  strictMode: false,
  // 摄像头姿态检测模式：true 为开启摄像头 AI 视觉检测，false 为无摄像头纯计时模式
  cameraEnabled: true,
  // 每次锁屏需要完成的动作组数 (默认 1 组，范围 1 ~ 5)
  actionCountPerSession: 1
});

// 常见快捷工作/活动预设
export const WORKOUT_PRESETS = Object.freeze([
  { id: 'pomodoro', name: '25 分钟 / 1 组', usageLimit: 25, actionCount: 1, label: '25m / 1组' },
  { id: 'deep_work', name: '50 分钟 / 3 组', usageLimit: 50, actionCount: 3, label: '50m / 3组' }
]);

// 判定用户已自然离开休息的静默超时阈值 (15 分钟 = 900 秒)
export const REST_TIMEOUT_SECONDS = 15 * 60;

export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'fitgate_settings',
  ACCUMULATED_USAGE: 'fitgate_accumulated_usage',
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
  // 锁屏界面请求推迟/稍后提醒
  SNOOZE_WORKOUT: 'FITGATE_SNOOZE_WORKOUT',
  // Popup 查询实时状态
  GET_STATUS: 'FITGATE_GET_STATUS',
  // 状态变更广播
  STATUS_UPDATED: 'FITGATE_STATUS_UPDATED'
});
