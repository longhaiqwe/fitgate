export const REMINDER_REST_MS = 5 * 60 * 1000;
export function remainingRestSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil(((Number(deadline) || now) - now) / 1000));
}
export function formatRestTime(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
