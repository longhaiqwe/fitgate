export function pauseDeadline(duration, now = Date.now()) {
  if (duration === 'tomorrow') {
    const next = new Date(now); next.setHours(24, 0, 0, 0); return next.getTime();
  }
  return ['30', '60'].includes(String(duration)) ? now + Number(duration) * 60000 : 0;
}
export function pauseLabel(until, now = Date.now()) {
  if (!until) return '已暂停';
  const date = new Date(until), today = new Date(now);
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `暂停至 ${date.toDateString() === today.toDateString() ? '' : `${date.getMonth() + 1}/${date.getDate()} `}${time}`;
}
