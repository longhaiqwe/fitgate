/**
 * 参数输入解析器
 * 支持用户手动输入带单位或不带单位的文本，并转换为对应的数值。
 */

/**
 * 清洗字符串，去除多余空格并转为小写
 */
function cleanString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase();
}

/**
 * 解析“累计使用上限”输入
 * 基准单位：分钟
 * 支持格式：
 * - 30 分钟 / 30分钟 / 30分 / 30m / 30min / 30 mins
 * - 1小时 / 1.5小时 / 1h / 1.5h / 1小时30分 / 1h30m
 * - 120s / 120秒（大于等于60秒时折算为分钟，不足60秒取1分钟）
 * - 纯数字 30（默认为分钟）
 * 边界范围：1 ~ 180 分钟
 *
 * @param {string|number} input
 * @returns {number|null} 成功返回分钟整数，失败返回 null
 */
export function parseUsageLimitInput(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.max(1, Math.min(180, Math.round(input)));
  }

  const text = cleanString(input);
  if (!text) return null;

  // 1. 组合时间格式：如 1小时30分、1h30m、1小时20分钟
  const combinedMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:小时|h|hours?)\s*(\d+(?:\.\d+)?)\s*(?:分钟|分|m|mins?|minutes?)?$/);
  if (combinedMatch) {
    const hours = parseFloat(combinedMatch[1]);
    const mins = parseFloat(combinedMatch[2]);
    const total = Math.round(hours * 60 + mins);
    return Math.max(1, Math.min(180, total));
  }

  // 2. 纯小时：如 1.5小时、2h
  const hourMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:小时|h|hours?)$/);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    const total = Math.round(hours * 60);
    return Math.max(1, Math.min(180, total));
  }

  // 3. 分钟：如 30 分钟、30分钟、30分、30m、30min
  const minMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:分钟|分|m|mins?|minutes?)$/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    const total = Math.round(mins);
    return Math.max(1, Math.min(180, total));
  }

  // 4. 秒：如 120s、90秒
  const secMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:秒|s|secs?|seconds?)$/);
  if (secMatch) {
    const secs = parseFloat(secMatch[1]);
    const mins = Math.max(1, Math.round(secs / 60));
    return Math.max(1, Math.min(180, mins));
  }

  // 5. 纯数字（默认按分钟处理）
  const numMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const val = Math.round(parseFloat(numMatch[1]));
    if (val <= 0) return null;
    return Math.max(1, Math.min(180, val));
  }

  return null;
}

/**
 * 解析“单侧拉伸目标时长”输入
 * 基准单位：秒
 * 支持格式：
 * - 20s / 20 s / 20秒 / 20 秒 / 20sec / 20secs
 * - 1分钟 / 1分 / 1m / 1min / 0.5m（折算为秒）
 * - 纯数字 20（默认为秒）
 * 边界范围：5 ~ 180 秒
 *
 * @param {string|number} input
 * @returns {number|null} 成功返回秒数整数，失败返回 null
 */
export function parseStretchSecondsInput(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.max(5, Math.min(180, Math.round(input)));
  }

  const text = cleanString(input);
  if (!text) return null;

  // 1. 分钟输入：如 1分钟、1m、0.5分
  const minMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:分钟|分|m|mins?|minutes?)$/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    const secs = Math.round(mins * 60);
    return Math.max(5, Math.min(180, secs));
  }

  // 2. 秒输入：如 20s、20秒、20 sec
  const secMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:秒|s|secs?|seconds?)$/);
  if (secMatch) {
    const secs = Math.round(parseFloat(secMatch[1]));
    return Math.max(5, Math.min(180, secs));
  }

  // 3. 纯数字（默认按秒处理）
  const numMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const val = Math.round(parseFloat(numMatch[1]));
    if (val <= 0) return null;
    return Math.max(5, Math.min(180, val));
  }

  return null;
}

/**
 * 解析“解锁深蹲目标”输入
 * 基准单位：次
 * 支持格式：
 * - 10 次 / 10次 / 10个 / 10 reps / 10rep
 * - 纯数字 10
 * 边界范围：1 ~ 100 次
 *
 * @param {string|number} input
 * @returns {number|null} 成功返回次数整数，失败返回 null
 */
export function parseSquatTargetInput(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.max(1, Math.min(100, Math.round(input)));
  }

  const text = cleanString(input);
  if (!text) return null;

  const match = text.match(/^(\d+)\s*(?:次|个|reps?|times?)?$/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val <= 0) return null;
    return Math.max(1, Math.min(100, val));
  }

  return null;
}

/**
 * 格式化累计使用上限展示
 */
export function formatUsageLimit(minutes) {
  return `${minutes} 分钟`;
}

/**
 * 格式化拉伸秒数展示
 */
export function formatStretchSeconds(seconds) {
  return `${seconds} 秒`;
}

/**
 * 格式化深蹲目标展示
 */
export function formatSquatTarget(reps) {
  return `${reps} 次`;
}

/**
 * 解析“动作组数”输入
 * 基准单位：组
 * 支持格式：
 * - 1 组 / 2组 / 3 组动作 / 4 sets
 * - 纯数字 1 ~ 5
 * 边界范围：1 ~ 5 组
 *
 * @param {string|number} input
 * @returns {number|null} 成功返回组数整数，失败返回 null
 */
export function parseActionCountInput(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.max(1, Math.min(5, Math.round(input)));
  }

  const text = cleanString(input);
  if (!text) return null;

  const match = text.match(/^(\d+)\s*(?:组动作|组|sets?|rounds?)?$/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val <= 0) return null;
    return Math.max(1, Math.min(5, val));
  }

  return null;
}

/**
 * 格式化动作组数展示
 */
export function formatActionCount(count) {
  return `${count} 组`;
}

