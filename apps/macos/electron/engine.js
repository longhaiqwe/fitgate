import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { getActionsByScenario } from '../src/shared/actions-data.js';
import { normalizeDomainList } from '../src/shared/target-rules.js';
import { actionRecordId, normalizeActionRecords } from '../src/shared/action-records.js';
import { REMINDER_REST_MS } from '../src/shared/reminder-timer.js';

export function localDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const DESKTOP_DEFAULTS = {
  ...DEFAULT_SETTINGS, monitorMode: 'all', selectedApps: [], idleSeconds: 60, breakResetSeconds: 300,
  paused: false, pausedUntil: 0, warnSeconds: 60, quietApps: [], launchAtLogin: false
};
const bounded = (v, low, high, fallback) => Number.isFinite(Number(v)) ? Math.min(high, Math.max(low, Math.round(Number(v)))) : fallback;
export function sanitizeSettings(input = {}) {
  const s = { ...DESKTOP_DEFAULTS, ...input };
  s.usageLimit = bounded(s.usageLimit, 1, 180, DESKTOP_DEFAULTS.usageLimit);
  s.actionCountPerSession = bounded(s.actionCountPerSession, 1, 5, 1);
  s.squatTarget = bounded(s.squatTarget, 1, 100, 10);
  s.stretchSeconds = bounded(s.stretchSeconds, 5, 180, 30);
  s.idleSeconds = bounded(s.idleSeconds, 30, 900, 60);
  s.breakResetSeconds = [120, 300, 600, 900].includes(Number(s.breakResetSeconds)) ? Number(s.breakResetSeconds) : 300;
  if (!['all', 'apps', 'websites'].includes(s.monitorMode)) s.monitorMode = 'all';
  if (!['office_seated', 'office_standing', 'home_active'].includes(s.scenario)) s.scenario = 'office_seated';
  if (!getActionsByScenario(s.scenario).some(a => a.id === s.activeActionId)) s.activeActionId = 'auto';
  s.selectedApps = [...new Set(Array.isArray(s.selectedApps) ? s.selectedApps.filter(x => typeof x === 'string' && x.length < 200) : [])];
  s.quietApps = [...new Set(Array.isArray(s.quietApps) ? s.quietApps.filter(x => typeof x === 'string' && x.trim() && x.length < 200) : [])];
  s.customDomains = normalizeDomainList(Array.isArray(s.customDomains) ? s.customDomains.join('\n') : '');
  for (const key of ['cameraEnabled', 'strictMode', 'paused', 'launchAtLogin', 'customEnabled']) s[key] = !!s[key];
  s.warnSeconds = [0, 30, 60, 120].includes(Number(s.warnSeconds)) ? Number(s.warnSeconds) : 60;
  s.pausedUntil = s.paused && Number.isSafeInteger(s.pausedUntil) && s.pausedUntil > 0 && s.pausedUntil <= 8640000000000000 ? s.pausedUntil : 0;
  s.sns = { ...DEFAULT_SETTINGS.sns, ...(s.sns || {}) };
  return Object.fromEntries(Object.keys(DESKTOP_DEFAULTS).map(k => [k, s[k]]));
}

