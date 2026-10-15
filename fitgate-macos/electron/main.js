import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, powerMonitor, protocol, net, session, systemPreferences, shell, dialog, screen } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UsageEngine, localDay } from './engine.js';
import { LocalStore } from './store.js';
import { reminderWindowOptions, reminderBounds } from './reminder-window.js';
import { matchTarget } from '../src/shared/target-rules.js';
const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = process.argv.includes('--smoke-test');
const hiddenTest = smoke && process.env.FITGATE_TEST_HIDDEN === '1';
if (smoke) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-smoke-')));
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
app.setName('FitGate');
protocol.registerSchemesAsPrivileged([{ scheme: 'fitgate', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
let dashboard, workout, tray, helper, interval, restartTimer;
let quitting = false, sleeping = false, screenLocked = false, preview = false;
let blockingWorkout = false, systemDialog = false, focusTimer;
let reminders = [], foreground = { id: '', name: '正在连接', apps: [] }, lastForegroundAt = 0;
let browserTarget = false, browserBusy = false, browserError = '', browserCheckedAt = 0, browserId = '';
let helperWarning = '', storeWarning = '', completedSession = false, trayLocked;
const store = new LocalStore(app.getPath('userData'));
const engine = new UsageEngine(store.read());
function save() {
  try { store.write(engine.snapshot()); storeWarning = ''; }
  catch { storeWarning = '本地记录保存失败，请检查磁盘空间与文件权限。'; }
}
function status() {
  return { ...engine.snapshot(), today: engine.day(Date.now()), reason: engine.reason, foreground,
    nativeReady: Date.now() - lastForegroundAt < 5000,
    warning: storeWarning || helperWarning || store.warning || (engine.settings.monitorMode === 'websites' ? browserError : ''),
    cameraPermission: systemPreferences.getMediaAccessStatus('camera'),
    packaged: app.isPackaged, platform: process.arch, version: app.getVersion(), workoutActive: blockingWorkout && !!workout
  };
}
function broadcast() {
  const state = status();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('status-changed', state);
  if (tray) {
    if (trayLocked !== engine.usage.isLocked) updateTray();
    const remaining = Math.max(0, Math.ceil(Math.max(engine.settings.usageLimit * 60 - engine.usage.seconds, (engine.usage.snoozedUntil - Date.now()) / 1000) / 60));
    tray.setTitle(engine.settings.paused ? ' 暂停' : engine.usage.isLocked ? ' 休息' : ` ${remaining}m`);
    tray.setToolTip(`FitGate · ${engine.reason}`);
  }
}
function secureWindow(options, page, autoShow = true) {
  const w = new BrowserWindow({ backgroundColor: '#f8fafc', show: false, ...options,
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', event => event.preventDefault());
  w.webContents.on('will-attach-webview', event => event.preventDefault());
  w.loadURL(`fitgate://app/${page}`);
  w.once('ready-to-show', () => { if (!hiddenTest && autoShow) w.show(); });
  return w;
}
function openDashboard() {
  if (reminders.length) { focusScreenBlock(); return; }
  if (!dashboard || dashboard.isDestroyed()) {
    dashboard = secureWindow({ width: 1080, height: 790, minWidth: 880, minHeight: 650,
      title: 'FitGate', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 22 } }, 'index.html');
    dashboard.on('close', event => { if (!quitting) { event.preventDefault(); dashboard.hide(); } });
  }
  if (!hiddenTest) { dashboard.show(); dashboard.focus(); }
}
function dismissReminders() {
  clearTimeout(focusTimer);
  const previous = reminders; reminders = [];
  previous.forEach(w => { if (!w.isDestroyed()) w.destroy(); });
  preview = false;
  blockingWorkout = false;
  if (workout && !workout.isDestroyed()) workout.setAlwaysOnTop(false);
}

function blockWindows() {
  return [...reminders.filter(w => !w.isDestroyed() && !(blockingWorkout && workout?.isVisible() && w.reminderDisplayId === workout.reminderDisplayId)),
    ...(blockingWorkout && workout && !workout.isDestroyed() ? [workout] : [])];
}
function focusScreenBlock() {
  if (hiddenTest || quitting || sleeping || screenLocked || systemDialog || !reminders.length) return;
  // Hiding the application hides every display. Restore all screens before
  // considering focus, including screens that do not contain the pointer.
  const activeWorkout = blockingWorkout && workout?.blockReady && !workout.isDestroyed() ? workout : null;
  for (const w of reminders) {
    if (w.isDestroyed() || !w.blockReady) continue;
    if (activeWorkout && w.reminderDisplayId === activeWorkout.reminderDisplayId) { if (w.isVisible()) w.hide(); }
    else if (!w.isVisible()) w.showInactive();
  }
  if (activeWorkout && !activeWorkout.isVisible()) activeWorkout.showInactive();
  const windows = blockWindows();
  const focused = BrowserWindow.getFocusedWindow();
  // macOS can retain an app's key window while another process is frontmost.
  // Use the native foreground sample as well as Electron's window focus.
  if (focused && windows.includes(focused) && focused.isVisible() && foreground.pid === process.pid) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const target = blockingWorkout && workout?.isVisible() ? workout
    : windows.find(w => w.reminderDisplayId === display.id) || windows[0];
  if (!target || target.isDestroyed() || !target.blockReady) return;
  app.focus({ steal: true });
  target.show(); target.moveTop(); target.focus();
}
function scheduleBlockFocus() {
  clearTimeout(focusTimer);
  focusTimer = setTimeout(focusScreenBlock, 60);
}
function configureScreenBlock(w, display) {
  w.reminderDisplayId = display.id;
  w.blockReady = false;
  w.once('ready-to-show', () => { w.blockReady = true; });
  w.setAlwaysOnTop(true, systemDialog ? 'floating' : 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(false);
  w.setBounds(reminderBounds(display.bounds));
  w.on('will-move', event => event.preventDefault());
  w.on('will-resize', event => event.preventDefault());
  w.on('blur', scheduleBlockFocus);
  w.on('hide', scheduleBlockFocus);
}
function createReminder(display) {
  const w = secureWindow(reminderWindowOptions(display.bounds), `reminder.html${preview ? '?preview=1' : ''}`, false);
  configureScreenBlock(w, display);
  reminders.push(w);
  w.once('ready-to-show', () => {
    if (w.isDestroyed() || !reminders.includes(w) || hiddenTest) return;
    if (!(blockingWorkout && workout?.isVisible() && w.reminderDisplayId === workout.reminderDisplayId)) w.showInactive();
    scheduleBlockFocus();
  });
  w.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    if (preview) dismissReminders(); else doSnooze();
  });
  w.on('closed', () => {
    reminders = reminders.filter(window => window !== w);
  });
}
function showReminder(isPreview = false) {
  if (reminders.length || workout || sleeping || screenLocked || (!isPreview && engine.settings.paused)) return;
  preview = isPreview;
  if (!isPreview) { engine.beginRest(); save(); }
  for (const display of screen.getAllDisplays()) createReminder(display);
}
function openWorkout(displayId) {
  if (workout && !workout.isDestroyed()) { workout.show(); workout.focus(); return; }
  const protect = engine.usage.isLocked && !engine.settings.paused && !preview;
  if (protect && !reminders.length) showReminder();
  engine.cancelRest(); save();
  if (!protect) dismissReminders();
  blockingWorkout = protect;
  const display = screen.getAllDisplays().find(d => d.id === displayId) || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  completedSession = false;
  const w = workout = secureWindow(protect ? { ...reminderWindowOptions(display.bounds), title: 'FitGate 伴练' }
    : { width: 1240, height: 840, minWidth: 980, minHeight: 680, title: 'FitGate 伴练' }, `src/workout/workout.html${protect ? '?blocked=1' : ''}`, !protect);
  if (protect) {
    configureScreenBlock(w, display);
    w.once('ready-to-show', () => {
      if (w.isDestroyed() || !blockingWorkout || hiddenTest) return;
      if (systemDialog) w.showInactive();
      else { w.show(); w.moveTop(); w.focus(); }
      for (const reminder of reminders) if (reminder.reminderDisplayId === w.reminderDisplayId) reminder.hide();
    });
  }
  w.on('closed', () => {
    workout = null;
    blockingWorkout = false;
    if (engine.usage.isLocked && !quitting && !sleeping && !screenLocked && !engine.settings.paused) {
      engine.beginRest(); save();
      if (!reminders.length) showReminder();
      else { for (const reminder of reminders) if (!hiddenTest) reminder.showInactive(); scheduleBlockFocus(); }
    }
    broadcast();
  });
  broadcast();
}
function keepRemindersOnScreen(displays = screen.getAllDisplays()) {
  if (!reminders.length || !displays.length) return;
  // Add before removing so unplugging a covered screen never releases the block.
  for (const display of displays) {
    const w = reminders.find(w => w.reminderDisplayId === display.id);
    if (!w) createReminder(display);
    else if (JSON.stringify(w.getBounds()) !== JSON.stringify(reminderBounds(display.bounds))) w.setBounds(reminderBounds(display.bounds));
  }
  for (const w of [...reminders]) if (!displays.some(d => d.id === w.reminderDisplayId)) w.destroy();
  if (blockingWorkout && workout && !workout.isDestroyed()) {
    const display = displays.find(d => d.id === workout.reminderDisplayId) || displays[0];
    workout.reminderDisplayId = display.id;
    workout.setBounds(reminderBounds(display.bounds));
    for (const w of reminders) {
      if (hiddenTest) continue;
      if (w.reminderDisplayId === display.id && workout.isVisible()) w.hide(); else w.showInactive();
    }
  }
  scheduleBlockFocus();
}
function doSnooze() {
  if (!engine.usage.isLocked) return;
  engine.snooze();
  const pendingWorkout = blockingWorkout ? workout : null;
  dismissReminders();
  pendingWorkout?.close();
  save(); broadcast();
}
function syncSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效设置');
  const loginChanged = 'launchAtLogin' in patch && !!patch.launchAtLogin !== engine.settings.launchAtLogin;
  engine.updateSettings(patch);
  if (loginChanged) {
    if (!app.isPackaged && patch.launchAtLogin) { engine.settings.launchAtLogin = false; throw new Error('请在构建好的 FitGate.app 中启用开机启动'); }
    app.setLoginItemSettings({ openAtLogin: engine.settings.launchAtLogin, openAsHidden: true, args: ['--hidden'] });
  }
  browserTarget = false; browserCheckedAt = 0;
  if (engine.settings.paused) dismissReminders();
  updateTray(); save(); broadcast(); return engine.settings;
}
function startHelper() {
  helper = spawn(path.join(root, 'native/activity-monitor'), [], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '';
  helper.stdout.on('data', data => {
    buffer += data.toString();
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      try {
        foreground = JSON.parse(line); lastForegroundAt = Date.now(); helperWarning = '';
        if (reminders.length && foreground.pid !== process.pid) scheduleBlockFocus();
      } catch { /* incomplete sample */ }
    }
  });
  helper.stderr.on('data', () => {});
  helper.on('error', () => { helperWarning = '系统监测未启动，请重新打开应用。'; });
  helper.on('exit', () => { if (!quitting) { helperWarning = '系统监测正在重连，期间不会累计时长。'; restartTimer = setTimeout(startHelper, 3000); } });
}
const browserScripts = {
  'com.apple.Safari': 'tell application id "com.apple.Safari" to get URL of current tab of front window',
  'com.google.Chrome': 'tell application id "com.google.Chrome" to get URL of active tab of front window',
  'com.microsoft.edgemac': 'tell application id "com.microsoft.edgemac" to get URL of active tab of front window',
  'com.brave.Browser': 'tell application id "com.brave.Browser" to get URL of active tab of front window',
  'company.thebrowser.Browser': 'tell application id "company.thebrowser.Browser" to get URL of active tab of front window'
};
async function checkBrowser(now) {
  const id = foreground.id;
  if (id !== browserId) { browserTarget = false; browserId = id; browserCheckedAt = 0; }
  if (!browserScripts[id]) { browserTarget = false; browserError = '网站模式支持 Safari、Chrome、Edge、Brave 和 Arc；其他应用不计时。'; return; }
  if (browserBusy || now - browserCheckedAt < 2000) return;
  browserBusy = true; browserCheckedAt = now;
  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', browserScripts[id]], { timeout: 4000 });
    if (foreground.id === id) {
      const url = new URL(stdout.trim());
      browserTarget = !!matchTarget(url.hostname, url.pathname, engine.settings);
      browserError = '';
    }
  } catch {
    browserTarget = false;
    browserError = '无法读取当前网站。请打开一个网页，并在系统设置 → 隐私与安全性 → 自动化中允许 FitGate 控制浏览器。';
  } finally { browserBusy = false; }
}
function trusted(event) {
  if (!event.senderFrame?.url.startsWith('fitgate://app/')) throw new Error('不受信任的页面');
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(event, ...args); });
}
function updateTray() {
  if (!tray) return;
  trayLocked = engine.usage.isLocked;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 FitGate', click: openDashboard },
    { label: '开始伴练', click: openWorkout },
    { type: 'separator' },
    { label: engine.settings.paused ? '继续记录使用时间' : '暂停记录使用时间', click: () => syncSettings({ paused: !engine.settings.paused }) },
    { label: '推迟提醒 5 分钟', enabled: engine.usage.isLocked, click: doSnooze },
    { type: 'separator' },
    { label: '退出 FitGate', accelerator: 'Command+Q', click: () => app.quit() }
  ]));
}
app.on('second-instance', openDashboard);
app.on('activate', openDashboard);
app.on('window-all-closed', () => {});
app.on('browser-window-focus', (_, w) => { if (reminders.length && !blockWindows().includes(w)) scheduleBlockFocus(); });
app.on('before-quit', () => { quitting = true; clearInterval(interval); clearTimeout(restartTimer); clearTimeout(focusTimer); helper?.kill(); save(); });
app.whenReady().then(async () => {
  protocol.handle('fitgate', request => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { return new Response('Invalid path', { status: 400 }); }
    const base = path.join(root, 'dist');
    const filename = path.resolve(base, `.${decoded}`);
    if (!filename.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filename).href);
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'"]
  } }));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => permission === 'media' && webContents === workout?.webContents);
  session.defaultSession.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    if (webContents !== workout?.webContents || permission !== 'media' || details.mediaTypes?.includes('audio')) { callback(false); return; }
    if (smoke || systemPreferences.getMediaAccessStatus('camera') === 'granted') { callback(true); return; }
    // Let the OS permission sheet receive input; restore coverage when it closes.
    systemDialog = true;
    for (const w of blockWindows()) w.setAlwaysOnTop(true, 'floating');
    try { callback(await systemPreferences.askForMediaAccess('camera')); }
    finally {
      systemDialog = false;
      for (const w of blockWindows()) w.setAlwaysOnTop(true, 'screen-saver');
      scheduleBlockFocus();
    }
  });
  app.setAboutPanelOptions({ applicationName: 'FitGate', applicationVersion: app.getVersion(), credits: '电脑使用计时与活动提醒\n动作图、姿态识别模型与使用记录保存在本机。' });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'FitGate', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '打开主面板', click: openDashboard }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'windowMenu' }
  ]));
  const icon = nativeImage.createFromPath(path.join(root, 'dist/icons/icon16.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon); updateTray();
  tray.on('double-click', openDashboard);
  handle('status', status);
  handle('settings', (_, patch) => syncSettings(patch));
  handle('open-workout', event => { openWorkout(BrowserWindow.fromWebContents(event.sender)?.reminderDisplayId); return { success: true }; });
  handle('snooze', () => { doSnooze(); return { success: true }; });
  handle('preview-reminder', () => { showReminder(true); return true; });
  handle('close-preview', () => { if (preview) dismissReminders(); });
  handle('camera-privacy', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'));
  handle('automation-privacy', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'));
  handle('export-data', async () => {
    const result = await dialog.showSaveDialog(dashboard, { defaultPath: `FitGate-${localDay()}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!result.canceled && result.filePath) { fs.writeFileSync(result.filePath, JSON.stringify(engine.snapshot(), null, 2)); return true; }
    return false;
  });
  handle('storage-get', (_, keys) => {
    const values = { fitgate_settings: engine.settings, fitgate_accumulated_usage: engine.usage };
    return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in values).map(k => [k, values[k]]));
  });
  handle('storage-set', (_, values) => { if (values?.fitgate_settings) syncSettings(values.fitgate_settings); return true; });
  handle('workout-message', (event, message) => {
    if (event.sender !== workout?.webContents) throw new Error('仅伴练窗口可以提交完成记录');
    if (message?.type === 'FITGATE_WORKOUT_COMPLETED' && !completedSession) {
      completedSession = true;
      engine.complete(message.payload?.amount);
      dismissReminders(); save(); broadcast();
      return { success: true };
    }
    return { success: false };
  });
  for (const name of ['suspend', 'lock-screen']) powerMonitor.on(name, () => {
    if (name === 'suspend') sleeping = true; else screenLocked = true;
    const protectedWorkout = blockingWorkout ? workout : null;
    workout?.webContents.send('workout-suspended');
    dismissReminders(); save(); broadcast();
    // Close a protected workout so waking cannot leave a normal workout window
    // bypassing a still-due reminder. Manual workouts remain paused in place.
    protectedWorkout?.close();
  });
  for (const name of ['resume', 'unlock-screen']) powerMonitor.on(name, () => {
    // Natural rest includes sleep/lock time and does not add it to screen time.
    engine.resetAfterRest(Date.now(), Date.now() - engine.usage.lastActiveAt >= 900000);
    if (name === 'resume') sleeping = false; else screenLocked = false;
    engine.lastTick = Date.now();
  });
  screen.on('display-added', () => keepRemindersOnScreen());
  screen.on('display-removed', () => keepRemindersOnScreen());
  screen.on('display-metrics-changed', () => keepRemindersOnScreen());
  startHelper();
  let ticks = 0;
  interval = setInterval(() => {
    const now = Date.now(), s = engine.settings;
    if (s.monitorMode === 'websites' && !sleeping && !screenLocked && !s.paused && !workout) void checkBrowser(now);
    const self = foreground.pid === process.pid || foreground.id === 'com.fitgate.desktop' || foreground.id.startsWith('com.github.Electron');
    const target = !self && (s.monitorMode === 'all' || (s.monitorMode === 'apps' && s.selectedApps.includes(foreground.id)) || (s.monitorMode === 'websites' && browserTarget && browserId === foreground.id));
    engine.tick({ now, idle: powerMonitor.getSystemIdleTime(), sleeping, screenLocked, activeApp: foreground, target, workout: !!workout, available: now - lastForegroundAt < 5000 });
    if (engine.usage.isLocked && !s.paused) showReminder();
    else if (!preview && reminders.length) dismissReminders();
    focusScreenBlock();
    broadcast(); if (++ticks % 5 === 0) save();
  }, 1000);
  if (!process.argv.includes('--hidden')) openDashboard();
  if (smoke) {
    try {
      const { runSmoke } = await import('../scripts/smoke.mjs');
      await runSmoke({ app, engine, getDashboard: () => dashboard, getWorkout: () => workout, getReminders: () => reminders, openWorkout, showReminder, dismissReminders, reconcileReminders: keepRemindersOnScreen, status, root });
      app.quit();
    } catch (error) { console.error('SMOKE FAILED', error); app.exit(1); }
  }
});
}
