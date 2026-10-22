import { dateKey, periodStart, shiftPeriod, periodLabel } from './activity-history.js';

const seconds = value => Number.isFinite(value) && value > 0 ? value : 0;

export function usageSummary(days, period, date, now = new Date()) {
  const start = periodStart(period, date), end = shiftPeriod(period, start, 1);
  const first = dateKey(start), last = dateKey(end), today = dateKey(now);
  let totalSeconds = 0, activeDays = 0, unknownSeconds = 0;
  const apps = new Map(), monthly = new Map();
  for (const [key, day] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b))) {
    if (key > today) continue;
    const value = seconds(day.seconds);
    const month = key.slice(0, 7);
    monthly.set(month, (monthly.get(month) || 0) + value);
    if (key < first || key >= last) continue;
    totalSeconds += value;
    if (value > 0) activeDays++;
    let attributed = 0;
    for (const [id, app] of Object.entries(day.apps || {})) {
      const value = seconds(app?.seconds);
      if (!value) continue;
      attributed += value;
      const previous = apps.get(id);
      apps.set(id, { id, name: app.name || previous?.name || id, seconds: (previous?.seconds || 0) + value });
    }
    unknownSeconds += Math.max(0, value - attributed);
  }
  const buckets = [], cursor = new Date(start);
  if (period === 'day') cursor.setDate(cursor.getDate() - 6);
  while (cursor < end) {
    const key = dateKey(cursor), month = key.slice(0, 7);
    buckets.push({
      key,
      label: period === 'year' ? `${cursor.getMonth() + 1}月` : `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      seconds: key > today ? 0 : period === 'year' ? monthly.get(month) || 0 : seconds(days[key]?.seconds),
      future: key > today,
      selected: period === 'day' ? key === first : period === 'year' ? month === today.slice(0, 7) : key === today
    });
    if (period === 'year') cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
  }
  return {
    label: periodLabel(period, date), totalSeconds, activeDays, unknownSeconds,
    apps: [...apps.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)),
    buckets
  };
}

// Use the saved application ID, not its display name: names can change or collide.
export function appUsageSummary(days, appId, period, date, now = new Date()) {
  const filtered = Object.fromEntries(Object.entries(days).map(([key, day]) => {
    const app = Object.hasOwn(day.apps || {}, appId) ? day.apps[appId] : null;
    return [key, { seconds: seconds(app?.seconds) }];
  }));
  const summary = usageSummary(filtered, period, date, now);
  return {
    label: summary.label, totalSeconds: summary.totalSeconds, activeDays: summary.activeDays,
    averageSeconds: summary.activeDays ? summary.totalSeconds / summary.activeDays : 0,
    buckets: summary.buckets,
    // Missing history cannot be attributed to any particular application.
    unattributedSeconds: usageSummary(days, period, date, now).unknownSeconds
  };
}