export class UsageEngine {
  constructor(saved = {}, now = Date.now()) {
    this.settings = sanitizeSettings(saved.settings);
    this.usage = {
      reminderCounted: false, idleRestCounted: false, awaySince: 0, seconds: 0, isLocked: false, warned: false, snoozedUntil: 0, restEndsAt: 0, restMode: null, standingMs: 0, activeDate: localDay(now), lastActiveAt: now,
      ...(saved.usage || {})
    };
    this.usage.seconds = Math.max(0, Number(this.usage.seconds) || 0);
    this.usage.deferredSince = Number.isSafeInteger(this.usage.deferredSince) && this.usage.deferredSince > 0
      ? Math.min(this.usage.deferredSince, now) : 0;
    this.remindersMuted = false;
    // Only a departure observed by this running process can establish lock/sleep duration.
    this.usage.awaySince = 0;
    this.usage.restEndsAt = Math.max(0, Number(this.usage.restEndsAt) || 0);
    this.usage.standingMs = bounded(this.usage.standingMs, 0, REMINDER_REST_MS, 0);
    this.lastStandingSample = null;
    this.standingSince = null;
    this.days = Object.fromEntries(Object.entries(saved.days && typeof saved.days === 'object' ? saved.days : {}).map(([key, day]) => [key, { ...day, actions: normalizeActionRecords(day.actions || {}) }]));
    this.lastTick = now;
    this.expirePause(now);
    this.reason = '正在连接系统';
    // On restart, wait for an actual OS idle sample instead of treating app downtime as rest.
    this.resetAfterRest(now, false);
  }
  day(now) {
    const key = localDay(now);
    this.days[key] ||= { seconds: 0, sessions: 0, sets: 0, apps: {}, actions: {} };
    this.days[key].idleBreaks = Math.max(0, Math.floor(Number(this.days[key].idleBreaks) || 0));
    for (const field of ['reminders', 'snoozes', 'timedRests']) {
      const value = this.days[key][field];
      this.days[key][field] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }
    this.days[key].actions ||= {};
    // Preserve daily app totals alongside activity totals for annual history.
    this.days[key].apps ||= {};
    return this.days[key];
  }
  resetAfterRest(now, rested) {
    if (this.usage.activeDate !== localDay(now) || rested) {
      this.usage = { reminderCounted: false, idleRestCounted: !!this.usage.idleRestCounted, awaySince: this.usage.awaySince || 0, seconds: 0, isLocked: false, warned: false, snoozedUntil: 0, restEndsAt: 0, restMode: null, standingMs: 0, activeDate: localDay(now), lastActiveAt: now };
    }
  }
  beginAway(now = Date.now(), idle = 0) {
    const since = now - Math.max(0, Number(idle) || 0) * 1000;
    this.usage.awaySince = this.usage.awaySince ? Math.min(this.usage.awaySince, since) : since;
  }
  checkIdleRest(now, idle = 0, { away = false, workout = false } = {}) {
    if (away) this.beginAway(now, idle);
    const rested = idle >= this.settings.breakResetSeconds
      || (this.usage.awaySince > 0 && now - this.usage.awaySince >= this.settings.breakResetSeconds * 1000);
    const verifiedStanding = this.usage.restMode === 'standing' && this.standingSince !== null
      && this.lastStandingSample !== null && now >= this.lastStandingSample && now - this.lastStandingSample <= 1000;
    if (rested && !workout && !verifiedStanding && !this.usage.idleRestCounted) {
      const hadUsage = this.usage.seconds > 0 || this.usage.isLocked;
      this.usage.idleRestCounted = true;
      this.resetAfterRest(now, true);
      this.pauseStanding();
      if (hadUsage) this.day(now).idleBreaks += 1;
    } else if (!rested && !away) this.usage.idleRestCounted = false;
    if (!away) this.usage.awaySince = 0;
  }
  expirePause(now = Date.now()) {
    if (!this.settings.paused || !this.settings.pausedUntil || now < this.settings.pausedUntil) return false;
    this.settings.paused = false; this.settings.pausedUntil = 0;
    this.lastTick = now;
    return true;
  }
  tick({ now, idle = 0, sleeping = false, screenLocked = false, activeApp, target = true, workout = false, available = true }) {
    this.remindersMuted = this.settings.quietApps.includes(activeApp?.id);
    this.expirePause(now);
    if (!this.settings.cameraEnabled && !workout && this.usage.isLocked && this.usage.restEndsAt > 0 && now >= this.usage.restEndsAt) this.finishRest(now);
    const elapsed = Math.max(0, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.checkIdleRest(now, idle, { away: sleeping || screenLocked, workout });
    this.resetAfterRest(now, false);
    const blocked = sleeping || screenLocked || idle >= Math.min(this.settings.idleSeconds, this.settings.breakResetSeconds);
    if (!blocked) this.usage.lastActiveAt = now;
    this.reason = !available ? '系统监测重连中' : sleeping || screenLocked ? '电脑休眠或已锁屏' : idle >= this.settings.breakResetSeconds && this.usage.idleRestCounted ? '空闲休息已重置本轮' : idle >= this.settings.idleSeconds ? '离开电脑，计时暂停' : this.settings.paused ? '监控已暂停' : workout ? '伴练进行中' : this.usage.isLocked ? '已达到使用上限' : !target ? '当前应用不在受控范围' : '正在记录活跃使用';
    if (!available || blocked || this.settings.paused || workout || this.usage.isLocked) return;
    // A pending reminder is released on leaving the quiet app even when the new
    // foreground app is outside the selected monitoring scope.
    if (this.usage.deferredSince) this.checkReminderDue(now);
    if (this.usage.isLocked || !target) return;
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
    this.checkReminderDue(now);
    const remaining = Math.ceil(Math.max(this.settings.usageLimit * 60 - this.usage.seconds, (this.usage.snoozedUntil - now) / 1000));
    if (!this.remindersMuted && !this.usage.isLocked && !this.usage.warned && this.settings.warnSeconds > 0 && remaining > 0 && remaining <= this.settings.warnSeconds) {
      this.usage.warned = true;
      return remaining;
    }
  }
  checkReminderDue(now) {
    if (this.usage.seconds < this.settings.usageLimit * 60 || now < this.usage.snoozedUntil) {
      this.usage.deferredSince = 0;
      return;
    }
    if (this.remindersMuted) {
      this.usage.deferredSince ||= now;
      if (now - this.usage.deferredSince < 60 * 60 * 1000) {
        this.reason = '免打扰应用使用中 · 待提醒（最多顺延 60 分钟）';
        return;
      }
    }
    this.usage.deferredSince = 0;
    this.usage.isLocked = true;
    this.reason = '已达到使用上限';
  }
  updateSettings(patch) {
    if ((patch.usageLimit !== undefined && Number(patch.usageLimit) !== this.settings.usageLimit) || (patch.warnSeconds !== undefined && Number(patch.warnSeconds) !== this.settings.warnSeconds)) this.usage.warned = false;
    const previousCamera = this.settings.cameraEnabled;
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    if (previousCamera !== this.settings.cameraEnabled && this.usage.restMode) {
      this.cancelRest(); this.beginRest();
    }
  }
  recordReminder(now = Date.now()) {
    if (!this.usage.isLocked || this.settings.paused || this.usage.reminderCounted) return false;
    this.day(now).reminders += 1;
    this.usage.reminderCounted = true;
    return true;
  }
  beginRest(now = Date.now()) {
    if (!this.usage.isLocked) return;
    this.usage.restMode = this.settings.cameraEnabled ? 'standing' : 'timer';
    if (this.settings.cameraEnabled) this.usage.restEndsAt = 0;
    else if (!this.usage.restEndsAt) this.usage.restEndsAt = now + REMINDER_REST_MS;
  }
  cancelRest() {
    this.usage.restEndsAt = 0; this.usage.restMode = null; this.usage.standingMs = 0;
    this.pauseStanding();
  }
  pauseStanding() { this.lastStandingSample = null; this.standingSince = null; }
  recordStanding(matched, now = Date.now()) {
    if (!this.usage.isLocked || this.usage.restMode !== 'standing' || !this.settings.cameraEnabled) return false;
    const previous = this.lastStandingSample;
    this.lastStandingSample = now;
    if (!matched) { this.standingSince = null; return false; }
    const delta = previous === null ? 0 : now - previous;
    if (this.standingSince === null || delta <= 0 || delta > 1000) {
      this.standingSince = now; return false;
    }
    if (now - this.standingSince < 1000) return false;
    this.usage.standingMs = Math.min(REMINDER_REST_MS, this.usage.standingMs + delta);
    if (this.usage.standingMs < REMINDER_REST_MS) return false;
    this.complete(1, now, ['standing_five_minutes']);
    this.pauseStanding();
    return true;
  }
  finishRest(now = Date.now()) {
    if (!this.usage.isLocked || this.settings.cameraEnabled || this.usage.restMode !== 'timer'
      || !this.usage.restEndsAt || now < this.usage.restEndsAt) return false;
    this.day(now).timedRests += 1;
    // A timed break resets the usage cycle without claiming exercise sets.
    this.usage = { reminderCounted: false, seconds: 0, isLocked: false, warned: false, snoozedUntil: 0, restEndsAt: 0, restMode: null, standingMs: 0, activeDate: localDay(now), lastActiveAt: now };
    this.lastTick = now;
    return true;
  }
  snooze(now = Date.now()) {
    if (!this.usage.isLocked) return false;
    this.day(now).snoozes += 1;
    this.cancelRest();
    this.usage.isLocked = false;
    this.usage.reminderCounted = false;
    this.usage.warned = false;
    this.usage.seconds = Math.max(0, this.settings.usageLimit * 60 - 300);
    this.usage.snoozedUntil = now + 300000;
    this.usage.lastActiveAt = now;
    return true;
  }
  complete(sets, now = Date.now(), completedActions = []) {
    const day = this.day(now);
    day.sessions += 1;
    day.sets += bounded(sets, 1, 5, 1);
    day.actions ||= {};
    const list = Array.isArray(completedActions)
      ? completedActions
      : (typeof completedActions === 'string' && completedActions ? [completedActions] : []);
    for (const name of list) {
      if (typeof name === 'string' && name.trim()) {
        const clean = actionRecordId(name.trim());
        Object.defineProperty(day.actions, clean, { value: (Object.hasOwn(day.actions, clean) ? day.actions[clean] : 0) + 1, enumerable: true, writable: true, configurable: true });
      }
    }
    this.usage = { reminderCounted: false, seconds: 0, isLocked: false, warned: false, snoozedUntil: 0, restEndsAt: 0, restMode: null, standingMs: 0, activeDate: localDay(now), lastActiveAt: now };
    this.lastTick = now;
  }
  snapshot() { return { settings: this.settings, usage: this.usage, days: this.days }; }
}
