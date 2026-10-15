import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { getActionsByScenario } from '../src/shared/actions-data.js';
import { normalizeDomainList } from '../src/shared/target-rules.js';
import { REMINDER_REST_MS } from '../src/shared/reminder-timer.js';

export function localDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const DESKTOP_DEFAULTS = {
  ...DEFAULT_SETTINGS, monitorMode: 'all', selectedApps: [], idleSeconds: 60,
  paused: false, launchAtLogin: false
};
const bounded = (v, low, high, fallback) => Number.isFinite(Number(v)) ? Math.min(high, Math.max(low, Math.round(Number(v)))) : fallback;
export function sanitizeSettings(input = {}) {
  const s = { ...DESKTOP_DEFAULTS, ...input };
  s.usageLimit = bounded(s.usageLimit, 1, 180, DESKTOP_DEFAULTS.usageLimit);
  s.actionCountPerSession = bounded(s.actionCountPerSession, 1, 5, 1);
  s.squatTarget = bounded(s.squatTarget, 1, 100, 10);
  s.stretchSeconds = bounded(s.stretchSeconds, 5, 180, 30);
  s.idleSeconds = bounded(s.idleSeconds, 30, 900, 60);
  if (!['all', 'apps', 'websites'].includes(s.monitorMode)) s.monitorMode = 'all';
  if (!['office_seated', 'office_standing', 'home_active'].includes(s.scenario)) s.scenario = 'office_seated';
  if (!getActionsByScenario(s.scenario).some(a => a.id === s.activeActionId)) s.activeActionId = 'auto';
  s.selectedApps = [...new Set(Array.isArray(s.selectedApps) ? s.selectedApps.filter(x => typeof x === 'string' && x.length < 200) : [])];
  s.customDomains = normalizeDomainList(Array.isArray(s.customDomains) ? s.customDomains.join('\n') : '');
  for (const key of ['cameraEnabled', 'strictMode', 'paused', 'launchAtLogin', 'customEnabled']) s[key] = !!s[key];
  s.sns = { ...DEFAULT_SETTINGS.sns, ...(s.sns || {}) };
  return Object.fromEntries(Object.keys(DESKTOP_DEFAULTS).map(k => [k, s[k]]));
}

export class UsageEngine {
  constructor(saved = {}, now = Date.now()) {
    this.settings = sanitizeSettings(saved.settings);
    this.usage = {
      seconds: 0, isLocked: false, snoozedUntil: 0, restEndsAt: 0, activeDate: localDay(now), lastActiveAt: now,
      ...(saved.usage || {})
    };
    this.usage.seconds = Math.max(0, Number(this.usage.seconds) || 0);
    this.usage.restEndsAt = Math.max(0, Number(this.usage.restEndsAt) || 0);
    this.days = saved.days && typeof saved.days === 'object' ? saved.days : {};
    this.lastTick = now;
    this.reason = '正在连接系统';
    this.resetAfterRest(now, now - this.usage.lastActiveAt >= 900000);
  }
  day(now) {
    const key = localDay(now);
    this.days[key] ||= { seconds: 0, sessions: 0, sets: 0, apps: {} };
    const keys = Object.keys(this.days).sort();
    keys.slice(0, Math.max(0, keys.length - 90)).forEach(k => delete this.days[k]);
    return this.days[key];
  }
  resetAfterRest(now, rested) {
    if (this.usage.activeDate !== localDay(now) || rested) {
      this.usage = { seconds: 0, isLocked: false, snoozedUntil: 0, restEndsAt: 0, activeDate: localDay(now), lastActiveAt: now };
    }
  }
  tick({ now, idle = 0, sleeping = false, screenLocked = false, activeApp, target = true, workout = false, available = true }) {
    if (!workout && this.usage.isLocked && this.usage.restEndsAt > 0 && now >= this.usage.restEndsAt) this.finishRest(now);
    const elapsed = Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.resetAfterRest(now, idle >= 900 || (sleeping && now - this.usage.lastActiveAt >= 900000));
    const blocked = sleeping || screenLocked || idle >= this.settings.idleSeconds;
    if (!blocked) this.usage.lastActiveAt = now;
    this.reason = !available ? '系统监测重连中' : sleeping || screenLocked ? '电脑休眠或已锁屏' : idle >= this.settings.idleSeconds ? '离开电脑，计时暂停' : this.settings.paused ? '监控已暂停' : workout ? '伴练进行中' : this.usage.isLocked ? '已达到使用上限' : !target ? '当前应用不在受控范围' : '正在记录活跃使用';
    if (!available || blocked || this.settings.paused || workout || this.usage.isLocked || !target) return;
    // Never charge suspension, a blocked main loop, or clock corrections as use.
    const seconds = elapsed <= 5 ? elapsed : 0;
    this.usage.seconds += seconds;
    const day = this.day(now);
    day.seconds += seconds;
    if (activeApp?.id) {
      day.apps[activeApp.id] ||= { name: activeApp.name, seconds: 0 };
      day.apps[activeApp.id].name = activeApp.name;
      day.apps[activeApp.id].seconds += seconds;
    }
    if (this.usage.seconds >= this.settings.usageLimit * 60 && now >= this.usage.snoozedUntil) {
      this.usage.isLocked = true;
      this.reason = '已达到使用上限';
    }
  }
  updateSettings(patch) { this.settings = sanitizeSettings({ ...this.settings, ...patch }); }
  beginRest(now = Date.now()) {
    if (this.usage.isLocked && !this.usage.restEndsAt) this.usage.restEndsAt = now + REMINDER_REST_MS;
  }
  cancelRest() { this.usage.restEndsAt = 0; }
  finishRest(now = Date.now()) {
    // A timed break resets the usage cycle without claiming exercise sets.
    this.usage = { seconds: 0, isLocked: false, snoozedUntil: 0, restEndsAt: 0, activeDate: localDay(now), lastActiveAt: now };
    this.lastTick = now;
  }
  snooze(now = Date.now()) {
    this.cancelRest();
    this.usage.isLocked = false;
    this.usage.seconds = Math.max(0, this.settings.usageLimit * 60 - 300);
    this.usage.snoozedUntil = now + 300000;
    this.usage.lastActiveAt = now;
  }
  complete(sets, now = Date.now()) {
    const day = this.day(now);
    day.sessions += 1;
    day.sets += bounded(sets, 1, 5, 1);
    this.usage = { seconds: 0, isLocked: false, snoozedUntil: 0, restEndsAt: 0, activeDate: localDay(now), lastActiveAt: now };
    this.lastTick = now;
  }
  snapshot() { return { settings: this.settings, usage: this.usage, days: this.days }; }
}
