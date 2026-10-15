// 目标受控网站规则定义、URL 标准化与精准匹配逻辑

/**
 * 预设支持的重点受控平台
 * 包含域名、显示名称、别名与特定路径限制 (如 YouTube Shorts)
 */
export const SNS_SERVICES = Object.freeze([
  Object.freeze({
    key: 'x',
    domain: 'x.com',
    label: 'X',
    aliases: ['twitter.com']
  }),
  Object.freeze({
    key: 'facebook',
    domain: 'facebook.com',
    label: 'Facebook',
    aliases: ['m.facebook.com']
  }),
  Object.freeze({
    key: 'reddit',
    domain: 'reddit.com',
    label: 'Reddit'
  }),
  Object.freeze({
    key: 'threads',
    domain: 'threads.net',
    label: 'Threads',
    aliases: ['threads.com']
  }),
  Object.freeze({
    key: 'bluesky',
    domain: 'bsky.app',
    label: 'Bluesky'
  }),
  Object.freeze({
    key: 'youtube',
    domain: 'youtube.com',
    excludePath: '/shorts',
    label: 'YouTube'
  }),
  Object.freeze({
    key: 'youtubeShorts',
    domain: 'youtube.com',
    path: '/shorts',
    label: 'YouTube Shorts',
    wide: true
  })
]);

/**
 * 默认预设平台的开启状态（全选）
 */
export const DEFAULT_SNS_SETTINGS = Object.freeze({
  x: true,
  facebook: true,
  reddit: true,
  threads: true,
  bluesky: true,
  youtube: true,
  youtubeShorts: true
});

/**
 * 清洗并标准化单个域名或 URL 输入
 * 例如 "https://www.bilibili.com/video" -> "bilibili.com"
 */
export function normalizeDomainEntry(entry) {
  if (typeof entry !== 'string') return '';
  let value = entry.trim().toLowerCase();
  if (!value) return '';

  // 去除前导通配符和点号
  value = value.replace(/^[*.]+/, '');

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    value = url.hostname.toLowerCase();
  } catch (_e) {
    value = value.split(/[/?#]/, 1)[0].trim().toLowerCase();
    value = value.replace(/:\d+$/, '');
  }

  value = value.replace(/^[*.]+/, '');
  value = value.replace(/^www\./, '');
  value = value.replace(/\.+$/, '');

  if (value === 'twitter.com') {
    value = 'x.com';
  }

  if (!value || !value.includes('.') || !/^[a-z0-9.-]+$/.test(value)) {
    return '';
  }

  return value;
}

/**
 * 规范化域名列表（去重、过滤非法字符）
 */
export function normalizeDomainList(domains) {
  const inputList = Array.isArray(domains)
    ? domains
    : typeof domains === 'string'
      ? domains.split(/[\n,]+/)
      : [];
  const normalized = [];
  const seen = new Set();

  inputList.forEach((item) => {
    const norm = normalizeDomainEntry(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      normalized.push(norm);
    }
  });

  return normalized;
}

/**
 * 路径前缀匹配辅助函数
 */
export function pathMatches(pathname, pathPrefix) {
  const value = typeof pathname === 'string' ? pathname : '';
  return value === pathPrefix || value.startsWith(`${pathPrefix}/`);
}

/**
 * 判断 hostname 是否匹配某个主域名（支持子域名匹配）
 * 如 "m.facebook.com" 匹配 "facebook.com"
 */
export function hostnameMatchesDomain(hostname, domain) {
  const normHost = normalizeDomainEntry(hostname);
  const normDomain = normalizeDomainEntry(domain);
  if (!normHost || !normDomain) return false;
  return normHost === normDomain || normHost.endsWith(`.${normDomain}`);
}

/**
 * 判定给定的 URL (hostname + pathname) 是否命中当前用户设置中的受控规则
 * @param {string} hostname 主机名，如 "youtube.com"
 * @param {string} pathname 路径，如 "/shorts/abc"
 * @param {object} settings 用户配置对象
 * @returns {object|null} 命中则返回匹配项信息，否则返回 null
 */
export function matchTarget(hostname, pathname, settings) {
  if (!hostname || !settings) return null;

  const currentSns = settings.sns || DEFAULT_SNS_SETTINGS;
  const customEnabled = settings.customEnabled !== false;
  const customDomains = Array.isArray(settings.customDomains) ? settings.customDomains : [];

  // 1. 检查各预设平台
  for (const service of SNS_SERVICES) {
    if (!currentSns[service.key]) continue;

    // 检查主域名或别名是否匹配
    const allDomains = [service.domain, ...(service.aliases || [])];
    const isHostMatch = allDomains.some((d) => hostnameMatchesDomain(hostname, d));

    if (isHostMatch) {
      // 检查路径白名单（如 YouTube Shorts）
      if (service.path && !pathMatches(pathname, service.path)) {
        continue;
      }
      // 检查路径排除（如普通 YouTube 排除 Shorts）
      if (service.excludePath && pathMatches(pathname, service.excludePath)) {
        continue;
      }
      return {
        matchedType: 'preset',
        serviceKey: service.key,
        label: service.label,
        domain: service.domain
      };
    }
  }

  // 2. 检查自定义“其他网站”
  if (customEnabled && customDomains.length > 0) {
    for (const customDomain of customDomains) {
      if (hostnameMatchesDomain(hostname, customDomain)) {
        return {
          matchedType: 'custom',
          serviceKey: 'custom',
          label: customDomain,
          domain: customDomain
        };
      }
    }
  }

  return null;
}

/**
 * 获取当前已激活的目标主域名列表（用于向后兼容与简单域名查重）
 */
export function getActiveDomains(settings) {
  const domains = [];
  const currentSns = settings?.sns || DEFAULT_SNS_SETTINGS;

  SNS_SERVICES.forEach((s) => {
    if (currentSns[s.key]) {
      domains.push(s.domain);
      if (s.aliases) domains.push(...s.aliases);
    }
  });

  if (settings?.customEnabled !== false && Array.isArray(settings?.customDomains)) {
    domains.push(...settings.customDomains);
  }

  return [...new Set(domains)];
}
