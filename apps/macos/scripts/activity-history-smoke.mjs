// Isolated renderer check: synthetic history only, no native monitor or user data.
import { app, BrowserWindow, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { DESKTOP_DEFAULTS } from '../electron/engine.js';
import { dateKey, shiftPeriod } from '../src/shared/activity-history.js';
async function run() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-history-ui-')));
  const output = path.join(root, 'artifacts/activity-history');
  fs.mkdirSync(output, { recursive: true });
  const today = new Date();
  const day = (sets, actions) => ({ seconds: 7200, sessions: sets, sets, actions, apps: { editor: { name: 'Editor', seconds: 5400 }, browser: { name: 'Browser', seconds: 1800 } } });
  const current = day(14, { '耳朵找肩膀': 2, '胳膊向后旋': 3, '扶腰后伸': 2, '举手翻掌': 4, '交叉腿叉腰侧屈': 2, '托住后脑低头': 1 });
  let state = { settings: DESKTOP_DEFAULTS, usage: { seconds: 720, snoozedUntil: 0 }, today: current,
    days: { [dateKey(today)]: current, [dateKey(shiftPeriod('day', today, -1))]: day(7, { '举手翻掌': 7 }), [dateKey(shiftPeriod('month', today, -1))]: day(9, { '扶腰后伸': 9 }), [dateKey(shiftPeriod('year', today, -1))]: day(5, { '耳朵找肩膀': 5 }) },
    foreground: { name: 'FitGate', apps: [] }, reason: '正在记录活跃使用', version: '1.1.0', cameraPermission: 'granted' };
  ipcMain.handle('status', () => state);
  ipcMain.handle('dashboard-ready', () => {});
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, 'dist', `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await app.whenReady();
  const win = new BrowserWindow({ width: 1280, height: 960, show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, sandbox: true } });
  const errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const js = source => win.webContents.executeJavaScript(source);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const text = id => js(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const capture = async name => { await new Promise(resolve => setTimeout(resolve, 150)); fs.writeFileSync(path.join(output, name), (await win.webContents.capturePage()).toPNG()); };
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}`);
    for (let i = 0; i < 100 && await text('today-sessions') !== '14'; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await text('today-sessions'), '14');
    // Exercise identical chart drill-down in both lists and both filtered details.
    const yesterdayKey = dateKey(shiftPeriod('day', today, -1));
    for (const config of [
      { entry: 'open-usage', chart: 'week-chart', period: 'usage-period', label: 'usage-period-label', total: 'usage-total', expected: '2 小时 0 分', empty: '0 秒' },
      { entry: 'open-activity', chart: 'activity-chart', period: 'period', label: 'activity-period-label', total: 'activity-sets', expected: '7', empty: '0' },
      { entry: 'open-usage', row: '[data-usage-app="editor"]', chart: 'app-detail-chart', period: 'app-period', label: 'app-detail-period-label', total: 'app-detail-total', expected: '1 小时 30 分', empty: '0 秒', name: 'app-detail-name', expectedName: 'Editor' },
      { entry: 'open-activity', row: '[data-history-action="standing_raise_hands"]', chart: 'action-detail-chart', period: 'action-period', label: 'action-detail-period-label', total: 'action-detail-total', expected: '7 次', empty: '0 次', name: 'action-detail-name', expectedName: '举手翻掌' }
    ]) {
      await js(`document.querySelector('[data-view="overview"]').click()`);
      await click(config.entry);
      if (config.row) await js(`document.querySelector(${JSON.stringify(config.row)}).click()`);
      const selectPeriod = period => js(`document.querySelector('[data-${config.period}="${period}"]').click()`);
      const selectBar = key => js(`document.querySelector('#${config.chart} [data-chart-date="${key}"]').click()`);
      const back = `${config.chart}-back`;
      assert.equal(await js(`document.getElementById('${back}').hidden`), true);
      await selectPeriod('year');
      const yearLabel = await text(config.label);
      const yearScroll = await js('window.scrollTo(0, 80); scrollY');
      assert.equal(await js(`document.getElementById('${config.chart}').getAttribute('role')`), 'group');
      const futureKey = await js(`document.querySelector('#${config.chart} button:disabled')?.dataset.chartDate`);
      if (futureKey) { const previous = await text(config.label); await selectBar(futureKey); assert.equal(await text(config.label), previous); }
      await selectBar(dateKey(new Date(today.getFullYear(), today.getMonth(), 1)));
      assert.equal(await js(`document.querySelector('[data-${config.period}="month"]').getAttribute('aria-pressed')`), 'true');
      const monthLabel = await text(config.label);
      assert.match(await text(back), /年视图/);
      await selectBar(dateKey(today));
      assert.match(await text(back), /月视图/);
      await capture(`${config.chart}-back-to-month.png`);
      assert.equal(await js(`document.querySelector('[data-${config.period}="day"]').getAttribute('aria-pressed')`), 'true');
      await selectBar(yesterdayKey);
      const yesterday = shiftPeriod('day', today, -1);
      assert.equal(await text(config.label), `${yesterday.getFullYear()}年${yesterday.getMonth()+1}月${yesterday.getDate()}日`);
      assert.equal(await text(config.total), config.expected);
      assert.equal(await js('document.activeElement.id'), config.label);
      if (config.name) assert.equal(await text(config.name), config.expectedName);
      // Live refresh must not pull a selected historical date back to today.
      win.webContents.send('status-changed', state);
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(await text(config.total), config.expected);
      await click(back);
      assert.equal(await text(config.label), monthLabel);
      assert.equal(await js(`document.querySelector('[data-${config.period}="month"]').getAttribute('aria-pressed')`), 'true');
      assert.equal(await js('document.activeElement.dataset.chartDate'), dateKey(today));
      assert.match(await text(back), /年视图/);
      await click(back);
      assert.equal(await text(config.label), yearLabel);
      assert.equal(await js(`document.querySelector('[data-${config.period}="year"]').getAttribute('aria-pressed')`), 'true');
      assert.ok(Math.abs(await js('scrollY') - yearScroll) <= 1);
      assert.equal(await js(`document.getElementById('${back}').hidden`), true);
      await selectPeriod('week');
      const weekLabel = await text(config.label);
      await selectBar(yesterdayKey);
      assert.equal(await text(config.total), config.expected);
      const emptyKey = dateKey(shiftPeriod('day', today, -2));
      await selectBar(emptyKey); assert.equal(await text(config.total), config.empty);
      await capture(`${config.chart}-drilldown-empty.png`);
      await click(back);
      assert.equal(await text(config.label), weekLabel);
      assert.equal(await js(`document.getElementById('${back}').hidden`), true);
      // Historical year/month must be restored exactly, never reset to the present.
      await selectPeriod('year');
      await click(config.label.replace('-period-label', '-prev'));
      const historicalYear = await text(config.label);
      const january = dateKey(new Date(today.getFullYear() - 1, 0, 1));
      await selectBar(january);
      const historicalMonth = await text(config.label);
      await selectBar(january);
      win.webContents.send('status-changed', state);
      await new Promise(resolve => setTimeout(resolve, 60));
      await click(back); assert.equal(await text(config.label), historicalMonth);
      await click(back); assert.equal(await text(config.label), historicalYear);
      assert.equal(await js(`document.getElementById('${back}').hidden`), true);
      // An explicit period selection starts a fresh path.
      await selectBar(january); await selectPeriod('week');
      assert.equal(await js(`document.getElementById('${back}').hidden`), true);
      if (config.name) assert.equal(await text(config.name), config.expectedName);
      const beforeCalendar = await text(config.label);
      await click(config.label);
      assert.equal(await js('document.getElementById("history-calendar").open'), true);
      await capture(`${config.chart}-calendar.png`);
      await click('calendar-close');
      assert.equal(await text(config.label), beforeCalendar);
      assert.equal(await js('document.activeElement.id'), config.label);
      const setCalendar = (id, value) => js(`(() => { const input = document.getElementById('${id}'); input.value = '${value}'; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
      await click(config.label);
      await setCalendar('calendar-year', 2024); await setCalendar('calendar-month', 1);
      assert.equal(await js('document.querySelectorAll("#calendar-days button").length'), 29);
      // Status refresh while the dialog is open must not change the chosen calendar month.
      win.webContents.send('status-changed', state);
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(await js('document.getElementById("calendar-month").value'), '1');
      await js(`document.querySelector('[data-calendar-date="2024-02-29"]').click()`);
      assert.equal(await js('document.getElementById("history-calendar").open'), false);
      assert.equal(await text(config.label), '2024年2月29日');
      assert.equal(await text(config.total), config.empty);
      if (config.name) assert.equal(await text(config.name), config.expectedName);
      assert.match(await text(back), /周视图/);
      await click(back); assert.equal(await text(config.label), beforeCalendar);
      await click(config.label);
      await setCalendar('calendar-year', 2023); await setCalendar('calendar-month', 1);
      assert.equal(await js('document.querySelectorAll("#calendar-days button").length'), 28);
      await setCalendar('calendar-month', 11); await click('calendar-next');
      assert.equal(await js('document.getElementById("calendar-year").value'), '2024');
      assert.equal(await js('document.getElementById("calendar-month").value'), '0');
      await click('calendar-prev');
      assert.equal(await js('document.getElementById("calendar-year").value'), '2023');
      await setCalendar('calendar-year', today.getFullYear() + 1);
      assert.equal(await js('document.getElementById("calendar-year").value'), '2023');
      await click('calendar-today');
      assert.equal(await text(config.label), `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`);
      await click(config.label);
      assert.equal(await js('document.getElementById("calendar-next").disabled'), true);
      const future = await js('document.querySelector("#calendar-days button:disabled")?.dataset.calendarDate');
      if (future) {
        await js(`document.querySelector('[data-calendar-date="${future}"]').click()`);
        assert.equal(await js('document.getElementById("history-calendar").open'), true);
      }
      await click('calendar-close');
    }
    await js(`document.querySelector('[data-view="overview"]').click()`);
    await capture('overview.png');
    await click('open-usage');
    assert.equal(await js('document.getElementById("activity").hidden'), false);
    assert.equal(await text('usage-total'), '2 小时 0 分');
    assert.equal(await text('usage-app-count'), '2');
    assert.match(await text('app-usage'), /Editor.*1 小时 30 分/s);
    assert.equal(await js('document.getElementById("usage-next").disabled'), true);
    await capture('usage-day.png');
    await js(`document.querySelector('[data-usage-app="editor"]').click()`);
    assert.equal(await js('document.getElementById("app-detail").hidden'), false);
    assert.equal(await text('app-detail-name'), 'Editor');
    assert.equal(await text('app-detail-total'), '1 小时 30 分');
    assert.equal(await js('document.querySelector(".nav.active").dataset.view'), 'activity');
    assert.equal(await js('document.getElementById("app-detail-next").disabled'), true);
    await capture('application-day.png');
    for (const period of ['week', 'month', 'year']) {
      await js(`document.querySelector('[data-app-period="${period}"]').click()`);
      const first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (period === 'week') first.setDate(first.getDate() - (first.getDay() + 6) % 7);
      else { first.setDate(1); if (period === 'year') first.setMonth(0); }
      const count = Object.keys(state.days).filter(key => key >= dateKey(first) && key <= dateKey(today)).length;
      assert.equal(await text('app-detail-total'), `${Math.floor(count * 1.5)} 小时 ${count % 2 ? 30 : 0} 分`);
      assert.equal(await text('app-detail-days'), String(count));
      assert.equal(await text('app-detail-average'), '1 小时 30 分');
      await capture(`application-${period}.png`);
    }
    await click('app-detail-prev'); assert.equal(await text('app-detail-total'), '1 小时 30 分');
    await click('app-detail-prev'); assert.equal(await text('app-detail-total'), '0 秒');
    assert.equal(await js('document.getElementById("app-detail-empty").hidden'), false);
    await click('app-detail-current');
    await js(`document.querySelector('[data-app-period="month"]').click()`);
    win.setSize(960, 800); await capture('application-month-compact.png');
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    win.setSize(1280, 960);
    await click('back-app-usage');
    assert.equal(await js(`document.querySelector('[data-usage-period="day"]').getAttribute('aria-pressed')`), 'true');
    assert.equal(await js('document.activeElement.dataset.usageApp'), 'editor');
    await js(`document.querySelector('[data-usage-app="browser"]').click()`);
    assert.equal(await text('app-detail-name'), 'Browser');
    assert.equal(await text('app-detail-total'), '30 分钟');
    await click('back-app-usage');

    for (const period of ['week', 'month', 'year']) {
      await js(`document.querySelector('[data-usage-period="${period}"]').click()`);
      const first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (period === 'week') first.setDate(first.getDate() - (first.getDay() + 6) % 7);
      else { first.setDate(1); if (period === 'year') first.setMonth(0); }
      const count = Object.keys(state.days).filter(key => key >= dateKey(first) && key <= dateKey(today)).length;
      assert.equal(await text('usage-total'), `${count * 2} 小时 0 分`);
      assert.equal(await text('usage-active-days'), String(count));
      assert.equal(await js(`document.querySelector('[data-usage-period="${period}"]').getAttribute('aria-pressed')`), 'true');
      if (period === 'year') assert.equal(await js('document.querySelectorAll("#week-chart .bar-column").length'), 12);
      await capture(`usage-${period}.png`);
    }
    await click('usage-prev'); assert.equal(await text('usage-total'), '2 小时 0 分');
    await click('usage-prev'); assert.equal(await text('usage-total'), '0 秒');
    assert.match(await text('app-usage'), /暂无使用记录/);
    await click('usage-current');
    await js(`document.querySelector('[data-usage-period="month"]').click()`);
    win.setSize(960, 800); await capture('usage-month-compact.png');
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    win.setSize(1280, 960);
    await js(`document.querySelector('[data-usage-app="editor"]').click()`);
    assert.equal(await js(`document.querySelector('[data-app-period="month"]').getAttribute('aria-pressed')`), 'true');
    await click('back-app-usage');
    assert.equal(await js(`document.querySelector('[data-usage-period="month"]').getAttribute('aria-pressed')`), 'true');
    await click('back-usage-overview');
    await click('open-usage');
    assert.equal(await js(`document.querySelector('[data-usage-period="day"]').getAttribute('aria-pressed')`), 'true');
    // Incoming usage changes refresh totals and individual application rows.
    const saved = state;
    const updated = { ...current, seconds: 10800, apps: { editor: { name: 'Editor', seconds: 9000 }, browser: { name: 'Browser', seconds: 1800 } } };
    state = { ...state, today: updated, days: { ...state.days, [dateKey(today)]: updated } };
    win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('usage-total'), '3 小时 0 分');
    assert.match(await text('app-usage'), /2 小时 30 分/);
    await js(`document.querySelector('[data-usage-app="editor"]').click()`);
    assert.equal(await text('app-detail-total'), '2 小时 30 分');
    state = saved; win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('app-detail-total'), '1 小时 30 分');
    await click('back-app-usage');

    await click('back-usage-overview');
    await click('open-activity');
    assert.equal(await js('document.getElementById("exercise").hidden'), false);
    assert.equal(await text('activity-sets'), '14');
    assert.equal(await js('document.querySelectorAll(".action-history-row").length'), 6);
    assert.equal(await js('document.getElementById("activity-next").disabled'), true);
    await capture('day.png');
    const activityScroll = await js(`(() => { document.querySelector('[data-history-action="standing_raise_hands"]').scrollIntoView({block:'center'}); return scrollY; })()`);
    await js(`document.querySelector('[data-history-action="standing_raise_hands"]').click()`);
    assert.equal(await js('document.getElementById("action-detail").hidden'), false);
    assert.equal(await text('action-detail-name'), '举手翻掌');
    assert.equal(await text('action-detail-total'), '4 次');
    assert.equal(await js('document.querySelector(".nav.active").dataset.view'), 'exercise');
    assert.equal(await js('document.getElementById("action-detail-next").disabled'), true);
    await capture('action-detail-day.png');
    for (const period of ['week', 'month', 'year']) {
      await js(`document.querySelector('[data-action-period="${period}"]').click()`);
      const first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (period === 'week') first.setDate(first.getDate() - (first.getDay() + 6) % 7);
      else { first.setDate(1); if (period === 'year') first.setMonth(0); }
      const records = Object.entries(state.days).filter(([key]) => key >= dateKey(first) && key <= dateKey(today));
      const total = records.reduce((n, [, d]) => n + (d.actions['举手翻掌'] || 0), 0);
      assert.equal(await text('action-detail-total'), `${total} 次`);
      assert.equal(await text('action-detail-days'), String(records.filter(([, d]) => d.actions['举手翻掌'] > 0).length));
      assert.equal(await js(`document.querySelector('[data-action-period="${period}"]').getAttribute('aria-pressed')`), 'true');
      await capture(`action-detail-${period}.png`);
    }
    await click('action-detail-prev'); assert.equal(await text('action-detail-total'), '0 次');
    assert.equal(await js('document.getElementById("action-detail-empty").hidden'), false);
    await click('action-detail-current');
    await js(`document.querySelector('[data-action-period="month"]').click()`);
    win.setSize(960, 800); await capture('action-detail-month-compact.png');
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
    win.setSize(1280, 960);
    await click('back-action-list');
    assert.equal(await js(`document.querySelector('[data-period="day"]').getAttribute('aria-pressed')`), 'true');
    assert.equal(await js('document.activeElement.dataset.historyAction'), 'standing_raise_hands');
    assert.ok(Math.abs(await js('scrollY') - activityScroll) <= 1);
    await js(`document.querySelector('[data-history-action="seated_ear_shoulder"]').click()`);
    assert.equal(await text('action-detail-total'), '2 次');
    await js(`document.querySelector('[data-action-period="year"]').click()`);
    await click('action-detail-prev'); assert.equal(await text('action-detail-total'), '5 次');
    await click('back-action-list');
    await js(`document.querySelector('[data-history-action="standing_raise_hands"]').click()`);
    const savedActivityState = state;
    const changedActivity = { ...current, sets: 17, actions: { ...current.actions, '举手翻掌': 5 } };
    state = { ...state, today: changedActivity, days: { ...state.days, [dateKey(today)]: changedActivity } };
    win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('action-detail-total'), '5 次');
    assert.match(await text('action-detail-unknown'), /2 组/);
    state = savedActivityState; win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('action-detail-total'), '4 次');
    await click('back-action-list');

    for (const period of ['week', 'month', 'year']) {
      await js(`document.querySelector('[data-period="${period}"]').click()`);
      assert.equal(await js(`document.querySelector('[data-period="${period}"]').getAttribute('aria-pressed')`), 'true');
      if (period === 'month') assert.equal(await js('document.querySelectorAll("#activity-chart .bar-column").length'), new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate());
      if (period === 'year') assert.equal(await js('document.querySelectorAll("#activity-chart .bar-column").length'), 12);
      await capture(`${period}.png`);
    }
    await click('activity-prev'); assert.equal(await text('activity-sets'), '5');
    assert.equal(await js('document.getElementById("activity-next").disabled'), false);
    await click('activity-current');
    await js(`document.querySelector('[data-period="month"]').click()`);
    await js(`document.querySelector('[data-history-action="standing_raise_hands"]').click()`);
    assert.equal(await js(`document.querySelector('[data-action-period="month"]').getAttribute('aria-pressed')`), 'true');
    await click('back-action-list');
    assert.equal(await js(`document.querySelector('[data-period="month"]').getAttribute('aria-pressed')`), 'true');
    win.setSize(960, 800); await capture('month-compact.png');
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'no horizontal overflow at compact desktop size');
    await click('back-overview'); assert.equal(await js('document.activeElement.id'), 'open-activity');
    await click('open-activity'); assert.equal(await text('activity-sets'), '14');
    state = { ...state, today: day(0, {}), days: {} };
    win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('activity-sets'), '0');
    assert.match(await text('activity-action-list'), /还没有完成活动/);
    await capture('empty.png');
    state = { ...state, today: day(3, {}), days: { [dateKey(today)]: day(3, {}) } };
    win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(await text('activity-unknown'), /3 组/);
    assert.equal(await js('document.getElementById("activity-unknown").hidden'), false);
    await click('back-overview');
    await click('open-usage');
    state = { ...state, today: { ...state.today, apps: {} }, days: { [dateKey(today)]: { seconds: 7200, apps: {} } } };
    win.webContents.send('status-changed', state);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await text('usage-total'), '2 小时 0 分');
    assert.match(await text('usage-unknown'), /2 小时 0 分/);
    assert.equal(await js('document.getElementById("usage-unknown").hidden'), false);
    await capture('usage-missing-apps.png');
    assert.deepEqual(errors, []);
    console.log(`Action detail, application detail, usage and activity history UI passed: entry, calendar controls, past year, current period, live refresh, empty/legacy states, compact layout. Screenshots: ${output}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); server.close(); app.quit(); }

}
run().catch(error => { console.error(error); app.exit(1); });
