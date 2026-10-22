import { actionRecordId, actionRecordName, normalizeActionRecords } from './action-records.js';
// Calendar periods use the Mac's local date; weeks start on Monday.
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function periodStart(period, date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === 'month' || period === 'year') start.setDate(1);
  if (period === 'year') start.setMonth(0);
  return start;
}
export function shiftPeriod(period, date, offset) {
  const next = periodStart(period, date);
  if (period === 'year') next.setFullYear(next.getFullYear() + offset);
  else if (period === 'month') next.setMonth(next.getMonth() + offset);
  else next.setDate(next.getDate() + offset * (period === 'week' ? 7 : 1));
  return next;
}
const count = value => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
export function activitySummary(days, period, date, now = new Date()) {
  const start = periodStart(period, date), end = shiftPeriod(period, start, 1);
  const first = dateKey(start), last = dateKey(end), today = dateKey(now);
  let sessions = 0, sets = 0, activeDays = 0, namedSets = 0, idleBreaks = 0, reminders = 0, snoozes = 0, timedRests = 0;
  const actions = new Map();
  for (const [key, day] of Object.entries(days)) {
    if (key < first || key >= last || key > today) continue;
    sessions += count(day.sessions); sets += count(day.sets); idleBreaks += count(day.idleBreaks);
    reminders += count(day.reminders); snoozes += count(day.snoozes); timedRests += count(day.timedRests);
    if (count(day.sessions) || count(day.sets)) activeDays++;
    for (const [name, value] of Object.entries(normalizeActionRecords(day.actions || {}))) {
      if (!count(value)) continue;
      actions.set(name, (actions.get(name) || 0) + count(value)); namedSets += count(value);
    }
  }
  const buckets = [];
  const cursor = new Date(start);
  // A day view adds context with the seven days ending on that date.
  if (period === 'day') cursor.setDate(cursor.getDate() - 6);
  while (cursor < end) {
    const key = dateKey(cursor);
    const label = period === 'year' ? `${cursor.getMonth() + 1}月` : `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    let value = 0;
    if (period === 'year') {
      const month = key.slice(0, 7);
      for (const [day, record] of Object.entries(days)) if (day.startsWith(month) && day <= today) value += count(record.sets);
    } else if (key <= today) value = count(days[key]?.sets);
    buckets.push({ key, label, value, future: key > today, selected: period === 'day' ? key === first : key.slice(0, period === 'year' ? 7 : 10) === today.slice(0, period === 'year' ? 7 : 10) });
    if (period === 'year') cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
  }
  const label = periodLabel(period, start);
  return { label, sessions, sets, activeDays, idleBreaks, reminders, snoozes, timedRests, unknownSets: Math.max(0, sets - namedSets), actions: [...actions].sort((a, b) => b[1] - a[1] || actionRecordName(a[0]).localeCompare(actionRecordName(b[0]), 'zh-CN')), buckets };
}

export function periodLabel(period, date) {
  const start = periodStart(period, date), end = shiftPeriod(period, start, 1), first = dateKey(start);
  const inclusiveEnd = new Date(end); inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  const label = period === 'year' ? `${start.getFullYear()}年` : period === 'month' ? `${start.getFullYear()}年${start.getMonth() + 1}月` : period === 'day' ? `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日` : `${first.replaceAll('-', '.')} — ${dateKey(inclusiveEnd).replaceAll('-', '.')}`;
  return label;
}

export function actionSummary(days, actionName, period, date, now = new Date()) {
  // Resolve only documented historical names; unnamed sets stay unassigned.
  const id = actionRecordId(actionName);
  const filtered = Object.fromEntries(Object.entries(days).map(([key, day]) => {
    const actions = normalizeActionRecords(day.actions || {});
    const value = Object.hasOwn(actions, id) ? count(actions[id]) : 0;
    return [key, { sets: value }];
  }));
  const summary = activitySummary(filtered, period, date, now);
  return {
    label: summary.label, totalCount: summary.sets, activeDays: summary.activeDays,
    averageCount: summary.activeDays ? summary.sets / summary.activeDays : 0,
    buckets: summary.buckets,
    unknownSets: activitySummary(days, period, date, now).unknownSets
  };
}
